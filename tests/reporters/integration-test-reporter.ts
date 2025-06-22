/**
 * Integration Test Reporter
 * Comprehensive reporting system for integration test results
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

export interface TestResult {
  id: string;
  suite: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  startTime: Date;
  endTime: Date;
  error?: {
    message: string;
    stack?: string;
    type: string;
  };
  metadata: {
    service: string;
    category: string;
    tags: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
  performance?: {
    responseTime: number;
    throughput?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  assertions: {
    total: number;
    passed: number;
    failed: number;
  };
}

export interface TestSuiteResult {
  name: string;
  tests: TestResult[];
  startTime: Date;
  endTime: Date;
  duration: number;
  stats: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
  };
}

export interface IntegrationTestReport {
  id: string;
  timestamp: Date;
  environment: string;
  version: string;
  suites: TestSuiteResult[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    duration: number;
    coverage: {
      statements: number;
      branches: number;
      functions: number;
      lines: number;
    };
  };
  performance: {
    averageResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
    totalRequests: number;
    throughput: number;
  };
  services: {
    [serviceName: string]: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      responseTime: number;
      uptime: number;
      errors: number;
    };
  };
  artifacts: {
    logs: string[];
    screenshots: string[];
    videos: string[];
    traces: string[];
  };
}

export class IntegrationTestReporter {
  private report!: IntegrationTestReport;
  private outputDir: string;
  private currentSuite: TestSuiteResult | null = null;

  constructor(outputDir: string = './test-results') {
    this.outputDir = outputDir;
    this.ensureOutputDirectory();
    this.initializeReport();
  }

  private ensureOutputDirectory(): void {
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    const subdirs = ['html', 'json', 'xml', 'artifacts', 'coverage'];
    subdirs.forEach(dir => {
      const fullPath = join(this.outputDir, dir);
      if (!existsSync(fullPath)) {
        mkdirSync(fullPath, { recursive: true });
      }
    });
  }

  private initializeReport(): void {
    this.report = {
      id: this.generateReportId(),
      timestamp: new Date(),
      environment: process.env.NODE_ENV || 'test',
      version: process.env.APP_VERSION || '1.0.0',
      suites: [],
      summary: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        duration: 0,
        coverage: {
          statements: 0,
          branches: 0,
          functions: 0,
          lines: 0
        }
      },
      performance: {
        averageResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Infinity,
        totalRequests: 0,
        throughput: 0
      },
      services: {},
      artifacts: {
        logs: [],
        screenshots: [],
        videos: [],
        traces: []
      }
    };
  }

  private generateReportId(): string {
    const timestamp = new Date().toISOString();
    const hash = createHash('md5').update(timestamp).digest('hex').substring(0, 8);
    return `integration-${hash}`;
  }

  startSuite(suiteName: string): void {
    this.currentSuite = {
      name: suiteName,
      tests: [],
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      stats: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        pending: 0
      }
    };
  }

  endSuite(): void {
    if (this.currentSuite) {
      this.currentSuite.endTime = new Date();
      this.currentSuite.duration = this.currentSuite.endTime.getTime() - this.currentSuite.startTime.getTime();
      
      // Calculate suite statistics
      this.currentSuite.stats.total = this.currentSuite.tests.length;
      this.currentSuite.stats.passed = this.currentSuite.tests.filter(t => t.status === 'passed').length;
      this.currentSuite.stats.failed = this.currentSuite.tests.filter(t => t.status === 'failed').length;
      this.currentSuite.stats.skipped = this.currentSuite.tests.filter(t => t.status === 'skipped').length;
      this.currentSuite.stats.pending = this.currentSuite.tests.filter(t => t.status === 'pending').length;

      this.report.suites.push(this.currentSuite);
      this.currentSuite = null;
    }
  }

  addTestResult(testResult: TestResult): void {
    if (this.currentSuite) {
      this.currentSuite.tests.push(testResult);
    }

    // Update performance metrics
    if (testResult.performance) {
      const responseTime = testResult.performance.responseTime;
      this.report.performance.totalRequests++;
      this.report.performance.maxResponseTime = Math.max(this.report.performance.maxResponseTime, responseTime);
      this.report.performance.minResponseTime = Math.min(this.report.performance.minResponseTime, responseTime);
    }
  }

  addServiceStatus(serviceName: string, status: any): void {
    this.report.services[serviceName] = status;
  }

  addArtifact(type: 'logs' | 'screenshots' | 'videos' | 'traces', path: string): void {
    this.report.artifacts[type].push(path);
  }

  finalize(): void {
    this.calculateSummary();
    this.calculatePerformanceMetrics();
    this.generateReports();
  }

  private calculateSummary(): void {
    const allTests = this.report.suites.flatMap(suite => suite.tests);
    
    this.report.summary.totalTests = allTests.length;
    this.report.summary.passed = allTests.filter(t => t.status === 'passed').length;
    this.report.summary.failed = allTests.filter(t => t.status === 'failed').length;
    this.report.summary.skipped = allTests.filter(t => t.status === 'skipped').length;
    this.report.summary.pending = allTests.filter(t => t.status === 'pending').length;
    this.report.summary.duration = this.report.suites.reduce((total, suite) => total + suite.duration, 0);
  }

  private calculatePerformanceMetrics(): void {
    const allTests = this.report.suites.flatMap(suite => suite.tests);
    const testsWithPerformance = allTests.filter(t => t.performance);

    if (testsWithPerformance.length > 0) {
      const responseTimes = testsWithPerformance.map(t => t.performance!.responseTime);
      this.report.performance.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      
      if (this.report.summary.duration > 0) {
        this.report.performance.throughput = this.report.performance.totalRequests / (this.report.summary.duration / 1000);
      }
    }
  }

  private generateReports(): void {
    this.generateJSONReport();
    this.generateHTMLReport();
    this.generateXMLReport();
    this.generateConsoleReport();
  }

  private generateJSONReport(): void {
    const jsonPath = join(this.outputDir, 'json', `${this.report.id}.json`);
    writeFileSync(jsonPath, JSON.stringify(this.report, null, 2));
    console.log(`📊 JSON report generated: ${jsonPath}`);
  }

  private generateHTMLReport(): void {
    const html = this.generateHTMLContent();
    const htmlPath = join(this.outputDir, 'html', `${this.report.id}.html`);
    writeFileSync(htmlPath, html);
    console.log(`📊 HTML report generated: ${htmlPath}`);
  }

  private generateHTMLContent(): string {
    const passRate = (this.report.summary.passed / this.report.summary.totalTests * 100).toFixed(1);
    const statusIcon = this.report.summary.failed === 0 ? '✅' : '❌';
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Integration Test Report - ${this.report.id}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f7fa; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .title { font-size: 28px; font-weight: 600; color: #1a202c; margin: 0; }
        .subtitle { color: #718096; margin: 5px 0 0 0; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-number { font-size: 32px; font-weight: 700; margin: 0; }
        .stat-label { color: #718096; font-size: 14px; margin: 5px 0 0 0; }
        .passed { color: #48bb78; }
        .failed { color: #f56565; }
        .skipped { color: #ed8936; }
        .suite { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .suite-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .suite-name { font-size: 20px; font-weight: 600; color: #1a202c; }
        .suite-stats { color: #718096; font-size: 14px; }
        .test { padding: 10px; border-left: 4px solid #e2e8f0; margin-bottom: 10px; background: #f7fafc; }
        .test.passed { border-left-color: #48bb78; }
        .test.failed { border-left-color: #f56565; }
        .test.skipped { border-left-color: #ed8936; }
        .test-name { font-weight: 500; margin-bottom: 5px; }
        .test-meta { font-size: 12px; color: #718096; }
        .error { background: #fed7d7; border: 1px solid #feb2b2; padding: 10px; margin-top: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; }
        .performance { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 10px; }
        .perf-metric { font-size: 12px; }
        .perf-value { font-weight: 600; }
        .services { margin-top: 20px; }
        .service { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f7fafc; margin-bottom: 5px; border-radius: 4px; }
        .service-status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
        .healthy { background: #c6f6d5; color: #22543d; }
        .degraded { background: #feebc8; color: #c05621; }
        .unhealthy { background: #fed7d7; color: #c53030; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">${statusIcon} Integration Test Report</h1>
            <p class="subtitle">Generated on ${this.report.timestamp.toLocaleString()} • Environment: ${this.report.environment}</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${this.report.summary.totalTests}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat-card">
                <div class="stat-number passed">${this.report.summary.passed}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number failed">${this.report.summary.failed}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${passRate}%</div>
                <div class="stat-label">Pass Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${(this.report.summary.duration / 1000).toFixed(1)}s</div>
                <div class="stat-label">Total Duration</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${this.report.performance.averageResponseTime.toFixed(0)}ms</div>
                <div class="stat-label">Avg Response Time</div>
            </div>
        </div>

        ${this.generateServicesHTML()}
        ${this.generateSuitesHTML()}
    </div>
</body>
</html>`;
  }

  private generateServicesHTML(): string {
    const services = Object.entries(this.report.services);
    if (services.length === 0) return '';

    return `
        <div class="suite">
            <h2>Service Health</h2>
            <div class="services">
                ${services.map(([name, status]) => `
                    <div class="service">
                        <span>${name}</span>
                        <span class="service-status ${status.status}">${status.status.toUpperCase()}</span>
                    </div>
                `).join('')}
            </div>
        </div>`;
  }

  private generateSuitesHTML(): string {
    return this.report.suites.map(suite => `
        <div class="suite">
            <div class="suite-header">
                <h2 class="suite-name">${suite.name}</h2>
                <div class="suite-stats">
                    ${suite.stats.total} tests • ${suite.stats.passed} passed • ${suite.stats.failed} failed • ${(suite.duration / 1000).toFixed(1)}s
                </div>
            </div>
            ${suite.tests.map(test => `
                <div class="test ${test.status}">
                    <div class="test-name">${test.name}</div>
                    <div class="test-meta">
                        ${test.metadata.service} • ${test.metadata.category} • ${test.duration}ms
                        ${test.metadata.tags.map(tag => `<span style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 5px;">${tag}</span>`).join('')}
                    </div>
                    ${test.performance ? `
                        <div class="performance">
                            <div class="perf-metric">Response: <span class="perf-value">${test.performance.responseTime}ms</span></div>
                            ${test.performance.throughput ? `<div class="perf-metric">Throughput: <span class="perf-value">${test.performance.throughput}/s</span></div>` : ''}
                        </div>
                    ` : ''}
                    ${test.error ? `
                        <div class="error">
                            <strong>${test.error.type}:</strong> ${test.error.message}
                            ${test.error.stack ? `<pre style="margin-top: 10px; white-space: pre-wrap;">${test.error.stack}</pre>` : ''}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `).join('');
  }

  private generateXMLReport(): void {
    const xml = this.generateJUnitXML();
    const xmlPath = join(this.outputDir, 'xml', `${this.report.id}.xml`);
    writeFileSync(xmlPath, xml);
    console.log(`📊 XML report generated: ${xmlPath}`);
  }

  private generateJUnitXML(): string {
    const escapeXML = (str: string) => str.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case "'": return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Integration Tests" tests="${this.report.summary.totalTests}" failures="${this.report.summary.failed}" time="${(this.report.summary.duration / 1000).toFixed(3)}">
${this.report.suites.map(suite => `
  <testsuite name="${escapeXML(suite.name)}" tests="${suite.stats.total}" failures="${suite.stats.failed}" time="${(suite.duration / 1000).toFixed(3)}">
${suite.tests.map(test => `
    <testcase name="${escapeXML(test.name)}" classname="${escapeXML(test.metadata.service)}" time="${(test.duration / 1000).toFixed(3)}">
${test.status === 'failed' && test.error ? `
      <failure message="${escapeXML(test.error.message)}" type="${escapeXML(test.error.type)}">
        ${test.error.stack ? escapeXML(test.error.stack) : ''}
      </failure>` : ''}
${test.status === 'skipped' ? '      <skipped/>' : ''}
    </testcase>`).join('')}
  </testsuite>`).join('')}
</testsuites>`;
  }

  private generateConsoleReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📋 INTEGRATION TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`📅 Timestamp: ${this.report.timestamp.toLocaleString()}`);
    console.log(`🏷️  Report ID: ${this.report.id}`);
    console.log(`🔧 Environment: ${this.report.environment}`);
    console.log(`📦 Version: ${this.report.version}`);
    console.log('');

    // Summary
    const passRate = (this.report.summary.passed / this.report.summary.totalTests * 100).toFixed(1);
    const statusIcon = this.report.summary.failed === 0 ? '✅' : '❌';
    
    console.log(`${statusIcon} SUMMARY`);
    console.log(`   Total Tests: ${this.report.summary.totalTests}`);
    console.log(`   ✅ Passed: ${this.report.summary.passed}`);
    console.log(`   ❌ Failed: ${this.report.summary.failed}`);
    console.log(`   ⏭️  Skipped: ${this.report.summary.skipped}`);
    console.log(`   📊 Pass Rate: ${passRate}%`);
    console.log(`   ⏱️  Duration: ${(this.report.summary.duration / 1000).toFixed(1)}s`);
    console.log('');

    // Performance
    console.log('🚀 PERFORMANCE');
    console.log(`   Average Response Time: ${this.report.performance.averageResponseTime.toFixed(0)}ms`);
    console.log(`   Max Response Time: ${this.report.performance.maxResponseTime.toFixed(0)}ms`);
    console.log(`   Total Requests: ${this.report.performance.totalRequests}`);
    console.log(`   Throughput: ${this.report.performance.throughput.toFixed(1)} req/s`);
    console.log('');

    // Services
    if (Object.keys(this.report.services).length > 0) {
      console.log('🔗 SERVICES');
      Object.entries(this.report.services).forEach(([name, status]) => {
        const icon = status.status === 'healthy' ? '✅' : status.status === 'degraded' ? '⚠️' : '❌';
        console.log(`   ${icon} ${name}: ${status.status.toUpperCase()}`);
      });
      console.log('');
    }

    // Failed tests
    const failedTests = this.report.suites.flatMap(suite => 
      suite.tests.filter(test => test.status === 'failed')
    );

    if (failedTests.length > 0) {
      console.log('❌ FAILURES');
      failedTests.forEach(test => {
        console.log(`   ${test.suite} > ${test.name}`);
        if (test.error) {
          console.log(`      ${test.error.message}`);
        }
      });
      console.log('');
    }

    console.log('='.repeat(80));
  }

  getReport(): IntegrationTestReport {
    return this.report;
  }
}