/**
 * Comprehensive API Endpoints Integration Tests
 * Tests all identified API endpoints with proper authentication, validation, and error handling
 */

import request from 'supertest';
import { Express } from 'express';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../backend/src/app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db-setup';
import { TestDataFactory } from '../utils/test-data-factory';
import { AuthTestHelper } from '../utils/auth-test-helper';

describe('API Endpoints Integration Tests', () => {
  let app: Express;
  let prisma: PrismaClient;
  let testDataFactory: TestDataFactory;
  let authHelper: AuthTestHelper;
  let testUser: any;
  let adminUser: any;
  let authToken: string;
  let adminToken: string;

  beforeAll(async () => {
    // Setup test environment
    prisma = await setupTestDatabase();
    testDataFactory = new TestDataFactory(prisma);
    authHelper = new AuthTestHelper();
    
    app = createApp();

    // Create test users
    testUser = await testDataFactory.createUser({
      email: 'auditor@austa.com',
      role: 'auditor',
      name: 'Test Auditor'
    });

    adminUser = await testDataFactory.createUser({
      email: 'admin@austa.com',
      role: 'admin',
      name: 'Test Admin'
    });

    authToken = await authHelper.generateToken(testUser);
    adminToken = await authHelper.generateToken(adminUser);
  });

  afterAll(async () => {
    await cleanupTestDatabase(prisma);
  });

  beforeEach(async () => {
    await testDataFactory.cleanup();
  });

  describe('Authentication Routes (/api/auth)', () => {
    it('should handle user registration', async () => {
      const userData = {
        email: 'newuser@austa.com',
        password: 'SecurePassword123!',
        name: 'New User',
        role: 'auditor'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            email: userData.email,
            name: userData.name,
            role: userData.role
          },
          token: expect.any(String)
        }
      });
    });

    it('should handle user login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.email).toBe(testUser.email);
    });

    it('should reject login with invalid credentials', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword'
        })
        .expect(401);
    });

    it('should handle token refresh', async () => {
      const refreshToken = await authHelper.generateRefreshToken(testUser);
      
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body.data).toHaveProperty('token');
    });

    it('should handle logout', async () => {
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('should handle MFA verification', async () => {
      await testDataFactory.enableMFA(testUser.id);
      
      const mfaToken = await authHelper.generateMFAToken(testUser);
      
      const response = await request(app)
        .post('/api/auth/mfa/verify')
        .send({
          token: mfaToken,
          code: '123456'
        })
        .expect(200);

      expect(response.body.data).toHaveProperty('token');
    });
  });

  describe('Case Management Routes (/api/cases)', () => {
    it('should list cases with pagination and filtering', async () => {
      await testDataFactory.createMultipleCases(15, testUser.id);

      const response = await request(app)
        .get('/api/cases')
        .query({
          page: 1,
          limit: 10,
          status: 'pending',
          priority: 'high',
          sortBy: 'createdAt',
          sortOrder: 'desc'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.cases).toHaveLength(10);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 10,
        total: expect.any(Number),
        totalPages: expect.any(Number)
      });
    });

    it('should get case by ID with relationships', async () => {
      const testCase = await testDataFactory.createCase(testUser.id, {
        title: 'Test Case',
        priority: 'high'
      });

      const response = await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.case).toMatchObject({
        id: testCase.id,
        title: 'Test Case',
        priority: 'high'
      });
    });

    it('should create new case with validation', async () => {
      const patient = await testDataFactory.createPatient();
      
      const caseData = {
        patientId: patient.id,
        title: 'Medical procedure',
        description: 'Medical procedure case', 
        estimatedHours: 15,
        priority: 'medium',
        attachments: [
          {
            type: 'medical_record',
            url: 'https://example.com/document.pdf',
            name: 'Patient Record'
          }
        ]
      };

      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .send(caseData)
        .expect(201);

      expect(response.body.data.case).toMatchObject({
        patientId: patient.id,
        procedureCode: 'PROC001',
        estimatedHours: 15,
        priority: 'medium',
        status: 'pending'
      });
    });

    it('should update case status', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      const response = await request(app)
        .patch(`/api/cases/${testCase.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'in_review' })
        .expect(200);

      expect(response.body.data.case.status).toBe('in_review');
    });

    it('should assign case to auditor (admin only)', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);
      const auditor = await testDataFactory.createUser({
        email: 'auditor2@austa.com',
        role: 'auditor'
      });

      const response = await request(app)
        .post(`/api/cases/${testCase.id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ auditorId: auditor.id })
        .expect(200);

      expect(response.body.data.case.assignedTo).toBe(auditor.id);
      expect(response.body.data.case.status).toBe('in_progress');
    });

    it('should reject case assignment for non-admin users', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      await request(app)
        .post(`/api/cases/${testCase.id}/assign`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ auditorId: testUser.id })
        .expect(403);
    });
  });

  describe('AI Routes (/api/ai)', () => {
    it('should request AI analysis for case', async () => {
      const testCase = await testDataFactory.createCaseWithPatient(testUser.id);

      const response = await request(app)
        .post(`/api/ai/analyze/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          analysis_type: 'full',
          priority: 'high'
        })
        .expect(200);

      expect(response.body.data).toMatchObject({
        analysisId: expect.any(String),
        status: expect.any(String),
        results: expect.any(Object)
      });
    });

    it('should handle AI chat with case context', async () => {
      const testCase = await testDataFactory.createCaseWithPatient(testUser.id);

      const response = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'What is your recommendation for this case?',
          caseId: testCase.id
        })
        .expect(200);

      expect(response.body.data).toMatchObject({
        response: expect.any(String),
        conversationId: expect.any(String),
        confidence: expect.any(Number),
        sources: expect.any(Array)
      });
    });

    it('should perform fraud detection on case', async () => {
      const testCase = await testDataFactory.createCaseWithPatient(testUser.id, {
        estimatedHours: 500 // High value to trigger fraud analysis
      });

      const response = await request(app)
        .post(`/api/ai/fraud-detection/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        fraud_probability: expect.any(Number),
        risk_level: expect.stringMatching(/low|medium|high|critical/),
        risk_factors: expect.any(Array)
      });
    });

    it('should find similar cases', async () => {
      const testCase = await testDataFactory.createCaseWithPatient(testUser.id);
      
      // Create some similar cases
      await testDataFactory.createMultipleCases(5, testUser.id, {});

      const response = await request(app)
        .get(`/api/ai/similar-cases/${testCase.id}`)
        .query({ limit: 3 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.similarCases).toHaveLength(3);
      expect(response.body.data.similarCases[0]).toMatchObject({
        caseId: expect.any(String),
        similarity: expect.any(Number),
        decision: expect.any(String)
      });
    });
  });

  describe('Analytics Routes (/api/analytics)', () => {
    beforeEach(async () => {
      // Create test data for analytics
      await testDataFactory.createAnalyticsTestData(testUser.id);
    });

    it('should get dashboard metrics', async () => {
      const response = await request(app)
        .get('/api/analytics/dashboard')
        .query({ period: 'month' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        overview: {
          totalCases: expect.any(Number),
          pendingCases: expect.any(Number),
          totalDecisions: expect.any(Number),
          avgProcessingTime: expect.any(Number),
          approvalRate: expect.any(Number)
        },
        performance: {
          auditors: expect.any(Array)
        },
        trends: expect.any(Array),
        alerts: expect.any(Array)
      });
    });

    it('should get auditor performance metrics', async () => {
      const response = await request(app)
        .get('/api/analytics/metrics/auditor')
        .query({
          auditorId: testUser.id,
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        metrics: {
          totalDecisions: expect.any(Number),
          avgProcessingTime: expect.any(Number),
          avgAIConfidence: expect.any(Number),
          aiAgreementRate: expect.any(Number)
        },
        decisionBreakdown: expect.any(Array),
        hourlyDistribution: expect.any(Array)
      });
    });

    it('should get fraud analysis metrics', async () => {
      const response = await request(app)
        .get('/api/analytics/fraud-analysis')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        statistics: expect.any(Object),
        topIndicators: expect.any(Array),
        trends: expect.any(Array),
        providerRisk: expect.any(Array)
      });
    });

    it('should generate custom report (admin only)', async () => {
      const response = await request(app)
        .post('/api/analytics/reports/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reportType: 'performance',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          filters: {
            auditorId: testUser.id
          },
          format: 'pdf'
        })
        .expect(202);

      expect(response.body.data).toMatchObject({
        jobId: expect.any(String),
        message: expect.stringContaining('queued')
      });
    });
  });

  describe('Health Check Routes', () => {
    it('should return application health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number)
      });
    });
  });

  describe('Error Handling and Validation', () => {
    it('should handle 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/non-existent-endpoint')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('not found')
      });
    });

    it('should validate request parameters', async () => {
      const response = await request(app)
        .get('/api/cases/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error.type).toBe('VALIDATION_ERROR');
    });

    it('should handle unauthorized requests', async () => {
      await request(app)
        .get('/api/cases')
        .expect(401);
    });

    it('should handle insufficient permissions', async () => {
      await request(app)
        .post('/api/analytics/reports/generate')
        .set('Authorization', `Bearer ${authToken}`) // Non-admin user
        .send({
          reportType: 'performance',
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .expect(403);
    });

    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle rate limiting', async () => {
      // Make rapid requests to trigger rate limiting
      const requests = Array.from({ length: 20 }, () =>
        request(app)
          .get('/api/cases')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Data Consistency and Integrity', () => {
    it('should maintain referential integrity on case creation', async () => {
      const patient = await testDataFactory.createPatient();

      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId: patient.id,
          procedureCode: 'PROC001',
          description: 'Test procedure',
          estimatedHours: 10,
          priority: 'medium'
        })
        .expect(201);

      // Verify case is linked to patient
      const createdCase = await prisma.case.findUnique({
        where: { id: response.body.data.case.id }
      });

      expect(createdCase?.patientId).toBe(patient.id);
    });

    it('should prevent orphaned records on deletion', async () => {
      const testCase = await testDataFactory.createCaseWithAttachments(testUser.id);

      // Attempt to delete patient should fail if cases exist
      await request(app)
        .delete(`/api/patients/${testCase.patientId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409); // Conflict due to existing references
    });

    it('should handle concurrent updates with optimistic locking', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Simulate concurrent updates
      const update1 = request(app)
        .patch(`/api/cases/${testCase.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'in_review' });

      const update2 = request(app)
        .patch(`/api/cases/${testCase.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'completed' });

      const [response1, response2] = await Promise.all([update1, update2]);

      // One should succeed, the other should handle the conflict
      expect([response1.status, response2.status]).toContain(200);
      expect([response1.status, response2.status]).toContain(409);
    });
  });
});