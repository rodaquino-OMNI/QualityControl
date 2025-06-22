/**
 * Frontend ↔ Backend API Integration Tests
 * Tests the complete API flow between frontend and backend services
 */

import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../backend/src/app';
import { PrismaClient } from '@prisma/client';
import WebSocket from 'ws';
import { createServer } from 'http';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db-setup';
import { TestDataFactory } from '../utils/test-data-factory';
import { AuthTestHelper } from '../utils/auth-test-helper';

describe('Frontend ↔ Backend API Integration', () => {
  let app: Express;
  let server: any;
  let prisma: PrismaClient;
  let testDataFactory: TestDataFactory;
  let authHelper: AuthTestHelper;
  let wsServer: WebSocket.Server;
  let testUser: any;
  let adminUser: any;
  let authToken: string;
  let adminToken: string;

  beforeAll(async () => {
    // Setup test database
    prisma = await setupTestDatabase();
    testDataFactory = new TestDataFactory(prisma);
    authHelper = new AuthTestHelper();

    // Create test app and server
    app = createApp();
    server = createServer(app);
    
    // Setup WebSocket server for real-time testing
    wsServer = new WebSocket.Server({ server, path: '/ws' });

    // Create test users
    testUser = await testDataFactory.createUser({
      email: 'test@austa.com',
      role: 'auditor',
      name: 'Test Auditor'
    });
    
    adminUser = await testDataFactory.createUser({
      email: 'admin@austa.com',
      role: 'admin',
      name: 'Test Admin'
    });

    // Generate auth tokens
    authToken = await authHelper.generateToken(testUser);
    adminToken = await authHelper.generateToken(adminUser);

    // Start server
    server.listen(3001);
  });

  afterAll(async () => {
    await cleanupTestDatabase(prisma);
    wsServer.close();
    server.close();
  });

  beforeEach(async () => {
    await testDataFactory.cleanupCases();
  });

  describe('Authentication API Integration', () => {
    it('should handle complete login flow', async () => {
      const loginData = {
        email: 'test@austa.com',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          token: expect.any(String),
          user: {
            id: testUser.id,
            email: testUser.email,
            role: testUser.role
          }
        }
      });

      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should handle session management with Redis', async () => {
      // Login to create session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@austa.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      const sessionToken = loginResponse.body.data.token;

      // Use session for protected route
      const protectedResponse = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);

      expect(protectedResponse.body.data.email).toBe('test@austa.com');

      // Logout and verify session is destroyed
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);

      // Verify session is invalid
      await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(401);
    });

    it('should handle MFA authentication flow', async () => {
      // Enable MFA for user
      await testDataFactory.enableMFA(testUser.id);

      // Initial login should request MFA
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@austa.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(loginResponse.body.data.requiresMFA).toBe(true);
      const mfaToken = loginResponse.body.data.mfaToken;

      // Complete MFA verification
      const mfaResponse = await request(app)
        .post('/api/auth/verify-mfa')
        .send({
          mfaToken,
          code: '123456' // Mock TOTP code
        })
        .expect(200);

      expect(mfaResponse.body.data.token).toBeDefined();
    });
  });

  describe('Case Management API Integration', () => {
    it('should handle complete case lifecycle', async () => {
      // Create case
      const caseData = {
        title: 'Medical Audit Case',
        description: 'Patient records review',
        priority: 'high',
        category: 'medical_records'
      };

      const createResponse = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .send(caseData)
        .expect(201);

      const caseId = createResponse.body.data.id;

      // Fetch case details
      const getResponse = await request(app)
        .get(`/api/cases/${caseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.data).toMatchObject({
        ...caseData,
        status: 'pending',
        assignedToId: testUser.id
      });

      // Update case status
      const updateResponse = await request(app)
        .put(`/api/cases/${caseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'in_progress' })
        .expect(200);

      expect(updateResponse.body.data.status).toBe('in_progress');

      // Add case notes
      const noteResponse = await request(app)
        .post(`/api/cases/${caseId}/notes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Initial review completed',
          type: 'review'
        })
        .expect(201);

      expect(noteResponse.body.data.content).toBe('Initial review completed');

      // Complete case
      await request(app)
        .put(`/api/cases/${caseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          status: 'completed',
          resolution: 'No issues found'
        })
        .expect(200);
    });

    it('should handle case pagination and filtering', async () => {
      // Create multiple test cases
      const cases = await testDataFactory.createMultipleCases(15, testUser.id);

      // Test pagination
      const page1Response = await request(app)
        .get('/api/cases?page=1&pageSize=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(page1Response.body.data.cases).toHaveLength(10);
      expect(page1Response.body.data.total).toBe(15);
      expect(page1Response.body.data.page).toBe(1);

      // Test filtering by status
      await testDataFactory.updateCaseStatus(cases[0].id, 'completed');
      
      const filteredResponse = await request(app)
        .get('/api/cases?status=completed')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(filteredResponse.body.data.cases).toHaveLength(1);
      expect(filteredResponse.body.data.cases[0].status).toBe('completed');

      // Test date range filtering
      const dateResponse = await request(app)
        .get('/api/cases?startDate=2024-01-01&endDate=2024-12-31')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(dateResponse.body.data.cases.length).toBeGreaterThan(0);
    });
  });

  describe('Analytics API Integration', () => {
    beforeEach(async () => {
      // Create test data for analytics
      await testDataFactory.createAnalyticsTestData(testUser.id);
    });

    it('should fetch dashboard metrics', async () => {
      const response = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        totalCases: expect.any(Number),
        pendingCases: expect.any(Number),
        completedCases: expect.any(Number),
        averageProcessingTime: expect.any(Number)
      });
    });

    it('should generate analytics reports', async () => {
      const reportRequest = {
        reportType: 'performance',
        dateRange: {
          start: '2024-01-01',
          end: '2024-12-31'
        },
        filters: {
          auditorId: testUser.id,
          priority: 'high'
        }
      };

      const response = await request(app)
        .post('/api/analytics/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportRequest)
        .expect(200);

      expect(response.body.data).toMatchObject({
        reportId: expect.any(String),
        status: 'generating'
      });

      // Poll for report completion
      const reportId = response.body.data.reportId;
      let reportReady = false;
      let attempts = 0;

      while (!reportReady && attempts < 10) {
        const statusResponse = await request(app)
          .get(`/api/analytics/reports/${reportId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        if (statusResponse.body.data.status === 'completed') {
          reportReady = true;
          expect(statusResponse.body.data.data).toBeDefined();
        } else {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
      }

      expect(reportReady).toBe(true);
    });

    it('should export data in multiple formats', async () => {
      // Test CSV export
      const csvResponse = await request(app)
        .get('/api/analytics/export?format=csv&type=cases')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(csvResponse.headers['content-type']).toContain('text/csv');
      expect(csvResponse.headers['content-disposition']).toContain('attachment');

      // Test Excel export
      const excelResponse = await request(app)
        .get('/api/analytics/export?format=excel&type=cases')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(excelResponse.headers['content-type']).toContain('application/vnd.openxmlformats');

      // Test PDF export
      const pdfResponse = await request(app)
        .get('/api/analytics/export?format=pdf&type=dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(pdfResponse.headers['content-type']).toContain('application/pdf');
    });
  });

  describe('File Upload API Integration', () => {
    it('should handle file upload and processing', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);
      const fileContent = Buffer.from('Sample medical record content');

      // Upload file
      const uploadResponse = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fileContent, 'medical-record.pdf')
        .field('caseId', testCase.id)
        .field('fileType', 'medical_record')
        .expect(201);

      const fileId = uploadResponse.body.data.id;

      expect(uploadResponse.body.data).toMatchObject({
        filename: 'medical-record.pdf',
        size: fileContent.length,
        mimeType: 'application/pdf',
        caseId: testCase.id
      });

      // Check file processing status
      const statusResponse = await request(app)
        .get(`/api/files/${fileId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(statusResponse.body.data.status).toMatch(/processing|completed/);

      // Retrieve processed file metadata
      const metadataResponse = await request(app)
        .get(`/api/files/${fileId}/metadata`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(metadataResponse.body.data).toMatchObject({
        extractedText: expect.any(String),
        confidence: expect.any(Number)
      });
    });

    it('should handle bulk file upload', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);
      const files = [
        { name: 'doc1.pdf', content: Buffer.from('Document 1 content') },
        { name: 'doc2.pdf', content: Buffer.from('Document 2 content') },
        { name: 'doc3.pdf', content: Buffer.from('Document 3 content') }
      ];

      const uploadRequest = request(app)
        .post('/api/files/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('caseId', testCase.id);

      files.forEach(file => {
        uploadRequest.attach('files', file.content, file.name);
      });

      const response = await uploadRequest.expect(201);

      expect(response.body.data.uploadedFiles).toHaveLength(3);
      expect(response.body.data.failedFiles).toHaveLength(0);
    });
  });

  describe('Real-time WebSocket Integration', () => {
    it('should handle WebSocket connections and notifications', (done) => {
      const ws = new WebSocket(`ws://localhost:3001/ws?token=${authToken}`);
      
      ws.on('open', async () => {
        // Create a case to trigger notification
        const caseData = {
          title: 'WebSocket Test Case',
          description: 'Testing real-time notifications',
          priority: 'high'
        };

        await request(app)
          .post('/api/cases')
          .set('Authorization', `Bearer ${authToken}`)
          .send(caseData);
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'case_created') {
          expect(message.data).toMatchObject({
            title: 'WebSocket Test Case',
            priority: 'high'
          });
          ws.close();
          done();
        }
      });

      ws.on('error', done);
    });

    it('should handle real-time case updates', (done) => {
      const ws = new WebSocket(`ws://localhost:3001/ws?token=${authToken}`);
      let caseId: string;

      ws.on('open', async () => {
        // Create case first
        const createResponse = await request(app)
          .post('/api/cases')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: 'Real-time Update Test',
            priority: 'medium'
          });

        caseId = createResponse.body.data.id;

        // Update the case to trigger real-time notification
        setTimeout(async () => {
          await request(app)
            .put(`/api/cases/${caseId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({ status: 'in_progress' });
        }, 100);
      });

      let messagesReceived = 0;
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        messagesReceived++;

        if (message.type === 'case_updated' && messagesReceived === 2) {
          expect(message.data.status).toBe('in_progress');
          ws.close();
          done();
        }
      });

      ws.on('error', done);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle validation errors consistently', async () => {
      const invalidCaseData = {
        title: '', // Invalid: empty title
        priority: 'invalid-priority' // Invalid: not in enum
      };

      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidCaseData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          type: 'validation_error',
          message: expect.any(String),
          details: expect.any(Array)
        }
      });
    });

    it('should handle rate limiting', async () => {
      const requests = Array.from({ length: 15 }, (_, i) =>
        request(app)
          .get('/api/cases')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should handle database connection errors gracefully', async () => {
      // Simulate database connection issue
      await prisma.$disconnect();

      const response = await request(app)
        .get('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(503);

      expect(response.body.error.type).toBe('service_unavailable');

      // Reconnect for cleanup
      prisma = await setupTestDatabase();
    });
  });

  describe('Performance Integration Tests', () => {
    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 50;
      const startTime = Date.now();

      const requests = Array.from({ length: concurrentRequests }, () =>
        request(app)
          .get('/api/analytics/dashboard')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time (adjust based on requirements)
      expect(duration).toBeLessThan(5000); // 5 seconds for 50 concurrent requests
    });

    it('should handle large data sets with pagination', async () => {
      // Create large dataset
      await testDataFactory.createMultipleCases(1000, testUser.id);

      const startTime = Date.now();
      const response = await request(app)
        .get('/api/cases?page=1&pageSize=100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const endTime = Date.now();

      expect(response.body.data.cases).toHaveLength(100);
      expect(response.body.data.total).toBe(1000);
      
      // Response should be fast even with large dataset
      expect(endTime - startTime).toBeLessThan(1000); // 1 second
    });
  });
});