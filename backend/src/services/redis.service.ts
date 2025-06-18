import Redis from 'ioredis';
import { authConfig } from '../config/auth.config';

export class RedisService {
  private client: Redis;
  private sessionPrefix = 'session:';
  private userSessionPrefix = 'user-sessions:';
  private rateLimitPrefix = 'rate-limit:';

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
    });
  }

  /**
   * Store session data
   */
  async setSession(sessionId: string, userId: string, data: any, ttl?: number): Promise<void> {
    const key = `${this.sessionPrefix}${sessionId}`;
    const sessionData = {
      userId,
      ...data,
      createdAt: new Date().toISOString(),
    };

    await this.client.setex(
      key,
      ttl || authConfig.session.maxAge / 1000, // Convert to seconds
      JSON.stringify(sessionData)
    );

    // Add to user's session list
    await this.addUserSession(userId, sessionId);
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<any | null> {
    const key = `${this.sessionPrefix}${sessionId}`;
    const data = await this.client.get(key);
    
    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const key = `${this.sessionPrefix}${sessionId}`;
    const session = await this.getSession(sessionId);
    
    if (session && session.userId) {
      await this.removeUserSession(session.userId, sessionId);
    }

    await this.client.del(key);
  }

  /**
   * Extend session TTL
   */
  async touchSession(sessionId: string, ttl?: number): Promise<boolean> {
    const key = `${this.sessionPrefix}${sessionId}`;
    const result = await this.client.expire(
      key,
      ttl || authConfig.session.maxAge / 1000
    );
    return result === 1;
  }

  /**
   * Add session to user's session list
   */
  private async addUserSession(userId: string, sessionId: string): Promise<void> {
    const key = `${this.userSessionPrefix}${userId}`;
    await this.client.sadd(key, sessionId);
    await this.client.expire(key, 86400 * 7); // 7 days
  }

  /**
   * Remove session from user's session list
   */
  private async removeUserSession(userId: string, sessionId: string): Promise<void> {
    const key = `${this.userSessionPrefix}${userId}`;
    await this.client.srem(key, sessionId);
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<string[]> {
    const key = `${this.userSessionPrefix}${userId}`;
    return await this.client.smembers(key);
  }

  /**
   * Clear all sessions for a user
   */
  async clearUserSessions(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    
    // Delete all session data
    const pipeline = this.client.pipeline();
    for (const sessionId of sessions) {
      pipeline.del(`${this.sessionPrefix}${sessionId}`);
    }
    
    // Delete user session list
    pipeline.del(`${this.userSessionPrefix}${userId}`);
    
    await pipeline.exec();
  }

  /**
   * Rate limiting check
   */
  async checkRateLimit(identifier: string, limit: number, window: number): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
  }> {
    const key = `${this.rateLimitPrefix}${identifier}`;
    const now = Date.now();
    const windowStart = now - window;

    // Remove old entries
    await this.client.zremrangebyscore(key, '-inf', windowStart);

    // Count requests in current window
    const count = await this.client.zcard(key);

    if (count >= limit) {
      // Get oldest entry to determine reset time
      const oldestEntry = await this.client.zrange(key, 0, 0, 'WITHSCORES');
      const resetAt = oldestEntry.length > 1 
        ? new Date(parseInt(oldestEntry[1]) + window)
        : new Date(now + window);

      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    // Add current request
    await this.client.zadd(key, now, `${now}-${Math.random()}`);
    await this.client.expire(key, Math.ceil(window / 1000));

    return {
      allowed: true,
      remaining: limit - count - 1,
      resetAt: new Date(now + window),
    };
  }

  /**
   * Store temporary data (e.g., password reset tokens)
   */
  async setTemp(key: string, value: string, ttl: number): Promise<void> {
    await this.client.setex(`temp:${key}`, ttl, value);
  }

  /**
   * Get temporary data
   */
  async getTemp(key: string): Promise<string | null> {
    return await this.client.get(`temp:${key}`);
  }

  /**
   * Delete temporary data
   */
  async deleteTemp(key: string): Promise<void> {
    await this.client.del(`temp:${key}`);
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.client.quit();
  }
}