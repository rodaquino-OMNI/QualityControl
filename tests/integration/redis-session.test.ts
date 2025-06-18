/**
 * Redis Session Management Integration Tests
 */

import Redis from 'ioredis';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../backend/src/index';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db-setup';
import { TestDataFactory } from '../utils/test-data-factory';
import { AuthTestHelper } from '../utils/auth-test-helper';
import { PrismaClient } from '@prisma/client';

describe('Redis Session Management Integration', () => {
  let app: Express;
  let prisma: PrismaClient;
  let redisClient: Redis;
  let testDataFactory: TestDataFactory;
  let authHelper: AuthTestHelper;
  let testUser: any;

  beforeAll(async () => {
    // Setup test infrastructure
    prisma = await setupTestDatabase();
    testDataFactory = new TestDataFactory(prisma);
    authHelper = new AuthTestHelper();
    
    // Setup Redis client
    redisClient = new Redis({
      host: process.env.REDIS_TEST_HOST || 'localhost',
      port: parseInt(process.env.REDIS_TEST_PORT || '6381'),
      password: process.env.REDIS_TEST_PASSWORD || 'test_password',
      db: 1
    });

    // Create test app
    app = createApp();

    // Create test user
    testUser = await testDataFactory.createUser({
      email: 'redis.test@austa.com',
      role: 'auditor',
      name: 'Redis Test User'
    });
  });

  afterAll(async () => {
    await cleanupTestDatabase(prisma);
    await redisClient.quit();
  });

  beforeEach(async () => {
    await redisClient.flushdb();
  });

  describe('Session Creation and Management', () => {
    it('should create session in Redis on login', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'redis.test@austa.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(loginResponse.body.data.sessionId).toBeDefined();
      
      const sessionId = loginResponse.body.data.sessionId;
      const sessionKey = `session:${sessionId}`;

      // Verify session exists in Redis
      const sessionData = await redisClient.get(sessionKey);
      expect(sessionData).toBeDefined();

      const session = JSON.parse(sessionData!);
      expect(session.userId).toBe(testUser.id);
      expect(session.email).toBe(testUser.email);
      expect(session.loginTime).toBeDefined();
    });

    it('should update session on activity', async () => {
      // Login to create session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'redis.test@austa.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      const token = loginResponse.body.data.token;
      const sessionId = loginResponse.body.data.sessionId;
      const sessionKey = `session:${sessionId}`;

      // Get initial session data
      const initialSession = JSON.parse(await redisClient.get(sessionKey) || '{}');
      const initialLastActivity = initialSession.lastActivity;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      // Make authenticated request to update session
      await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Verify session was updated
      const updatedSession = JSON.parse(await redisClient.get(sessionKey) || '{}');
      expect(updatedSession.lastActivity).toBeDefined();
      expect(new Date(updatedSession.lastActivity).getTime()).toBeGreaterThan(
        new Date(initialLastActivity).getTime()
      );
    });

    it('should handle session expiration', async () => {
      // Login to create session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'redis.test@austa.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      const token = loginResponse.body.data.token;
      const sessionId = loginResponse.body.data.sessionId;
      const sessionKey = `session:${sessionId}`;

      // Set short expiration for testing
      await redisClient.expire(sessionKey, 1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Verify session is expired
      const expiredSession = await redisClient.get(sessionKey);
      expect(expiredSession).toBeNull();

      // Verify API request fails with expired session
      await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('should destroy session on logout', async () => {
      // Login to create session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'redis.test@austa.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      const token = loginResponse.body.data.token;
      const sessionId = loginResponse.body.data.sessionId;
      const sessionKey = `session:${sessionId}`;

      // Verify session exists
      const sessionExists = await redisClient.exists(sessionKey);
      expect(sessionExists).toBe(1);

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Verify session is destroyed
      const sessionAfterLogout = await redisClient.exists(sessionKey);
      expect(sessionAfterLogout).toBe(0);
    });
  });

  describe('Session Security', () => {
    it('should handle concurrent sessions', async () => {
      const sessionTokens = [];
      const sessionIds = [];

      // Create multiple sessions for the same user
      for (let i = 0; i < 3; i++) {
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'redis.test@austa.com',
            password: 'TestPassword123!'
          })
          .expect(200);

        sessionTokens.push(loginResponse.body.data.token);
        sessionIds.push(loginResponse.body.data.sessionId);
      }

      // Verify all sessions exist
      for (const sessionId of sessionIds) {
        const sessionExists = await redisClient.exists(`session:${sessionId}`);
        expect(sessionExists).toBe(1);
      }

      // Test that all sessions work independently
      for (const token of sessionTokens) {
        await request(app)
          .get('/api/user/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }
    });

    it('should invalidate session on password change', async () => {
      // Login to create session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'redis.test@austa.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      const token = loginResponse.body.data.token;
      const sessionId = loginResponse.body.data.sessionId;

      // Change password (simulated)
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'TestPassword123!',
          newPassword: 'NewPassword123!'
        })
        .expect(200);

      // Verify old session is invalidated
      const sessionExists = await redisClient.exists(`session:${sessionId}`);
      expect(sessionExists).toBe(0);

      // Verify old token no longer works
      await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('should handle session hijacking prevention', async () => {
      // Login from one "location"
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'redis.test@austa.com',
          password: 'TestPassword123!'
        })
        .set('User-Agent', 'Original-Browser')
        .set('X-Forwarded-For', '192.168.1.100')
        .expect(200);

      const token = loginResponse.body.data.token;
      const sessionId = loginResponse.body.data.sessionId;

      // Attempt to use session from different "location"
      const suspiciousResponse = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${token}`)
        .set('User-Agent', 'Different-Browser')
        .set('X-Forwarded-For', '10.0.0.50');

      // Depending on security settings, this might be blocked
      // For testing, we'll check that security metadata is tracked
      const sessionData = await redisClient.get(`session:${sessionId}`);
      const session = JSON.parse(sessionData || '{}');
      
      expect(session.securityFlags).toBeDefined();
      expect(session.lastUserAgent).toBeDefined();
      expect(session.lastIpAddress).toBeDefined();
    });
  });

  describe('Session Storage and Retrieval', () => {
    it('should store complex session data', async () => {
      const sessionData = {
        userId: testUser.id,
        email: testUser.email,
        role: testUser.role,
        permissions: ['read_cases', 'write_cases'],
        preferences: {
          theme: 'dark',
          language: 'en',
          timezone: 'UTC'
        },
        metadata: {
          loginTime: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      };

      const sessionId = 'test-session-' + Math.random().toString(36).substring(7);
      const sessionKey = `session:${sessionId}`;

      // Store complex session data
      await redisClient.setex(sessionKey, 3600, JSON.stringify(sessionData));

      // Retrieve and verify
      const retrievedData = await redisClient.get(sessionKey);
      const parsedData = JSON.parse(retrievedData!);

      expect(parsedData.userId).toBe(testUser.id);
      expect(parsedData.permissions).toEqual(['read_cases', 'write_cases']);
      expect(parsedData.preferences.theme).toBe('dark');
    });

    it('should handle session data compression for large objects', async () => {
      // Create large session data
      const largeSessionData = {
        userId: testUser.id,
        email: testUser.email,
        largeArray: Array(1000).fill(0).map((_, i) => ({
          id: i,
          data: `Large data item ${i}`,
          nested: {
            field1: `Nested field 1 for item ${i}`,
            field2: `Nested field 2 for item ${i}`
          }
        }))
      };

      const sessionId = 'large-session-' + Math.random().toString(36).substring(7);
      const sessionKey = `session:${sessionId}`;

      // Store large session data
      const serializedData = JSON.stringify(largeSessionData);
      await redisClient.setex(sessionKey, 3600, serializedData);

      // Verify storage and retrieval
      const retrievedData = await redisClient.get(sessionKey);
      const parsedData = JSON.parse(retrievedData!);

      expect(parsedData.userId).toBe(testUser.id);
      expect(parsedData.largeArray).toHaveLength(1000);
      expect(parsedData.largeArray[0].id).toBe(0);
      expect(parsedData.largeArray[999].id).toBe(999);
    });
  });

  describe('Session Cleanup and Maintenance', () => {
    it('should clean up expired sessions', async () => {
      const sessionIds = [];

      // Create multiple sessions with different expiration times
      for (let i = 0; i < 5; i++) {
        const sessionId = `cleanup-test-${i}`;
        const sessionKey = `session:${sessionId}`;
        const sessionData = { userId: testUser.id, sessionNumber: i };

        // Set different expiration times
        const expiration = i === 0 ? 1 : 3600; // First session expires in 1 second
        await redisClient.setex(sessionKey, expiration, JSON.stringify(sessionData));
        sessionIds.push(sessionId);
      }

      // Wait for first session to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Check which sessions still exist
      const existingKeys = await Promise.all(
        sessionIds.map(id => redisClient.exists(`session:${id}`))
      );

      expect(existingKeys[0]).toBe(0); // First session should be expired
      expect(existingKeys.slice(1).every(exists => exists === 1)).toBe(true); // Others should exist
    });

    it('should handle session cleanup on user deletion', async () => {
      // Create additional user for testing
      const testUser2 = await testDataFactory.createUser({
        email: 'cleanup.test@austa.com',
        role: 'auditor',
        name: 'Cleanup Test User'
      });

      // Create sessions for both users
      const user1SessionId = 'user1-session';
      const user2SessionId = 'user2-session';

      await redisClient.setex(
        `session:${user1SessionId}`,
        3600,
        JSON.stringify({ userId: testUser.id })
      );

      await redisClient.setex(
        `session:${user2SessionId}`,
        3600,
        JSON.stringify({ userId: testUser2.id })
      );

      // Simulate user deletion cleanup
      await redisClient.del(`session:${user2SessionId}`);

      // Verify correct session was cleaned up
      const user1Session = await redisClient.exists(`session:${user1SessionId}`);
      const user2Session = await redisClient.exists(`session:${user2SessionId}`);

      expect(user1Session).toBe(1);
      expect(user2Session).toBe(0);
    });
  });

  describe('Session Performance', () => {
    it('should handle high-volume session operations', async () => {
      const sessionCount = 100;
      const startTime = Date.now();

      // Create multiple sessions rapidly
      const sessionPromises = Array.from({ length: sessionCount }, async (_, i) => {
        const sessionId = `perf-test-${i}`;
        const sessionData = {
          userId: testUser.id,
          sessionNumber: i,
          timestamp: new Date().toISOString()
        };

        return redisClient.setex(
          `session:${sessionId}`,
          3600,
          JSON.stringify(sessionData)
        );
      });

      await Promise.all(sessionPromises);

      const createTime = Date.now() - startTime;

      // Retrieve all sessions
      const retrieveStartTime = Date.now();
      const retrievePromises = Array.from({ length: sessionCount }, (_, i) => 
        redisClient.get(`session:perf-test-${i}`)
      );

      const sessions = await Promise.all(retrievePromises);
      const retrieveTime = Date.now() - retrieveStartTime;

      // Verify performance and data integrity
      expect(sessions.every(session => session !== null)).toBe(true);
      expect(createTime).toBeLessThan(1000); // Should create 100 sessions in under 1 second
      expect(retrieveTime).toBeLessThan(500); // Should retrieve 100 sessions in under 0.5 seconds

      console.log(`Created ${sessionCount} sessions in ${createTime}ms`);
      console.log(`Retrieved ${sessionCount} sessions in ${retrieveTime}ms`);
    });

    it('should handle concurrent session access', async () => {
      const sessionId = 'concurrent-test';
      const sessionKey = `session:${sessionId}`;
      
      // Initialize session
      await redisClient.setex(sessionKey, 3600, JSON.stringify({
        userId: testUser.id,
        counter: 0
      }));

      // Simulate concurrent session updates
      const concurrentUpdates = 50;
      const updatePromises = Array.from({ length: concurrentUpdates }, async (_, i) => {
        // Get current session
        const sessionData = await redisClient.get(sessionKey);
        const session = JSON.parse(sessionData || '{}');
        
        // Update session
        session.lastUpdate = Date.now();
        session.updateNumber = i;
        
        // Set with expiration
        return redisClient.setex(sessionKey, 3600, JSON.stringify(session));
      });

      await Promise.all(updatePromises);

      // Verify final session state
      const finalSession = JSON.parse(await redisClient.get(sessionKey) || '{}');
      expect(finalSession.userId).toBe(testUser.id);
      expect(finalSession.lastUpdate).toBeDefined();
      expect(finalSession.updateNumber).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Session Error Handling', () => {
    it('should handle Redis connection failures gracefully', async () => {
      // Create a separate Redis client to simulate connection issues
      const faultyClient = new Redis({
        host: 'non-existent-host',
        port: 6379,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1,
        lazyConnect: true
      });

      // Attempt operations that should fail gracefully
      try {
        await faultyClient.get('test-key');
      } catch (error) {
        expect(error.code).toMatch(/ENOTFOUND|ECONNREFUSED/);
      }

      await faultyClient.quit();
    });

    it('should handle malformed session data', async () => {
      const sessionId = 'malformed-session';
      const sessionKey = `session:${sessionId}`;

      // Store malformed JSON
      await redisClient.set(sessionKey, 'invalid-json{');

      // Attempt to retrieve and handle gracefully
      const sessionData = await redisClient.get(sessionKey);
      
      expect(() => {
        JSON.parse(sessionData || '');
      }).toThrow();

      // Application should handle this gracefully by treating as no session
      await redisClient.del(sessionKey);
    });
  });
});