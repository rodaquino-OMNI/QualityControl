// Comprehensive test reporting and screenshots setup

interface TestReport {
  testSuite: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  browser: string;
  screenshot?: string;
  video?: string;
  error?: string;
  timestamp: string;
  tags: string[];
  metadata: Record<string, any>;
}

interface TestSuiteReport {
  suiteName: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;
  browser: string;
  timestamp: string;
  tests: TestReport[];
  coverage?: CoverageReport;
  accessibility?: AccessibilityReport;
  visual?: VisualRegressionReport;
}

interface CoverageReport {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
  uncoveredLines: string[];
}

interface AccessibilityReport {
  violations: Array<{
    id: string;
    description: string;
    impact: 'minor' | 'moderate' | 'serious' | 'critical';
    nodes: number;
  }>;
  passes: number;
  incomplete: number;
}

interface VisualRegressionReport {
  comparisons: Array<{
    name: string;
    passed: boolean;
    difference?: number;
    threshold: number;
  }>;
  totalComparisons: number;
  passedComparisons: number;
  failedComparisons: number;
}

class TestReporter {
  private reports: TestSuiteReport[] = [];
  private currentSuite: TestSuiteReport | null = null;
  private suiteStartTime: number = 0;

  startSuite(suiteName: string) {
    this.suiteStartTime = Date.now();
    this.currentSuite = {
      suiteName,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      duration: 0,
      browser: Cypress.browser.name,
      timestamp: new Date().toISOString(),
      tests: []
    };
  }

  addTest(test: TestReport) {
    if (!this.currentSuite) return;

    this.currentSuite.tests.push(test);
    this.currentSuite.totalTests++;

    switch (test.status) {
      case 'passed':
        this.currentSuite.passedTests++;
        break;
      case 'failed':
        this.currentSuite.failedTests++;
        break;
      case 'skipped':
        this.currentSuite.skippedTests++;
        break;
    }
  }

  endSuite() {
    if (!this.currentSuite) return;

    this.currentSuite.duration = Date.now() - this.suiteStartTime;
    this.reports.push(this.currentSuite);
    this.currentSuite = null;
  }

  addCoverageReport(coverage: CoverageReport) {
    if (this.currentSuite) {
      this.currentSuite.coverage = coverage;
    }
  }

  addAccessibilityReport(accessibility: AccessibilityReport) {
    if (this.currentSuite) {
      this.currentSuite.accessibility = accessibility;
    }
  }

  addVisualRegressionReport(visual: VisualRegressionReport) {
    if (this.currentSuite) {
      this.currentSuite.visual = visual;
    }
  }

  generateReport(): string {
    const report = {
      summary: this.generateSummary(),
      suites: this.reports,
      generatedAt: new Date().toISOString(),
      environment: {
        browser: Cypress.browser,
        viewport: Cypress.config('viewportWidth') + 'x' + Cypress.config('viewportHeight'),
        baseUrl: Cypress.config('baseUrl'),
        nodeVersion: Cypress.env('NODE_VERSION') || 'unknown'
      }
    };

    return JSON.stringify(report, null, 2);
  }

