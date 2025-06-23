/**
 * External API Mocks for Integration Testing
 */

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

export class ExternalAPIMocks {
  private mock: MockAdapter;

  constructor() {
    this.mock = new MockAdapter(axios);
    this.setupDefaultMocks();
  }

  private setupDefaultMocks(): void {
    // Medical coding API mock
    this.mock.onGet(/\/api\/codes\/.*/).reply((config) => {
      const code = config.url?.split('/').pop();
      
      const medicalCodes: Record<string, any> = {
        'E11.9': {
          code: 'E11.9',
          description: 'Type 2 diabetes mellitus without complications',
          category: 'Endocrine, nutritional and metabolic diseases',
          valid: true
        },
        'I10': {
          code: 'I10',
          description: 'Essential hypertension',
          category: 'Diseases of the circulatory system',
          valid: true
        },
        'J44.1': {
          code: 'J44.1',
          description: 'Chronic obstructive pulmonary disease with acute exacerbation',
          category: 'Diseases of the respiratory system',
          valid: true
        }
      };

      const result = medicalCodes[code || ''] || {
        code,
        valid: false,
        error: 'Code not found'
      };

      return [200, result];
    });

    // Drug interaction API mock
    this.mock.onPost('/api/drug-interactions').reply((config) => {
      const { medications } = JSON.parse(config.data || '{}');
      
      const interactions = [];
      if (medications?.includes('Metformin') && medications?.includes('Insulin')) {
        interactions.push({
          severity: 'moderate',
          description: 'Monitor blood glucose levels closely',
          medications: ['Metformin', 'Insulin']
        });
      }

      return [200, {
        interactions,
        checked: medications?.length || 0,
        timestamp: new Date().toISOString()
      }];
    });

    // Insurance verification API mock
    this.mock.onPost('/api/insurance/verify').reply((config) => {
      const { patientId, insuranceId } = JSON.parse(config.data || '{}');
      
      return [200, {
        verified: true,
        coverage: {
          active: true,
          effectiveDate: '2024-01-01',
          expirationDate: '2024-12-31',
          copay: 25,
          deductible: 1000,
          coinsurance: 0.2
        },
        patientId,
        insuranceId
      }];
    });

    // Provider directory API mock
    this.mock.onGet(/\/api\/providers\/search.*/).reply((config) => {
      const specialty = config.params?.specialty;
      
      const providers = [
        {
          id: 'PROV001',
          name: 'Dr. Sarah Johnson',
          specialty: 'cardiology',
          location: 'New York, NY',
          rating: 4.8,
          accepting_patients: true
        },
        {
          id: 'PROV002', 
          name: 'Dr. Michael Chen',
          specialty: 'neurology',
          location: 'Los Angeles, CA',
          rating: 4.9,
          accepting_patients: true
        },
        {
          id: 'PROV003',
          name: 'Dr. Emily Rodriguez',
          specialty: 'orthopedics',
          location: 'Chicago, IL', 
          rating: 4.7,
          accepting_patients: false
        }
      ];

      const filtered = specialty 
        ? providers.filter(p => p.specialty === specialty)
        : providers;

      return [200, {
        providers: filtered,
        total: filtered.length,
        page: 1
      }];
    });

    // Clinical guidelines API mock
    this.mock.onGet(/\/api\/guidelines\/.*/).reply((config) => {
      const condition = config.url?.split('/').pop();
      
      const guidelines: Record<string, any> = {
        'diabetes': {
          condition: 'Type 2 Diabetes',
          lastUpdated: '2024-01-01',
          recommendations: [
            'HbA1c target <7% for most adults',
            'Blood pressure target <140/90 mmHg',
            'Annual eye and foot exams',
            'Statin therapy if indicated'
          ],
          evidenceLevel: 'A',
          source: 'American Diabetes Association'
        },
        'hypertension': {
          condition: 'Essential Hypertension',
          lastUpdated: '2024-01-01',
          recommendations: [
            'Target BP <130/80 mmHg for most adults',
            'Lifestyle modifications first-line',
            'ACE inhibitors or ARBs preferred',
            'Regular monitoring required'
          ],
          evidenceLevel: 'A',
          source: 'American Heart Association'
        }
      };

      const result = guidelines[condition || ''] || {
        error: 'Guidelines not found for condition',
        condition
      };

      return [200, result];
    });

    // Laboratory reference ranges API mock
    this.mock.onGet('/api/lab/reference-ranges').reply(() => {
      return [200, {
        ranges: {
          'glucose': {
            fasting: { min: 70, max: 100, unit: 'mg/dL' },
            random: { min: 70, max: 140, unit: 'mg/dL' }
          },
          'hba1c': {
            normal: { min: 4.0, max: 5.6, unit: '%' },
            prediabetes: { min: 5.7, max: 6.4, unit: '%' },
            diabetes: { min: 6.5, max: null, unit: '%' }
          },
          'cholesterol': {
            total: { min: null, max: 200, unit: 'mg/dL' },
            ldl: { min: null, max: 100, unit: 'mg/dL' },
            hdl: { min: 40, max: null, unit: 'mg/dL' }
          }
        },
        lastUpdated: '2024-01-01'
      }];
    });
  }

  /**
   * Mock rate limiting response
   */
  mockRateLimitError(endpoint: string): void {
    this.mock.onAny(endpoint).reply(429, {
      error: 'Rate limit exceeded',
      retryAfter: 60,
      limit: 1000,
      remaining: 0,
      resetTime: Date.now() + 60000
    });
  }

  /**
   * Mock authentication error
   */
  mockAuthError(endpoint: string): void {
    this.mock.onAny(endpoint).reply(401, {
      error: 'Authentication required',
      message: 'Invalid or missing API key'
    });
  }

  /**
   * Mock service unavailable
   */
  mockServiceUnavailable(endpoint: string): void {
    this.mock.onAny(endpoint).reply(503, {
      error: 'Service temporarily unavailable',
      message: 'External service is down for maintenance',
      retryAfter: 300
    });
  }

  /**
   * Mock timeout
   */
  mockTimeout(endpoint: string): void {
    this.mock.onAny(endpoint).timeout();
  }

  /**
   * Mock network error
   */
  mockNetworkError(endpoint: string): void {
    this.mock.onAny(endpoint).networkError();
  }

  /**
   * Mock custom response
   */
  mockCustomResponse(endpoint: string, status: number, data: any): void {
    this.mock.onAny(endpoint).reply(status, data);
  }

  /**
   * Reset all mocks
   */
  reset(): void {
    this.mock.reset();
    this.setupDefaultMocks();
  }

  /**
   * Restore original axios
   */
  restore(): void {
    this.mock.restore();
  }

  /**
   * Get request history
   */
  getHistory(): any[] {
    return this.mock.history.get.concat(
      this.mock.history.post,
      this.mock.history.put,
      this.mock.history.delete,
      this.mock.history.patch
    );
  }

  /**
   * Clear request history
   */
  clearHistory(): void {
    this.mock.resetHistory();
  }
}