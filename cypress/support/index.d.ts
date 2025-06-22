/// <reference types="cypress" />
/// <reference types="cypress-axe" />
/// <reference types="cypress-visual-regression" />
/// <reference types="@cypress/code-coverage" />

declare namespace Cypress {
  interface AUTWindow extends Window {
    getEventListeners?: (target: EventTarget) => Record<string, any[]>;
    performance: Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };
  }

  interface PerformanceResourceTiming extends PerformanceEntry {
    transferSize?: number;
    loadEventEnd?: number;
    loadEventStart?: number;
  }

  interface PerformanceLayoutShift extends PerformanceEntry {
    hadRecentInput?: boolean;
    value?: number;
  }

  interface Chainable<Subject = any> {
    /**
     * Custom command to log in a user
     * @example cy.login('admin@austa.com', 'Admin123!')
     */
    login(email: string, password: string): Chainable<Subject>;

    /**
     * Custom command to log out
     * @example cy.logout()
     */
    logout(): Chainable<Subject>;

    /**
     * Navigate to a specific route in the application
     * @example cy.visitRoute('/cases')
     */
    visitRoute(route: string): Chainable<Subject>;

    /**
     * Wait for a specific API request to complete
     * @example cy.waitForApi('getCases')
     */
    waitForApi(alias: string): Chainable<Subject>;

    /**
     * Check accessibility of the current page
     * @example cy.checkA11y()
     */
    checkA11y(
      context?: string | Node | Element | null,
      options?: {
        runOnly?: {
          type: string;
          values: string[];
        };
        rules?: Record<string, any>;
        includedImpacts?: string[];
        excludedImpacts?: string[];
      }
    ): Chainable<Subject>;

    /**
     * Inject axe for accessibility testing
     * @example cy.injectAxe()
     */
    injectAxe(): Chainable<Subject>;

    /**
     * Upload a file to an input element
     * @example cy.get('input[type="file"]').attachFile('document.pdf')
     */
    attachFile(
      fileName: string | { filePath: string; mimeType?: string; encoding?: string },
      options?: { subjectType?: string; force?: boolean }
    ): Chainable<Subject>;

    /**
     * Upload multiple files
     * @example cy.get('input').uploadFile('file.pdf', 'application/pdf')
     */
    uploadFile(fileName: string, mimeType?: string): Chainable<Subject>;

    /**
     * Select from a custom dropdown
     * @example cy.selectFromDropdown('Case Status', 'In Progress')
     */
    selectFromDropdown(label: string, value: string): Chainable<Subject>;

    /**
     * Check for a notification message
     * @example cy.checkNotification('Success', 'Case created successfully')
     */
    checkNotification(type: 'success' | 'error' | 'warning' | 'info', message: string): Chainable<Subject>;

    /**
     * Navigate using tab key
     * @example cy.tab()
     */
    tab(options?: { shift?: boolean }): Chainable<Subject>;

    /**
     * Wait for page to fully load
     * @example cy.waitForPageLoad()
     */
    waitForPageLoad(): Chainable<Subject>;

    /**
     * Fill a form with data
     * @example cy.fillForm({ name: 'John', email: 'john@example.com' })
     */
    fillForm(data: Record<string, any>): Chainable<Subject>;

    /**
     * Setup auth interceptors
     * @example cy.setupAuthInterceptors()
     */
    setupAuthInterceptors(): Chainable<Subject>;

    /**
     * Mock API error response
     * @example cy.mockApiError('getCases', 500, 'Server error')
     */
    mockApiError(alias: string, statusCode: number, message: string): Chainable<Subject>;

    /**
     * Click and wait for response
     * @example cy.clickAndWait('[data-testid="submit"]', '@saveCase')
     */
    clickAndWait(selector: string, apiAlias: string): Chainable<Subject>;

    /**
     * Type and verify input
     * @example cy.typeAndVerify('#email', 'test@example.com')
     */
    typeAndVerify(selector: string, text: string): Chainable<Subject>;

    /**
     * Verify table data
     * @example cy.verifyTableData(['Name', 'Status'], [['Case 1', 'Open']])
     */
    verifyTableData(headers: string[], rows: string[][]): Chainable<Subject>;

    /**
     * Check API response
     * @example cy.checkApiResponse('@getCases', 200)
     */
    checkApiResponse(alias: string, statusCode: number, responseCheck?: (body: any) => void): Chainable<Subject>;

    /**
     * Drag and drop element
     * @example cy.dragAndDrop('#source', '#target')
     */
    dragAndDrop(sourceSelector: string, targetSelector: string): Chainable<Subject>;

    /**
     * Verify download
     * @example cy.verifyDownload('report.pdf')
     */
    verifyDownload(fileName: string): Chainable<Subject>;

    /**
     * Mock geolocation
     * @example cy.mockGeolocation(40.7128, -74.0060)
     */
    mockGeolocation(latitude: number, longitude: number): Chainable<Subject>;

    /**
     * Check Core Web Vitals
     * @example cy.checkCoreWebVitals()
     */
    checkCoreWebVitals(): Chainable<{ fcp: number; lcp: number; cls: number }>;

    /**
     * Add test metadata
     * @example cy.addTestMetadata({ feature: 'login', priority: 'high' })
     */
    addTestMetadata(metadata: Record<string, any>): Chainable<Subject>;

    /**
     * Alternative to .contains() that handles visibility better
     */
    or(selector: string): Chainable<Subject>;
  }

  interface cy extends Cypress.cy {
    /**
     * Verify download completion
     * @example cy.verifyDownload('report.pdf')
     */
    verifyDownload(fileName: string): void;

    /**
     * Add test metadata
     * @example cy.addTestMetadata({ feature: 'login' })
     */
    addTestMetadata(metadata: Record<string, any>): void;

    /**
     * Clear session storage
     * @example cy.clearSessionStorage()
     */
    clearSessionStorage(): void;

    /**
     * Navigate using tab key
     * @example cy.tab()
     */
    tab(options?: { shift?: boolean }): Chainable<any>;
  }
}

// Extend JQuery for custom assertions
declare global {
  namespace Chai {
    interface Assertion {
      accessibility(): void;
    }
  }
}

// Visual regression types
declare module 'cypress-visual-regression/dist/plugin' {
  function plugin(on: Cypress.PluginEvents, config: Cypress.PluginConfigOptions): void;
  export = plugin;
}

// Axe-core types extension
declare module 'cypress-axe' {
  interface Options {
    includeTags?: string[];
    runOnly?: {
      type: string;
      values: string[];
    };
  }
}

export {};