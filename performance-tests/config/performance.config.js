/**
 * Performance Testing Configuration for AUSTA Cockpit
 * Defines test parameters, thresholds, and SLA requirements
 */

module.exports = {
  // Environment configurations
  environments: {
    development: {
      baseUrl: 'http://localhost:3000',
      apiUrl: 'http://localhost:8000',
      aiServiceUrl: 'http://localhost:8001',
      maxUsers: 50,
      rampUpDuration: '30s',
      testDuration: '2m'
    },
    staging: {
      baseUrl: 'https://staging.austa-cockpit.com',
      apiUrl: 'https://api-staging.austa-cockpit.com',
      aiServiceUrl: 'https://ai-staging.austa-cockpit.com',
      maxUsers: 200,
      rampUpDuration: '2m',
      testDuration: '10m'
    },
    production: {
      baseUrl: 'https://austa-cockpit.com',
      apiUrl: 'https://api.austa-cockpit.com',
      aiServiceUrl: 'https://ai.austa-cockpit.com',
      maxUsers: 500,
      rampUpDuration: '5m',
      testDuration: '30m'
    }
  },

  // Performance SLA thresholds
  sla: {
    responseTime: {
      p95: 1000, // 95th percentile response time in ms
      p99: 2000, // 99th percentile response time in ms
      avg: 500   // Average response time in ms
    },
    throughput: {
      minRps: 100,  // Minimum requests per second
      maxRps: 1000  // Maximum requests per second
    },
    errorRate: {
      max: 0.01 // Maximum error rate (1%)
    },
    availability: {
      min: 0.999 // Minimum availability (99.9%)
    }
  },

  // Authentication load testing
  authLoad: {
    scenarios: {
      login_burst: {
        executor: 'ramping-vus',
        stages: [
          { duration: '30s', target: 50 },
          { duration: '1m', target: 100 },
          { duration: '30s', target: 0 }
        ]
      },
      concurrent_logins: {
        executor: 'constant-vus',
        vus: 100,
        duration: '5m'
      }
    },
    thresholds: {
      http_req_duration: ['p(95)<1000', 'p(99)<2000'],
      http_req_failed: ['rate<0.01'],
      login_success_rate: ['rate>0.99']
    }
  },

  // Case processing performance
  caseProcessing: {
    scenarios: {
      case_creation: {
        executor: 'constant-arrival-rate',
        rate: 10,
        duration: '5m',
        preAllocatedVUs: 20
      },
      case_analysis: {
        executor: 'ramping-arrival-rate',
        stages: [
          { duration: '2m', target: 5 },
          { duration: '5m', target: 15 },
          { duration: '2m', target: 0 }
        ]
      }
    },
    thresholds: {
      http_req_duration: ['p(95)<3000', 'p(99)<5000'],
      case_processing_time: ['p(95)<10000'],
      http_req_failed: ['rate<0.005']
    }
  },

  // AI service performance
  aiService: {
    scenarios: {
      ai_analysis: {
        executor: 'constant-vus',
        vus: 10,
        duration: '10m'
      },
      ai_chat: {
        executor: 'ramping-vus',
        stages: [
          { duration: '1m', target: 5 },
          { duration: '3m', target: 20 },
          { duration: '1m', target: 0 }
        ]
      }
    },
    thresholds: {
      http_req_duration: ['p(95)<5000', 'p(99)<10000'],
      ai_response_time: ['p(95)<8000'],
      ai_accuracy: ['rate>0.95']
    }
  },

  // Dashboard and real-time metrics
  dashboard: {
    scenarios: {
      realtime_updates: {
        executor: 'constant-vus',
        vus: 50,
        duration: '10m'
      },
      dashboard_load: {
        executor: 'ramping-vus',
        stages: [
          { duration: '2m', target: 100 },
          { duration: '5m', target: 200 },
          { duration: '3m', target: 0 }
        ]
      }
    },
    thresholds: {
      http_req_duration: ['p(95)<2000'],
      websocket_connect_time: ['p(95)<1000'],
      data_freshness: ['p(95)<5000']
    }
  },

  // Database performance
  database: {
    thresholds: {
      query_duration: ['p(95)<500', 'p(99)<1000'],
      connection_time: ['p(95)<100'],
      transaction_time: ['p(95)<1000']
    }
  },

  // Lighthouse performance criteria
  lighthouse: {
    thresholds: {
      performance: 90,
      accessibility: 95,
      bestPractices: 90,
      seo: 85,
      pwa: 80
    },
    categories: [
      'performance',
      'accessibility',
      'best-practices',
      'seo',
      'pwa'
    ]
  },

  // Monitoring and alerting
  monitoring: {
    influxdb: {
      host: 'localhost',
      port: 8086,
      database: 'austa_performance'
    },
    prometheus: {
      pushgateway: 'http://localhost:9091'
    },
    grafana: {
      url: 'http://localhost:3001',
      apiKey: process.env.GRAFANA_API_KEY
    }
  },

  // Test data and credentials
  testData: {
    users: {
      admin: {
        username: 'admin@austa.com',
        password: process.env.TEST_ADMIN_PASSWORD || 'admin123'
      },
      auditor: {
        username: 'auditor@austa.com',
        password: process.env.TEST_AUDITOR_PASSWORD || 'auditor123'
      },
      analyst: {
        username: 'analyst@austa.com',
        password: process.env.TEST_ANALYST_PASSWORD || 'analyst123'
      }
    },
    cases: {
      sampleCaseCount: 1000,
      fraudProbability: 0.3,
      complexityLevels: ['low', 'medium', 'high', 'critical']
    }
  }
};