/**
 * E2E Test Configuration
 * Cypress configuration with base config inheritance
 */

const baseConfig = require('./base.config');

const e2eConfig = {
  ...baseConfig,
  
  // E2E-specific settings
  environment: {
    ...baseConfig.environment,
    browser: true,
    crossBrowser: ['chrome', 'firefox', 'edge'],
    headless: process.env.CI === 'true',
    video: true,
    screenshots: true,
  },
  
  // E2E viewport configurations
  viewports: {
    desktop: { width: 1280, height: 720 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 667 },
  },
  
  // E2E test patterns
  specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
  
  // E2E performance thresholds
  performance: {
    ...baseConfig.performance,
    thresholds: {
      ...baseConfig.performance.thresholds,
      pageLoad: 3000, // ms for page load
      userInteraction: 1000, // ms for user interaction response
      apiCall: 2000, // ms for API call completion
      databaseOperation: 1500, // ms for database operations
    },
  },
  
  // E2E-specific retry configuration
  retries: {
    ...baseConfig.retries,
    runMode: 2,
    openMode: 0,
  },
  
  // E2E test data management
  testData: {
    ...baseConfig.testData,
    seedDatabase: true,
    cleanupAfterTest: true,
    isolateTestData: true,
    useTestFixtures: true,
  },
  
  // E2E-specific timeouts
  timeouts: {
    ...baseConfig.timeouts,
    defaultCommand: 10000,
    pageLoad: 60000,
    request: 30000,
    response: 30000,
  },
  
  // E2E browsers configuration
  browsers: [
    {
      name: 'chrome',
      family: 'chromium',
      channel: 'stable',
      displayName: 'Chrome',
    },
    {
      name: 'firefox', 
      family: 'firefox',
      channel: 'stable',
      displayName: 'Firefox',
    },
    {
      name: 'edge',
      family: 'chromium', 
      channel: 'stable',
      displayName: 'Edge',
    },
  ],
  
  // E2E test users and data
  testUsers: {
    admin: {
      email: 'admin@austa.com',
      password: 'Admin123!',
      role: 'admin',
    },
    auditor: {
      email: 'auditor@austa.com',
      password: 'Auditor123!',
      role: 'auditor',
    },
    reviewer: {
      email: 'reviewer@austa.com',
      password: 'Reviewer123!',
      role: 'reviewer',
    },
    manager: {
      email: 'manager@austa.com',
      password: 'Manager123!',
      role: 'manager',
    },
  },
  
  // E2E-specific reporters
  reporters: {
    ...baseConfig.reporters,
    mochawesome: true,
    junit: true,
    html: true,
    json: true,
    accessibility: true,
    visualRegression: true,
  },
  
  // E2E security settings
  security: {
    ...baseConfig.security,
    chromeWebSecurity: false,
    allowInsecureConnection: process.env.NODE_ENV === 'test',
  },
};

module.exports = e2eConfig;