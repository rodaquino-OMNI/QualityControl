/**
 * Backend ↔ Database Operations Integration Tests
 * Tests database operations across PostgreSQL, MongoDB, and Redis
 */

import { PrismaClient } from '@prisma/client';
import { MongoClient, Db } from 'mongodb';
import Redis from 'ioredis';
import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../backend/src/index';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db-setup';
import { TestDataFactory } from '../utils/test-data-factory';
import { AuthTestHelper } from '../utils/auth-test-helper';
import { DatabaseTestHelper } from '../utils/database-test-helper';

describe('Backend ↔ Database Integration', () => {
  let app: Express;
  let prisma: PrismaClient;
  let mongoClient: MongoClient;
  let mongodb: Db;
  let redisClient: Redis;
  let testDataFactory: TestDataFactory;
  let authHelper: AuthTestHelper;
  let dbHelper: DatabaseTestHelper;
  let testUser: any;
  let authToken: string;

  beforeAll(async () => {
    // Setup databases
    prisma = await setupTestDatabase();
    
    // Setup MongoDB
    mongoClient = new MongoClient(process.env.MONGODB_TEST_URL || 'mongodb://localhost:27017');
    await mongoClient.connect();
    mongodb = mongoClient.db('austa_test_logs');

    // Setup Redis
    redisClient = new Redis({
      host: process.env.REDIS_TEST_HOST || 'localhost',
      port: parseInt(process.env.REDIS_TEST_PORT || '6379'),
      db: 1 // Use separate DB for tests
    });

    // Setup test utilities
    testDataFactory = new TestDataFactory(prisma);
    authHelper = new AuthTestHelper();
    dbHelper = new DatabaseTestHelper(prisma, mongodb, redisClient);
    
    // Create test app
    app = createApp();

    // Create test user
    testUser = await testDataFactory.createUser({
      email: 'test@austa.com',
      role: 'auditor',
      name: 'Test Auditor'
    });

    authToken = await authHelper.generateToken(testUser);
  });

  afterAll(async () => {
    await cleanupTestDatabase(prisma);
    await mongoClient.close();
    await redisClient.quit();
  });

  beforeEach(async () => {
    await testDataFactory.cleanup();
    await dbHelper.clearMongoCollections();
    await redisClient.flushdb();
  });

  describe('PostgreSQL Operations', () => {
    it('should handle complex case queries with relationships', async () => {
      // Create test data with relationships
      const department = await testDataFactory.createDepartment({
        name: 'Cardiology',
        code: 'CARD'
      });

      const auditor = await testDataFactory.createUser({
        email: 'auditor@austa.com',
        role: 'auditor',
        departmentId: department.id
      });

      const cases = await testDataFactory.createMultipleCases(5, auditor.id, {
        department: department.id,
        priority: 'high'
      });

      // Add case notes and attachments
      for (const testCase of cases) {
        await testDataFactory.createCaseNote(testCase.id, auditor.id, {
          content: `Analysis for case ${testCase.title}`,
          type: 'analysis'
        });

        await testDataFactory.createCaseAttachment(testCase.id, {
          filename: `document_${testCase.id}.pdf`,
          size: 1024 * 1024,
          type: 'medical_record'
        });
      }

      // Test complex query through API
      const response = await request(app)
        .get('/api/cases')
        .query({
          department: department.id,
          priority: 'high',
          include: 'notes,attachments,assignee,department',
          sort: 'createdAt:desc'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.cases).toHaveLength(5);
      
      // Verify relationships are loaded
      const firstCase = response.body.data.cases[0];
      expect(firstCase.assignee).toBeDefined();
      expect(firstCase.assignee.email).toBe('auditor@austa.com');
      expect(firstCase.department).toBeDefined();
      expect(firstCase.department.name).toBe('Cardiology');
      expect(firstCase.notes).toBeDefined();
      expect(firstCase.attachments).toBeDefined();
    });

    it('should handle database transactions properly', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Test transaction rollback scenario
      const invalidUpdateData = {
        status: 'invalid_status', // This should fail validation
        priority: 'high',
        assignedToId: 'invalid_user_id' // This should fail foreign key constraint
      };

      const response = await request(app)
        .put(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidUpdateData)
        .expect(400);

      // Verify original data is unchanged (transaction rolled back)
      const originalCase = await prisma.case.findUnique({
        where: { id: testCase.id }
      });

      expect(originalCase?.status).toBe('pending'); // Original status
      expect(originalCase?.assignedToId).toBe(testUser.id); // Original assignee
    });

    it('should handle concurrent database operations', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Simulate concurrent updates
      const updateOperations = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post(`/api/cases/${testCase.id}/notes`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            content: `Concurrent note ${i}`,
            type: 'review'
          })
      );

      const responses = await Promise.all(updateOperations);

      // All operations should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Verify all notes were created
      const caseWithNotes = await prisma.case.findUnique({
        where: { id: testCase.id },
        include: { notes: true }
      });

      expect(caseWithNotes?.notes).toHaveLength(10);
    });

    it('should handle database connection pooling', async () => {
      // Create multiple simultaneous database-heavy operations
      const operations = Array.from({ length: 20 }, (_, i) =>
        request(app)
          .post('/api/cases')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Concurrent Case ${i}`,
            description: `Test case ${i}`,
            priority: 'medium'
          })
      );

      const startTime = Date.now();
      const responses = await Promise.all(operations);
      const endTime = Date.now();

      // All operations should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Should complete within reasonable time (good connection pooling)
      expect(endTime - startTime).toBeLessThan(5000);
      console.log(`Completed ${operations.length} DB operations in ${endTime - startTime}ms`);
    });

    it('should handle large dataset queries with pagination', async () => {
      // Create large dataset
      await testDataFactory.createMultipleCases(1000, testUser.id);

      // Test pagination performance
      const startTime = Date.now();
      const response = await request(app)
        .get('/api/cases')
        .query({
          page: 1,
          pageSize: 50,
          sort: 'createdAt:desc'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const endTime = Date.now();

      expect(response.body.data.cases).toHaveLength(50);
      expect(response.body.data.total).toBe(1000);
      expect(response.body.data.totalPages).toBe(20);

      // Should be fast even with large dataset
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle database migrations and schema changes', async () => {
      // Test schema validation
      const schemaInfo = await prisma.$queryRaw`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name IN ('cases', 'users', 'departments')
        ORDER BY table_name, ordinal_position;
      `;

      expect(schemaInfo).toBeDefined();
      expect(Array.isArray(schemaInfo)).toBe(true);

      // Test foreign key constraints
      const foreignKeys = await prisma.$queryRaw`
        SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public';
      `;

      expect(foreignKeys).toBeDefined();
      expect(Array.isArray(foreignKeys)).toBe(true);
    });
  });

  describe('MongoDB Operations', () => {
    it('should handle audit log storage and retrieval', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Create case to generate audit logs
      await request(app)
        .put(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'in_progress',
          priority: 'high'
        })
        .expect(200);

      // Wait for async log processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify audit logs in MongoDB
      const auditLogs = await mongodb.collection('audit_logs').find({
        resourceId: testCase.id,
        resourceType: 'case'
      }).toArray();

      expect(auditLogs.length).toBeGreaterThan(0);
      
      const updateLog = auditLogs.find(log => log.action === 'update');
      expect(updateLog).toBeDefined();
      expect(updateLog.userId).toBe(testUser.id);
      expect(updateLog.changes).toMatchObject({
        status: { from: 'pending', to: 'in_progress' },
        priority: { from: expect.any(String), to: 'high' }
      });
    });

    it('should handle system event logging', async () => {
      // Trigger system events
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@austa.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Wait for async log processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify system events in MongoDB
      const systemEvents = await mongodb.collection('system_events').find({
        userId: testUser.id
      }).toArray();

      expect(systemEvents.length).toBeGreaterThan(0);
      
      const loginEvent = systemEvents.find(event => event.eventType === 'user_login');
      expect(loginEvent).toBeDefined();
      expect(loginEvent.metadata.userAgent).toBeDefined();
      expect(loginEvent.metadata.ipAddress).toBeDefined();
    });

    it('should handle error logging and aggregation', async () => {
      // Trigger an error
      await request(app)
        .get('/api/cases/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      // Wait for async log processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify error logs in MongoDB
      const errorLogs = await mongodb.collection('error_logs').find({
        userId: testUser.id,
        errorType: 'NotFoundError'
      }).toArray();

      expect(errorLogs.length).toBeGreaterThan(0);
      
      const errorLog = errorLogs[0];
      expect(errorLog.message).toContain('not found');
      expect(errorLog.stack).toBeDefined();
      expect(errorLog.metadata.endpoint).toBe('/api/cases/non-existent-id');
    });

    it('should handle MongoDB aggregation queries', async () => {
      // Create test data for aggregation
      const cases = await testDataFactory.createMultipleCases(20, testUser.id);
      
      // Generate various audit logs
      for (const testCase of cases.slice(0, 10)) {
        await mongodb.collection('audit_logs').insertOne({
          resourceId: testCase.id,
          resourceType: 'case',
          action: 'update',
          userId: testUser.id,
          timestamp: new Date(),
          changes: { status: { from: 'pending', to: 'completed' } }
        });
      }

      // Test aggregation through API
      const response = await request(app)
        .get('/api/analytics/audit-summary')
        .query({
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
          groupBy: 'action'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.summary).toBeDefined();
      expect(response.body.data.summary.update).toBeGreaterThanOrEqual(10);
    });

    it('should handle MongoDB text search', async () => {
      // Insert searchable documents
      await mongodb.collection('case_notes').insertMany([
        {
          caseId: 'case1',
          content: 'Patient shows signs of diabetes complications',
          keywords: ['diabetes', 'complications', 'patient'],
          createdAt: new Date()
        },
        {
          caseId: 'case2',
          content: 'Hypertension medication review required',
          keywords: ['hypertension', 'medication', 'review'],
          createdAt: new Date()
        },
        {
          caseId: 'case3',
          content: 'Diabetes management plan updated',
          keywords: ['diabetes', 'management', 'plan'],
          createdAt: new Date()
        }
      ]);

      // Test text search through API
      const response = await request(app)
        .get('/api/search/case-notes')
        .query({
          q: 'diabetes',
          limit: 10
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.results).toHaveLength(2);
      expect(response.body.data.results.every((r: any) => 
        r.content.includes('diabetes') || r.keywords.includes('diabetes')
      )).toBe(true);
    });
  });

  describe('Redis Operations', () => {
    it('should handle session management', async () => {
      // Login to create session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@austa.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      const sessionToken = loginResponse.body.data.token;
      const sessionId = loginResponse.body.data.sessionId;

      // Verify session exists in Redis
      const sessionData = await redisClient.get(`session:${sessionId}`);
      expect(sessionData).toBeDefined();
      
      const parsedSession = JSON.parse(sessionData!);
      expect(parsedSession.userId).toBe(testUser.id);
      expect(parsedSession.email).toBe(testUser.email);

      // Test session usage
      await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);

      // Verify session is updated (last accessed time)
      const updatedSession = await redisClient.get(`session:${sessionId}`);
      const parsedUpdated = JSON.parse(updatedSession!);
      expect(parsedUpdated.lastAccessed).toBeDefined();

      // Test session expiration
      await redisClient.expire(`session:${sessionId}`, 1); // 1 second TTL
      await new Promise(resolve => setTimeout(resolve, 1100));

      const expiredSession = await redisClient.get(`session:${sessionId}`);
      expect(expiredSession).toBeNull();
    });

    it('should handle caching operations', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // First request should hit database and cache result
      const response1 = await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify data is cached
      const cachedData = await redisClient.get(`case:${testCase.id}`);
      expect(cachedData).toBeDefined();
      
      const parsedCache = JSON.parse(cachedData!);
      expect(parsedCache.id).toBe(testCase.id);

      // Second request should hit cache (should be faster)
      const startTime = Date.now();
      const response2 = await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const endTime = Date.now();

      expect(response2.body.data.id).toBe(testCase.id);
      expect(endTime - startTime).toBeLessThan(100); // Should be very fast from cache

      // Test cache invalidation
      await request(app)
        .put(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'in_progress' })
        .expect(200);

      // Cache should be invalidated
      const invalidatedCache = await redisClient.get(`case:${testCase.id}`);
      expect(invalidatedCache).toBeNull();
    });

    it('should handle rate limiting', async () => {
      const endpoint = '/api/cases';
      const requests = Array.from({ length: 15 }, () =>
        request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // Verify rate limit info in Redis
      const rateLimitKey = `rate_limit:${testUser.id}:${endpoint}`;
      const rateLimitData = await redisClient.get(rateLimitKey);
      expect(rateLimitData).toBeDefined();
    });

    it('should handle distributed locking', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);
      const lockKey = `lock:case:${testCase.id}`;

      // Simulate concurrent updates that require locking
      const updateOperations = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .put(`/api/cases/${testCase.id}/priority-update`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ priority: i % 2 === 0 ? 'high' : 'low' })
      );

      const responses = await Promise.all(updateOperations);

      // Only one operation should succeed due to locking
      const successfulResponses = responses.filter(r => r.status === 200);
      expect(successfulResponses).toHaveLength(1);

      // Others should be rejected
      const rejectedResponses = responses.filter(r => r.status === 409);
      expect(rejectedResponses).toHaveLength(4);

      // Lock should be released
      const lockExists = await redisClient.exists(lockKey);
      expect(lockExists).toBe(0);
    });

    it('should handle pub/sub messaging', async () => {
      const subscriber = new Redis({
        host: process.env.REDIS_TEST_HOST || 'localhost',
        port: parseInt(process.env.REDIS_TEST_PORT || '6379'),
        db: 1
      });

      let receivedMessages: any[] = [];
      
      subscriber.subscribe('case_updates');
      subscriber.on('message', (channel, message) => {
        if (channel === 'case_updates') {
          receivedMessages.push(JSON.parse(message));
        }
      });

      // Wait for subscription to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create case update to trigger pub/sub
      const testCase = await testDataFactory.createCase(testUser.id);
      await request(app)
        .put(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'in_progress' })
        .expect(200);

      // Wait for message to be received
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toMatchObject({
        type: 'case_updated',
        caseId: testCase.id,
        status: 'in_progress'
      });

      await subscriber.quit();
    });
  });

  describe('Cross-Database Operations', () => {
    it('should handle operations across all three databases', async () => {
      // Create case (PostgreSQL)
      const testCase = await testDataFactory.createCase(testUser.id, {
        title: 'Cross-DB Test Case',
        priority: 'high'
      });

      // Cache case data (Redis)
      await redisClient.setex(`case:${testCase.id}`, 3600, JSON.stringify({
        id: testCase.id,
        title: 'Cross-DB Test Case',
        cached_at: new Date().toISOString()
      }));

      // Log case creation (MongoDB)
      await mongodb.collection('audit_logs').insertOne({
        resourceId: testCase.id,
        resourceType: 'case',
        action: 'create',
        userId: testUser.id,
        timestamp: new Date(),
        metadata: { title: 'Cross-DB Test Case' }
      });

      // Test API that uses all three databases
      const response = await request(app)
        .get(`/api/cases/${testCase.id}/full-details`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        case: {
          id: testCase.id,
          title: 'Cross-DB Test Case'
        },
        cached_info: {
          cached_at: expect.any(String)
        },
        audit_trail: expect.arrayContaining([
          expect.objectContaining({
            action: 'create',
            userId: testUser.id
          })
        ])
      });
    });

    it('should handle database failover scenarios', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Simulate PostgreSQL failure
      await prisma.$disconnect();

      // API should gracefully handle database unavailability
      const response = await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(503);

      expect(response.body.error.type).toBe('database_unavailable');

      // Reconnect and verify recovery
      prisma = await setupTestDatabase();
      
      const recoveryResponse = await request(app)
        .get('/api/health/database')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(recoveryResponse.body.data.postgresql.status).toBe('healthy');
    });

    it('should maintain data consistency across databases', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Update case (should update PostgreSQL, invalidate Redis cache, log to MongoDB)
      await request(app)
        .put(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'completed',
          resolution: 'Case resolved successfully'
        })
        .expect(200);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify PostgreSQL update
      const updatedCase = await prisma.case.findUnique({
        where: { id: testCase.id }
      });
      expect(updatedCase?.status).toBe('completed');

      // Verify Redis cache invalidation
      const cachedData = await redisClient.get(`case:${testCase.id}`);
      expect(cachedData).toBeNull();

      // Verify MongoDB audit log
      const auditLog = await mongodb.collection('audit_logs').findOne({
        resourceId: testCase.id,
        action: 'update'
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.changes.status.to).toBe('completed');
    });
  });

  describe('Database Performance and Monitoring', () => {
    it('should monitor database performance metrics', async () => {
      // Generate some database activity
      await testDataFactory.createMultipleCases(50, testUser.id);

      const response = await request(app)
        .get('/api/admin/database/metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        postgresql: {
          connections: expect.any(Number),
          queries_per_second: expect.any(Number),
          avg_query_time: expect.any(Number)
        },
        mongodb: {
          connections: expect.any(Number),
          operations_per_second: expect.any(Number),
          avg_operation_time: expect.any(Number)
        },
        redis: {
          connected_clients: expect.any(Number),
          operations_per_second: expect.any(Number),
          memory_usage: expect.any(Number)
        }
      });
    });

    it('should handle database backup and restore operations', async () => {
      // Create test data
      const testCase = await testDataFactory.createCase(testUser.id);
      await mongodb.collection('audit_logs').insertOne({
        resourceId: testCase.id,
        action: 'create',
        timestamp: new Date()
      });

      // Trigger backup
      const backupResponse = await request(app)
        .post('/api/admin/database/backup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ include_logs: true })
        .expect(202);

      expect(backupResponse.body.data.backup_id).toBeDefined();

      // Check backup status
      const statusResponse = await request(app)
        .get(`/api/admin/database/backup/${backupResponse.body.data.backup_id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(statusResponse.body.data.status).toMatch(/pending|in_progress|completed/);
    });
  });
});