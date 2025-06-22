/**
 * End-to-End Workflows Integration Tests
 * Tests complete business workflows from start to finish
 */

import request from 'supertest';
import { Express } from 'express';
import { PrismaClient } from '@prisma/client';
import WebSocket from 'ws';
import { createApp } from '../../backend/src/app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db-setup';
import { TestDataFactory } from '../utils/test-data-factory';
import { AuthTestHelper } from '../utils/auth-test-helper';

describe('End-to-End Workflows Integration Tests', () => {
  let app: Express;
  let prisma: PrismaClient;
  let testDataFactory: TestDataFactory;
  let authHelper: AuthTestHelper;
  let wsServer: WebSocket.Server;
  let auditorUser: any;
  let adminUser: any;
  let patientUser: any;
  let auditorToken: string;
  let adminToken: string;
  let patientToken: string;

  beforeAll(async () => {
    // Setup test environment
    prisma = await setupTestDatabase();
    testDataFactory = new TestDataFactory(prisma);
    authHelper = new AuthTestHelper();
    
    app = createApp();

    // Create test users with different roles
    auditorUser = await testDataFactory.createUser({
      email: 'auditor@austa.com',
      role: 'auditor',
      name: 'Test Auditor',
      department: 'Cardiology'
    });

    adminUser = await testDataFactory.createUser({
      email: 'admin@austa.com',
      role: 'admin',
      name: 'Test Admin'
    });

    patientUser = await testDataFactory.createUser({
      email: 'patient@austa.com',
      role: 'patient',
      name: 'Test Patient'
    });

    auditorToken = await authHelper.generateToken(auditorUser);
    adminToken = await authHelper.generateToken(adminUser);
    patientToken = await authHelper.generateToken(patientUser);

    // Setup WebSocket server
    wsServer = new WebSocket.Server({ port: 8080 });
  });

  afterAll(async () => {
    await cleanupTestDatabase(prisma);
    wsServer.close();
  });

  beforeEach(async () => {
    await testDataFactory.cleanup();
  });

  describe('Medical Case Authorization Workflow', () => {
    it('should complete full medical case authorization workflow', async () => {
      // Step 1: Patient submits authorization request
      const patient = await testDataFactory.createPatient({
        userId: patientUser.id,
        name: 'John Doe',
        dateOfBirth: '1980-05-15',
        healthPlan: 'Premium Care'
      });

      const submissionResponse = await request(app)
        .post('/api/cases/submit')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          patientId: patient.id,
          procedureCode: 'PROC001',
          procedureDescription: 'Cardiac catheterization',
          requestedDate: '2024-12-25',
          urgency: 'high',
          physicianName: 'Dr. Smith',
          clinicalJustification: 'Patient shows signs of coronary artery disease',
          supportingDocuments: [
            {
              type: 'medical_records',
              description: 'EKG results'
            },
            {
              type: 'lab_results',
              description: 'Cardiac enzymes'
            }
          ]
        })
        .expect(201);

      const caseId = submissionResponse.body.data.case.id;
      expect(submissionResponse.body.data.case).toMatchObject({
        status: 'submitted',
        priority: 'high',
        procedureCode: 'PROC001'
      });

      // Step 2: System performs initial triage and AI analysis
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for background processing

      const triageResponse = await request(app)
        .get(`/api/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(triageResponse.body.data.status).toBe('under_review');
      expect(triageResponse.body.data.aiAnalysis).toBeDefined();

      // Step 3: Case assigned to auditor
      const assignmentResponse = await request(app)
        .post(`/api/cases/${caseId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ auditorId: auditorUser.id })
        .expect(200);

      expect(assignmentResponse.body.data.case.assignedTo).toBe(auditorUser.id);
      expect(assignmentResponse.body.data.case.status).toBe('in_progress');

      // Step 4: Auditor reviews case and requests additional information
      const reviewResponse = await request(app)
        .post(`/api/cases/${caseId}/review`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          action: 'request_info',
          notes: 'Need recent stress test results',
          requestedDocuments: ['stress_test'],
          dueDate: '2024-12-20'
        })
        .expect(200);

      expect(reviewResponse.body.data.status).toBe('pending_info');

      // Step 5: Patient provides additional information
      const additionalInfoResponse = await request(app)
        .post(`/api/cases/${caseId}/provide-info`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          documents: [
            {
              type: 'stress_test',
              description: 'Stress test results from 2024-12-15',
              url: 'https://example.com/stress-test.pdf'
            }
          ],
          notes: 'Stress test shows positive findings'
        })
        .expect(200);

      expect(additionalInfoResponse.body.data.status).toBe('in_progress');

      // Step 6: Auditor makes final decision
      const decisionResponse = await request(app)
        .post(`/api/cases/${caseId}/decision`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          decision: 'approved',
          justification: 'Clinical evidence supports medical necessity',
          conditions: [
            'Pre-authorization valid for 30 days',
            'Must be performed at approved facility'
          ],
          approvedAmount: 25000.00,
          validUntil: '2025-01-25'
        })
        .expect(200);

      expect(decisionResponse.body.data).toMatchObject({
        decision: 'approved',
        status: 'completed',
        approvedAmount: 25000.00
      });

      // Step 7: Verify notifications were sent
      const notificationsResponse = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(notificationsResponse.body.data.notifications).toContainEqual(
        expect.objectContaining({
          type: 'case_approved',
          caseId: caseId
        })
      );

      // Step 8: Verify audit trail
      const auditResponse = await request(app)
        .get(`/api/cases/${caseId}/audit-trail`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(auditResponse.body.data.auditTrail).toHaveLength(7); // All workflow steps logged
      expect(auditResponse.body.data.auditTrail).toContainEqual(
        expect.objectContaining({
          action: 'case_submitted',
          userId: patientUser.id
        })
      );
    });

    it('should handle case denial workflow', async () => {
      const patient = await testDataFactory.createPatient({ userId: patientUser.id });

      // Submit case
      const submissionResponse = await request(app)
        .post('/api/cases/submit')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          patientId: patient.id,
          procedureCode: 'PROC999',
          procedureDescription: 'Experimental procedure',
          requestedDate: '2024-12-25',
          urgency: 'low'
        })
        .expect(201);

      const caseId = submissionResponse.body.data.case.id;

      // Assign to auditor
      await request(app)
        .post(`/api/cases/${caseId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ auditorId: auditorUser.id })
        .expect(200);

      // Auditor denies case
      const denialResponse = await request(app)
        .post(`/api/cases/${caseId}/decision`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          decision: 'denied',
          justification: 'Procedure is experimental and not covered',
          denialReason: 'not_medically_necessary',
          appealInformation: {
            deadline: '2025-01-15',
            process: 'Submit additional clinical evidence'
          }
        })
        .expect(200);

      expect(denialResponse.body.data).toMatchObject({
        decision: 'denied',
        status: 'completed',
        denialReason: 'not_medically_necessary'
      });

      // Patient files appeal
      const appealResponse = await request(app)
        .post(`/api/cases/${caseId}/appeal`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          reason: 'New clinical evidence available',
          supportingDocuments: [
            {
              type: 'clinical_study',
              description: 'Recent study supporting procedure effectiveness'
            }
          ]
        })
        .expect(201);

      expect(appealResponse.body.data).toMatchObject({
        status: 'appeal_submitted',
        appealId: expect.any(String)
      });
    });
  });

  describe('Fraud Detection Workflow', () => {
    it('should complete fraud detection and investigation workflow', async () => {
      // Step 1: Submit multiple suspicious cases
      const provider = await testDataFactory.createProvider({
        name: 'Suspicious Medical Center',
        type: 'clinic'
      });

      const patient = await testDataFactory.createPatient({
        providerId: provider.id
      });

      const suspiciousCases = [];
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/cases/submit')
          .set('Authorization', `Bearer ${patientToken}`)
          .send({
            patientId: patient.id,
            procedureCode: 'PROC001',
            procedureDescription: 'High-value procedure',
            value: 50000 + (i * 5000),
            requestedDate: `2024-12-${15 + i}`,
            providerId: provider.id
          })
          .expect(201);

        suspiciousCases.push(response.body.data.case.id);
      }

      // Step 2: AI fraud detection triggers alerts
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for fraud analysis

      const alertsResponse = await request(app)
        .get('/api/fraud/alerts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(alertsResponse.body.data.alerts).toContainEqual(
        expect.objectContaining({
          type: 'pattern_detected',
          riskLevel: 'high',
          entity: provider.id
        })
      );

      // Step 3: Fraud investigation initiated
      const investigationResponse = await request(app)
        .post('/api/fraud/investigation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          entityType: 'provider',
          entityId: provider.id,
          alertIds: alertsResponse.body.data.alerts.map((a: any) => a.id),
          priority: 'high'
        })
        .expect(201);

      const investigationId = investigationResponse.body.data.investigation.id;

      // Step 4: Cases automatically flagged and held
      for (const caseId of suspiciousCases) {
        const caseStatusResponse = await request(app)
          .get(`/api/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${auditorToken}`)
          .expect(200);

        expect(caseStatusResponse.body.data.flags).toContain('fraud_investigation');
        expect(caseStatusResponse.body.data.status).toBe('on_hold');
      }

      // Step 5: Investigator reviews and documents findings
      const findingsResponse = await request(app)
        .post(`/api/fraud/investigation/${investigationId}/findings`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          findings: [
            'Unusual billing pattern detected',
            'Multiple high-value procedures in short timeframe',
            'Lack of supporting documentation'
          ],
          riskScore: 0.85,
          recommendation: 'refer_to_compliance',
          evidence: [
            {
              type: 'billing_analysis',
              description: 'Billing pattern analysis report'
            }
          ]
        })
        .expect(200);

      // Step 6: Cases denied due to fraud suspicion
      for (const caseId of suspiciousCases) {
        await request(app)
          .post(`/api/cases/${caseId}/decision`)
          .set('Authorization', `Bearer ${auditorToken}`)
          .send({
            decision: 'denied',
            justification: 'Denied due to fraud investigation findings',
            denialReason: 'fraud_suspicion',
            investigationReference: investigationId
          })
          .expect(200);
      }

      // Step 7: Provider flagged in system
      const providerStatusResponse = await request(app)
        .get(`/api/providers/${provider.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(providerStatusResponse.body.data.flags).toContain('fraud_investigation');
      expect(providerStatusResponse.body.data.riskLevel).toBe('high');
    });
  });

  describe('Analytics and Reporting Workflow', () => {
    it('should complete comprehensive analytics reporting workflow', async () => {
      // Step 1: Generate test data for analytics
      await testDataFactory.createAnalyticsTestData(auditorUser.id, {
        casesCount: 50,
        timespan: '30days',
        includeDecisions: true,
        includeFraudCases: true
      });

      // Step 2: Generate performance report
      const reportRequest = await request(app)
        .post('/api/analytics/reports/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reportType: 'performance',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          filters: {
            auditorId: auditorUser.id,
            includeMetrics: ['processing_time', 'accuracy', 'fraud_detection']
          },
          format: 'pdf'
        })
        .expect(202);

      const reportJobId = reportRequest.body.data.jobId;

      // Step 3: Monitor report generation progress
      let reportReady = false;
      let attempts = 0;
      
      while (!reportReady && attempts < 20) {
        const statusResponse = await request(app)
          .get(`/api/analytics/reports/${reportJobId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        if (statusResponse.body.data.status === 'completed') {
          reportReady = true;
          expect(statusResponse.body.data.downloadUrl).toBeDefined();
        } else {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
      }

      expect(reportReady).toBe(true);

      // Step 4: Download and verify report
      const downloadResponse = await request(app)
        .get(`/api/analytics/reports/${reportJobId}/download`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(downloadResponse.headers['content-type']).toContain('application/pdf');

      // Step 5: Generate dashboard metrics
      const dashboardResponse = await request(app)
        .get('/api/analytics/dashboard')
        .query({ period: 'month' })
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(dashboardResponse.body.data).toMatchObject({
        overview: {
          totalCases: expect.any(Number),
          pendingCases: expect.any(Number),
          averageProcessingTime: expect.any(Number)
        },
        performance: {
          auditors: expect.any(Array)
        },
        trends: expect.any(Array)
      });

      // Step 6: Export data for external analysis
      const exportResponse = await request(app)
        .post('/api/analytics/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          dataType: 'cases',
          format: 'csv',
          filters: {
            dateRange: {
              start: '2024-01-01',
              end: '2024-12-31'
            },
            status: ['completed'],
            includePersonalData: false
          }
        })
        .expect(200);

      expect(exportResponse.headers['content-type']).toContain('text/csv');
    });
  });

  describe('Real-time Collaboration Workflow', () => {
    it('should handle real-time collaboration between auditors', async () => {
      const secondAuditor = await testDataFactory.createUser({
        email: 'auditor2@austa.com',
        role: 'auditor',
        name: 'Second Auditor'
      });
      const secondAuditorToken = await authHelper.generateToken(secondAuditor);

      const testCase = await testDataFactory.createCase(auditorUser.id);

      // Step 1: First auditor starts reviewing case
      await request(app)
        .post(`/api/cases/${testCase.id}/start-review`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      // Step 2: Second auditor tries to access same case
      const accessResponse = await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${secondAuditorToken}`)
        .expect(200);

      expect(accessResponse.body.data.case.lockedBy).toBe(auditorUser.id);
      expect(accessResponse.body.data.case.lockExpires).toBeDefined();

      // Step 3: Second auditor requests collaboration
      await request(app)
        .post(`/api/cases/${testCase.id}/request-collaboration`)
        .set('Authorization', `Bearer ${secondAuditorToken}`)
        .send({
          message: 'I have experience with similar cases, can I assist?'
        })
        .expect(200);

      // Step 4: First auditor accepts collaboration
      await request(app)
        .post(`/api/cases/${testCase.id}/accept-collaboration`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ collaboratorId: secondAuditor.id })
        .expect(200);

      // Step 5: Both auditors can now work on case
      const collaborativeResponse = await request(app)
        .get(`/api/cases/${testCase.id}`)
        .set('Authorization', `Bearer ${secondAuditorToken}`)
        .expect(200);

      expect(collaborativeResponse.body.data.case.collaborators).toContain(secondAuditor.id);

      // Step 6: Real-time comments and updates
      await request(app)
        .post(`/api/cases/${testCase.id}/comments`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          content: 'Initial assessment: patient history looks good',
          type: 'review_note'
        })
        .expect(201);

      await request(app)
        .post(`/api/cases/${testCase.id}/comments`)
        .set('Authorization', `Bearer ${secondAuditorToken}`)
        .send({
          content: 'Agreed, but we should verify the diagnostic codes',
          type: 'review_note',
          replyTo: 'previous_comment_id'
        })
        .expect(201);

      // Step 7: Collaborative decision
      await request(app)
        .post(`/api/cases/${testCase.id}/collaborative-decision`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          decision: 'approved',
          primaryReviewer: auditorUser.id,
          collaborativeReviewer: secondAuditor.id,
          justification: 'Both auditors agree on approval'
        })
        .expect(200);
    });
  });

  describe('Emergency Case Workflow', () => {
    it('should handle emergency authorization workflow', async () => {
      const patient = await testDataFactory.createPatient();

      // Step 1: Emergency case submission
      const emergencyResponse = await request(app)
        .post('/api/cases/emergency-submit')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          patientId: patient.id,
          procedureCode: 'EMERG001',
          procedureDescription: 'Emergency cardiac surgery',
          emergencyLevel: 'life_threatening',
          expectedDuration: '6_hours',
          physicianOnCall: 'Dr. Emergency',
          hospitalLocation: 'City General Hospital',
          clinicalSummary: 'Patient presenting with acute MI, needs immediate intervention'
        })
        .expect(201);

      const emergencyCaseId = emergencyResponse.body.data.case.id;
      expect(emergencyResponse.body.data.case.priority).toBe('emergency');
      expect(emergencyResponse.body.data.case.autoApproved).toBe(true);

      // Step 2: Immediate provisional approval
      const statusResponse = await request(app)
        .get(`/api/cases/${emergencyCaseId}/status`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(statusResponse.body.data.status).toBe('provisional_approved');
      expect(statusResponse.body.data.validUntil).toBeDefined();

      // Step 3: Post-emergency review (within 24 hours)
      await request(app)
        .post(`/api/cases/${emergencyCaseId}/post-emergency-review`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          reviewDate: new Date().toISOString(),
          emergencyJustified: true,
          finalDecision: 'approved',
          notes: 'Emergency authorization was appropriate given clinical presentation'
        })
        .expect(200);

      // Step 4: Final approval confirmation
      const finalResponse = await request(app)
        .get(`/api/cases/${emergencyCaseId}/final-status`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(finalResponse.body.data.status).toBe('approved');
      expect(finalResponse.body.data.emergencyReviewCompleted).toBe(true);
    });
  });

  describe('Batch Processing Workflow', () => {
    it('should handle bulk case processing workflow', async () => {
      // Step 1: Upload bulk case file
      const csvContent = `
patient_id,procedure_code,procedure_description,value,priority
PAT001,PROC001,Routine checkup,500,low
PAT002,PROC002,Blood test,200,low
PAT003,PROC003,X-ray,800,medium
      `.trim();

      const uploadResponse = await request(app)
        .post('/api/cases/bulk-upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from(csvContent), 'bulk-cases.csv')
        .field('validateOnly', 'false')
        .expect(202);

      const batchId = uploadResponse.body.data.batchId;

      // Step 2: Monitor batch processing
      let processingComplete = false;
      let attempts = 0;

      while (!processingComplete && attempts < 20) {
        const statusResponse = await request(app)
          .get(`/api/cases/batch/${batchId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        if (statusResponse.body.data.status === 'completed') {
          processingComplete = true;
          expect(statusResponse.body.data.summary).toMatchObject({
            total: 3,
            successful: expect.any(Number),
            failed: expect.any(Number)
          });
        } else {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
      }

      expect(processingComplete).toBe(true);

      // Step 3: Review batch results
      const resultsResponse = await request(app)
        .get(`/api/cases/batch/${batchId}/results`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(resultsResponse.body.data.results).toHaveLength(3);
      expect(resultsResponse.body.data.errors).toBeDefined();

      // Step 4: Auto-approve eligible cases
      const autoApprovalResponse = await request(app)
        .post(`/api/cases/batch/${batchId}/auto-approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          criteria: {
            maxValue: 1000,
            allowedProcedures: ['PROC001', 'PROC002'],
            requiresManualReview: false
          }
        })
        .expect(200);

      expect(autoApprovalResponse.body.data.autoApproved).toBeGreaterThan(0);
    });
  });
});