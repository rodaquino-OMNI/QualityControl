import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../../../src/services/redisService';
import { AppError } from '../../../src/middleware/errorHandler';
import {
  createRateLimiter,
  createRateLimiters,
  createRateLimitReset,
} from '../../../src/middleware/rateLimiter';

// Mock RedisService
jest.mock('../../../src/services/redisService');
jest.mock('../../../src/middleware/errorHandler');

describe('rateLimiter', () => {
  let mockRedisService: jest.Mocked<RedisService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Redis client methods
    mockRedisClient = {
      zremrangebyscore: jest.fn().mockResolvedValue(null),
      zadd: jest.fn().mockResolvedValue(null),
      zcard: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(null),
      zrange: jest.fn().mockResolvedValue(['1640995200000-0.123']),
      zrem: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(null),
    };

    mockRedisService = {
      client: mockRedisClient,
    } as any;

    mockRequest = {
      ip: '192.168.1.1',
      body: {},
      headers: {},
    };

    mockResponse = {
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      statusCode: 200,
    } as any;

    mockNext = jest.fn();
  });

  describe('createRateLimiter', () => {
    it('should allow request within rate limit', async () => {
      mockRedisClient.zcard.mockResolvedValue(1);
      
      const rateLimiter = createRateLimiter(mockRedisService, {
        windowMs: 60000,
        max: 10,
      });

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('RateLimit-Limit', 10);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', 9);
    });

    it('should block request when rate limit exceeded', async () => {
      mockRedisClient.zcard.mockResolvedValue(11);
      
      const rateLimiter = createRateLimiter(mockRedisService, {
        windowMs: 60000,
        max: 10,
        message: 'Rate limit exceeded',
      });

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(AppError).toHaveBeenCalledWith(
        'Rate limit exceeded',
        429,
        'RATE_LIMIT_EXCEEDED',
        expect.objectContaining({
          limit: 10,
          current: 11,
        })
      );
      expect(mockRedisClient.zrem).toHaveBeenCalled(); // Should decrement
    });

    it('should use custom key generator', async () => {
      const customKeyGenerator = jest.fn().mockReturnValue('custom-key') as any;
      
      const rateLimiter = createRateLimiter(mockRedisService, {
        keyGenerator: customKeyGenerator,
      });

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(customKeyGenerator).toHaveBeenCalledWith(mockRequest);
      expect(mockRedisClient.zremrangebyscore).toHaveBeenCalledWith(
        'rate-limit:custom-key',
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should set legacy headers when enabled', async () => {
      const rateLimiter = createRateLimiter(mockRedisService, {
        legacyHeaders: true,
        standardHeaders: false,
      });

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 99);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.zcard.mockRejectedValue(new Error('Redis connection failed'));
      
      const rateLimiter = createRateLimiter(mockRedisService);

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      // Should fail open and allow the request
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should skip successful requests when configured', async () => {
      const rateLimiter = createRateLimiter(mockRedisService, {
        skipSuccessfulRequests: true,
      });

      // Mock the response.send method
      const originalSend = jest.fn();
      mockResponse.send = jest.fn().mockImplementation(function(data) {
        // Simulate successful response
        this.statusCode = 200;
        return originalSend.call(this, data);
      });

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      // Call the wrapped send method
      (mockResponse.send as jest.Mock)('test data');

      // Should call decrement for successful requests
      expect(mockRedisClient.zrem).toHaveBeenCalled();
    });

    it('should skip failed requests when configured', async () => {
      const rateLimiter = createRateLimiter(mockRedisService, {
        skipFailedRequests: true,
      });

      const originalSend = jest.fn();
      mockResponse.send = jest.fn().mockImplementation(function(data) {
        // Simulate failed response
        this.statusCode = 400;
        return originalSend.call(this, data);
      });

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      // Call the wrapped send method
      (mockResponse.send as jest.Mock)('error data');

      // Should call decrement for failed requests
      expect(mockRedisClient.zrem).toHaveBeenCalled();
    });

    it('should calculate reset time correctly', async () => {
      mockRedisClient.zrange.mockResolvedValue(['1640995200000-0.123']);
      
      const rateLimiter = createRateLimiter(mockRedisService, {
        windowMs: 60000, // 1 minute
      });

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'RateLimit-Reset',
        expect.any(String)
      );
    });

    it('should handle missing IP address', async () => {
      delete mockRequest.ip;
      
      const rateLimiter = createRateLimiter(mockRedisService);

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRedisClient.zremrangebyscore).toHaveBeenCalledWith(
        'rate-limit:unknown',
        expect.any(String),
        expect.any(Number)
      );
    });
  });

  describe('RedisRateLimiterStore', () => {
    it('should increment and return correct values', async () => {
      mockRedisClient.zcard.mockResolvedValue(5);
      mockRedisClient.zrange.mockResolvedValue(['1640995200000-0.123']);
      
      const rateLimiter = createRateLimiter(mockRedisService, {
        windowMs: 60000,
        max: 10,
      });

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRedisClient.zremrangebyscore).toHaveBeenCalled();
      expect(mockRedisClient.zadd).toHaveBeenCalled();
      expect(mockRedisClient.zcard).toHaveBeenCalled();
      expect(mockRedisClient.expire).toHaveBeenCalled();
    });

    it('should handle empty zrange result', async () => {
      mockRedisClient.zrange.mockResolvedValue([]);
      
      const rateLimiter = createRateLimiter(mockRedisService);

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should decrement correctly', async () => {
      mockRedisClient.zrange.mockResolvedValue(['1640995200000-0.123']);
      mockRedisClient.zcard.mockResolvedValue(11); // Over limit
      
      const rateLimiter = createRateLimiter(mockRedisService, { max: 10 });

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRedisClient.zrem).toHaveBeenCalledWith(
        'rate-limit:192.168.1.1',
        '1640995200000-0.123'
      );
    });
  });

  describe('createRateLimiters', () => {
    it('should create predefined rate limiters', () => {
      const limiters = createRateLimiters(mockRedisService);

      expect(limiters).toHaveProperty('api');
      expect(limiters).toHaveProperty('auth');
      expect(limiters).toHaveProperty('passwordReset');
      expect(limiters).toHaveProperty('upload');
      expect(limiters).toHaveProperty('expensive');
      expect(limiters).toHaveProperty('perUser');
      expect(limiters).toHaveProperty('dynamic');

      expect(typeof limiters.api).toBe('function');
      expect(typeof limiters.auth).toBe('function');
      expect(typeof limiters.dynamic).toBe('function');
    });

    it('should use email as key for password reset limiter', async () => {
      mockRequest.body = { email: 'test@example.com' };
      
      const limiters = createRateLimiters(mockRedisService);
      
      await limiters.passwordReset(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRedisClient.zremrangebyscore).toHaveBeenCalledWith(
        'rate-limit:test@example.com',
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should use user ID for per-user limiter', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      
      const limiters = createRateLimiters(mockRedisService);
      
      await limiters.perUser(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRedisClient.zremrangebyscore).toHaveBeenCalledWith(
        'rate-limit:user-123',
        expect.any(String),
        expect.any(Number)
      );
    });
  });

  describe('createRateLimitReset', () => {
    it('should reset rate limit for given key', async () => {
      const keyGenerator = jest.fn().mockReturnValue('test-key') as any;
      const resetMiddleware = createRateLimitReset(mockRedisService, keyGenerator);

      await resetMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(keyGenerator).toHaveBeenCalledWith(mockRequest);
      expect(mockRedisClient.del).toHaveBeenCalledWith('rate-limit:test-key');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle reset errors gracefully', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));
      
      const keyGenerator = jest.fn().mockReturnValue('test-key') as any;
      const resetMiddleware = createRateLimitReset(mockRedisService, keyGenerator);

      await resetMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Should continue despite error
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('edge cases', () => {
    it('should handle zero remaining requests', async () => {
      mockRedisClient.zcard.mockResolvedValue(10);
      
      const rateLimiter = createRateLimiter(mockRedisService, { max: 10 });

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', 0);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle very small window times', async () => {
      const rateLimiter = createRateLimiter(mockRedisService, {
        windowMs: 1000, // 1 second
        max: 5,
      });

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'rate-limit:192.168.1.1',
        1 // 1 second
      );
    });

    it('should handle AppError instances correctly', async () => {
      const mockAppError = new Error('Test error');
      (mockAppError as any).name = 'AppError';
      mockRedisClient.zcard.mockRejectedValue(mockAppError);
      
      // Mock AppError constructor
      (AppError as any).mockImplementation(() => mockAppError);
      
      const rateLimiter = createRateLimiter(mockRedisService);

      await rateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      // Should fail open for non-AppError instances
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
