/**
 * K6 Authentication Load Testing Script
 * Tests concurrent login scenarios and session management
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Custom metrics
const loginSuccessRate = new Rate('login_success_rate');
const loginDuration = new Trend('login_duration');
const sessionDuration = new Trend('session_duration');
const mfaValidationRate = new Rate('mfa_validation_rate');

// Test data
const users = new SharedArray('users', function() {
  return [
    { username: 'admin@austa.com', password: 'admin123', role: 'admin' },
    { username: 'auditor@austa.com', password: 'auditor123', role: 'auditor' },
    { username: 'analyst@austa.com', password: 'analyst123', role: 'analyst' },
    { username: 'user@austa.com', password: 'user123', role: 'user' }
  ];
});

// Test configuration
export const options = {
  scenarios: {
    // Burst login scenario - simulates peak login times
    login_burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },   // Ramp up to 50 users
        { duration: '1m', target: 100 },   // Scale to 100 users
        { duration: '2m', target: 100 },   // Stay at 100 users
        { duration: '30s', target: 0 }     // Ramp down
      ],
      gracefulRampDown: '30s',
    },
    
    // Concurrent login scenario - sustained load
    concurrent_logins: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      gracefulStop: '30s',
    },
    
    // Session management scenario
    session_management: {
      executor: 'per-vu-iterations',
      vus: 20,
      iterations: 10,
      maxDuration: '10m',
    }
  },
  
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    login_success_rate: ['rate>0.99'],
    login_duration: ['p(95)<800'],
    session_duration: ['p(95)<300'],
    mfa_validation_rate: ['rate>0.98']
  }
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8000';

export function setup() {
  console.log('Setting up authentication load test...');
  return {
    baseUrl: BASE_URL,
    timestamp: new Date().toISOString()
  };
}

export default function(data) {
  const user = users[Math.floor(Math.random() * users.length)];
  
  group('Authentication Flow', function() {
    // 1. Login attempt
    group('User Login', function() {
      const loginStart = new Date();
      
      const loginPayload = {
        email: user.username,
        password: user.password
      };
      
      const loginParams = {
        headers: {
          'Content-Type': 'application/json',
        },
        tags: { name: 'login' }
      };
      
      const loginResponse = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify(loginPayload),
        loginParams
      );
      
      const loginEnd = new Date();
      loginDuration.add(loginEnd - loginStart);
      
      const loginSuccess = check(loginResponse, {
        'login status is 200': (r) => r.status === 200,
        'login response has token': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.token !== undefined;
          } catch (e) {
            return false;
          }
        },
        'login response time < 1s': (r) => r.timings.duration < 1000,
      });
      
      loginSuccessRate.add(loginSuccess);
      
      if (loginSuccess && loginResponse.status === 200) {
        const authData = JSON.parse(loginResponse.body);
        const token = authData.token;
        
        // 2. MFA validation (if required)
        if (authData.requiresMFA) {
          group('MFA Validation', function() {
            const mfaPayload = {
              token: '123456', // Mock MFA token
              userId: authData.userId
            };
            
            const mfaResponse = http.post(
              `${BASE_URL}/api/auth/verify-mfa`,
              JSON.stringify(mfaPayload),
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                tags: { name: 'mfa_validation' }
              }
            );
            
            const mfaSuccess = check(mfaResponse, {
              'MFA validation status is 200': (r) => r.status === 200,
              'MFA response time < 500ms': (r) => r.timings.duration < 500,
            });
            
            mfaValidationRate.add(mfaSuccess);
          });
        }
        
        // 3. Session validation and user profile
        group('Session Management', function() {
          const sessionStart = new Date();
          
          const profileResponse = http.get(
            `${BASE_URL}/api/auth/profile`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              },
              tags: { name: 'profile_fetch' }
            }
          );
          
          const sessionEnd = new Date();
          sessionDuration.add(sessionEnd - sessionStart);
          
          check(profileResponse, {
            'profile fetch status is 200': (r) => r.status === 200,
            'profile has user data': (r) => {
              try {
                const body = JSON.parse(r.body);
                return body.id !== undefined && body.email !== undefined;
              } catch (e) {
                return false;
              }
            },
            'profile response time < 300ms': (r) => r.timings.duration < 300,
          });
          
          // 4. Token refresh test
          sleep(1); // Simulate some activity time
          
          const refreshResponse = http.post(
            `${BASE_URL}/api/auth/refresh`,
            JSON.stringify({ refreshToken: authData.refreshToken }),
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              tags: { name: 'token_refresh' }
            }
          );
          
          check(refreshResponse, {
            'token refresh status is 200': (r) => r.status === 200,
            'refresh response has new token': (r) => {
              try {
                const body = JSON.parse(r.body);
                return body.token !== undefined;
              } catch (e) {
                return false;
              }
            },
            'token refresh time < 200ms': (r) => r.timings.duration < 200,
          });
        });
        
        // 5. Logout
        group('User Logout', function() {
          const logoutResponse = http.post(
            `${BASE_URL}/api/auth/logout`,
            JSON.stringify({}),
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              tags: { name: 'logout' }
            }
          );
          
          check(logoutResponse, {
            'logout status is 200': (r) => r.status === 200,
            'logout response time < 200ms': (r) => r.timings.duration < 200,
          });
        });
      }
    });
  });
  
  // Simulate user think time
  sleep(Math.random() * 3 + 1); // 1-4 seconds
}

export function teardown(data) {
  console.log('Authentication load test completed at:', new Date().toISOString());
  console.log('Test started at:', data.timestamp);
}