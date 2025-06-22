import Redis from 'ioredis';
import { logger } from '../utils/logger';

export class RedisService {
  public client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.client.on('connect', () => {
      logger.info('Connected to Redis');
    });

    this.client.on('error', (error) => {
      logger.error('Redis error:', error);
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error(`Error getting key ${key} from Redis:`, error);
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.setex(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error(`Error setting key ${key} in Redis:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error(`Error deleting key ${key} from Redis:`, error);
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    try {
      await this.client.publish(channel, message);
    } catch (error) {
      logger.error(`Error publishing to channel ${channel}:`, error);
    }
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    const subscriber = this.client.duplicate();
    
    subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        callback(message);
      }
    });

    await subscriber.subscribe(channel);
  }

  async checkRateLimit(identifier: string, limit: number, window: number): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
  }> {
    const key = `rate-limit:${identifier}`;
    const now = Date.now();
    const windowStart = now - window;

    // Remove old entries
    await this.client.zremrangebyscore(key, '-inf', windowStart);

    // Count current entries
    const count = await this.client.zcard(key);

    if (count >= limit) {
      // Get the oldest entry to determine reset time
      const oldest = await this.client.zrange(key, 0, 0, 'WITHSCORES');
      const resetAt = new Date((oldest[1] as any as number) + window);
      
      return {
        allowed: false,
        remaining: 0,
        resetAt
      };
    }

    // Add current request
    await this.client.zadd(key, now, `${now}-${Math.random()}`);
    
    // Set expiration
    await this.client.expire(key, Math.ceil(window / 1000));

    return {
      allowed: true,
      remaining: limit - count - 1,
      resetAt: new Date(now + window)
    };
  }

  async clearUserSessions(userId: string): Promise<void> {
    // Pattern for user session keys
    const sessionPattern = `user-sessions:${userId}:*`;
    
    try {
      // Get all session keys for this user
      const keys = await this.client.keys(sessionPattern);
      
      if (keys.length > 0) {
        // Delete all session keys
        await this.client.del(...keys);
      }
      
      // Also delete the user session list
      await this.client.del(`user-sessions:${userId}`);
    } catch (error) {
      logger.error('Failed to clear user sessions:', error);
    }
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    try {
      await this.client.setex(key, seconds, value);
    } catch (error) {
      logger.error(`Error setting key ${key} with expiration in Redis:`, error);
    }
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    try {
      return await this.client.hincrby(key, field, increment);
    } catch (error) {
      logger.error(`Error incrementing hash field ${field} in key ${key}:`, error);
      return 0;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hgetall(key);
    } catch (error) {
      logger.error(`Error getting all hash fields for key ${key}:`, error);
      return {};
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      logger.error(`Error setting expiration for key ${key}:`, error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}