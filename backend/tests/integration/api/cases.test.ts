import request from 'supertest';
import { Express } from 'express';
import { createApp } from '@/app';
import { PrismaClient } from '@prisma/client';
import { jest } from '@jest/globals';

describe('Cases API Integration Tests', () => {
  let app: Express;
  let prisma: PrismaClient;
  let authToken: string;
  let testUser: any;

  beforeAll(async () => {
    // Initialize app and database
    app = createApp();
    prisma = new PrismaClient();
    
    // Clean database
    await prisma.case.deleteMany();
    await prisma.user.deleteMany();
    
    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        password: '$2b$10$YourHashedPasswordHere',
        name: 'Test User',
        role: 'auditor',
      },
    });
    
    // Get auth token
    authToken = global.testUtils.generateToken({
      id: testUser.id,
      email: testUser.email,
      role: testUser.role,
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean cases before each test
    await prisma.case.deleteMany();
  });

  describe('GET /api/cases', () => {
    it('should return empty array when no cases exist', async () => {
      const response = await request(app)
        .get('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          cases: [],
          total: 0,
          page: 1,
          pageSize: 10,
        },
      });
    });

    it('should return paginated cases', async () => {
      // Create test cases
      const cases = await Promise.all(
        Array.from({ length: 15 }).map((_, i) =>
          prisma.case.create({
            data: {
              title: `Test Case ${i + 1}`,
              description: `Description for case ${i + 1}`,
              status: 'pending',
              priority: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
              assignedToId: testUser.id,
            },
          })
        )
      );

      const response = await request(app)
        .get('/api/cases?page=1&pageSize=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.cases).toHaveLength(10);
      expect(response.body.data.total).toBe(15);
      expect(response.body.data.page).toBe(1);
    });

    it('should filter cases by status', async () => {
      // Create cases with different statuses
      await prisma.case.createMany({
        data: [
          { title: 'Pending 1', status: 'pending', assignedToId: testUser.id },
          { title: 'Pending 2', status: 'pending', assignedToId: testUser.id },
          { title: 'In Progress', status: 'in_progress', assignedToId: testUser.id },
          { title: 'Completed', status: 'completed', assignedToId: testUser.id },
        ],
      });

      const response = await request(app)
        .get('/api/cases?status=pending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.cases).toHaveLength(2);
      expect(response.body.data.cases.every((c: any) => c.status === 'pending')).toBe(true);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/cases')
        .expect(401);
    });
  });

  describe('POST /api/cases', () => {
    it('should create a new case', async () => {
      const newCase = {
        title: 'New Medical Audit Case',
        description: 'Patient records need review',
        priority: 'high',
        category: 'medical_records',
        patientId: '12345',
      };

      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newCase)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        title: newCase.title,
        description: newCase.description,
        priority: newCase.priority,
        status: 'pending',
        assignedToId: testUser.id,
      });
      expect(response.body.data.id).toBeValidId();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required title
          description: 'Some description',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('validation');
    });

    it('should validate priority enum', async () => {
      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Case',
          priority: 'invalid-priority',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('priority');
    });
  });

  describe('GET /api/cases/:id', () => {
    it('should return a specific case', async () => {
      const testCase = await prisma.case.create({
        data: {
          title: 'Specific Case',
          description: 'Test description',
          status: 'pending',
          priority: 'medium',
          assignedToId: testUser.id,
        },
      });

      const response = await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: testCase.id,
        title: testCase.title,
        description: testCase.description,
      });
    });

    it('should return 404 for non-existent case', async () => {
      const response = await request(app)
        .get('/api/cases/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('not found');
    });
  });

  describe('PUT /api/cases/:id', () => {
    it('should update a case', async () => {
      const testCase = await prisma.case.create({
        data: {
          title: 'Original Title',
          status: 'pending',
          priority: 'low',
          assignedToId: testUser.id,
        },
      });

      const updates = {
        title: 'Updated Title',
        status: 'in_progress',
        priority: 'high',
      };

      const response = await request(app)
        .put(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.data).toMatchObject(updates);
    });

    it('should validate status transitions', async () => {
      const testCase = await prisma.case.create({
        data: {
          title: 'Test Case',
          status: 'completed',
          assignedToId: testUser.id,
        },
      });

      const response = await request(app)
        .put(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'pending' })
        .expect(400);

      expect(response.body.error.message).toContain('Invalid status transition');
    });
  });

  describe('DELETE /api/cases/:id', () => {
    it('should soft delete a case', async () => {
      const testCase = await prisma.case.create({
        data: {
          title: 'To Delete',
          status: 'pending',
          assignedToId: testUser.id,
        },
      });

      await request(app)
        .delete(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify soft delete
      const deletedCase = await prisma.case.findUnique({
        where: { id: testCase.id },
      });
      expect(deletedCase?.deletedAt).not.toBeNull();
    });

    it('should require admin role for deletion', async () => {
      // Create non-admin user token
      const nonAdminToken = global.testUtils.generateToken({
        id: testUser.id,
        email: testUser.email,
        role: 'viewer',
      });

      const testCase = await prisma.case.create({
        data: {
          title: 'Test Case',
          status: 'pending',
          assignedToId: testUser.id,
        },
      });

      await request(app)
        .delete(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${nonAdminToken}`)
        .expect(403);
    });
  });
});