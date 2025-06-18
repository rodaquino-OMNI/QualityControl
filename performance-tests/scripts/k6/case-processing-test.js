/**
 * K6 Case Processing Performance Test
 * Tests case creation, analysis, and processing throughput
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom metrics
const caseCreationRate = new Rate('case_creation_success_rate');
const caseProcessingTime = new Trend('case_processing_time');
const caseAnalysisTime = new Trend('case_analysis_time');
const fraudDetectionAccuracy = new Rate('fraud_detection_accuracy');
const caseUpdateRate = new Rate('case_update_success_rate');

// Test data
const caseTemplates = new SharedArray('caseTemplates', function() {
  return [
    {
      type: 'fraud_detection',
      priority: 'high',
      category: 'financial',
      amount: 50000,
      suspicious_patterns: ['unusual_transaction_time', 'new_device', 'high_amount']
    },
    {
      type: 'compliance_review',
      priority: 'medium',
      category: 'regulatory',
      amount: 25000,
      suspicious_patterns: ['document_mismatch', 'identity_verification']
    },
    {
      type: 'risk_assessment',
      priority: 'low',
      category: 'operational',
      amount: 10000,
      suspicious_patterns: ['pattern_anomaly']
    },
    {
      type: 'audit_review',
      priority: 'critical',
      category: 'audit',
      amount: 100000,
      suspicious_patterns: ['multiple_flags', 'high_risk_profile', 'manual_review_required']
    }
  ];
});

const users = new SharedArray('users', function() {
  return [
    { token: 'admin_token', role: 'admin' },
    { token: 'auditor_token', role: 'auditor' },
    { token: 'analyst_token', role: 'analyst' }
  ];
});

// Test configuration
export const options = {
  scenarios: {
    // Case creation load test
    case_creation: {
      executor: 'constant-arrival-rate',
      rate: 10, // 10 cases per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
    
    // Case analysis throughput test
    case_analysis: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      stages: [
        { duration: '2m', target: 5 },   // Start at 5 analyses per second
        { duration: '5m', target: 15 },  // Ramp to 15 per second
        { duration: '3m', target: 15 },  // Sustain 15 per second
        { duration: '2m', target: 0 }    // Ramp down
      ],
      preAllocatedVUs: 30,
      maxVUs: 100,
    },
    
    // Bulk case processing
    bulk_processing: {
      executor: 'per-vu-iterations',
      vus: 10,
      iterations: 50,
      maxDuration: '15m',
    }
  },
  
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    http_req_failed: ['rate<0.005'],
    case_creation_success_rate: ['rate>0.99'],
    case_processing_time: ['p(95)<10000'],
    case_analysis_time: ['p(95)<8000'],
    fraud_detection_accuracy: ['rate>0.95'],
    case_update_success_rate: ['rate>0.98']
  }
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8000';

export function setup() {
  console.log('Setting up case processing performance test...');
  
  // Authenticate and get tokens for test users
  const authTokens = {};
  const testUsers = [
    { email: 'admin@austa.com', password: 'admin123', role: 'admin' },
    { email: 'auditor@austa.com', password: 'auditor123', role: 'auditor' },
    { email: 'analyst@austa.com', password: 'analyst123', role: 'analyst' }
  ];
  
  testUsers.forEach(user => {
    const loginResponse = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    if (loginResponse.status === 200) {
      const authData = JSON.parse(loginResponse.body);
      authTokens[user.role] = authData.token;
    }
  });
  
  return {
    baseUrl: BASE_URL,
    authTokens: authTokens,
    timestamp: new Date().toISOString()
  };
}

export default function(data) {
  const caseTemplate = caseTemplates[Math.floor(Math.random() * caseTemplates.length)];
  const userRole = ['admin', 'auditor', 'analyst'][Math.floor(Math.random() * 3)];
  const token = data.authTokens[userRole];
  
  if (!token) {
    console.error(`No auth token available for role: ${userRole}`);
    return;
  }
  
  group('Case Processing Workflow', function() {
    let caseId;
    
    // 1. Create new case
    group('Case Creation', function() {
      const caseData = {
        id: uuidv4(),
        type: caseTemplate.type,
        priority: caseTemplate.priority,
        category: caseTemplate.category,
        title: `${caseTemplate.type} - ${Date.now()}`,
        description: `Automated test case for ${caseTemplate.type}`,
        amount: caseTemplate.amount,
        currency: 'USD',
        suspicious_patterns: caseTemplate.suspicious_patterns,
        metadata: {
          source: 'performance_test',
          created_by: userRole,
          test_run: data.timestamp
        }
      };
      
      const createStart = new Date();
      
      const createResponse = http.post(
        `${BASE_URL}/api/cases`,
        JSON.stringify(caseData),
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          tags: { name: 'case_creation' }
        }
      );
      
      const createEnd = new Date();
      const creationTime = createEnd - createStart;
      
      const creationSuccess = check(createResponse, {
        'case creation status is 201': (r) => r.status === 201,
        'case creation response has ID': (r) => {
          try {
            const body = JSON.parse(r.body);
            caseId = body.id;
            return body.id !== undefined;
          } catch (e) {
            return false;
          }
        },
        'case creation time < 2s': (r) => r.timings.duration < 2000,
      });
      
      caseCreationRate.add(creationSuccess);
      
      if (creationSuccess) {
        console.log(`Created case ${caseId} in ${creationTime}ms`);
      }
    });
    
    if (caseId) {
      // 2. Case analysis and fraud detection
      group('Case Analysis', function() {
        const analysisStart = new Date();
        
        const analysisResponse = http.post(
          `${BASE_URL}/api/cases/${caseId}/analyze`,
          JSON.stringify({
            analysis_type: 'fraud_detection',
            include_ai_assessment: true,
            risk_factors: caseTemplate.suspicious_patterns
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            tags: { name: 'case_analysis' }
          }
        );
        
        const analysisEnd = new Date();
        caseAnalysisTime.add(analysisEnd - analysisStart);
        
        const analysisSuccess = check(analysisResponse, {
          'analysis status is 200': (r) => r.status === 200,
          'analysis response has results': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.risk_score !== undefined && body.recommendation !== undefined;
            } catch (e) {
              return false;
            }
          },
          'analysis time < 8s': (r) => r.timings.duration < 8000,
        });
        
        if (analysisSuccess && analysisResponse.status === 200) {
          const analysisData = JSON.parse(analysisResponse.body);
          
          // Check fraud detection accuracy
          const expectedFraud = caseTemplate.suspicious_patterns.length > 2;
          const detectedFraud = analysisData.risk_score > 0.7;
          fraudDetectionAccuracy.add(expectedFraud === detectedFraud);
        }
      });
      
      // 3. Case updates and status changes
      group('Case Updates', function() {
        const updateData = {
          status: 'under_review',
          assigned_to: userRole,
          notes: 'Case assigned for detailed review',
          priority: caseTemplate.priority,
          updated_by: userRole
        };
        
        const updateResponse = http.put(
          `${BASE_URL}/api/cases/${caseId}`,
          JSON.stringify(updateData),
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            tags: { name: 'case_update' }
          }
        );
        
        const updateSuccess = check(updateResponse, {
          'update status is 200': (r) => r.status === 200,
          'update response reflects changes': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.status === 'under_review';
            } catch (e) {
              return false;
            }
          },
          'update time < 1s': (r) => r.timings.duration < 1000,
        });
        
        caseUpdateRate.add(updateSuccess);
      });
      
      // 4. Case retrieval and details
      group('Case Retrieval', function() {
        const retrievalResponse = http.get(
          `${BASE_URL}/api/cases/${caseId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            },
            tags: { name: 'case_retrieval' }
          }
        );
        
        check(retrievalResponse, {
          'retrieval status is 200': (r) => r.status === 200,
          'retrieval response has complete data': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.id === caseId && body.type === caseTemplate.type;
            } catch (e) {
              return false;
            }
          },
          'retrieval time < 500ms': (r) => r.timings.duration < 500,
        });
      });
      
      // 5. Case processing completion
      group('Case Processing', function() {
        const processingStart = new Date();
        
        const processResponse = http.post(
          `${BASE_URL}/api/cases/${caseId}/process`,
          JSON.stringify({
            action: 'complete_analysis',
            decision: Math.random() > 0.5 ? 'approved' : 'flagged',
            confidence: Math.random() * 0.4 + 0.6, // 0.6-1.0
            processed_by: userRole
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            tags: { name: 'case_processing' }
          }
        );
        
        const processingEnd = new Date();
        caseProcessingTime.add(processingEnd - processingStart);
        
        check(processResponse, {
          'processing status is 200': (r) => r.status === 200,
          'processing response has decision': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.decision !== undefined;
            } catch (e) {
              return false;
            }
          },
          'processing time < 10s': (r) => r.timings.duration < 10000,
        });
      });
    }
  });
  
  // Simulate processing time between cases
  sleep(Math.random() * 2 + 0.5); // 0.5-2.5 seconds
}

export function teardown(data) {
  console.log('Case processing performance test completed at:', new Date().toISOString());
  console.log('Test started at:', data.timestamp);
}