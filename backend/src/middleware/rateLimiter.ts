import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../services/redisService';
import { AppError } from './errorHandler';

interface RateLimitOptions {
  windowMs?: number;        // Time window in milliseconds
  max?: number;             // Maximum number of requests
  message?: string;         // Error message
  keyGenerator?: (req: Request) => string | Promise<string>;  // Function to generate key
  skipSuccessfulRequests?: boolean;         // Skip counting successful requests
  skipFailedRequests?: boolean;             // Skip counting failed requests
  standardHeaders?: boolean;                // Return rate limit info in headers
  legacyHeaders?: boolean;                  // Return rate limit info in legacy headers
}

interface RateLimiterStore {
  increment(key: string): Promise<{ totalHits: number; resetTime: Date }>;
  decrement(key: string): Promise<void>;
  resetKey(key: string): Promise<void>;
}

/**
 * Redis-based rate limiter store
 */
class RedisRateLimiterStore implements RateLimiterStore {
  constructor(
    private redisService: RedisService,
    private windowMs: number
  ) {}

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const redisKey = `rate-limit:${key}`;

    // Remove old entries
    await this.redisService.client.zremrangebyscore(redisKey, '-inf', windowStart);

    // Add current request
    await this.redisService.client.zadd(redisKey, now, `${now}-${Math.random()}`);

    // Count requests in window
    const totalHits = await this.redisService.client.zcard(redisKey);

    // Set expiry
    await this.redisService.client.expire(redisKey, Math.ceil(this.windowMs / 1000));

    // Calculate reset time
    const oldestEntry = await this.redisService.client.zrange(redisKey, 0, 0);
    const oldestTime = oldestEntry.length > 0 
      ? parseInt(oldestEntry[0].split('-')[0]) 
      : now;
    const resetTime = new Date(oldestTime + this.windowMs);

    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const redisKey = `rate-limit:${key}`;
    const members = await this.redisService.client.zrange(redisKey, -1, -1);
    if (members.length > 0) {
      await this.redisService.client.zrem(redisKey, members[0]);
    }
  }

  async resetKey(key: string): Promise<void> {
    const redisKey = `rate-limit:${key}`;
    await this.redisService.client.del(redisKey);
  }
}

/**
 * Create a rate limiter middleware
 */
export const createRateLimiter = (
  redisService: RedisService,
  options: RateLimitOptions = {}
) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    message = 'Too many requests from this IP, please try again later.',
    keyGenerator = (req: Request) => req.ip || 'unknown',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    standardHeaders = true,
    legacyHeaders = false,
  } = options;

  const store = new RedisRateLimiterStore(redisService, windowMs);

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = await keyGenerator(req);

    try {
      const { totalHits, resetTime } = await store.increment(key);
      const remaining = Math.max(0, max - totalHits);

      // Set headers
      if (standardHeaders) {
        res.setHeader('RateLimit-Limit', max);
        res.setHeader('RateLimit-Remaining', remaining);
        res.setHeader('RateLimit-Reset', resetTime.toISOString());
      }

      if (legacyHeaders) {
        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', resetTime.getTime());
      }

      // Check if limit exceeded
      if (totalHits > max) {
        // Decrement since this request won't be processed
        await store.decrement(key);

        const retryAfter = Math.ceil((resetTime.getTime() - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfter);

        throw new AppError(message, 429, 'RATE_LIMIT_EXCEEDED', {
          limit: max,
          current: totalHits,
          resetTime,
          retryAfter,
        });
      }

      // Handle skip logic after response
      const originalSend = res.send;
      res.send = function (data: any) {
        res.send = originalSend;
        
        // Check if we should skip this request
        const shouldSkip = 
          (skipSuccessfulRequests && res.statusCode < 400) ||
          (skipFailedRequests && res.statusCode >= 400);

        if (shouldSkip) {
          store.decrement(key).catch(err => 
            console.error('Error decrementing rate limit:', err)
          );
        }

        return originalSend.call(this, data);
      };

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        console.error('Rate limiter error:', error);
        // Fail open - allow request if rate limiter fails
        next();
      }
    }
  };
};

/**
 * Pre-configured rate limiters for common use cases
 */
export const createRateLimiters = (redisService: RedisService) => ({
  // General API rate limiter
  api: createRateLimiter(redisService, {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many API requests, please try again later.',
  }),

  // Strict rate limiter for auth endpoints
  auth: createRateLimiter(redisService, {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true,
  }),

  // Rate limiter for password reset
  passwordReset: createRateLimiter(redisService, {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: 'Too many password reset requests, please try again later.',
    keyGenerator: (req) => req.body.email || req.ip || 'unknown',
  }),

  // Rate limiter for file uploads
  upload: createRateLimiter(redisService, {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'Too many file uploads, please try again later.',
  }),

  // Rate limiter for expensive operations
  expensive: createRateLimiter(redisService, {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: 'Too many resource-intensive requests, please try again later.',
  }),

  // Per-user rate limiter
  perUser: createRateLimiter(redisService, {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    message: 'Too many requests, please try again later.',
    keyGenerator: (req) => (req as any).user?.id || req.ip || 'unknown',
  }),

  // Dynamic rate limiter based on user tier
  dynamic: (getUserTier: (req: Request) => Promise<string>) => 
    createRateLimiter(redisService, {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Will be overridden
      keyGenerator: async (req) => {
        const tier = await getUserTier(req);
        return `${(req as any).user?.id || req.ip}:${tier}`;
      },
    }),
});

/**
 * Middleware to reset rate limit for a specific key
 */
export const createRateLimitReset = (
  redisService: RedisService,
  keyGenerator: (req: Request) => string
) => {
  const store = new RedisRateLimiterStore(redisService, 0);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyGenerator(req);
      await store.resetKey(key);
      next();
    } catch (error) {
      console.error('Error resetting rate limit:', error);
      next();
    }
  };
};