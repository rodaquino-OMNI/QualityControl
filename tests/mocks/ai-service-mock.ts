/**
 * AI Service Mock for Integration Testing
 */

import express, { Request, Response, NextFunction } from 'express';
import { Server } from 'http';

export class AIServiceMock {
  private app: express.Application;
  private server: Server | null = null;
  private port: number;
  private requests: Array<{
    method: string;
    path: string;
    body: any;
    headers: any;
    timestamp: Date;
  }> = [];
  private responses: Map<string, any> = new Map();
  private errors: Map<string, any> = new Map();
  private requestCounts: Map<string, number> = new Map();

  constructor(port: number = 8000) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      // Log all requests
      this.requests.push({
        method: req.method,
        path: req.path,
        body: req.body,
        headers: req.headers,
        timestamp: new Date()
      });

      // Increment request count
      const key = `${req.method}:${req.path}`;
      this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);

      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/api/v1/health', (req, res) => {
      const mockResponse = this.responses.get('health') || {
        status: 'healthy',
        version: '1.2.3',
        uptime: 86400,
        models_loaded: ['bert_medical', 'xgboost_fraud'],
        gpu_available: true,
        memory_usage: {
          used: '2.1GB',
          available: '6.4GB',
          percentage: 32.8
        }
      };
      res.json(mockResponse);
    });

    // Case analysis endpoint
    (this.app as any).post('/api/v1/ai/analyze', (req: Request, res: Response) => {
      const error = this.errors.get('/api/v1/ai/analyze');
      if (error) {
        return res.status(error.status || 500).json(error);
      }

      const mockResponse = this.responses.get('analyze') || {
        case_id: req.body.case_id,
        analysis_id: `analysis-${Date.now()}`,
        risk_score: 0.75,
        confidence: 0.88,
        findings: ['Standard medical procedure analysis completed'],
        recommendations: ['Continue with standard protocol'],
        model_version: '1.2.3',
        processing_time: 1.25,
        timestamp: new Date().toISOString()
      };

      return res.json(mockResponse);
    });

    // Batch analysis endpoint
    this.app.post('/api/v1/ai/batch-analyze', (req, res) => {
      const { case_ids } = req.body;
      const mockResponse = this.responses.get('batch-analyze') || {
        batch_id: `batch-${Date.now()}`,
        total_cases: case_ids.length,
        status: 'processing',
        results: case_ids.map((id: string) => ({
          case_id: id,
          status: 'completed',
          risk_score: Math.random(),
          confidence: 0.8 + Math.random() * 0.2,
          processing_time: Math.random() * 2
        })),
        estimated_completion: new Date(Date.now() + 60000).toISOString()
      };

      res.json(mockResponse);
    });

    // Fraud detection endpoint
    this.app.post('/api/v1/ml/fraud/detect', (req, res) => {
      const mockResponse = this.responses.get('fraud-detection') || {
        fraud_probability: 0.15,
        risk_level: 'low',
        confidence: 0.92,
        risk_factors: [],
        feature_importance: {
          claim_amount: 0.25,
          provider_frequency: 0.20,
          time_pattern: 0.15
        },
        model_version: 'xgboost-fraud-v2.1.0',
        processing_time: 0.12
      };

      res.json(mockResponse);
    });

    // NLP extraction endpoint
    this.app.post('/api/v1/nlp/extract', (req, res) => {
      const mockResponse = this.responses.get('nlp-extraction') || {
        extracted_entities: {
          diagnoses: [],
          medications: [],
          procedures: [],
          vital_signs: {}
        },
        confidence_scores: {
          diagnoses: 0.95,
          medications: 0.92,
          procedures: 0.88
        }
      };

      res.json(mockResponse);
    });

    // Sentiment analysis endpoint
    this.app.post('/api/v1/nlp/sentiment', (req, res) => {
      const mockResponse = this.responses.get('sentiment-analysis') || {
        sentiment_results: [],
        overall_sentiment: 'neutral',
        confidence: 0.85
      };

      res.json(mockResponse);
    });

    // Anomaly detection endpoint
    this.app.post('/api/v1/ml/anomaly/detect', (req, res) => {
      const mockResponse = this.responses.get('anomaly-detection') || {
        anomalies_detected: false,
        anomaly_score: 0.15,
        critical_values: [],
        recommendations: []
      };

      res.json(mockResponse);
    });

    // Metrics endpoint
    this.app.get('/api/v1/metrics', (req, res) => {
      const mockResponse = this.responses.get('metrics') || {
        requests_per_minute: 45,
        average_response_time: 1.25,
        model_performance: {
          bert_medical: { accuracy: 0.94, last_updated: '2024-01-15T10:30:00Z' },
          xgboost_fraud: { accuracy: 0.89, last_updated: '2024-01-14T15:20:00Z' }
        },
        error_rate: 0.02,
        queue_length: 3
      };

      res.json(mockResponse);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          console.log(`AI Service Mock started on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('AI Service Mock stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  reset(): void {
    this.requests = [];
    this.responses.clear();
    this.errors.clear();
    this.requestCounts.clear();
  }

  // Mock configuration methods
  mockAnalyzeCase(response: any): void {
    this.responses.set('analyze', response);
  }

  mockBatchAnalyze(responses: any[]): void {
    this.responses.set('batch-analyze', {
      batch_id: `batch-${Date.now()}`,
      total_cases: responses.length,
      status: 'completed',
      results: responses
    });
  }

  mockBatchAnalyzePartialFailure(caseIds: string[], failedIds: string[], error: any): void {
    const results = caseIds.map(id => ({
      case_id: id,
      status: failedIds.includes(id) ? 'failed' : 'completed',
      ...(failedIds.includes(id) ? { error } : {
        risk_score: Math.random(),
        confidence: 0.8 + Math.random() * 0.2
      })
    }));

    this.responses.set('batch-analyze', {
      batch_id: `batch-${Date.now()}`,
      total_cases: caseIds.length,
      status: 'completed',
      successful: caseIds.length - failedIds.length,
      failed: failedIds.length,
      results,
      errors: failedIds.map(id => ({ case_id: id, error }))
    });
  }

  mockFraudDetection(response: any): void {
    this.responses.set('fraud-detection', response);
  }

  mockAnomalyDetection(response: any): void {
    this.responses.set('anomaly-detection', response);
  }

  mockNLPExtraction(response: any): void {
    this.responses.set('nlp-extraction', response);
  }

  mockSentimentAnalysis(response: any): void {
    this.responses.set('sentiment-analysis', response);
  }

  mockHealthCheck(response: any): void {
    this.responses.set('health', response);
  }

  mockMetrics(response: any): void {
    this.responses.set('metrics', response);
  }

  mockTimeout(path: string, delay: number): void {
    this.app.use(path, (req, res, next) => {
      setTimeout(next, delay);
    });
  }

  mockError(path: string, error: any): void {
    this.errors.set(path, error);
  }

  mockErrorThenSuccess(path: string, error: any, successResponse: any, failureCount: number): void {
    let attempts = 0;
    const originalHandler = this.app._router.stack.find((layer: any) => 
      layer.route?.path === path && layer.route?.methods.post
    );

    (this.app as any).post(path, (req: Request, res: Response) => {
      attempts++;
      if (attempts <= failureCount) {
        return res.status(error.status || 500).json(error);
      }
      return res.json({ ...successResponse, case_id: req.body.case_id });
    });
  }

  mockRepeatedErrors(path: string, error: any, count: number): void {
    let attempts = 0;
    (this.app as any).use(path, (req: Request, res: Response, next: NextFunction) => {
      attempts++;
      if (attempts <= count) {
        return res.status(error.status || 500).json(error);
      }
      return next();
    });
  }

  mockSecureAnalysis(): void {
    this.app.use('/api/v1/ai/analyze', (req, res, next) => {
      // Mock data encryption/masking
      if (req.body.case_data?.patientData) {
        const patientData = req.body.case_data.patientData;
        if (patientData.ssn) {
          patientData.ssn = patientData.ssn.replace(/\d{3}-\d{2}-(\d{4})/, '***-**-$1');
        }
        if (patientData.name) {
          const parts = patientData.name.split(' ');
          patientData.name = parts[0] + ' ' + parts[1].charAt(0) + '.';
        }
      }

      // Add security headers
      req.headers['x-data-encryption'] = 'aes-256-gcm';
      req.headers['x-request-signature'] = 'mock-signature';
      
      next();
    });
  }

  mockConcurrentAnalysis(count: number): void {
    // No special handling needed for concurrent requests in mock
    // The express server handles concurrency naturally
  }

  // Utility methods for test verification
  getLastRequest(): any {
    return this.requests[this.requests.length - 1];
  }

  getRequestCount(path: string): number {
    return this.requestCounts.get(`POST:${path}`) || 0;
  }

  getAllRequests(): any[] {
    return [...this.requests];
  }

  clearRequests(): void {
    this.requests = [];
    this.requestCounts.clear();
  }
}