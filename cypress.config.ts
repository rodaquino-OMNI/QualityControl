import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    screenshotOnRunFailure: true,
    chromeWebSecurity: false,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    setupNodeEvents(on, config) {
      // Database tasks
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
        table(message) {
          console.table(message);
          return null;
        },
        seedDatabase() {
          // Seed database with test data
          const { exec } = require('child_process');
          return new Promise((resolve, reject) => {
            exec('npm run seed:test', (error, stdout, stderr) => {
              if (error) {
                console.error('Database seeding failed:', error);
                reject(error);
              } else {
                console.log('Database seeded successfully');
                resolve(stdout);
              }
            });
          });
        },
        cleanupDatabase() {
          // Clean up test data
          const { exec } = require('child_process');
          return new Promise((resolve, reject) => {
            exec('npm run db:clean', (error, stdout, stderr) => {
              if (error) {
                console.error('Database cleanup failed:', error);
                reject(error);
              } else {
                console.log('Database cleaned successfully');
                resolve(stdout);
              }
            });
          });
        },
        queryDatabase(query) {
          // Direct database queries for testing
          const { Pool } = require('pg');
          const pool = new Pool({
            host: 'localhost',
            port: 5432,
            database: 'austa_test',
            user: 'postgres',
            password: 'postgres',
          });
          
          return pool.query(query.sql, query.params).then(result => {
            pool.end();
            return result.rows;
          });
        },
        generateTestReport(data) {
          // Generate test report
          const fs = require('fs');
          const path = require('path');
          const reportPath = path.join(__dirname, 'cypress/reports/test-report.json');
          fs.writeFileSync(reportPath, JSON.stringify(data, null, 2));
          return reportPath;
        },
      });

      // Visual regression testing
      require('cypress-visual-regression/dist/plugin')(on, config);

      // Coverage plugin
      require('@cypress/code-coverage/task')(on, config);

      // Accessibility plugin
      require('cypress-axe/dist/plugin')(on, config);

      return config;
    },
    env: {
      apiUrl: 'http://localhost:8000/api',
      coverage: false,
      visualRegressionType: 'regression',
      visualRegressionBaseDirectory: 'cypress/visual-regression/base',
      visualRegressionDiffDirectory: 'cypress/visual-regression/diff',
      visualRegressionGenerateDiff: 'fail',
      // Test user credentials
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
      // Test data
      testData: {
        cases: {
          pending: 'case-pending-001',
          inProgress: 'case-progress-001',
          completed: 'case-complete-001',
        },
        patients: {
          standard: 'patient-001',
          highRisk: 'patient-risk-001',
          fraud: 'patient-fraud-001',
        },
      },
    },
    retries: {
      runMode: 2,
      openMode: 0,
    },
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.ts',
    experimentalWebKitSupport: true,
    // Cross-browser testing
    browsers: [
      {
        name: 'chrome',
        family: 'chromium',
        channel: 'stable',
        displayName: 'Chrome',
        version: '91.0.4472.124',
      },
      {
        name: 'firefox',
        family: 'firefox',
        channel: 'stable',
        displayName: 'Firefox',
        version: '89.0.2',
      },
      {
        name: 'edge',
        family: 'chromium',
        channel: 'stable',
        displayName: 'Edge',
        version: '91.0.864.59',
      },
    ],
  },
  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
    },
    specPattern: 'src/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/component.ts',
  },
});