  private generateSummary() {
    const totalTests = this.reports.reduce((sum, suite) => sum + suite.totalTests, 0);
    const passedTests = this.reports.reduce((sum, suite) => sum + suite.passedTests, 0);
    const failedTests = this.reports.reduce((sum, suite) => sum + suite.failedTests, 0);
    const skippedTests = this.reports.reduce((sum, suite) => sum + suite.skippedTests, 0);
    const totalDuration = this.reports.reduce((sum, suite) => sum + suite.duration, 0);

    return {
      totalSuites: this.reports.length,
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      successRate: totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) + '%' : '0%',
      totalDuration: totalDuration + 'ms',
      browser: Cypress.browser.name
    };
  }

  generateHTMLReport(): string {
    const summary = this.generateSummary();
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AUSTA Cockpit - E2E Test Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .header h1 { margin: 0; color: #2563eb; }
        .header .subtitle { color: #6b7280; margin-top: 5px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .summary-card h3 { margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; color: #6b7280; }
        .summary-card .value { font-size: 24px; font-weight: bold; color: #111827; }
        .summary-card.success .value { color: #059669; }
        .summary-card.error .value { color: #dc2626; }
        .summary-card.warning .value { color: #d97706; }
        .suite { background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; overflow: hidden; }
        .suite-header { background: #f9fafb; padding: 20px; border-bottom: 1px solid #e5e7eb; }
        .suite-header h2 { margin: 0; color: #111827; }
        .suite-stats { margin-top: 10px; display: flex; gap: 20px; }
        .suite-stat { font-size: 14px; color: #6b7280; }
        .test { padding: 15px 20px; border-bottom: 1px solid #f3f4f6; }
        .test:last-child { border-bottom: none; }
        .test-name { font-weight: 500; margin-bottom: 5px; }
        .test-meta { font-size: 12px; color: #6b7280; }
        .status { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; }
        .status.passed { background: #d1fae5; color: #065f46; }
        .status.failed { background: #fee2e2; color: #991b1b; }
        .status.skipped { background: #fef3c7; color: #92400e; }
        .error-details { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px; margin-top: 10px; font-family: monospace; font-size: 12px; color: #991b1b; }
        .accessibility-violations { margin-top: 15px; }
        .violation { background: #fef2f2; border-left: 4px solid #ef4444; padding: 10px; margin-bottom: 10px; }
        .violation.critical { border-left-color: #dc2626; }
        .violation.serious { border-left-color: #ea580c; }
        .violation.moderate { border-left-color: #d97706; }
        .violation.minor { border-left-color: #eab308; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>AUSTA Cockpit E2E Test Report</h1>
            <div class="subtitle">Generated on ${new Date().toLocaleString()} • Browser: ${Cypress.browser.name}</div>
        </div>
        
        <div class="summary">
            <div class="summary-card">
                <h3>Total Tests</h3>
                <div class="value">${summary.totalTests}</div>
            </div>
            <div class="summary-card success">
                <h3>Passed</h3>
                <div class="value">${summary.passedTests}</div>
            </div>
            <div class="summary-card error">
                <h3>Failed</h3>
                <div class="value">${summary.failedTests}</div>
            </div>
            <div class="summary-card warning">
                <h3>Skipped</h3>
                <div class="value">${summary.skippedTests}</div>
            </div>
            <div class="summary-card">
                <h3>Success Rate</h3>
                <div class="value">${summary.successRate}</div>
            </div>
            <div class="summary-card">
                <h3>Duration</h3>
                <div class="value">${summary.totalDuration}</div>
            </div>
        </div>

        ${this.reports.map(suite => `
            <div class="suite">
                <div class="suite-header">
                    <h2>${suite.suiteName}</h2>
                    <div class="suite-stats">
                        <span class="suite-stat">Total: ${suite.totalTests}</span>
                        <span class="suite-stat">Passed: ${suite.passedTests}</span>
                        <span class="suite-stat">Failed: ${suite.failedTests}</span>
                        <span class="suite-stat">Duration: ${suite.duration}ms</span>
                    </div>
                </div>
                ${suite.tests.map(test => `
                    <div class="test">
                        <div class="test-name">
                            <span class="status ${test.status}">${test.status.toUpperCase()}</span>
                            ${test.testName}
                        </div>
                        <div class="test-meta">
                            Duration: ${test.duration}ms • 
                            Tags: ${test.tags.join(', ') || 'none'}
                            ${test.screenshot ? ` • <a href="${test.screenshot}">Screenshot</a>` : ''}
                            ${test.video ? ` • <a href="${test.video}">Video</a>` : ''}
                        </div>
                        ${test.error ? `<div class="error-details">${test.error}</div>` : ''}
                    </div>
                `).join('')}
                
                ${suite.accessibility ? `
                    <div class="accessibility-violations">
                        <h3>Accessibility Violations</h3>
                        ${suite.accessibility.violations.map(violation => `
                            <div class="violation ${violation.impact}">
                                <strong>${violation.id}</strong> (${violation.impact})
                                <br>${violation.description}
                                <br><small>${violation.nodes} nodes affected</small>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('')}
    </div>
</body>
</html>
    `;
  }
}

// Global test reporter instance
const testReporter = new TestReporter();

// Cypress hooks for automatic reporting
Cypress.on('test:before:run', (test, runnable) => {
  if (runnable.parent?.title && runnable.parent.title !== testReporter['currentSuite']?.suiteName) {
    if (testReporter['currentSuite']) {
      testReporter.endSuite();
    }
    testReporter.startSuite(runnable.parent.title);
  }
});

Cypress.on('test:after:run', (test, runnable) => {
  const testReport: TestReport = {
    testSuite: runnable.parent?.title || 'Unknown Suite',
    testName: test.title,
    status: test.state as 'passed' | 'failed' | 'skipped',
    duration: test.duration || 0,
    browser: Cypress.browser.name,
    timestamp: new Date().toISOString(),
    tags: [],
    metadata: {}
  };

  if (test.state === 'failed') {
    testReport.error = test.err?.message || 'Unknown error';
    testReport.screenshot = `screenshots/${test.title} -- ${testReport.testSuite} (failed).png`;
  }

  testReporter.addTest(testReport);
});

// Enhanced screenshot functionality
export const takeEnhancedScreenshot = (name: string, options?: {
  fullPage?: boolean;
  hideElements?: string[];
  annotations?: Array<{ x: number; y: number; text: string }>;
}) => {
  // Hide specified elements
  if (options?.hideElements) {
    options.hideElements.forEach(selector => {
      cy.get(selector).invoke('css', 'visibility', 'hidden');
    });
  }

  // Take screenshot
  cy.screenshot(name, {
    capture: options?.fullPage ? 'fullPage' : 'viewport',
    overwrite: true,
    onAfterScreenshot: (el, props) => {
      // Add annotations if specified
      if (options?.annotations) {
        // This would require additional image processing
        cy.log(`Screenshot taken: ${props.path}`);
      }
    }
  });

  // Restore hidden elements
  if (options?.hideElements) {
    options.hideElements.forEach(selector => {
      cy.get(selector).invoke('css', 'visibility', 'visible');
    });
  }
};

// Test execution tracking
export const trackTestExecution = (testName: string, callback: () => void) => {
  const startTime = Date.now();
  
  cy.log(`Starting test: ${testName}`);
  
  try {
    callback();
    
    const duration = Date.now() - startTime;
    cy.log(`Test completed: ${testName} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    cy.log(`Test failed: ${testName} (${duration}ms) - ${error}`);
    throw error;
  }
};

// Export the reporter for use in tests
export { testReporter };

// Helper function to generate final report
export const generateFinalReport = () => {
  if (testReporter['currentSuite']) {
    testReporter.endSuite();
  }
  
  const jsonReport = testReporter.generateReport();
  const htmlReport = testReporter.generateHTMLReport();
  
  // Save reports
  cy.task('saveReport', {
    json: jsonReport,
    html: htmlReport,
    timestamp: new Date().toISOString()
  });
};

// Custom command to add test metadata
Cypress.Commands.add('addTestMetadata', (key: string, value: any) => {
  // This would be used to add custom metadata to test reports
  cy.log(`Test metadata: ${key} = ${JSON.stringify(value)}`);
});

// Performance monitoring
export const monitorPerformance = (pageName: string) => {
  cy.window().then((win) => {
    const navigation = win.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    const metrics = {
      pageLoadTime: navigation.loadEventEnd - navigation.fetchStart,
      domContentLoaded: navigation.domContentLoadedEventEnd - navigation.fetchStart,
      firstPaint: 0,
      firstContentfulPaint: 0
    };

    // Get paint metrics if available
    const paintEntries = win.performance.getEntriesByType('paint');
    paintEntries.forEach((entry) => {
      if (entry.name === 'first-paint') {
        metrics.firstPaint = entry.startTime;
      } else if (entry.name === 'first-contentful-paint') {
        metrics.firstContentfulPaint = entry.startTime;
      }
    });

    cy.log(`Performance metrics for ${pageName}:`, metrics);
    
    // Add performance data to test metadata
    cy.addTestMetadata('performance', metrics);
  });
};