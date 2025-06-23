// ***********************************************************
// This file is processed and loaded automatically before test files.
//
// You can change the location of this file or turn off processing
// it by changing the "supportFile" configuration option.
// ***********************************************************

/// <reference path="./index.d.ts" />

// Import commands.js using ES2015 syntax:
import './commands';
import { interceptAllApiCalls } from './commands';

// Import accessibility and visual regression testing
import 'cypress-axe';
import 'cypress-visual-regression/dist/command';
import '@cypress/code-coverage/support';
import 'cypress-file-upload';

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Add type definitions
declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
      loginAs(role: string): Chainable<void>;
      loginWithMFA(email: string, password: string, mfaCode: string): Chainable<void>;
      logout(): Chainable<void>;
      createCase(caseData: any): Chainable<any>;
      createCaseWithData(caseData: any): Chainable<any>;
      updateCaseStatus(caseId: string, status: string): Chainable<any>;
      waitForApi(alias: string): Chainable<any>;
      apiRequest(method: string, endpoint: string, body?: any): Chainable<any>;
      checkAccessibility(): Chainable<void>;
      seedDatabase(): Chainable<void>;
      cleanupDatabase(): Chainable<void>;
      setupTestData(dataType: string): Chainable<any>;
      cleanupTestData(dataType?: string): Chainable<any>;
      compareSnapshot(name: string, options?: any): Chainable<void>;
      takeScreenshotOnFail(): Chainable<void>;
      measurePageLoad(pageName: string): Chainable<void>;
      skipOnBrowser(browser: string): Chainable<void>;
      tab(options?: { shift?: boolean }): Chainable<void>;
      verifyDownload(fileName: string, timeout?: number): Chainable<void>;
      addTestMetadata(metadata: Record<string, any>): Chainable<void>;
    }
  }
}

// Prevent TypeScript from reading file as legacy script
export {};

// Configure Cypress behavior
Cypress.on('uncaught:exception', (err, _runnable) => {
  // returning false here prevents Cypress from failing the test
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false;
  }
  
  // Ignore React hydration errors in development
  if (err.message.includes('Hydration failed')) {
    return false;
  }
  
  // Ignore ChunkLoadError (common in development with hot reloading)
  if (err.name === 'ChunkLoadError') {
    return false;
  }
  
  return true;
});

// Global configuration
Cypress.on('window:before:load', (win) => {
  // Mock console methods to reduce noise in tests
  if (Cypress.env('SUPPRESS_CONSOLE_LOGS')) {
    win.console.warn = cy.stub().as('consoleWarn');
    win.console.error = cy.stub().as('consoleError');
  }
  
  // Add performance monitoring
  win.performance.mark('test-start');
});

// Before each test
beforeEach(() => {
  // Clear all storage
  cy.clearLocalStorage();
  cy.clearAllSessionStorage();
  cy.clearCookies();
  
  // Reset viewport to default
  cy.viewport(1280, 720);
  
  // Set up comprehensive API interceptors
  interceptAllApiCalls();
  
  // Set up accessibility testing
  cy.injectAxe();
  
  // Performance monitoring setup
  cy.window().then((win) => {
    win.performance.mark('test-page-start');
  });
  
  // Set up visual regression baseline if needed
  if (Cypress.env('updateSnapshots')) {
    cy.log('Visual regression baseline update mode enabled');
  }
  
  // Configure test timeouts based on browser
  if (Cypress.browser.name === 'firefox') {
    Cypress.config('defaultCommandTimeout', 15000);
  }
  
  // Set up test data seeding
  if (Cypress.env('AUTO_SEED_DATA')) {
    cy.seedDatabase();
  }
});

// After each test
afterEach(() => {
  // Performance measurements
  cy.window().then((win) => {
    win.performance.mark('test-page-end');
    win.performance.measure('test-page-duration', 'test-page-start', 'test-page-end');
    
    const measure = win.performance.getEntriesByName('test-page-duration')[0];
    if (measure) {
      cy.log(`Test page duration: ${measure.duration.toFixed(2)}ms`);
    }
  });
  
  // Accessibility check (if enabled for test)
  if (Cypress.env('CHECK_ACCESSIBILITY')) {
    cy.checkA11y(undefined, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa']
      }
    }, (violations) => {
      violations.forEach(violation => {
        cy.log(`Accessibility violation: ${violation.description}`);
      });
    });
  }
  
  // Take screenshot on failure with enhanced naming
  if ((Cypress.currentTest as any).state === 'failed') {
    const testTitle = Cypress.currentTest.title.replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    cy.screenshot(`failed_${testTitle}_${timestamp}`, {
      capture: 'viewport',
      overwrite: true,
    });
    
    // Log additional debug information
    cy.window().then((win) => {
      cy.log('Current URL:', win.location.href);
      cy.log('User Agent:', win.navigator.userAgent);
      cy.log('Local Storage:', JSON.stringify(win.localStorage));
    });
  }
  
  // Visual regression comparison (if enabled)
  if (Cypress.env('VISUAL_REGRESSION') && (Cypress.currentTest as any).state === 'passed') {
    const testName = Cypress.currentTest.title.replace(/[^a-zA-Z0-9]/g, '_');
    cy.compareSnapshot(testName);
  }
  
  // Clean up test data
  if (Cypress.env('AUTO_CLEANUP_DATA')) {
    cy.cleanupDatabase();
  }
  
  // Clear any remaining timers or intervals
  cy.window().then((win) => {
    // Clear all timeouts and intervals
    for (let i = 1; i < 99999; i++) {
      win.clearTimeout(i);
      win.clearInterval(i);
    }
  });
});

// Before run hook - executed once before all tests
before(() => {
  cy.log('Starting E2E test suite for AUSTA Cockpit');
  
  // Verify test environment
  cy.request('GET', `${Cypress.env('apiUrl')}/health`).then((response) => {
    expect(response.status).to.eq(200);
    cy.log('API health check passed');
  });
  
  // Set up global test data if needed
  if (Cypress.env('GLOBAL_TEST_DATA')) {
    cy.task('setupGlobalTestData');
  }
});

// After run hook - executed once after all tests
after(() => {
  cy.log('E2E test suite completed');
  
  // Generate test report
  if (Cypress.env('GENERATE_REPORT')) {
    cy.task('generateTestReport', {
      timestamp: new Date().toISOString(),
      browser: Cypress.browser,
      environment: Cypress.env('NODE_ENV') || 'test'
    });
  }
  
  // Clean up global test data
  if (Cypress.env('GLOBAL_TEST_DATA')) {
    cy.task('cleanupGlobalTestData');
  }
});

// Custom commands for enhanced error handling
Cypress.Commands.overwrite('visit', (originalFn, options, ...args) => {
  const enhancedOptions = {
    timeout: 30000,
    retryOnNetworkFailure: true,
    retryOnStatusCodeFailure: true,
    ...options,
  };
  return originalFn(enhancedOptions, ...args);
});

Cypress.Commands.overwrite('get', (originalFn, selector, options) => {
  return originalFn(selector, {
    timeout: 10000,
    ...options,
  });
});

// Enhanced command logging
Cypress.Commands.overwrite('log', (originalFn, message) => {
  const timestamp = new Date().toISOString();
  return originalFn(`[${timestamp}] ${message}`);
});

// Network failure retry logic
Cypress.on('fail', (err, _runnable) => {
  if (err.message.includes('Network Error') || err.message.includes('timeout')) {
    cy.log('Network error detected, implementing retry logic');
    // Custom retry logic can be implemented here
  }
  throw err;
});