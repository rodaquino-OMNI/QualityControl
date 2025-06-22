#!/usr/bin/env node

/**
 * Test Reporter - Comprehensive test result aggregation and reporting
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TestReporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || 'test-reports';
    this.format = options.format || 'html';
    this.includeCoverage = options.includeCoverage !== false;
    this.includePerformance = options.includePerformance !== false;
    this.includeSecurity = options.includeSecurity !== false;
    this.verbose = options.verbose || false;
    
    this.results = {
      summary: {
        timestamp: new Date().toISOString(),
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      },
      suites: {},
      coverage: {},
      performance: {},
      security: {}
    };
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      warning: '\x1b[33m',
      error: '\x1b[31m',
      reset: '\x1b[0m'
    };
    
    console.log(`${colors[type]}[${type.toUpperCase()}]${colors.reset} ${message}`);
  }

  // Collect test results from various sources
  async collectResults() {
    this.log('Collecting test results...');
    
    try {
      // Collect Jest results (Frontend/Backend)
      await this.collectJestResults();
      
      // Collect Pytest results (AI Service)
      await this.collectPytestResults();
      
      // Collect Cypress results (E2E)
      await this.collectCypressResults();
      
      // Collect coverage data
      if (this.includeCoverage) {
        await this.collectCoverageData();
      }
      
      // Collect performance data
      if (this.includePerformance) {
        await this.collectPerformanceData();
      }
      
      // Collect security scan results
      if (this.includeSecurity) {
        await this.collectSecurityData();
      }
      
      this.log('Test result collection completed', 'success');
    } catch (error) {
      this.log(`Error collecting results: ${error.message}`, 'error');
      throw error;
    }
  }

  // Collect Jest test results
  async collectJestResults() {
    const jestDirs = ['frontend', 'backend'];
    
    for (const dir of jestDirs) {
      if (!fs.existsSync(dir)) continue;
      
      const resultsPath = path.join(dir, 'test-results.json');
      const coveragePath = path.join(dir, 'coverage', 'coverage-summary.json');
      
      if (fs.existsSync(resultsPath)) {
        try {
          const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
          this.results.suites[dir] = {
            framework: 'jest',
            ...results,
            coveragePath: fs.existsSync(coveragePath) ? coveragePath : null
          };
          
          // Update summary
          this.results.summary.total += results.numTotalTests || 0;
          this.results.summary.passed += results.numPassedTests || 0;
          this.results.summary.failed += results.numFailedTests || 0;
          this.results.summary.skipped += results.numPendingTests || 0;
          
        } catch (error) {
          this.log(`Error parsing Jest results for ${dir}: ${error.message}`, 'warning');
        }
      }
    }
  }

  // Collect Pytest results
  async collectPytestResults() {
    const aiServiceDir = 'ai-service';
    if (!fs.existsSync(aiServiceDir)) return;
    
    const resultsPath = path.join(aiServiceDir, 'test-results.xml');
    const coveragePath = path.join(aiServiceDir, 'coverage.xml');
    
    if (fs.existsSync(resultsPath)) {
      try {
        // Parse pytest XML results (simplified)
        const xmlContent = fs.readFileSync(resultsPath, 'utf8');
        const testcases = (xmlContent.match(/<testcase/g) || []).length;
        const failures = (xmlContent.match(/<failure/g) || []).length;
        const errors = (xmlContent.match(/<error/g) || []).length;
        const skipped = (xmlContent.match(/<skipped/g) || []).length;
        
        this.results.suites[aiServiceDir] = {
          framework: 'pytest',
          numTotalTests: testcases,
          numPassedTests: testcases - failures - errors - skipped,
          numFailedTests: failures + errors,
          numPendingTests: skipped,
          coveragePath: fs.existsSync(coveragePath) ? coveragePath : null
        };
        
        // Update summary
        this.results.summary.total += testcases;
        this.results.summary.passed += testcases - failures - errors - skipped;
        this.results.summary.failed += failures + errors;
        this.results.summary.skipped += skipped;
        
      } catch (error) {
        this.log(`Error parsing Pytest results: ${error.message}`, 'warning');
      }
    }
  }

  // Collect Cypress results
  async collectCypressResults() {
    const cypressResultsPath = 'cypress/results';
    if (!fs.existsSync(cypressResultsPath)) return;
    
    try {
      const files = fs.readdirSync(cypressResultsPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      if (jsonFiles.length > 0) {
        const latestFile = jsonFiles.sort().pop();
        const results = JSON.parse(fs.readFileSync(path.join(cypressResultsPath, latestFile), 'utf8'));
        
        this.results.suites.e2e = {
          framework: 'cypress',
          ...results,
          numTotalTests: results.totalTests || 0,
          numPassedTests: results.totalPassed || 0,
          numFailedTests: results.totalFailed || 0,
          numPendingTests: results.totalPending || 0
        };
        
        // Update summary
        this.results.summary.total += results.totalTests || 0;
        this.results.summary.passed += results.totalPassed || 0;
        this.results.summary.failed += results.totalFailed || 0;
        this.results.summary.skipped += results.totalPending || 0;
      }
    } catch (error) {
      this.log(`Error parsing Cypress results: ${error.message}`, 'warning');
    }
  }

  // Collect coverage data
  async collectCoverageData() {
    const coverageDirs = ['frontend/coverage', 'backend/coverage', 'ai-service'];
    
    for (const dir of coverageDirs) {
      const summaryPath = path.join(dir, 'coverage-summary.json');
      const xmlPath = path.join(dir, 'coverage.xml');
      
      if (fs.existsSync(summaryPath)) {
        try {
          const coverage = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
          const serviceName = dir.split('/')[0];
          this.results.coverage[serviceName] = coverage;
        } catch (error) {
          this.log(`Error parsing coverage for ${dir}: ${error.message}`, 'warning');
        }
      } else if (fs.existsSync(xmlPath)) {
        // Parse XML coverage (simplified)
        try {
          const xmlContent = fs.readFileSync(xmlPath, 'utf8');
          const lineRate = xmlContent.match(/line-rate="([^"]+)"/)?.[1];
          const serviceName = dir.split('/')[0];
          
          if (lineRate) {
            this.results.coverage[serviceName] = {
              total: { lines: { pct: parseFloat(lineRate) * 100 } }
            };
          }
        } catch (error) {
          this.log(`Error parsing XML coverage for ${dir}: ${error.message}`, 'warning');
        }
      }
    }
  }

  // Collect performance data
  async collectPerformanceData() {
    const performanceDir = 'performance-tests';
    if (!fs.existsSync(performanceDir)) return;
    
    try {
      const files = fs.readdirSync(performanceDir);
      const jsonFiles = files.filter(f => f.endsWith('-performance.json'));
      
      for (const file of jsonFiles) {
        const testName = file.replace('-performance.json', '');
        const data = JSON.parse(fs.readFileSync(path.join(performanceDir, file), 'utf8'));
        this.results.performance[testName] = data;
      }
    } catch (error) {
      this.log(`Error collecting performance data: ${error.message}`, 'warning');
    }
  }

  // Collect security scan results
  async collectSecurityData() {
    const securityFiles = [
      'bandit-report.json',
      'safety-report.json',
      'trivy-results.sarif'
    ];
    
    for (const file of securityFiles) {
      if (fs.existsSync(file)) {
        try {
          const data = JSON.parse(fs.readFileSync(file, 'utf8'));
          const scanType = file.split('-')[0];
          this.results.security[scanType] = data;
        } catch (error) {
          this.log(`Error parsing security file ${file}: ${error.message}`, 'warning');
        }
      }
    }
  }

  // Generate HTML report
  generateHTMLReport() {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Results Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .metric h3 { margin: 0 0 10px 0; color: #333; }
        .metric .value { font-size: 2em; font-weight: bold; margin: 10px 0; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .skipped { color: #ffc107; }
        .suite { margin: 20px 0; padding: 20px; border: 1px solid #dee2e6; border-radius: 8px; }
        .suite h3 { margin: 0 0 15px 0; color: #495057; }
        .coverage-bar { width: 100%; height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden; }
        .coverage-fill { height: 100%; transition: width 0.3s ease; }
        .excellent { background: #28a745; }
        .good { background: #17a2b8; }
        .fair { background: #ffc107; }
        .poor { background: #dc3545; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6; }
        th { background-color: #f8f9fa; font-weight: 600; }
        .status-badge { padding: 4px 8px; border-radius: 4px; color: white; font-size: 0.8em; }
        .status-passed { background: #28a745; }
        .status-failed { background: #dc3545; }
        .status-skipped { background: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Test Results Report</h1>
            <p>Generated: ${new Date(this.results.summary.timestamp).toLocaleString()}</p>
        </div>
        
        <div class="summary">
            <div class="metric">
                <h3>Total Tests</h3>
                <div class="value">${this.results.summary.total}</div>
            </div>
            <div class="metric">
                <h3>Passed</h3>
                <div class="value passed">${this.results.summary.passed}</div>
            </div>
            <div class="metric">
                <h3>Failed</h3>
                <div class="value failed">${this.results.summary.failed}</div>
            </div>
            <div class="metric">
                <h3>Skipped</h3>
                <div class="value skipped">${this.results.summary.skipped}</div>
            </div>
            <div class="metric">
                <h3>Success Rate</h3>
                <div class="value ${this.results.summary.total > 0 && this.results.summary.failed === 0 ? 'passed' : 'failed'}">
                    ${this.results.summary.total > 0 ? Math.round((this.results.summary.passed / this.results.summary.total) * 100) : 0}%
                </div>
            </div>
        </div>
        
        ${this.generateSuitesHTML()}
        ${this.generateCoverageHTML()}
        ${this.generatePerformanceHTML()}
        ${this.generateSecurityHTML()}
    </div>
</body>
</html>`;
    
    return html;
  }

  generateSuitesHTML() {
    if (Object.keys(this.results.suites).length === 0) return '';
    
    let html = '<h2>Test Suites</h2>';
    
    for (const [name, suite] of Object.entries(this.results.suites)) {
      const successRate = suite.numTotalTests > 0 ? Math.round((suite.numPassedTests / suite.numTotalTests) * 100) : 0;
      
      html += `
        <div class="suite">
            <h3>${name} (${suite.framework})</h3>
            <table>
                <tr>
                    <th>Metric</th>
                    <th>Value</th>
                </tr>
                <tr>
                    <td>Total Tests</td>
                    <td>${suite.numTotalTests || 0}</td>
                </tr>
                <tr>
                    <td>Passed</td>
                    <td><span class="status-badge status-passed">${suite.numPassedTests || 0}</span></td>
                </tr>
                <tr>
                    <td>Failed</td>
                    <td><span class="status-badge status-failed">${suite.numFailedTests || 0}</span></td>
                </tr>
                <tr>
                    <td>Skipped</td>
                    <td><span class="status-badge status-skipped">${suite.numPendingTests || 0}</span></td>
                </tr>
                <tr>
                    <td>Success Rate</td>
                    <td>${successRate}%</td>
                </tr>
            </table>
        </div>`;
    }
    
    return html;
  }

  generateCoverageHTML() {
    if (Object.keys(this.results.coverage).length === 0) return '';
    
    let html = '<h2>Code Coverage</h2>';
    
    for (const [service, coverage] of Object.entries(this.results.coverage)) {
      const lineCoverage = coverage.total?.lines?.pct || 0;
      const branchCoverage = coverage.total?.branches?.pct || 0;
      const functionCoverage = coverage.total?.functions?.pct || 0;
      
      const coverageClass = lineCoverage >= 80 ? 'excellent' : lineCoverage >= 60 ? 'good' : lineCoverage >= 40 ? 'fair' : 'poor';
      
      html += `
        <div class="suite">
            <h3>${service}</h3>
            <table>
                <tr>
                    <th>Type</th>
                    <th>Coverage</th>
                    <th>Visual</th>
                </tr>
                <tr>
                    <td>Lines</td>
                    <td>${lineCoverage.toFixed(1)}%</td>
                    <td>
                        <div class="coverage-bar">
                            <div class="coverage-fill ${coverageClass}" style="width: ${lineCoverage}%"></div>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td>Branches</td>
                    <td>${branchCoverage.toFixed(1)}%</td>
                    <td>
                        <div class="coverage-bar">
                            <div class="coverage-fill ${branchCoverage >= 80 ? 'excellent' : branchCoverage >= 60 ? 'good' : branchCoverage >= 40 ? 'fair' : 'poor'}" style="width: ${branchCoverage}%"></div>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td>Functions</td>
                    <td>${functionCoverage.toFixed(1)}%</td>
                    <td>
                        <div class="coverage-bar">
                            <div class="coverage-fill ${functionCoverage >= 80 ? 'excellent' : functionCoverage >= 60 ? 'good' : functionCoverage >= 40 ? 'fair' : 'poor'}" style="width: ${functionCoverage}%"></div>
                        </div>
                    </td>
                </tr>
            </table>
        </div>`;
    }
    
    return html;
  }

  generatePerformanceHTML() {
    if (Object.keys(this.results.performance).length === 0) return '';
    
    let html = '<h2>Performance Results</h2>';
    
    for (const [testName, data] of Object.entries(this.results.performance)) {
      html += `
        <div class="suite">
            <h3>${testName}</h3>
            <p>Performance test results would be displayed here based on Artillery output format.</p>
        </div>`;
    }
    
    return html;
  }

  generateSecurityHTML() {
    if (Object.keys(this.results.security).length === 0) return '';
    
    let html = '<h2>Security Scan Results</h2>';
    
    for (const [scanType, data] of Object.entries(this.results.security)) {
      html += `
        <div class="suite">
            <h3>${scanType} Security Scan</h3>
            <p>Security scan results would be displayed here based on the scan tool output format.</p>
        </div>`;
    }
    
    return html;
  }

  // Generate JSON report
  generateJSONReport() {
    return JSON.stringify(this.results, null, 2);
  }

  // Generate markdown report
  generateMarkdownReport() {
    let md = `# Test Results Report\n\n`;
    md += `Generated: ${new Date(this.results.summary.timestamp).toLocaleString()}\n\n`;
    
    md += `## Summary\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Total Tests | ${this.results.summary.total} |\n`;
    md += `| Passed | ${this.results.summary.passed} |\n`;
    md += `| Failed | ${this.results.summary.failed} |\n`;
    md += `| Skipped | ${this.results.summary.skipped} |\n`;
    md += `| Success Rate | ${this.results.summary.total > 0 ? Math.round((this.results.summary.passed / this.results.summary.total) * 100) : 0}% |\n\n`;
    
    if (Object.keys(this.results.suites).length > 0) {
      md += `## Test Suites\n\n`;
      for (const [name, suite] of Object.entries(this.results.suites)) {
        md += `### ${name} (${suite.framework})\n\n`;
        md += `- Total: ${suite.numTotalTests || 0}\n`;
        md += `- Passed: ${suite.numPassedTests || 0}\n`;
        md += `- Failed: ${suite.numFailedTests || 0}\n`;
        md += `- Skipped: ${suite.numPendingTests || 0}\n\n`;
      }
    }
    
    if (Object.keys(this.results.coverage).length > 0) {
      md += `## Coverage\n\n`;
      for (const [service, coverage] of Object.entries(this.results.coverage)) {
        md += `### ${service}\n\n`;
        md += `- Lines: ${(coverage.total?.lines?.pct || 0).toFixed(1)}%\n`;
        md += `- Branches: ${(coverage.total?.branches?.pct || 0).toFixed(1)}%\n`;
        md += `- Functions: ${(coverage.total?.functions?.pct || 0).toFixed(1)}%\n\n`;
      }
    }
    
    return md;
  }

  // Save report to file
  async saveReport() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    
    let content;
    let filename;
    
    switch (this.format) {
      case 'html':
        content = this.generateHTMLReport();
        filename = 'test-report.html';
        break;
      case 'json':
        content = this.generateJSONReport();
        filename = 'test-report.json';
        break;
      case 'markdown':
        content = this.generateMarkdownReport();
        filename = 'test-report.md';
        break;
      default:
        throw new Error(`Unsupported format: ${this.format}`);
    }
    
    const filepath = path.join(this.outputDir, filename);
    fs.writeFileSync(filepath, content);
    
    this.log(`Report saved: ${filepath}`, 'success');
    return filepath;
  }

  // Generate and save report
  async generate() {
    try {
      await this.collectResults();
      const filepath = await this.saveReport();
      
      this.log('Test report generation completed', 'success');
      return filepath;
    } catch (error) {
      this.log(`Report generation failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    
    switch (key) {
      case 'format':
        options.format = value;
        break;
      case 'output':
        options.outputDir = value;
        break;
      case 'verbose':
        options.verbose = true;
        i--; // No value for this flag
        break;
      case 'no-coverage':
        options.includeCoverage = false;
        i--; // No value for this flag
        break;
      case 'no-performance':
        options.includePerformance = false;
        i--; // No value for this flag
        break;
      case 'no-security':
        options.includeSecurity = false;
        i--; // No value for this flag
        break;
    }
  }
  
  const reporter = new TestReporter(options);
  reporter.generate().catch(error => {
    console.error('Report generation failed:', error);
    process.exit(1);
  });
}

module.exports = TestReporter;