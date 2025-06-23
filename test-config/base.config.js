/**
 * Base Test Configuration
 * Shared settings across all test environments
 */

const baseConfig = {
  // Coverage thresholds standardized across all environments
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  
  // Test timeouts (in milliseconds)
  timeouts: {
    unit: 5000,
    integration: 15000,
    e2e: 30000,
    api: 10000,
  },
  
  // Retry configuration
  retries: {
    unit: 0,
    integration: 1,
    e2e: 2,
    flaky: 3,
  },
  
  // Test environment settings
  environment: {
    isolation: true,
    cleanup: true,
    parallel: false, // Enable per environment
    verbose: process.env.CI ? false : true,
  },
  
  // File patterns
  patterns: {
    unit: '**/*.(test|spec).(js|jsx|ts|tsx)',
    integration: '**/integration/**/*.(test|spec).(js|jsx|ts|tsx)',
    e2e: '**/e2e/**/*.cy.(js|jsx|ts|tsx)',
    fixtures: '**/fixtures/**/*',
    mocks: '**/__mocks__/**/*',
  },
  
  // Coverage exclusions
  coverageExclude: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '**/*.d.ts',
    '**/*.config.*',
    '**/test/',
    '**/tests/',
    '**/__tests__/',
    '**/__mocks__/',
    '**/fixtures/',
    '**/mockData.*',
    '**/stories.*',
    'cypress/',
    'test-utils/',
  ],
  
  // Test data management
  testData: {
    cleanup: true,
    isolation: true,
    seed: process.env.NODE_ENV === 'test',
    factories: true,
  },
  
  // Reporting configuration
  reporters: {
    console: true,
    junit: process.env.CI === 'true',
    coverage: ['text', 'lcov', 'html'],
    aggregation: true,
  },
  
  // Performance monitoring
  performance: {
    tracking: true,
    thresholds: {
      testExecution: 1000, // ms per test
      setupTeardown: 5000, // ms for setup/teardown
      totalSuite: 300000, // ms for entire suite
    },
  },
  
  // Security settings
  security: {
    sanitizeOutput: true,
    maskCredentials: true,
    testDataPrivacy: true,
  },
};

module.exports = baseConfig;