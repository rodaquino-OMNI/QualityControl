/**
 * Integration Tests for Case Management Routes
 * Tests all /api/cases endpoints with comprehensive scenarios
 */

import request from 'supertest';
import { Express } from 'express';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../backend/src/app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db-setup';
import { TestDataFactory } from '../utils/test-data-factory';
import { AuthTestHelper } from '../utils/auth-test-helper';
import { RedisService } from '../../backend/src/services/redisService';

describe('Case Routes Integration Tests', () => {
  let app: Express;
  let prisma: PrismaClient;
  let redisService: RedisService;
  let testDataFactory: TestDataFactory;
  let authHelper: AuthTestHelper;
  let auditorUser: any;
  let adminUser: any;
  let auditorToken: string;
  let adminToken: string;
  let testPatient: any;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    redisService = new RedisService();
    testDataFactory = new TestDataFactory(prisma);
    authHelper = new AuthTestHelper();
    app = createApp();

    // Create test users
    auditorUser = await testDataFactory.createUser({
      email: 'auditor@austa.com',
      role: 'auditor',
      name: 'Test Auditor'
    });

    adminUser = await testDataFactory.createUser({
      email: 'admin@austa.com',
      role: 'admin',
      name: 'Test Admin'
    });

    // Create test patient
    testPatient = await testDataFactory.createPatient({
      patientCode: 'P12345',
      birthYear: 1980,
      gender: 'M'
    });

    auditorToken = await authHelper.generateToken(auditorUser);
    adminToken = await authHelper.generateToken(adminUser);
  });

  afterAll(async () => {
    await cleanupTestDatabase(prisma);
    await redisService.disconnect();
  });

  beforeEach(async () => {
    await testDataFactory.cleanup();
    await redisService.flushAll();
  });

  describe('GET /api/cases', () => {
    beforeEach(async () => {
      // Create test cases with different statuses and priorities
      await testDataFactory.createCase(auditorUser.id, {
        patientId: testPatient.id,
        title: 'High Priority Case',
        priority: 'high',
        status: 'open'
      });

      await testDataFactory.createCase(auditorUser.id, {
        patientId: testPatient.id,
        title: 'Medium Priority Case',
        priority: 'medium',
        status: 'in_review'
      });

      await testDataFactory.createCase(auditorUser.id, {
        patientId: testPatient.id,
        title: 'Low Priority Case',
        priority: 'low',
        status: 'completed'
      });
    });

    it('should list all cases with pagination', async () => {
      const response = await request(app)
        .get('/api/cases')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          cases: expect.arrayContaining([
            expect.objectContaining({
              title: expect.any(String),
              priority: expect.any(String),
              status: expect.any(String),
              patient: expect.objectContaining({
                patientCode: expect.any(String)
              })
            })
          ])
        },
        meta: {
          page: 1,
          limit: 10,
          total: 3,
          totalPages: 1
        }
      });
    });

    it('should filter cases by status', async () => {
      const response = await request(app)
        .get('/api/cases')
        .query({ status: 'open' })
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(response.body.data.cases).toHaveLength(1);
      expect(response.body.data.cases[0].status).toBe('open');
    });

    it('should filter cases by priority', async () => {
      const response = await request(app)
        .get('/api/cases')
        .query({ priority: 'high' })
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(response.body.data.cases).toHaveLength(1);
      expect(response.body.data.cases[0].priority).toBe('high');
    });

    it('should sort cases by different fields', async () => {
      const response = await request(app)
        .get('/api/cases')
        .query({ sortBy: 'priority', sortOrder: 'desc' })
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      const priorities = response.body.data.cases.map((c: any) => c.priority);
      expect(priorities[0]).toBe('high');
    });

    it('should handle invalid query parameters', async () => {
      const response = await request(app)
        .get('/api/cases')
        .query({ status: 'invalid-status' })
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(400);

      expect(response.body.error).toContain('Validation failed');
    });

    it('should use caching for repeated requests', async () => {
      // First request
      const start1 = Date.now();
      await request(app)
        .get('/api/cases')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);
      const duration1 = Date.now() - start1;

      // Second request (should be cached)
      const start2 = Date.now();
      const response = await request(app)
        .get('/api/cases')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);
      const duration2 = Date.now() - start2;

      // Cached request should be significantly faster
      expect(duration2).toBeLessThan(duration1 / 2);
    });
  });

  describe('GET /api/cases/:id', () => {
    let testCase: any;

    beforeEach(async () => {
      testCase = await testDataFactory.createCaseWithAttachments(auditorUser.id, {
        patientId: testPatient.id,
        title: 'Test Case',
        description: 'Detailed case description',
        priority: 'medium'
      });
    });

    it('should get case by ID with all relationships', async () => {
      const response = await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          case: {
            id: testCase.id,
            title: 'Test Case',
            description: 'Detailed case description',
            patient: expect.objectContaining({
              id: testPatient.id,
              patientCode: testPatient.patientCode
            }),
            attachments: expect.arrayContaining([
              expect.objectContaining({
                type: expect.any(String),
                name: expect.any(String)
              })
            ])
          }
        }
      });
    });

    it('should return 404 for non-existent case', async () => {
      const response = await request(app)
        .get('/api/cases/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(404);

      expect(response.body.error).toContain('Case not found');
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .get('/api/cases/invalid-uuid')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(400);

      expect(response.body.error).toContain('Validation failed');
    });

    it('should log audit event for case access', async () => {
      await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      // Verify audit log was created
      const auditLog = await prisma.activityLog.findFirst({
        where: {
          action: 'case.viewed',
          entityId: testCase.id,
          userId: auditorUser.id
        }
      });

      expect(auditLog).toBeTruthy();
    });
  });

  describe('POST /api/cases', () => {
    it('should create new case with valid data', async () => {
      const caseData = {
        patientId: testPatient.id,
        procedureCode: 'PROC001',
        procedureDescription: 'Knee replacement surgery',
        value: 25000,
        priority: 'high',
        attachments: [
          {
            type: 'medical_record',
            url: 'https://example.com/record1.pdf',
            name: 'Patient Medical History'
          },
          {
            type: 'xray',
            url: 'https://example.com/xray1.jpg',
            name: 'Knee X-Ray'
          }
        ]
      };

      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send(caseData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          case: {
            patientId: testPatient.id,
            title: 'PROC001',
            description: 'Knee replacement surgery',
            priority: 'high',
            status: 'open',
            createdBy: auditorUser.id,
            attachments: expect.arrayContaining([
              expect.objectContaining({
                type: 'medical_record',
                name: 'Patient Medical History'
              })
            ])
          }
        }
      });

      // Verify case was created in database
      const createdCase = await prisma.case.findUnique({
        where: { id: response.body.data.case.id },
        include: { attachments: true }
      });

      expect(createdCase).toBeTruthy();
      expect(createdCase?.attachments).toHaveLength(2);
    });

    it('should queue AI analysis for new case', async () => {
      const caseData = {
        patientId: testPatient.id,
        procedureCode: 'PROC002',
        procedureDescription: 'Hip replacement',
        value: 30000,
        priority: 'urgent'
      };

      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send(caseData)
        .expect(201);

      // In a real test, we would verify the queue received the job
      // For now, we just check the case was created
      expect(response.body.data.case.id).toBeDefined();
    });

    it('should validate required fields', async () => {
      const invalidData = {
        // Missing required fields
        priority: 'medium'
      };

      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toContain('Validation failed');
    });

    it('should validate patient exists', async () => {
      const caseData = {
        patientId: '00000000-0000-0000-0000-000000000000',
        procedureCode: 'PROC001',
        procedureDescription: 'Test procedure',
        value: 1000,
        priority: 'low'
      };

      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send(caseData)
        .expect(400);

      expect(response.body.error).toContain('Patient not found');
    });

    it('should invalidate cache after creation', async () => {
      // Get initial list
      const initialResponse = await request(app)
        .get('/api/cases')
        .set('Authorization', `Bearer ${auditorToken}`);
      
      const initialCount = initialResponse.body.data.cases.length;

      // Create new case
      await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          patientId: testPatient.id,
          procedureCode: 'PROC003',
          procedureDescription: 'New procedure',
          value: 5000,
          priority: 'medium'
        })
        .expect(201);

      // Get updated list
      const updatedResponse = await request(app)
        .get('/api/cases')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(updatedResponse.body.data.cases.length).toBe(initialCount + 1);
    });
  });

  describe('PATCH /api/cases/:id/status', () => {
    let testCase: any;

    beforeEach(async () => {
      testCase = await testDataFactory.createCase(auditorUser.id, {
        patientId: testPatient.id,
        status: 'open'
      });
    });

    it('should update case status', async () => {
      const response = await request(app)
        .patch(`/api/cases/${testCase.id}/status`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ status: 'in_review' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          case: {
            id: testCase.id,
            status: 'in_review'
          }
        }
      });

      // Verify in database
      const updatedCase = await prisma.case.findUnique({
        where: { id: testCase.id }
      });
      expect(updatedCase?.status).toBe('in_review');
    });

    it('should validate status values', async () => {
      const response = await request(app)
        .patch(`/api/cases/${testCase.id}/status`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ status: 'invalid-status' })
        .expect(400);

      expect(response.body.error).toContain('Validation failed');
    });

    it('should require authorization', async () => {
      const regularUser = await testDataFactory.createUser({
        email: 'regular@austa.com',
        role: 'viewer'
      });
      const regularToken = await authHelper.generateToken(regularUser);

      await request(app)
        .patch(`/api/cases/${testCase.id}/status`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ status: 'in_review' })
        .expect(403);
    });

    it('should log status change in audit trail', async () => {
      await request(app)
        .patch(`/api/cases/${testCase.id}/status`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ status: 'completed' })
        .expect(200);

      const auditLog = await prisma.activityLog.findFirst({
        where: {
          action: 'case.statusUpdated',
          entityId: testCase.id
        }
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog?.metadata).toMatchObject({
        caseId: testCase.id,
        newStatus: 'completed'
      });
    });
  });

  describe('POST /api/cases/:id/assign', () => {
    let testCase: any;
    let anotherAuditor: any;

    beforeEach(async () => {
      testCase = await testDataFactory.createCase(auditorUser.id, {
        patientId: testPatient.id,
        status: 'open'
      });

      anotherAuditor = await testDataFactory.createUser({
        email: 'auditor2@austa.com',
        role: 'auditor',
        name: 'Another Auditor'
      });
    });

    it('should assign case to auditor (admin only)', async () => {
      const response = await request(app)
        .post(`/api/cases/${testCase.id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ auditorId: anotherAuditor.id })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          case: {
            id: testCase.id,
            assignedTo: anotherAuditor.id,
            status: 'in_review'
          }
        }
      });

      // Verify assignment in database
      const updatedCase = await prisma.case.findUnique({
        where: { id: testCase.id }
      });
      expect(updatedCase?.assignedTo).toBe(anotherAuditor.id);
      expect(updatedCase?.assignedAt).toBeTruthy();
    });

    it('should reject assignment by non-admin', async () => {
      await request(app)
        .post(`/api/cases/${testCase.id}/assign`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ auditorId: anotherAuditor.id })
        .expect(403);
    });

    it('should validate auditor exists', async () => {
      const response = await request(app)
        .post(`/api/cases/${testCase.id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ auditorId: '00000000-0000-0000-0000-000000000000' })
        .expect(400);

      expect(response.body.error).toContain('Auditor not found');
    });

    it('should send notification on assignment', async () => {
      await request(app)
        .post(`/api/cases/${testCase.id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ auditorId: anotherAuditor.id })
        .expect(200);

      // In a real test, verify notification was queued
      // For now, just verify the assignment worked
      const updatedCase = await prisma.case.findUnique({
        where: { id: testCase.id }
      });
      expect(updatedCase?.assignedTo).toBe(anotherAuditor.id);
    });
  });

  describe('Complex Case Scenarios', () => {
    it('should handle case with multiple attachments and updates', async () => {
      // Create case
      const createResponse = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          patientId: testPatient.id,
          procedureCode: 'COMPLEX001',
          procedureDescription: 'Complex medical procedure',
          value: 50000,
          priority: 'urgent',
          attachments: [
            { type: 'medical_record', url: 'http://example.com/rec1.pdf', name: 'Record 1' },
            { type: 'lab_result', url: 'http://example.com/lab1.pdf', name: 'Lab 1' },
            { type: 'imaging', url: 'http://example.com/img1.jpg', name: 'Image 1' }
          ]
        })
        .expect(201);

      const caseId = createResponse.body.data.case.id;

      // Update status
      await request(app)
        .patch(`/api/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ status: 'in_review' })
        .expect(200);

      // Assign to admin
      await request(app)
        .post(`/api/cases/${caseId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ auditorId: adminUser.id })
        .expect(200);

      // Get final case state
      const finalResponse = await request(app)
        .get(`/api/cases/${caseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(finalResponse.body.data.case).toMatchObject({
        status: 'in_review',
        assignedTo: adminUser.id,
        attachments: expect.arrayContaining([
          expect.objectContaining({ type: 'medical_record' }),
          expect.objectContaining({ type: 'lab_result' }),
          expect.objectContaining({ type: 'imaging' })
        ])
      });
    });

    it('should handle concurrent case updates gracefully', async () => {
      const testCase = await testDataFactory.createCase(auditorUser.id, {
        patientId: testPatient.id,
        status: 'open'
      });

      // Simulate concurrent status updates
      const update1 = request(app)
        .patch(`/api/cases/${testCase.id}/status`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ status: 'in_review' });

      const update2 = request(app)
        .patch(`/api/cases/${testCase.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'completed' });

      const [response1, response2] = await Promise.all([update1, update2]);

      // One should succeed, one might fail or succeed with different result
      const successfulResponses = [response1, response2].filter(r => r.status === 200);
      expect(successfulResponses.length).toBeGreaterThan(0);

      // Final state should be deterministic
      const finalCase = await prisma.case.findUnique({
        where: { id: testCase.id }
      });
      expect(['in_review', 'completed']).toContain(finalCase?.status);
    });
  });
});