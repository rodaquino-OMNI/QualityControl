/**
 * API Contract Testing
 * Tests to ensure API contracts between services are maintained
 * Uses PACT for consumer-driven contract testing
 */

import { Pact, Matchers } from '@pact-foundation/pact';
import { resolve } from 'path';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../backend/src/app';

const { like, eachLike, term, integer } = Matchers;

describe('API Contract Testing', () => {
  let _app: Express;
  
  // Frontend -> Backend Contract
  const frontendBackendPact = new Pact({
    consumer: 'AUSTA-Frontend',
    provider: 'AUSTA-Backend',
    port: 3004,
    log: resolve(process.cwd(), 'test-results', 'pact-logs', 'frontend-backend.log'),
    dir: resolve(process.cwd(), 'test-results', 'pacts'),
    spec: 2,
    logLevel: 'info'
  });

  // Backend -> AI Service Contract
  const backendAIPact = new Pact({
    consumer: 'AUSTA-Backend',
    provider: 'AUSTA-AI-Service',
    port: 3005,
    log: resolve(process.cwd(), 'test-results', 'pact-logs', 'backend-ai.log'),
    dir: resolve(process.cwd(), 'test-results', 'pacts'),
    spec: 2,
    logLevel: 'info'
  });

  beforeAll(async () => {
_app = createApp();
    await Promise.all([
      frontendBackendPact.setup(),
      backendAIPact.setup()
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      frontendBackendPact.finalize(),
      backendAIPact.finalize()
    ]);
  });

  afterEach(async () => {
    await Promise.all([
      frontendBackendPact.verify(),
      backendAIPact.verify()
    ]);
  });

  describe('Frontend -> Backend Contracts', () => {
    describe('Authentication Endpoints', () => {
      it('should handle login request', async () => {
        await frontendBackendPact.addInteraction({
          state: 'user exists with valid credentials',
          uponReceiving: 'a login request',
          withRequest: {
            method: 'POST',
            path: '/api/auth/login',
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              email: like('test@austa.com'),
              password: like('password123')
            }
          },
          willRespondWith: {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              success: true,
              data: {
                token: like('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'),
                user: {
                  id: like('user-id-123'),
                  email: like('test@austa.com'),
                  name: like('Test User'),
                  role: like('auditor')
                },
                sessionId: like('session-id-123'),
                expiresAt: like('2024-12-31T23:59:59.999Z')
              }
            }
          }
        });

        const response = await request(`http://localhost:3004`)
          .post('/api/auth/login')
          .send({
            email: 'test@austa.com',
            password: 'password123'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.token).toBeDefined();
        expect(response.body.data.user.email).toBe('test@austa.com');
      });

      it('should handle logout request', async () => {
        await frontendBackendPact.addInteraction({
          state: 'user is authenticated',
          uponReceiving: 'a logout request',
          withRequest: {
            method: 'POST',
            path: '/api/auth/logout',
            headers: {
              'Authorization': like('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'),
              'Content-Type': 'application/json'
            }
          },
          willRespondWith: {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              success: true,
              message: like('Logged out successfully')
            }
          }
        });

        await request(`http://localhost:3004`)
          .post('/api/auth/logout')
          .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
          .expect(200);
      });
    });

    describe('Cases Endpoints', () => {
      it('should return paginated cases list', async () => {
        await frontendBackendPact
          .given('user is authenticated and cases exist')
          .uponReceiving('a request for cases list')
          .withRequest({
            method: 'GET',
            path: '/api/cases',
            query: {
              page: '1',
              pageSize: '10'
            },
            headers: {
              'Authorization': like('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
            }
          })
          .willRespondWith({
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              success: true,
              data: {
                cases: eachLike({
                  id: like('case-id-123'),
                  title: like('Medical Audit Case'),
                  description: like('Patient records review'),
                  status: term({
                    matcher: '^(pending|in_progress|completed|cancelled)$',
                    generate: 'pending'
                  }),
                  priority: term({
                    matcher: '^(low|medium|high|critical)$',
                    generate: 'medium'
                  }),
                  category: like('medical_records'),
                  assignedTo: {
                    id: like('user-id-123'),
                    name: like('Test Auditor'),
                    email: like('auditor@austa.com')
                  },
                  createdAt: like('2024-01-15T10:30:00.000Z'),
                  updatedAt: like('2024-01-15T10:30:00.000Z'),
                  dueDate: like('2024-01-30T00:00:00.000Z')
                }),
                pagination: {
                  page: integer(1),
                  pageSize: integer(10),
                  total: integer(25),
                  totalPages: integer(3)
                }
              }
            }
          });

        const response = await request(`http://localhost:3004`)
          .get('/api/cases?page=1&pageSize=10')
          .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.cases).toBeInstanceOf(Array);
        expect(response.body.data.pagination).toBeDefined();
      });

      it('should create a new case', async () => {
        await frontendBackendPact
          .given('user is authenticated with case creation permissions')
          .uponReceiving('a request to create a case')
          .withRequest({
            method: 'POST',
            path: '/api/cases',
            headers: {
              'Authorization': like('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'),
              'Content-Type': 'application/json'
            },
            body: {
              title: like('New Medical Audit'),
              description: like('Review patient records for compliance'),
              priority: term({
                matcher: '^(low|medium|high|critical)$',
                generate: 'high'
              }),
              category: like('medical_records'),
              dueDate: like('2024-02-15T00:00:00.000Z')
            }
          })
          .willRespondWith({
            status: 201,
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              success: true,
              data: {
                id: like('new-case-id-456'),
                title: like('New Medical Audit'),
                description: like('Review patient records for compliance'),
                status: 'pending',
                priority: 'high',
                category: like('medical_records'),
                assignedTo: {
                  id: like('user-id-123'),
                  name: like('Test Auditor'),
                  email: like('auditor@austa.com')
                },
                createdAt: like('2024-01-15T10:30:00.000Z'),
                updatedAt: like('2024-01-15T10:30:00.000Z'),
                dueDate: like('2024-02-15T00:00:00.000Z')
              }
            }
          });

        const response = await request(`http://localhost:3004`)
          .post('/api/cases')
          .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
          .send({
            title: 'New Medical Audit',
            description: 'Review patient records for compliance',
            priority: 'high',
            category: 'medical_records',
            dueDate: '2024-02-15T00:00:00.000Z'
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBeDefined();
        expect(response.body.data.status).toBe('pending');
      });
    });

    describe('Analytics Endpoints', () => {
      it('should return dashboard metrics', async () => {
        await frontendBackendPact
          .given('user is authenticated and analytics data exists')
          .uponReceiving('a request for dashboard metrics')
          .withRequest({
            method: 'GET',
            path: '/api/analytics/dashboard',
            headers: {
              'Authorization': like('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
            }
          })
          .willRespondWith({
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              success: true,
              data: {
                totalCases: integer(150),
                pendingCases: integer(45),
                inProgressCases: integer(30),
                completedCases: integer(75),
                averageResolutionTime: integer(72), // hours
                riskDistribution: {
                  low: integer(60),
                  medium: integer(50),
                  high: integer(30),
                  critical: integer(10)
                },
                monthlyTrends: eachLike({
                  month: like('2024-01'),
                  cases: integer(25),
                  completed: integer(20),
                  avgResolutionTime: integer(68)
                }),
                recentActivity: eachLike({
                  id: like('activity-id-123'),
                  type: term({
                    matcher: '^(case_created|case_updated|case_completed)$',
                    generate: 'case_created'
                  }),
                  description: like('New case created: Medical Audit Case'),
                  timestamp: like('2024-01-15T10:30:00.000Z'),
                  user: {
                    name: like('Test Auditor'),
                    email: like('auditor@austa.com')
                  }
                })
              }
            }
          });

        const response = await request(`http://localhost:3004`)
          .get('/api/analytics/dashboard')
          .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.totalCases).toBeGreaterThanOrEqual(0);
        expect(response.body.data.riskDistribution).toBeDefined();
      });
    });
  });

  describe('Backend -> AI Service Contracts', () => {
    describe('Case Analysis Endpoints', () => {
      it('should request case analysis from AI service', async () => {
        await backendAIPact
          .given('AI service is available and case data is valid')
          .uponReceiving('a case analysis request')
          .withRequest({
            method: 'POST',
            path: '/api/v1/ai/analyze',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': like('backend-api-key-123'),
              'X-Request-ID': like('req-id-456')
            },
            body: {
              case_id: like('case-id-123'),
              case_data: {
                title: like('Medical Audit Case'),
                description: like('Patient records review'),
                priority: term({
                  matcher: '^(low|medium|high|critical)$',
                  generate: 'high'
                }),
                patient_data: like({
                  age: 65,
                  diagnosis: 'Diabetes Type 2',
                  medications: ['Metformin', 'Insulin']
                })
              },
              analysis_type: term({
                matcher: '^(quick|comprehensive|detailed)$',
                generate: 'comprehensive'
              }),
              options: {
                include_recommendations: like(true),
                confidence_threshold: like(0.8)
              }
            }
          })
          .willRespondWith({
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              case_id: like('case-id-123'),
              analysis_id: like('analysis-id-789'),
              risk_score: like(0.75),
              confidence: like(0.88),
              findings: eachLike(like('Medication interaction potential detected')),
              recommendations: eachLike(like('Review medication dosage')),
              model_version: like('bert-medical-v1.2.3'),
              processing_time: like(2.34),
              timestamp: like('2024-01-15T10:30:00.000Z')
            }
          });

        const response = await request(`http://localhost:3005`)
          .post('/api/v1/ai/analyze')
          .set('Content-Type', 'application/json')
          .set('X-API-Key', 'backend-api-key-123')
          .set('X-Request-ID', 'req-id-456')
          .send({
            case_id: 'case-id-123',
            case_data: {
              title: 'Medical Audit Case',
              description: 'Patient records review',
              priority: 'high',
              patient_data: {
                age: 65,
                diagnosis: 'Diabetes Type 2',
                medications: ['Metformin', 'Insulin']
              }
            },
            analysis_type: 'comprehensive',
            options: {
              include_recommendations: true,
              confidence_threshold: 0.8
            }
          })
          .expect(200);

        expect(response.body.case_id).toBe('case-id-123');
        expect(response.body.risk_score).toBeGreaterThanOrEqual(0);
        expect(response.body.findings).toBeInstanceOf(Array);
      });

      it('should request batch analysis from AI service', async () => {
        await backendAIPact
          .given('AI service is available and multiple cases exist')
          .uponReceiving('a batch analysis request')
          .withRequest({
            method: 'POST',
            path: '/api/v1/ai/batch-analyze',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': like('backend-api-key-123')
            },
            body: {
              case_ids: eachLike(like('case-id-123')),
              analysis_type: like('quick'),
              options: {
                parallel: like(true),
                max_concurrent: integer(5)
              }
            }
          })
          .willRespondWith({
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              batch_id: like('batch-id-456'),
              total_cases: integer(3),
              status: 'processing',
              results: eachLike({
                case_id: like('case-id-123'),
                status: term({
                  matcher: '^(processing|completed|failed)$',
                  generate: 'completed'
                }),
                risk_score: like(0.65),
                confidence: like(0.82),
                processing_time: like(1.25)
              }),
              estimated_completion: like('2024-01-15T10:35:00.000Z')
            }
          });

        const response = await request(`http://localhost:3005`)
          .post('/api/v1/ai/batch-analyze')
          .set('Content-Type', 'application/json')
          .set('X-API-Key', 'backend-api-key-123')
          .send({
            case_ids: ['case-id-123', 'case-id-124', 'case-id-125'],
            analysis_type: 'quick',
            options: {
              parallel: true,
              max_concurrent: 5
            }
          })
          .expect(200);

        expect(response.body.batch_id).toBeDefined();
        expect(response.body.total_cases).toBe(3);
        expect(response.body.results).toBeInstanceOf(Array);
      });
    });

    describe('ML Model Endpoints', () => {
      it('should request fraud detection analysis', async () => {
        await backendAIPact
          .given('fraud detection model is loaded')
          .uponReceiving('a fraud detection request')
          .withRequest({
            method: 'POST',
            path: '/api/v1/ml/fraud/detect',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': like('backend-api-key-123')
            },
            body: {
              claim_data: {
                amount: like(15000.00),
                provider_id: like('PROV-123'),
                procedure_codes: eachLike(like('99213')),
                diagnosis_codes: eachLike(like('I10')),
                service_date: like('2024-01-15')
              },
              options: {
                threshold: like(0.7),
                include_explanation: like(true)
              }
            }
          })
          .willRespondWith({
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              fraud_probability: like(0.82),
              risk_level: term({
                matcher: '^(low|medium|high|critical)$',
                generate: 'high'
              }),
              confidence: like(0.89),
              risk_factors: eachLike(like('High claim amount relative to typical')),
              feature_importance: like({
                'claim_amount': 0.35,
                'provider_frequency': 0.28,
                'time_pattern': 0.18
              }),
              model_version: like('xgboost-fraud-v2.1.0'),
              processing_time: like(0.15)
            }
          });

        const response = await request(`http://localhost:3005`)
          .post('/api/v1/ml/fraud/detect')
          .set('Content-Type', 'application/json')
          .set('X-API-Key', 'backend-api-key-123')
          .send({
            claim_data: {
              amount: 15000.00,
              provider_id: 'PROV-123',
              procedure_codes: ['99213', '93000'],
              diagnosis_codes: ['I10', 'E11.9'],
              service_date: '2024-01-15'
            },
            options: {
              threshold: 0.7,
              include_explanation: true
            }
          })
          .expect(200);

        expect(response.body.fraud_probability).toBeGreaterThanOrEqual(0);
        expect(response.body.fraud_probability).toBeLessThanOrEqual(1);
        expect(response.body.risk_level).toMatch(/^(low|medium|high|critical)$/);
      });
    });

    describe('Health Check Endpoints', () => {
      it('should return AI service health status', async () => {
        await backendAIPact
          .given('AI service is healthy')
          .uponReceiving('a health check request')
          .withRequest({
            method: 'GET',
            path: '/api/v1/health',
            headers: {
              'X-API-Key': like('backend-api-key-123')
            }
          })
          .willRespondWith({
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              status: 'healthy',
              version: like('1.2.3'),
              uptime: integer(86400),
              models_loaded: eachLike(like('bert_medical')),
              system_resources: {
                cpu_usage: like(45.2),
                memory_usage: like(68.7),
                gpu_available: like(true)
              },
              dependencies: {
                database: 'healthy',
                redis: 'healthy',
                storage: 'healthy'
              },
              timestamp: like('2024-01-15T10:30:00.000Z')
            }
          });

        const response = await request(`http://localhost:3005`)
          .get('/api/v1/health')
          .set('X-API-Key', 'backend-api-key-123')
          .expect(200);

        expect(response.body.status).toBe('healthy');
        expect(response.body.models_loaded).toBeInstanceOf(Array);
        expect(response.body.system_resources).toBeDefined();
      });
    });
  });

  describe('Error Contract Testing', () => {
    it('should handle authentication errors consistently', async () => {
      await frontendBackendPact
        .given('user provides invalid credentials')
        .uponReceiving('a login request with invalid credentials')
        .withRequest({
          method: 'POST',
          path: '/api/auth/login',
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            email: like('invalid@austa.com'),
            password: like('wrongpassword')
          }
        })
        .willRespondWith({
          status: 401,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            success: false,
            error: {
              type: 'authentication_error',
              message: like('Invalid email or password'),
              code: 'AUTH_001',
              timestamp: like('2024-01-15T10:30:00.000Z')
            }
          }
        });

      const response = await request(`http://localhost:3004`)
        .post('/api/auth/login')
        .send({
          email: 'invalid@austa.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.type).toBe('authentication_error');
    });

    it('should handle validation errors consistently', async () => {
      await frontendBackendPact
        .given('user is authenticated')
        .uponReceiving('a case creation request with invalid data')
        .withRequest({
          method: 'POST',
          path: '/api/cases',
          headers: {
            'Authorization': like('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'),
            'Content-Type': 'application/json'
          },
          body: {
            title: '', // Invalid: empty title
            priority: 'invalid_priority' // Invalid: not in enum
          }
        })
        .willRespondWith({
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            success: false,
            error: {
              type: 'validation_error',
              message: like('Validation failed'),
              code: 'VAL_001',
              details: eachLike({
                field: like('title'),
                message: like('Title is required'),
                value: like('')
              }),
              timestamp: like('2024-01-15T10:30:00.000Z')
            }
          }
        });

      const response = await request(`http://localhost:3004`)
        .post('/api/cases')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
        .send({
          title: '',
          priority: 'invalid_priority'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.type).toBe('validation_error');
      expect(response.body.error.details).toBeInstanceOf(Array);
    });

    it('should handle AI service errors consistently', async () => {
      await backendAIPact
        .given('AI service model is unavailable')
        .uponReceiving('an analysis request when model is down')
        .withRequest({
          method: 'POST',
          path: '/api/v1/ai/analyze',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': like('backend-api-key-123')
          },
          body: {
            case_id: like('case-id-123'),
            case_data: like({}),
            analysis_type: like('comprehensive')
          }
        })
        .willRespondWith({
          status: 503,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            error: {
              type: 'service_unavailable',
              message: like('Model is currently unavailable'),
              code: 'AI_003',
              retry_after: integer(300),
              timestamp: like('2024-01-15T10:30:00.000Z')
            }
          }
        });

      const response = await request(`http://localhost:3005`)
        .post('/api/v1/ai/analyze')
        .set('Content-Type', 'application/json')
        .set('X-API-Key', 'backend-api-key-123')
        .send({
          case_id: 'case-id-123',
          case_data: {},
          analysis_type: 'comprehensive'
        })
        .expect(503);

      expect(response.body.error.type).toBe('service_unavailable');
      expect(response.body.error.retry_after).toBeDefined();
    });
  });
});