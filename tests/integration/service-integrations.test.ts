/**
 * Service Integrations Integration Tests
 * Tests external service connections and integrations (Redis, AI Service, Database)
 */

import request from 'supertest';
import { Express } from 'express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import axios from 'axios';
import { createApp } from '../../backend/src/app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db-setup';
import { TestDataFactory } from '../utils/test-data-factory';
import { AuthTestHelper } from '../utils/auth-test-helper';

describe('Service Integrations Tests', () => {
  let app: Express;
  let prisma: PrismaClient;
  let redisClient: Redis;
  let testDataFactory: TestDataFactory;
  let authHelper: AuthTestHelper;
  let testUser: any;
  let authToken: string;

  beforeAll(async () => {
    // Setup test environment
    prisma = await setupTestDatabase();
    testDataFactory = new TestDataFactory(prisma);
    authHelper = new AuthTestHelper();
    
    // Setup Redis client for testing
    redisClient = new Redis({
      host: process.env.REDIS_TEST_HOST || 'localhost',
      port: parseInt(process.env.REDIS_TEST_PORT || '6379'),
      db: 1 // Use separate DB for tests
    });

    app = createApp();

    // Create test user
    testUser = await testDataFactory.createUser({
      email: 'test@austa.com',
      role: 'auditor',
      name: 'Test User'
    });

    authToken = await authHelper.generateToken(testUser);
  });

  afterAll(async () => {
    await cleanupTestDatabase(prisma);
    await redisClient.quit();
  });

  beforeEach(async () => {
    await testDataFactory.cleanup();
    await redisClient.flushdb(); // Clear Redis cache before each test
  });

  describe('Database Integration', () => {
    it('should handle PostgreSQL connection and queries', async () => {
      // Test database connectivity through API
      const response = await request(app)
        .get('/api/health/database')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.postgresql).toMatchObject({
        status: 'connected',
        version: expect.any(String),
        connectionCount: expect.any(Number)
      });
    });

    it('should handle complex queries with joins and aggregations', async () => {
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

      await testDataFactory.createMultipleCases(10, auditor.id, {
        department: department.id,
        priority: 'high'
      });

      // Test complex analytics query
      const response = await request(app)
        .get('/api/analytics/department-performance')
        .query({
          departmentId: department.id,
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        department: expect.any(Object),
        metrics: {
          totalCases: 10,
          averageProcessingTime: expect.any(Number),
          completionRate: expect.any(Number)
        },
        auditorPerformance: expect.any(Array)
      });
    });

    it('should handle database transactions correctly', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Test transaction that should succeed
      const response = await request(app)
        .post(`/api/cases/${testCase.id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'completed',
          resolution: 'Case resolved',
          attachFinalReport: true,
          notifyStakeholders: true
        })
        .expect(200);

      // Verify all operations completed atomically
      const completedCase = await prisma.case.findUnique({
        where: { id: testCase.id },
        include: { 
          attachments: true,
          auditLogs: true,
          notifications: true
        }
      });

      expect(completedCase?.status).toBe('completed');
      expect(completedCase?.attachments).toHaveLength(1); // Final report attached
      expect(completedCase?.auditLogs).toHaveLength(1); // Audit log created
      expect(completedCase?.notifications).toHaveLength(1); // Notification sent
    });

    it('should handle database connection failures gracefully', async () => {
      // Simulate database connection issue
      await prisma.$disconnect();

      const response = await request(app)
        .get('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(503);

      expect(response.body.error).toMatchObject({
        type: 'database_unavailable',
        message: expect.stringContaining('database')
      });

      // Reconnect for subsequent tests
      prisma = await setupTestDatabase();
    });

    it('should handle database query timeouts', async () => {
      // Create a large dataset to potentially trigger timeout
      await testDataFactory.createMultipleCases(1000, testUser.id);

      // Test with very short timeout setting
      const response = await request(app)
        .get('/api/analytics/complex-report')
        .query({ timeout: 1 }) // 1ms timeout to force timeout
        .set('Authorization', `Bearer ${authToken}`)
        .expect(408);

      expect(response.body.error.type).toBe('query_timeout');
    });
  });

  describe('Redis Integration', () => {
    it('should handle Redis caching correctly', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // First request should hit database and cache result
      const response1 = await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify data is cached in Redis
      const cacheKey = `case:${testCase.id}`;
      const cachedData = await redisClient.get(cacheKey);
      expect(cachedData).toBeTruthy();

      const parsedCache = JSON.parse(cachedData!);
      expect(parsedCache.id).toBe(testCase.id);

      // Second request should be faster (from cache)
      const startTime = Date.now();
      const response2 = await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const endTime = Date.now();

      expect(response2.body.data.case.id).toBe(testCase.id);
      expect(endTime - startTime).toBeLessThan(50); // Very fast response from cache
    });

    it('should handle cache invalidation properly', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Cache the case data
      await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify cache exists
      const cacheKey = `case:${testCase.id}`;
      let cachedData = await redisClient.get(cacheKey);
      expect(cachedData).toBeTruthy();

      // Update the case (should invalidate cache)
      await request(app)
        .patch(`/api/cases/${testCase.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'in_review' })
        .expect(200);

      // Verify cache is invalidated
      cachedData = await redisClient.get(cacheKey);
      expect(cachedData).toBeNull();
    });

    it('should handle Redis session management', async () => {
      // Login to create session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'TestPassword123!'
        })
        .expect(200);

      const sessionToken = loginResponse.body.data.token;
      const sessionId = loginResponse.body.data.sessionId;

      // Verify session exists in Redis
      const sessionKey = `session:${sessionId}`;
      const sessionData = await redisClient.get(sessionKey);
      expect(sessionData).toBeTruthy();

      const parsedSession = JSON.parse(sessionData!);
      expect(parsedSession.userId).toBe(testUser.id);

      // Use session for authenticated request
      await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);

      // Logout should remove session
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);

      // Verify session is removed from Redis
      const expiredSession = await redisClient.get(sessionKey);
      expect(expiredSession).toBeNull();
    });

    it('should handle Redis pub/sub for real-time updates', async () => {
      const subscriber = new Redis({
        host: process.env.REDIS_TEST_HOST || 'localhost',
        port: parseInt(process.env.REDIS_TEST_PORT || '6379'),
        db: 1
      });

      let receivedMessages: any[] = [];
      
      // Subscribe to case updates
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
        .patch(`/api/cases/${testCase.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'completed' })
        .expect(200);

      // Wait for message to be received
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toMatchObject({
        type: 'case_updated',
        caseId: testCase.id,
        status: 'completed',
        updatedBy: testUser.id
      });

      await subscriber.quit();
    });

    it('should handle Redis connection failures', async () => {
      // Disconnect Redis temporarily
      await redisClient.quit();

      // API should still work without caching
      const testCase = await testDataFactory.createCase(testUser.id);
      const response = await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.case.id).toBe(testCase.id);

      // Reconnect Redis
      redisClient = new Redis({
        host: process.env.REDIS_TEST_HOST || 'localhost',
        port: parseInt(process.env.REDIS_TEST_PORT || '6379'),
        db: 1
      });
    });
  });

  describe('AI Service Integration', () => {
    it('should communicate with AI service for case analysis', async () => {
      const testCase = await testDataFactory.createCaseWithPatient(testUser.id, {
        patientData: {
          age: 65,
          diagnosis: 'E11.9',
          medications: ['Metformin', 'Insulin']
        }
      });

      // Mock AI service response
      const aiServiceMock = jest.spyOn(axios, 'post').mockResolvedValue({
        data: {
          recommendation: 'approved',
          confidence: 0.85,
          explanation: 'Standard diabetes medication regimen',
          riskFactors: [
            {
              factor: 'age_related',
              score: 0.3,
              description: 'Age factor considered'
            }
          ],
          modelVersion: '1.2.3'
        }
      });

      const response = await request(app)
        .post(`/api/ai/analyze/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ analysisType: 'full' })
        .expect(200);

      expect(response.body.data.analysis).toMatchObject({
        recommendation: 'approved',
        confidence: 0.85,
        explanation: expect.stringContaining('diabetes')
      });

      expect(aiServiceMock).toHaveBeenCalledWith(
        expect.stringContaining('/analyze'),
        expect.objectContaining({
          case: expect.objectContaining({ id: testCase.id }),
          analysisType: 'full'
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer')
          })
        })
      );

      aiServiceMock.mockRestore();
    });

    it('should handle AI service timeouts with fallback', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Mock AI service timeout
      const aiServiceMock = jest.spyOn(axios, 'post').mockRejectedValue(
        new Error('ETIMEDOUT')
      );

      const response = await request(app)
        .post(`/api/ai/analyze/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ analysisType: 'quick' })
        .expect(200);

      // Should get fallback analysis
      expect(response.body.data.analysis).toMatchObject({
        recommendation: 'review',
        confidence: 0.5,
        explanation: expect.stringContaining('fallback'),
        modelVersion: 'fallback-1.0'
      });

      aiServiceMock.mockRestore();
    });

    it('should handle AI service authentication errors', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Mock AI service authentication error
      const aiServiceMock = jest.spyOn(axios, 'post').mockRejectedValue({
        response: { status: 401, data: { error: 'Unauthorized' } }
      });

      const response = await request(app)
        .post(`/api/ai/analyze/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ analysisType: 'full' })
        .expect(200); // Should fallback gracefully

      expect(response.body.data.analysis.modelVersion).toBe('fallback-1.0');

      aiServiceMock.mockRestore();
    });

    it('should handle fraud detection service integration', async () => {
      const testCase = await testDataFactory.createCaseWithPatient(testUser.id, {
        value: 50000 // High value case
      });

      // Mock fraud detection response
      const fraudMock = jest.spyOn(axios, 'post').mockResolvedValue({
        data: {
          fraudScore: 0.75,
          indicators: [
            {
              type: 'high_value',
              description: 'Unusually high claim value',
              severity: 'medium',
              confidence: 0.8
            }
          ],
          modelVersion: '2.1.0'
        }
      });

      const response = await request(app)
        .post(`/api/ai/fraud-detection/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        fraudScore: 0.75,
        riskLevel: 'high',
        indicators: expect.arrayContaining([
          expect.objectContaining({
            type: 'high_value',
            description: expect.stringContaining('high claim value')
          })
        ])
      });

      fraudMock.mockRestore();
    });
  });

  describe('Message Queue Integration', () => {
    it('should queue AI analysis jobs', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      const response = await request(app)
        .post(`/api/cases/${testCase.id}/queue-analysis`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          priority: 'high',
          analysisType: 'comprehensive'
        })
        .expect(202);

      expect(response.body.data).toMatchObject({
        jobId: expect.any(String),
        status: 'queued',
        estimatedProcessingTime: expect.any(Number)
      });
    });

    it('should queue fraud detection jobs', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      const response = await request(app)
        .post(`/api/cases/${testCase.id}/queue-fraud-check`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body.data.jobId).toBeDefined();
      expect(response.body.data.status).toBe('queued');
    });

    it('should handle notification queue', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Update case to trigger notifications
      await request(app)
        .patch(`/api/cases/${testCase.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'completed' })
        .expect(200);

      // Check if notification was queued
      const response = await request(app)
        .get('/api/admin/queue-status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.notifications.pending).toBeGreaterThan(0);
    });
  });

  describe('File Storage Integration', () => {
    it('should handle file upload and processing', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);
      const fileBuffer = Buffer.from('Mock PDF content');

      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'medical-report.pdf')
        .field('caseId', testCase.id)
        .field('fileType', 'medical_record')
        .expect(201);

      expect(response.body.data).toMatchObject({
        fileId: expect.any(String),
        filename: 'medical-report.pdf',
        size: fileBuffer.length,
        mimeType: 'application/pdf',
        status: 'uploaded'
      });
    });

    it('should handle file virus scanning', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);
      const fileBuffer = Buffer.from('Suspicious file content');

      // Mock virus scanner response
      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileBuffer, 'suspicious.exe')
        .field('caseId', testCase.id)
        .expect(400);

      expect(response.body.error).toMatchObject({
        type: 'file_rejected',
        reason: 'Unsupported file type'
      });
    });
  });

  describe('External API Integration', () => {
    it('should validate against external medical coding API', async () => {
      // Mock external API call
      const externalApiMock = jest.spyOn(axios, 'get').mockResolvedValue({
        data: {
          code: 'E11.9',
          description: 'Type 2 diabetes mellitus without complications',
          category: 'Endocrine, nutritional and metabolic diseases',
          valid: true
        }
      });

      const response = await request(app)
        .post('/api/validate/medical-code')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: 'E11.9' })
        .expect(200);

      expect(response.body.data).toMatchObject({
        code: 'E11.9',
        valid: true,
        description: expect.stringContaining('diabetes')
      });

      externalApiMock.mockRestore();
    });

    it('should handle external API rate limiting', async () => {
      // Mock rate limited response
      const externalApiMock = jest.spyOn(axios, 'get').mockRejectedValue({
        response: { status: 429, data: { error: 'Rate limit exceeded' } }
      });

      const response = await request(app)
        .post('/api/validate/medical-code')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: 'E11.9' })
        .expect(503);

      expect(response.body.error.type).toBe('external_service_unavailable');

      externalApiMock.mockRestore();
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent requests efficiently', async () => {
      const cases = await testDataFactory.createMultipleCases(20, testUser.id);

      const startTime = Date.now();
      const requests = cases.map(testCase =>
        request(app)
          .get(`/api/cases/${testCase.id}`)
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds for 20 concurrent requests
      console.log(`Completed ${responses.length} requests in ${duration}ms`);
    });

    it('should handle high-volume data processing', async () => {
      // Create large dataset
      await testDataFactory.createMultipleCases(100, testUser.id);

      const startTime = Date.now();
      const response = await request(app)
        .get('/api/analytics/performance-report')
        .query({
          includeAll: true,
          format: 'detailed'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const endTime = Date.now();

      expect(response.body.data.totalRecords).toBe(100);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});