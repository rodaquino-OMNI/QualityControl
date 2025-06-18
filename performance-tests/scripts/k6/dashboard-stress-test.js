/**
 * K6 Dashboard Stress Test
 * Tests real-time dashboard performance, WebSocket connections, and data updates
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Custom metrics
const websocketConnectTime = new Trend('websocket_connect_time');
const dataFreshness = new Trend('data_freshness');
const dashboardLoadTime = new Trend('dashboard_load_time');
const realtimeUpdateRate = new Rate('realtime_update_rate');
const chartRenderTime = new Trend('chart_render_time');
const metricAccuracy = new Rate('metric_accuracy');

// Test data
const dashboardEndpoints = new SharedArray('dashboardEndpoints', function() {
  return [
    { path: '/api/dashboard/overview', name: 'overview' },
    { path: '/api/dashboard/cases', name: 'cases' },
    { path: '/api/dashboard/analytics', name: 'analytics' },
    { path: '/api/dashboard/fraud-detection', name: 'fraud_detection' },
    { path: '/api/dashboard/compliance', name: 'compliance' },
    { path: '/api/dashboard/performance', name: 'performance' },
    { path: '/api/dashboard/audit-trail', name: 'audit_trail' },
    { path: '/api/dashboard/alerts', name: 'alerts' }
  ];
});

const realtimeChannels = new SharedArray('realtimeChannels', function() {
  return [
    'case_updates',
    'fraud_alerts',
    'system_metrics',
    'user_activity',
    'processing_queue',
    'compliance_status',
    'performance_metrics',
    'audit_events'
  ];
});

// Test configuration
export const options = {
  scenarios: {
    // Real-time dashboard load
    realtime_updates: {
      executor: 'constant-vus',
      vus: 50,
      duration: '10m',
      gracefulStop: '30s',
    },
    
    // Dashboard heavy load simulation
    dashboard_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },   // Ramp up to 100 users
        { duration: '5m', target: 200 },   // Scale to 200 users
        { duration: '3m', target: 200 },   // Sustain 200 users
        { duration: '2m', target: 0 }      // Ramp down
      ],
      gracefulRampDown: '1m',
    },
    
    // WebSocket stress test
    websocket_stress: {
      executor: 'per-vu-iterations',
      vus: 30,
      iterations: 20,
      maxDuration: '15m',
    }
  },
  
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.01'],
    websocket_connect_time: ['p(95)<1000'],
    data_freshness: ['p(95)<5000'],
    dashboard_load_time: ['p(95)<3000'],
    realtime_update_rate: ['rate>0.95'],
    chart_render_time: ['p(95)<2000'],
    metric_accuracy: ['rate>0.98']
  }
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:8000';

export function setup() {
  console.log('Setting up dashboard stress test...');
  
  // Authenticate to get token for dashboard access
  const loginResponse = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: 'admin@austa.com',
      password: 'admin123'
    }),
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );
  
  let authToken = null;
  if (loginResponse.status === 200) {
    const authData = JSON.parse(loginResponse.body);
    authToken = authData.token;
  }
  
  return {
    baseUrl: BASE_URL,
    wsUrl: WS_URL,
    authToken: authToken,
    timestamp: new Date().toISOString()
  };
}

export default function(data) {
  if (!data.authToken) {
    console.error('No auth token available, skipping test');
    return;
  }
  
  const headers = {
    'Authorization': `Bearer ${data.authToken}`,
    'Content-Type': 'application/json'
  };
  
  group('Dashboard Performance Tests', function() {
    // 1. Dashboard Data Loading
    group('Dashboard Data Loading', function() {
      const dashboardStart = new Date();
      
      // Load multiple dashboard endpoints in parallel
      const responses = dashboardEndpoints.map(endpoint => {
        return http.get(
          `${data.baseUrl}${endpoint.path}`,
          {
            headers: headers,
            tags: { name: `dashboard_${endpoint.name}` }
          }
        );
      });
      
      const dashboardEnd = new Date();
      dashboardLoadTime.add(dashboardEnd - dashboardStart);
      
      // Check all dashboard endpoints
      responses.forEach((response, index) => {
        const endpoint = dashboardEndpoints[index];
        
        const success = check(response, {
          [`${endpoint.name} status is 200`]: (r) => r.status === 200,
          [`${endpoint.name} has data`]: (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.data !== undefined || body.length > 0;
            } catch (e) {
              return false;
            }
          },
          [`${endpoint.name} response time < 2s`]: (r) => r.timings.duration < 2000,
        });
        
        // Check data freshness
        if (success && response.status === 200) {
          try {
            const body = JSON.parse(response.body);
            if (body.timestamp) {
              const dataAge = new Date() - new Date(body.timestamp);
              dataFreshness.add(dataAge);
            }
          } catch (e) {
            // Ignore parsing errors for freshness check
          }
        }
      });
    });
    
    // 2. Real-time WebSocket Connection
    group('WebSocket Real-time Updates', function() {
      const wsStart = new Date();
      const channel = realtimeChannels[Math.floor(Math.random() * realtimeChannels.length)];
      
      const wsUrl = `${data.wsUrl}/ws/dashboard?channel=${channel}&token=${data.authToken}`;
      
      const res = ws.connect(wsUrl, {
        tags: { name: 'websocket_connection' }
      }, function(socket) {
        const wsEnd = new Date();
        websocketConnectTime.add(wsEnd - wsStart);
        
        let updateCount = 0;
        let connectionEstablished = false;
        
        socket.on('open', function() {
          console.log(`WebSocket connected to channel: ${channel}`);
          connectionEstablished = true;
          
          // Subscribe to updates
          socket.send(JSON.stringify({
            action: 'subscribe',
            channel: channel,
            filters: {
              priority: ['high', 'critical'],
              types: ['case_update', 'alert', 'metric_update']
            }
          }));
        });
        
        socket.on('message', function(message) {
          try {
            const data = JSON.parse(message);
            updateCount++;
            
            // Validate message structure
            const validMessage = check(data, {
              'message has type': (d) => d.type !== undefined,
              'message has timestamp': (d) => d.timestamp !== undefined,
              'message has data': (d) => d.data !== undefined,
            });
            
            realtimeUpdateRate.add(validMessage);
            
            // Check data accuracy for known message types
            if (data.type === 'case_update' && data.data.case_id) {
              metricAccuracy.add(true);
            } else if (data.type === 'fraud_alert' && data.data.risk_score !== undefined) {
              metricAccuracy.add(data.data.risk_score >= 0 && data.data.risk_score <= 1);
            } else if (data.type === 'metric_update' && data.data.metrics) {
              metricAccuracy.add(Object.keys(data.data.metrics).length > 0);
            }
            
            console.log(`Received ${data.type} update on channel ${channel}`);
            
          } catch (e) {
            console.error('Error parsing WebSocket message:', e);
            realtimeUpdateRate.add(false);
          }
        });
        
        socket.on('error', function(e) {
          console.error('WebSocket error:', e);
        });
        
        socket.on('close', function() {
          console.log(`WebSocket closed for channel: ${channel}`);
        });
        
        // Keep connection open for a while to receive updates
        sleep(30);
        
        // Test sending a message
        socket.send(JSON.stringify({
          action: 'ping',
          timestamp: new Date().toISOString()
        }));
        
        sleep(5);
        
        console.log(`Received ${updateCount} updates on channel ${channel}`);
      });
      
      check(res, {
        'WebSocket connection successful': (r) => r && r.status === 101,
      });
    });
    
    // 3. Chart and Visualization Performance
    group('Chart Data and Rendering', function() {
      const chartEndpoints = [
        '/api/dashboard/charts/case-trends',
        '/api/dashboard/charts/fraud-statistics',
        '/api/dashboard/charts/performance-metrics',
        '/api/dashboard/charts/audit-timeline'
      ];
      
      chartEndpoints.forEach(endpoint => {
        const chartStart = new Date();
        
        const chartResponse = http.get(
          `${data.baseUrl}${endpoint}`,
          {
            headers: headers,
            tags: { name: 'chart_data' }
          }
        );
        
        const chartEnd = new Date();
        chartRenderTime.add(chartEnd - chartStart);
        
        check(chartResponse, {
          'chart data status is 200': (r) => r.status === 200,
          'chart data has series': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.series && body.series.length > 0;
            } catch (e) {
              return false;
            }
          },
          'chart data response time < 2s': (r) => r.timings.duration < 2000,
        });
      });
    });
    
    // 4. Dashboard Search and Filtering
    group('Dashboard Search and Filtering', function() {
      const searchQueries = [
        { query: 'fraud', filters: { type: 'case', status: 'open' } },
        { query: 'high risk', filters: { priority: 'high' } },
        { query: 'compliance', filters: { category: 'regulatory' } },
        { query: '', filters: { date_range: 'last_7_days' } }
      ];
      
      searchQueries.forEach(search => {
        const searchResponse = http.post(
          `${data.baseUrl}/api/dashboard/search`,
          JSON.stringify({
            query: search.query,
            filters: search.filters,
            limit: 50,
            offset: 0
          }),
          {
            headers: headers,
            tags: { name: 'dashboard_search' }
          }
        );
        
        check(searchResponse, {
          'search status is 200': (r) => r.status === 200,
          'search has results': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.results !== undefined;
            } catch (e) {
              return false;
            }
          },
          'search response time < 1s': (r) => r.timings.duration < 1000,
        });
      });
    });
    
    // 5. Dashboard Export Performance
    group('Dashboard Export', function() {
      const exportFormats = ['csv', 'pdf', 'excel'];
      const exportType = exportFormats[Math.floor(Math.random() * exportFormats.length)];
      
      const exportResponse = http.post(
        `${data.baseUrl}/api/dashboard/export`,
        JSON.stringify({
          format: exportType,
          data_type: 'case_summary',
          date_range: 'last_30_days',
          include_charts: true
        }),
        {
          headers: headers,
          tags: { name: 'dashboard_export' },
          timeout: '30s'
        }
      );
      
      check(exportResponse, {
        'export status is 200': (r) => r.status === 200,
        'export has download link': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.download_url !== undefined;
          } catch (e) {
            return false;
          }
        },
        'export response time < 15s': (r) => r.timings.duration < 15000,
      });
    });
  });
  
  // Simulate user interaction time
  sleep(Math.random() * 5 + 2); // 2-7 seconds
}

export function teardown(data) {
  console.log('Dashboard stress test completed at:', new Date().toISOString());
  console.log('Test started at:', data.timestamp);
}