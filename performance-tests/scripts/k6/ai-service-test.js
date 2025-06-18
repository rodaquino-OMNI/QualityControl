/**
 * K6 AI Service Performance Test
 * Tests AI analysis, chat, and decision pipeline performance
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Custom metrics
const aiResponseTime = new Trend('ai_response_time');
const aiAccuracy = new Rate('ai_accuracy');
const chatResponseTime = new Trend('chat_response_time');
const modelLoadTime = new Trend('model_load_time');
const analysisCompleteRate = new Rate('analysis_complete_rate');
const fraudPredictionAccuracy = new Rate('fraud_prediction_accuracy');

// Test data
const analysisRequests = new SharedArray('analysisRequests', function() {
  return [
    {
      type: 'fraud_detection',
      data: {
        transaction_amount: 45000,
        transaction_time: '2023-10-15T14:30:00Z',
        merchant_category: 'high_risk',
        user_behavior: 'suspicious',
        device_fingerprint: 'unknown_device',
        location: 'high_risk_country'
      },
      expected_risk_level: 'high'
    },
    {
      type: 'compliance_check',
      data: {
        document_type: 'identity_verification',
        document_quality: 'medium',
        data_consistency: 'partial_match',
        regulatory_flags: ['kyc_incomplete', 'address_mismatch'],
        risk_indicators: ['new_customer', 'high_value_transaction']
      },
      expected_risk_level: 'medium'
    },
    {
      type: 'pattern_analysis',
      data: {
        transaction_history: Array.from({length: 50}, (_, i) => ({
          amount: Math.random() * 10000,
          timestamp: new Date(Date.now() - i * 86400000).toISOString(),
          merchant: `merchant_${i % 10}`
        })),
        behavioral_patterns: ['unusual_timing', 'amount_spike'],
        risk_factors: ['velocity_check_failed']
      },
      expected_risk_level: 'medium'
    },
    {
      type: 'medical_analysis',
      data: {
        medical_codes: ['ICD10-Z123', 'CPT-99213', 'HCPCS-G0123'],
        claim_amount: 2500,
        provider_risk_score: 0.3,
        patient_history: 'chronic_condition',
        billing_patterns: ['normal_frequency', 'appropriate_codes']
      },
      expected_risk_level: 'low'
    }
  ];
});

const chatQueries = new SharedArray('chatQueries', function() {
  return [
    {
      query: "What are the key fraud indicators for this transaction?",
      context: "financial_fraud",
      expected_response_type: "analysis"
    },
    {
      query: "Explain the compliance requirements for high-risk customers.",
      context: "regulatory_compliance",
      expected_response_type: "explanation"
    },
    {
      query: "How should I interpret this risk score of 0.85?",
      context: "risk_assessment",
      expected_response_type: "interpretation"
    },
    {
      query: "What additional documentation is needed for this case?",
      context: "case_management",
      expected_response_type: "recommendation"
    }
  ];
});

// Test configuration
export const options = {
  scenarios: {
    // AI analysis load test
    ai_analysis: {
      executor: 'constant-vus',
      vus: 10,
      duration: '10m',
      gracefulStop: '30s',
    },
    
    // AI chat interaction test
    ai_chat: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '3m', target: 20 },
        { duration: '3m', target: 20 },
        { duration: '1m', target: 0 }
      ],
      gracefulRampDown: '30s',
    },
    
    // Model performance stress test
    model_stress: {
      executor: 'constant-arrival-rate',
      rate: 5, // 5 requests per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 15,
      maxVUs: 30,
    }
  },
  
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.01'],
    ai_response_time: ['p(95)<8000', 'p(99)<15000'],
    ai_accuracy: ['rate>0.95'],
    chat_response_time: ['p(95)<3000'],
    model_load_time: ['p(95)<2000'],
    analysis_complete_rate: ['rate>0.98'],
    fraud_prediction_accuracy: ['rate>0.90']
  }
};

const AI_SERVICE_URL = __ENV.AI_SERVICE_URL || 'http://localhost:8001';

export function setup() {
  console.log('Setting up AI service performance test...');
  
  // Test AI service connectivity
  const healthResponse = http.get(`${AI_SERVICE_URL}/health`);
  if (healthResponse.status !== 200) {
    console.error('AI service is not available');
    return null;
  }
  
  return {
    aiServiceUrl: AI_SERVICE_URL,
    timestamp: new Date().toISOString()
  };
}

export default function(data) {
  if (!data) {
    console.error('Setup failed, skipping test execution');
    return;
  }
  
  const analysisRequest = analysisRequests[Math.floor(Math.random() * analysisRequests.length)];
  const chatQuery = chatQueries[Math.floor(Math.random() * chatQueries.length)];
  
  group('AI Service Performance Tests', function() {
    // 1. AI Analysis Test
    group('AI Analysis', function() {
      const analysisStart = new Date();
      
      const analysisPayload = {
        type: analysisRequest.type,
        data: analysisRequest.data,
        model_preferences: {
          accuracy_threshold: 0.8,
          response_format: 'detailed',
          include_confidence: true
        }
      };
      
      const analysisResponse = http.post(
        `${data.aiServiceUrl}/api/analyze`,
        JSON.stringify(analysisPayload),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          tags: { name: 'ai_analysis' },
          timeout: '15s'
        }
      );
      
      const analysisEnd = new Date();
      aiResponseTime.add(analysisEnd - analysisStart);
      
      const analysisSuccess = check(analysisResponse, {
        'analysis status is 200': (r) => r.status === 200,
        'analysis response has results': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.risk_score !== undefined && 
                   body.confidence !== undefined && 
                   body.recommendation !== undefined;
          } catch (e) {
            return false;
          }
        },
        'analysis response time < 8s': (r) => r.timings.duration < 8000,
        'analysis confidence > 0.7': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.confidence > 0.7;
          } catch (e) {
            return false;
          }
        }
      });
      
      analysisCompleteRate.add(analysisSuccess);
      
      // Check prediction accuracy
      if (analysisSuccess && analysisResponse.status === 200) {
        try {
          const analysisData = JSON.parse(analysisResponse.body);
          const predictedRisk = analysisData.risk_level || 
                               (analysisData.risk_score > 0.7 ? 'high' : 
                                analysisData.risk_score > 0.4 ? 'medium' : 'low');
          const expectedRisk = analysisRequest.expected_risk_level;
          
          aiAccuracy.add(predictedRisk === expectedRisk);
          
          // For fraud detection specifically
          if (analysisRequest.type === 'fraud_detection') {
            const isFraudPredicted = analysisData.risk_score > 0.6;
            const shouldBeFraud = expectedRisk === 'high';
            fraudPredictionAccuracy.add(isFraudPredicted === shouldBeFraud);
          }
        } catch (e) {
          console.error('Error parsing analysis response:', e);
        }
      }
    });
    
    // 2. AI Chat Test
    group('AI Chat', function() {
      const chatStart = new Date();
      
      const chatPayload = {
        query: chatQuery.query,
        context: {
          type: chatQuery.context,
          case_data: analysisRequest.data,
          user_role: 'analyst'
        },
        conversation_id: `test_${Date.now()}`,
        response_format: 'structured'
      };
      
      const chatResponse = http.post(
        `${data.aiServiceUrl}/api/chat`,
        JSON.stringify(chatPayload),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          tags: { name: 'ai_chat' },
          timeout: '10s'
        }
      );
      
      const chatEnd = new Date();
      chatResponseTime.add(chatEnd - chatStart);
      
      const chatSuccess = check(chatResponse, {
        'chat status is 200': (r) => r.status === 200,
        'chat response has content': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.response !== undefined && 
                   body.response.length > 10 &&
                   body.confidence !== undefined;
          } catch (e) {
            return false;
          }
        },
        'chat response time < 3s': (r) => r.timings.duration < 3000,
        'chat response is relevant': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.response.toLowerCase().includes(chatQuery.context.split('_')[0]);
          } catch (e) {
            return false;
          }
        }
      });
      
      if (chatSuccess) {
        console.log(`Chat query processed successfully: ${chatQuery.query.substring(0, 50)}...`);
      }
    });
    
    // 3. Model Loading and Health Check
    group('Model Performance', function() {
      const modelStart = new Date();
      
      const modelResponse = http.get(
        `${data.aiServiceUrl}/api/models/status`,
        {
          tags: { name: 'model_status' }
        }
      );
      
      const modelEnd = new Date();
      modelLoadTime.add(modelEnd - modelStart);
      
      check(modelResponse, {
        'model status is 200': (r) => r.status === 200,
        'models are loaded': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.models && Object.keys(body.models).length > 0;
          } catch (e) {
            return false;
          }
        },
        'model check time < 2s': (r) => r.timings.duration < 2000,
      });
    });
    
    // 4. Batch Analysis Test
    group('Batch Analysis', function() {
      const batchPayload = {
        requests: [
          { type: 'fraud_detection', data: analysisRequests[0].data },
          { type: 'compliance_check', data: analysisRequests[1].data }
        ],
        batch_options: {
          parallel_processing: true,
          priority: 'normal'
        }
      };
      
      const batchResponse = http.post(
        `${data.aiServiceUrl}/api/analyze/batch`,
        JSON.stringify(batchPayload),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          tags: { name: 'batch_analysis' },
          timeout: '20s'
        }
      );
      
      check(batchResponse, {
        'batch status is 200': (r) => r.status === 200,
        'batch response has all results': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.results && body.results.length === 2;
          } catch (e) {
            return false;
          }
        },
        'batch processing time < 15s': (r) => r.timings.duration < 15000,
      });
    });
  });
  
  // Simulate think time between requests
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

export function teardown(data) {
  if (data) {
    console.log('AI service performance test completed at:', new Date().toISOString());
    console.log('Test started at:', data.timestamp);
  }
}