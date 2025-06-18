/**
 * Test Data Factory for Integration Tests
 */

import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcrypt';

export class TestDataFactory {
  constructor(private prisma: PrismaClient) {}

  async createUser(overrides: Partial<any> = {}): Promise<any> {
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
    
    const userData = {
      email: faker.internet.email(),
      password: hashedPassword,
      name: faker.person.fullName(),
      role: 'auditor',
      isActive: true,
      emailVerified: true,
      ...overrides
    };

    const user = await this.prisma.user.create({
      data: userData,
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // Assign default role
    const role = await this.prisma.role.findUnique({
      where: { name: userData.role }
    });

    if (role) {
      await this.prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id
        }
      });
    }

    return user;
  }

  async createDepartment(overrides: Partial<any> = {}): Promise<any> {
    const departmentData = {
      name: faker.company.buzzNoun(),
      code: faker.string.alpha({ length: 4 }).toUpperCase(),
      description: faker.lorem.sentence(),
      isActive: true,
      ...overrides
    };

    return await this.prisma.department.create({
      data: departmentData
    });
  }

  async createCase(userId: string, overrides: Partial<any> = {}): Promise<any> {
    const caseData = {
      title: faker.lorem.words(4),
      description: faker.lorem.paragraph(),
      status: 'pending',
      priority: faker.helpers.arrayElement(['low', 'medium', 'high']),
      category: faker.helpers.arrayElement([
        'medical_records',
        'billing_audit',
        'compliance_check',
        'fraud_investigation'
      ]),
      assignedToId: userId,
      patientId: faker.string.alphanumeric(8),
      estimatedHours: faker.number.int({ min: 1, max: 40 }),
      dueDate: faker.date.future(),
      ...overrides
    };

    return await this.prisma.case.create({
      data: caseData,
      include: {
        assignedTo: true,
        notes: true,
        attachments: true
      }
    });
  }

  async createMultipleCases(count: number, userId: string, overrides: Partial<any> = {}): Promise<any[]> {
    const cases = [];
    
    for (let i = 0; i < count; i++) {
      const caseOverrides = {
        title: `Test Case ${i + 1}`,
        priority: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
        status: i % 4 === 0 ? 'completed' : i % 4 === 1 ? 'in_progress' : 'pending',
        ...overrides
      };
      
      const testCase = await this.createCase(userId, caseOverrides);
      cases.push(testCase);
      
      // Add some delay to ensure different timestamps
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    return cases;
  }

  async createCaseNote(caseId: string, userId: string, overrides: Partial<any> = {}): Promise<any> {
    const noteData = {
      content: faker.lorem.paragraph(),
      type: faker.helpers.arrayElement(['review', 'analysis', 'decision', 'follow_up']),
      isInternal: faker.datatype.boolean(),
      caseId,
      createdById: userId,
      ...overrides
    };

    return await this.prisma.caseNote.create({
      data: noteData,
      include: {
        createdBy: true,
        case: true
      }
    });
  }

  async createCaseAttachment(caseId: string, overrides: Partial<any> = {}): Promise<any> {
    const attachmentData = {
      filename: faker.system.fileName(),
      originalName: faker.system.fileName(),
      mimeType: faker.helpers.arrayElement([
        'application/pdf',
        'image/jpeg',
        'image/png',
        'text/plain',
        'application/vnd.ms-excel'
      ]),
      size: faker.number.int({ min: 1024, max: 10 * 1024 * 1024 }),
      path: `/uploads/${faker.string.uuid()}`,
      caseId,
      ...overrides
    };

    return await this.prisma.caseAttachment.create({
      data: attachmentData,
      include: {
        case: true
      }
    });
  }

  async createAnalyticsTestData(userId: string): Promise<void> {
    // Create cases with various statuses and priorities
    const cases = await this.createMultipleCases(20, userId, {});

    // Update some cases to different statuses
    const caseIds = cases.map(c => c.id);
    
    // Mark some as completed
    await this.prisma.case.updateMany({
      where: { id: { in: caseIds.slice(0, 8) } },
      data: { 
        status: 'completed',
        completedAt: faker.date.recent(),
        resolution: faker.lorem.sentence()
      }
    });

    // Mark some as in progress
    await this.prisma.case.updateMany({
      where: { id: { in: caseIds.slice(8, 15) } },
      data: { 
        status: 'in_progress',
        startedAt: faker.date.recent()
      }
    });

    // Add notes to cases
    for (const caseId of caseIds.slice(0, 10)) {
      await this.createCaseNote(caseId, userId);
    }

    // Add attachments to some cases
    for (const caseId of caseIds.slice(0, 5)) {
      await this.createCaseAttachment(caseId);
    }
  }

  async enableMFA(userId: string): Promise<any> {
    return await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: faker.string.alphanumeric(32)
      }
    });
  }

  async updateCaseStatus(caseId: string, status: string): Promise<any> {
    const updateData: any = { status };
    
    if (status === 'completed') {
      updateData.completedAt = new Date();
    } else if (status === 'in_progress') {
      updateData.startedAt = new Date();
    }

    return await this.prisma.case.update({
      where: { id: caseId },
      data: updateData
    });
  }

  async createAuditTrail(resourceId: string, resourceType: string, action: string, userId: string, changes?: any): Promise<any> {
    return await this.prisma.caseAudit.create({
      data: {
        resourceId,
        resourceType,
        action,
        userId,
        changes: changes ? JSON.stringify(changes) : null,
        timestamp: new Date(),
        ipAddress: faker.internet.ip(),
        userAgent: faker.internet.userAgent()
      }
    });
  }

  async cleanup(): Promise<void> {
    // Clean up in correct order due to foreign key constraints
    await this.prisma.caseNote.deleteMany();
    await this.prisma.caseAttachment.deleteMany();
    await this.prisma.caseAudit.deleteMany();
    await this.prisma.case.deleteMany();
  }

  async cleanupCases(): Promise<void> {
    await this.prisma.caseNote.deleteMany();
    await this.prisma.caseAttachment.deleteMany();
    await this.prisma.case.deleteMany();
  }

  async cleanupUsers(): Promise<void> {
    await this.prisma.userRole.deleteMany();
    await this.prisma.user.deleteMany();
  }

  async cleanupAll(): Promise<void> {
    await this.cleanup();
    await this.cleanupUsers();
    await this.prisma.department.deleteMany();
  }

  // Helper methods for specific test scenarios
  async createComplexCaseScenario(userId: string): Promise<{
    case: any;
    notes: any[];
    attachments: any[];
    audit: any[];
  }> {
    const testCase = await this.createCase(userId, {
      title: 'Complex Medical Audit Case',
      priority: 'high',
      category: 'medical_records',
      status: 'in_progress'
    });

    const notes = [];
    for (let i = 0; i < 3; i++) {
      const note = await this.createCaseNote(testCase.id, userId, {
        type: ['review', 'analysis', 'decision'][i],
        content: `Note ${i + 1}: ${faker.lorem.paragraph()}`
      });
      notes.push(note);
    }

    const attachments = [];
    for (let i = 0; i < 2; i++) {
      const attachment = await this.createCaseAttachment(testCase.id, {
        filename: `document_${i + 1}.pdf`,
        mimeType: 'application/pdf'
      });
      attachments.push(attachment);
    }

    const audit = [];
    const auditActions = ['created', 'updated', 'note_added', 'file_uploaded'];
    for (const action of auditActions) {
      const auditEntry = await this.createAuditTrail(
        testCase.id,
        'case',
        action,
        userId,
        { action: `Case ${action}` }
      );
      audit.push(auditEntry);
    }

    return { case: testCase, notes, attachments, audit };
  }

  async createPerformanceTestData(userCount: number, casesPerUser: number): Promise<void> {
    const users = [];
    
    // Create users
    for (let i = 0; i < userCount; i++) {
      const user = await this.createUser({
        email: `testuser${i}@austa.com`,
        name: `Test User ${i}`
      });
      users.push(user);
    }

    // Create cases for each user
    for (const user of users) {
      await this.createMultipleCases(casesPerUser, user.id);
    }
  }

  async createLargeDataset(totalCases: number): Promise<void> {
    const batchSize = 50;
    const batches = Math.ceil(totalCases / batchSize);
    
    // Create a test user for the cases
    const user = await this.createUser({
      email: 'dataset@test.com',
      name: 'Dataset User'
    });

    for (let batch = 0; batch < batches; batch++) {
      const casesToCreate = Math.min(batchSize, totalCases - (batch * batchSize));
      await this.createMultipleCases(casesToCreate, user.id);
      
      // Log progress
      if (batch % 10 === 0) {
        console.log(`Created ${(batch + 1) * batchSize} / ${totalCases} cases`);
      }
    }
  }
}