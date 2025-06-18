/**
 * Backend ↔ AI Service Communication Integration Tests
 * Tests the complete communication flow between backend and AI service
 */

import request from 'supertest';
import { Express } from 'express';
import axios from 'axios';
import { createApp } from '../../backend/src/index';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db-setup';
import { TestDataFactory } from '../utils/test-data-factory';
import { AuthTestHelper } from '../utils/auth-test-helper';
import { AIServiceMock } from '../mocks/ai-service-mock';
import { PrismaClient } from '@prisma/client';

describe('Backend ↔ AI Service Integration', () => {
  let app: Express;
  let prisma: PrismaClient;
  let testDataFactory: TestDataFactory;
  let authHelper: AuthTestHelper;
  let aiServiceMock: AIServiceMock;
  let testUser: any;
  let authToken: string;

  const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

  beforeAll(async () => {
    // Setup test database and services
    prisma = await setupTestDatabase();
    testDataFactory = new TestDataFactory(prisma);
    authHelper = new AuthTestHelper();
    aiServiceMock = new AIServiceMock();
    
    // Create test app
    app = createApp();

    // Create test user
    testUser = await testDataFactory.createUser({
      email: 'test@austa.com',
      role: 'auditor',
      name: 'Test Auditor'
    });

    authToken = await authHelper.generateToken(testUser);

    // Start AI service mock
    await aiServiceMock.start();
  });

  afterAll(async () => {
    await cleanupTestDatabase(prisma);
    await aiServiceMock.stop();
  });

  beforeEach(async () => {
    await testDataFactory.cleanupCases();
    aiServiceMock.reset();
  });

  describe('AI Analysis Request Flow', () => {
    it('should successfully request case analysis from AI service', async () => {
      // Create test case
      const testCase = await testDataFactory.createCase(testUser.id, {
        title: 'Medical Audit Case',
        description: 'Patient with diabetes complications',
        priority: 'high',
        category: 'medical_records',
        patientData: {
          age: 65,
          diagnosis: 'E11.9 - Type 2 diabetes mellitus without complications',
          medications: ['Metformin', 'Insulin']
        }
      });

      // Mock AI service response
      aiServiceMock.mockAnalyzeCase({
        case_id: testCase.id,
        risk_score: 0.75,
        confidence: 0.88,
        findings: [
          'Medication interaction potential detected',
          'Blood glucose levels trending upward'
        ],
        recommendations: [
          'Review medication dosage',
          'Increase monitoring frequency'
        ],
        analysis_metadata: {
          model_version: '1.2.3',
          processing_time: 2.34,
          data_sources: ['clinical_notes', 'lab_results']
        }
      });

      // Request analysis through backend API
      const response = await request(app)
        .post(`/api/cases/${testCase.id}/analyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          analysis_type: 'comprehensive',
          include_recommendations: true,
          priority: 'high'
        })
        .expect(200);

      // Verify backend received and processed AI service response
      expect(response.body.data).toMatchObject({
        analysisId: expect.any(String),
        status: 'completed',
        results: {
          risk_score: 0.75,
          confidence: 0.88,
          findings: expect.arrayContaining([
            'Medication interaction potential detected'
          ]),
          recommendations: expect.arrayContaining([
            'Review medication dosage'
          ])
        }
      });

      // Verify AI service was called correctly
      expect(aiServiceMock.getLastRequest()).toMatchObject({
        method: 'POST',
        path: '/api/v1/ai/analyze',
        body: {
          case_id: testCase.id,
          case_data: expect.objectContaining({
            title: 'Medical Audit Case',
            priority: 'high'
          }),
          analysis_type: 'comprehensive',
          options: {
            include_recommendations: true,
            priority: 'high'
          }
        }
      });
    });

    it('should handle AI service timeout gracefully', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Configure AI service mock to timeout
      aiServiceMock.mockTimeout('/api/v1/ai/analyze', 10000); // 10 second timeout

      const response = await request(app)
        .post(`/api/cases/${testCase.id}/analyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ analysis_type: 'quick' })
        .expect(202); // Should return 202 Accepted for async processing

      expect(response.body.data).toMatchObject({
        analysisId: expect.any(String),
        status: 'processing',
        message: 'Analysis queued for processing'
      });

      // Check analysis status
      const statusResponse = await request(app)
        .get(`/api/analyses/${response.body.data.analysisId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(statusResponse.body.data.status).toMatch(/processing|queued/);
    });

    it('should handle AI service errors with retry logic', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);

      // Mock AI service to return errors first, then succeed
      aiServiceMock.mockErrorThenSuccess('/api/v1/ai/analyze', 
        { status: 500, message: 'Internal AI Service Error' },
        {
          case_id: testCase.id,
          risk_score: 0.5,
          confidence: 0.7,
          findings: ['Analysis completed after retry']
        },
        2 // Number of failures before success
      );

      const response = await request(app)
        .post(`/api/cases/${testCase.id}/analyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ analysis_type: 'comprehensive' })
        .expect(200);

      expect(response.body.data.results.findings).toContain('Analysis completed after retry');
      expect(aiServiceMock.getRequestCount('/api/v1/ai/analyze')).toBe(3); // 2 failures + 1 success
    });
  });

  describe('Batch Analysis Integration', () => {
    it('should handle batch case analysis requests', async () => {
      // Create multiple test cases
      const cases = await testDataFactory.createMultipleCases(5, testUser.id);
      const caseIds = cases.map(c => c.id);

      // Mock batch analysis response
      aiServiceMock.mockBatchAnalyze(caseIds.map(id => ({
        case_id: id,
        risk_score: Math.random(),
        confidence: 0.8 + Math.random() * 0.2,
        status: 'completed'
      })));

      const response = await request(app)
        .post('/api/analyses/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          case_ids: caseIds,
          analysis_type: 'quick',
          parallel: true
        })
        .expect(200);

      expect(response.body.data).toMatchObject({
        batchId: expect.any(String),
        totalCases: 5,
        status: 'processing',
        results: expect.any(Array)
      });

      // Verify batch processing status
      const batchId = response.body.data.batchId;
      const statusResponse = await request(app)
        .get(`/api/analyses/batch/${batchId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(statusResponse.body.data.completed).toBeGreaterThanOrEqual(0);
      expect(statusResponse.body.data.total).toBe(5);
    });

    it('should handle partial batch failures', async () => {
      const cases = await testDataFactory.createMultipleCases(3, testUser.id);
      const caseIds = cases.map(c => c.id);

      // Mock partial success scenario
      aiServiceMock.mockBatchAnalyzePartialFailure(
        caseIds,
        [caseIds[1]], // Second case fails
        { status: 422, message: 'Invalid case data' }
      );

      const response = await request(app)
        .post('/api/analyses/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ case_ids: caseIds })
        .expect(200);

      const batchId = response.body.data.batchId;

      // Poll for completion
      let completed = false;
      let attempts = 0;
      while (!completed && attempts < 10) {
        const statusResponse = await request(app)
          .get(`/api/analyses/batch/${batchId}/status`)
          .set('Authorization', `Bearer ${authToken}`);

        if (statusResponse.body.data.status === 'completed') {
          completed = true;
          expect(statusResponse.body.data.successful).toBe(2);
          expect(statusResponse.body.data.failed).toBe(1);
          expect(statusResponse.body.data.errors).toHaveLength(1);
        } else {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
      }

      expect(completed).toBe(true);
    });
  });

  describe('ML Model Integration', () => {
    it('should request fraud detection analysis', async () => {
      const testCase = await testDataFactory.createCase(testUser.id, {
        category: 'fraud_detection',
        patientData: {
          claims: [
            { amount: 5000, procedure: 'surgery', date: '2024-01-15' },
            { amount: 1200, procedure: 'consultation', date: '2024-01-20' }
          ],
          provider: { id: 'PROV001', specialty: 'cardiology' }
        }
      });

      aiServiceMock.mockFraudDetection({
        case_id: testCase.id,
        fraud_probability: 0.82,
        risk_factors: [
          'Unusual billing pattern detected',
          'High-value claims in short timeframe'
        ],
        model_confidence: 0.91,
        similar_cases: [
          { case_id: 'CASE001', similarity: 0.89 },
          { case_id: 'CASE002', similarity: 0.76 }
        ]
      });

      const response = await request(app)
        .post(`/api/cases/${testCase.id}/fraud-analysis`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          model_type: 'xgboost_fraud',
          threshold: 0.7
        })
        .expect(200);

      expect(response.body.data).toMatchObject({
        fraud_probability: 0.82,
        risk_level: 'high',
        confidence: 0.91,
        risk_factors: expect.arrayContaining([
          'Unusual billing pattern detected'
        ])
      });
    });

    it('should perform anomaly detection on medical patterns', async () => {
      const testCase = await testDataFactory.createCase(testUser.id, {
        category: 'pattern_analysis',
        patientData: {
          vital_signs: {
            blood_pressure: [180, 120],
            heart_rate: 45,
            temperature: 103.2
          },
          lab_results: {
            glucose: 350,
            creatinine: 2.5,
            hemoglobin: 6.2
          }
        }
      });

      aiServiceMock.mockAnomalyDetection({
        case_id: testCase.id,
        anomalies_detected: true,
        anomaly_score: 0.94,
        critical_values: [
          { parameter: 'glucose', value: 350, severity: 'critical' },
          { parameter: 'heart_rate', value: 45, severity: 'warning' }
        ],
        recommendations: [
          'Immediate glucose management required',
          'Cardiac evaluation recommended'
        ]
      });

      const response = await request(app)
        .post(`/api/cases/${testCase.id}/anomaly-detection`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          detection_type: 'medical_values',
          sensitivity: 'high'
        })
        .expect(200);

      expect(response.body.data.anomalies_detected).toBe(true);
      expect(response.body.data.anomaly_score).toBe(0.94);
      expect(response.body.data.critical_values).toHaveLength(2);
    });
  });

  describe('Natural Language Processing Integration', () => {
    it('should extract medical entities from clinical notes', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);
      const clinicalNote = `
        Patient John Doe, 65-year-old male, presents with chest pain.
        History of hypertension (I10) and diabetes mellitus type 2 (E11.9).
        Current medications: Metformin 1000mg BID, Lisinopril 10mg daily.
        Vital signs: BP 160/95, HR 88, Temp 98.6°F.
        EKG shows sinus rhythm with no acute changes.
      `;

      aiServiceMock.mockNLPExtraction({
        case_id: testCase.id,
        extracted_entities: {
          patient_info: {
            name: 'John Doe',
            age: 65,
            gender: 'male'
          },
          diagnoses: [
            { code: 'I10', description: 'Essential hypertension' },
            { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' }
          ],
          medications: [
            { name: 'Metformin', dosage: '1000mg', frequency: 'BID' },
            { name: 'Lisinopril', dosage: '10mg', frequency: 'daily' }
          ],
          vital_signs: {
            blood_pressure: '160/95',
            heart_rate: 88,
            temperature: '98.6°F'
          },
          procedures: ['EKG']
        },
        confidence_scores: {
          diagnoses: 0.95,
          medications: 0.92,
          vital_signs: 0.88
        }
      });

      const response = await request(app)
        .post(`/api/cases/${testCase.id}/extract-entities`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: clinicalNote,
          entity_types: ['diagnoses', 'medications', 'vital_signs', 'procedures']
        })
        .expect(200);

      expect(response.body.data.extracted_entities.diagnoses).toHaveLength(2);
      expect(response.body.data.extracted_entities.medications).toHaveLength(2);
      expect(response.body.data.confidence_scores.diagnoses).toBe(0.95);
    });

    it('should perform sentiment analysis on audit notes', async () => {
      const testCase = await testDataFactory.createCase(testUser.id);
      const auditNotes = [
        'Documentation is incomplete and concerning',
        'Patient care appears adequate',
        'Excellent record keeping and attention to detail'
      ];

      aiServiceMock.mockSentimentAnalysis({
        case_id: testCase.id,
        sentiment_results: auditNotes.map((note, index) => ({
          text: note,
          sentiment: index === 0 ? 'negative' : index === 1 ? 'neutral' : 'positive',
          confidence: 0.85 + (Math.random() * 0.1),
          keywords: ['documentation', 'patient care', 'record keeping'][index]
        })),
        overall_sentiment: 'mixed',
        concern_level: 'moderate'
      });

      const response = await request(app)
        .post(`/api/cases/${testCase.id}/sentiment-analysis`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          texts: auditNotes,
          analysis_type: 'audit_notes'
        })
        .expect(200);

      expect(response.body.data.sentiment_results).toHaveLength(3);
      expect(response.body.data.overall_sentiment).toBe('mixed');
      expect(response.body.data.concern_level).toBe('moderate');
    });
  });

  describe('AI Service Health and Monitoring', () => {
    it('should check AI service health status', async () => {
      aiServiceMock.mockHealthCheck({
        status: 'healthy',
        version: '1.2.3',
        uptime: 86400,
        models_loaded: ['bert_medical', 'xgboost_fraud', 'lstm_patterns'],
        gpu_available: true,
        memory_usage: {
          used: '2.1GB',
          available: '6.4GB',
          percentage: 32.8
        }
      });

      const response = await request(app)
        .get('/api/ai-service/health')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        status: 'healthy',
        models_loaded: expect.arrayContaining(['bert_medical', 'xgboost_fraud']),
        gpu_available: true
      });
    });

    it('should handle AI service performance metrics', async () => {
      aiServiceMock.mockMetrics({
        requests_per_minute: 45,
        average_response_time: 1.25,
        model_performance: {
          bert_medical: { accuracy: 0.94, last_updated: '2024-01-15T10:30:00Z' },
          xgboost_fraud: { accuracy: 0.89, last_updated: '2024-01-14T15:20:00Z' }
        },
        error_rate: 0.02,
        queue_length: 3
      });

      const response = await request(app)
        .get('/api/ai-service/metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.requests_per_minute).toBe(45);
      expect(response.body.data.model_performance.bert_medical.accuracy).toBe(0.94);
      expect(response.body.data.error_rate).toBeLessThan(0.05);
    });

    it('should handle AI service circuit breaker', async () => {
      // Simulate multiple failures to trigger circuit breaker
      const testCase = await testDataFactory.createCase(testUser.id);
      
      // Mock repeated failures
      aiServiceMock.mockRepeatedErrors('/api/v1/ai/analyze', 
        { status: 500, message: 'Service Unavailable' }, 
        5
      );

      // Make multiple requests to trigger circuit breaker
      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/cases/${testCase.id}/analyze`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ analysis_type: 'quick' })
      );

      const responses = await Promise.all(requests);
      
      // After circuit breaker opens, should get 503 responses
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(503);
      expect(lastResponse.body.error.message).toContain('AI service temporarily unavailable');
    });
  });

  describe('Data Security and Privacy', () => {
    it('should encrypt sensitive data in AI service requests', async () => {
      const testCase = await testDataFactory.createCase(testUser.id, {
        patientData: {
          ssn: '123-45-6789',
          dob: '1990-01-15',
          name: 'John Doe'
        }
      });

      aiServiceMock.mockSecureAnalysis();

      await request(app)
        .post(`/api/cases/${testCase.id}/analyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ analysis_type: 'comprehensive' })
        .expect(200);

      const lastRequest = aiServiceMock.getLastRequest();
      
      // Verify sensitive data is encrypted/masked
      expect(lastRequest.body.case_data.patientData.ssn).toMatch(/\*\*\*-\*\*-\d{4}/);
      expect(lastRequest.body.case_data.patientData.name).toMatch(/John D\./);
      
      // Verify encryption headers are present
      expect(lastRequest.headers['x-data-encryption']).toBeDefined();
      expect(lastRequest.headers['x-request-signature']).toBeDefined();
    });

    it('should validate AI service SSL certificates', async () => {
      // This test would verify SSL/TLS validation in production
      const response = await request(app)
        .get('/api/ai-service/ssl-check')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        ssl_valid: true,
        certificate_expiry: expect.any(String),
        cipher_suite: expect.any(String)
      });
    });
  });

  describe('Load Testing and Performance', () => {
    it('should handle high-volume AI requests', async () => {
      const cases = await testDataFactory.createMultipleCases(20, testUser.id);
      
      // Mock AI service to handle concurrent requests
      aiServiceMock.mockConcurrentAnalysis(20);

      const startTime = Date.now();
      const requests = cases.map(testCase =>
        request(app)
          .post(`/api/cases/${testCase.id}/analyze`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ analysis_type: 'quick' })
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds for 20 concurrent requests
      console.log(`Processed ${responses.length} AI requests in ${duration}ms`);
    });
  });
});