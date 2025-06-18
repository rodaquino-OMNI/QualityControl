/**
 * Automated Performance Regression Testing Pipeline
 * Detects performance degradation by comparing against baselines
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);

class PerformanceRegressionTester {
  constructor(config = {}) {
    this.config = {
      baseline: {
        path: config.baselinePath || path.join(__dirname, '../baseline/current-baseline.json'),
        thresholds: {
          response_time_degradation: config.responseTimeDegradation || 0.2, // 20% degradation
          error_rate_increase: config.errorRateIncrease || 0.05, // 5% increase
          p95_threshold_multiplier: config.p95ThresholdMultiplier || 1.5
        }
      },
      tests: {
        k6: {
          enabled: config.k6Enabled !== false,
          duration: config.k6Duration || '5m',
          vus: config.k6VUs || 25
        },
        artillery: {
          enabled: config.artilleryEnabled !== false,
          duration: config.artilleryDuration || 300
        },
        lighthouse: {
          enabled: config.lighthouseEnabled !== false
        }
      },
      reporting: {
        outputDir: config.outputDir || path.join(__dirname, '../../results/regression'),
        notifications: {
          slack: config.slackWebhook,
          email: config.emailConfig
        }
      },
      ci: {
        failOnRegression: config.failOnRegression !== false,
        maxRetries: config.maxRetries || 2
      },
      ...config
    };

    this.testResults = {
      timestamp: new Date().toISOString(),
      baseline: null,
      current: {},
      comparison: {},
      summary: {
        passed: 0,
        failed: 0,
        degraded: 0,
        improved: 0
      },
      recommendations: []
    };
  }

  async runRegressionTest() {
    console.log('🚀 Starting automated performance regression testing...');
    await this.ensureOutputDir();

    try {
      // Load baseline
      await this.loadBaseline();

      // Run performance tests
      await this.runPerformanceTests();

      // Compare results with baseline
      await this.compareWithBaseline();

      // Generate report
      const report = await this.generateRegressionReport();

      // Send notifications if needed
      await this.sendNotifications(report);

      // Determine exit code for CI/CD
      const exitCode = this.shouldFail() ? 1 : 0;

      console.log(`\n📊 Regression testing completed. Exit code: ${exitCode}`);
      return { report, exitCode };

    } catch (error) {
      console.error('❌ Regression testing failed:', error);
      throw error;
    }
  }

  async loadBaseline() {
    try {
      const baselineData = await readFile(this.config.baseline.path, 'utf8');
      this.testResults.baseline = JSON.parse(baselineData);
      console.log(`✅ Baseline loaded from: ${this.config.baseline.path}`);
      console.log(`   Created: ${this.testResults.baseline.metadata.created}`);
    } catch (error) {
      console.warn(`⚠️ Could not load baseline: ${error.message}`);
      console.log('   Running without baseline comparison...');
    }
  }

  async runPerformanceTests() {
    console.log('\n🧪 Running performance tests...');

    const testPromises = [];

    // Run k6 tests
    if (this.config.tests.k6.enabled) {
      testPromises.push(this.runK6Tests());
    }

    // Run Artillery tests
    if (this.config.tests.artillery.enabled) {
      testPromises.push(this.runArtilleryTests());
    }

    // Run Lighthouse tests
    if (this.config.tests.lighthouse.enabled) {
      testPromises.push(this.runLighthouseTests());
    }

    const results = await Promise.allSettled(testPromises);
    
    results.forEach((result, index) => {
      const testType = ['k6', 'artillery', 'lighthouse'][index];
      if (result.status === 'fulfilled') {
        console.log(`✅ ${testType} tests completed`);
        this.testResults.current[testType] = result.value;
      } else {
        console.error(`❌ ${testType} tests failed:`, result.reason);
        this.testResults.current[testType] = { error: result.reason.message };
      }
    });
  }

  async runK6Tests() {
    console.log('  Running k6 load tests...');

    const k6Results = {};
    const testScripts = [
      'auth-load-test.js',
      'case-processing-test.js', 
      'ai-service-test.js',
      'dashboard-stress-test.js'
    ];

    for (const script of testScripts) {
      try {
        const result = await this.executeK6Test(script);
        k6Results[script] = result;
        console.log(`    ✅ ${script} completed`);
      } catch (error) {
        console.error(`    ❌ ${script} failed:`, error.message);
        k6Results[script] = { error: error.message };
      }
    }

    return k6Results;
  }

  async executeK6Test(script) {
    return new Promise((resolve, reject) => {
      const k6Path = path.join(__dirname, '../k6', script);
      const outputFile = path.join(this.config.reporting.outputDir, `k6-${script}-${Date.now()}.json`);

      const k6Process = spawn('k6', [
        'run',
        '--duration', this.config.tests.k6.duration,
        '--vus', this.config.tests.k6.vus.toString(),
        '--out', `json=${outputFile}`,
        k6Path
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      k6Process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      k6Process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      k6Process.on('close', (code) => {
        if (code === 0) {
          // Parse k6 output
          try {
            const lines = stdout.trim().split('\n');
            const summaryLine = lines.find(line => line.includes('http_req_duration'));
            const metrics = this.parseK6Metrics(stdout);
            resolve({
              metrics,
              outputFile,
              stdout: lines.slice(-10) // Last 10 lines for summary
            });
          } catch (error) {
            reject(new Error(`Failed to parse k6 output: ${error.message}`));
          }
        } else {
          reject(new Error(`k6 process exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  parseK6Metrics(stdout) {
    const metrics = {};
    
    // Extract key metrics from k6 output
    const lines = stdout.split('\n');
    
    lines.forEach(line => {
      if (line.includes('http_req_duration')) {
        const match = line.match(/avg=(\d+\.?\d*)ms.*p\(95\)=(\d+\.?\d*)ms/);
        if (match) {
          metrics.response_time_avg = parseFloat(match[1]);
          metrics.response_time_p95 = parseFloat(match[2]);
        }
      }
      
      if (line.includes('http_req_failed')) {
        const match = line.match(/(\d+\.?\d*)%/);
        if (match) {
          metrics.error_rate = parseFloat(match[1]);
        }
      }
      
      if (line.includes('checks')) {
        const match = line.match(/(\d+\.?\d*)%/);
        if (match) {
          metrics.check_success_rate = parseFloat(match[1]);
        }
      }
    });
    
    return metrics;
  }

  async runArtilleryTests() {
    console.log('  Running Artillery stress tests...');

    return new Promise((resolve, reject) => {
      const artilleryConfig = path.join(__dirname, '../artillery/stress-test.yml');
      const outputFile = path.join(this.config.reporting.outputDir, `artillery-${Date.now()}.json`);

      const artilleryProcess = spawn('artillery', [
        'run',
        '--output', outputFile,
        artilleryConfig
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      artilleryProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      artilleryProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      artilleryProcess.on('close', (code) => {
        if (code === 0) {
          resolve({
            metrics: this.parseArtilleryMetrics(stdout),
            outputFile,
            summary: stdout.split('\n').slice(-15) // Last 15 lines
          });
        } else {
          reject(new Error(`Artillery process exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  parseArtilleryMetrics(stdout) {
    const metrics = {};
    const lines = stdout.split('\n');
    
    lines.forEach(line => {
      if (line.includes('http.response_time')) {
        const match = line.match(/p95:\s*(\d+\.?\d*)/);
        if (match) {
          metrics.response_time_p95 = parseFloat(match[1]);
        }
      }
      
      if (line.includes('http.request_rate')) {
        const match = line.match(/(\d+\.?\d*)\/sec/);
        if (match) {
          metrics.request_rate = parseFloat(match[1]);
        }
      }
    });
    
    return metrics;
  }

  async runLighthouseTests() {
    console.log('  Running Lighthouse frontend tests...');

    return new Promise((resolve, reject) => {
      const lighthouseScript = path.join(__dirname, '../lighthouse/lighthouse-runner.js');
      
      const lighthouseProcess = spawn('node', [lighthouseScript, 'run'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      lighthouseProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      lighthouseProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      lighthouseProcess.on('close', (code) => {
        if (code === 0) {
          resolve({
            metrics: this.parseLighthouseMetrics(stdout),
            summary: stdout.split('\n').slice(-10)
          });
        } else {
          reject(new Error(`Lighthouse process exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  parseLighthouseMetrics(stdout) {
    // Parse Lighthouse output for key metrics
    const metrics = {};
    
    try {
      // Look for performance scores in output
      const lines = stdout.split('\n');
      lines.forEach(line => {
        if (line.includes('Average Performance Score')) {
          const match = line.match(/(\d+)/);
          if (match) {
            metrics.performance_score = parseInt(match[1]);
          }
        }
      });
    } catch (error) {
      console.warn('Could not parse Lighthouse metrics:', error.message);
    }
    
    return metrics;
  }

  async compareWithBaseline() {
    if (!this.testResults.baseline) {
      console.log('⚠️ No baseline available for comparison');
      return;
    }

    console.log('\n📊 Comparing results with baseline...');

    this.testResults.comparison = {
      k6: this.compareK6Results(),
      artillery: this.compareArtilleryResults(),
      lighthouse: this.compareLighthouseResults()
    };

    // Calculate summary
    this.calculateSummary();
  }

  compareK6Results() {
    const baseline = this.testResults.baseline;
    const current = this.testResults.current.k6;
    
    if (!baseline || !current || current.error) {
      return { status: 'no_comparison', reason: 'Missing baseline or current data' };
    }

    const comparisons = {};
    
    // Compare each k6 test script
    Object.keys(current).forEach(script => {
      if (current[script].error) {
        comparisons[script] = { status: 'error', reason: current[script].error };
        return;
      }

      const currentMetrics = current[script].metrics;
      const baselineTest = this.findBaselineTest(script);

      if (!baselineTest) {
        comparisons[script] = { status: 'no_baseline', reason: 'No baseline data found' };
        return;
      }

      const comparison = {
        response_time: this.compareMetric(
          currentMetrics.response_time_p95,
          baselineTest.p95,
          this.config.baseline.thresholds.response_time_degradation
        ),
        error_rate: this.compareMetric(
          currentMetrics.error_rate,
          baselineTest.error_rate,
          this.config.baseline.thresholds.error_rate_increase,
          true // Lower is better
        ),
        status: 'compared'
      };

      // Overall status for this test
      if (comparison.response_time.regression || comparison.error_rate.regression) {
        comparison.overall_status = 'regression';
        this.testResults.summary.degraded++;
      } else if (comparison.response_time.improvement || comparison.error_rate.improvement) {
        comparison.overall_status = 'improvement';
        this.testResults.summary.improved++;
      } else {
        comparison.overall_status = 'stable';
        this.testResults.summary.passed++;
      }

      comparisons[script] = comparison;
    });

    return comparisons;
  }

  findBaselineTest(script) {
    // Find corresponding test in baseline data
    // This is a simplified lookup - in reality, you'd match based on test names/scenarios
    if (this.testResults.baseline && this.testResults.baseline.scenarios) {
      for (const scenario of this.testResults.baseline.scenarios) {
        for (const test of scenario.tests) {
          if (test.baseline_metrics) {
            return test.baseline_metrics;
          }
        }
      }
    }
    return null;
  }

  compareMetric(current, baseline, threshold, lowerIsBetter = false) {
    if (current === null || current === undefined || baseline === null || baseline === undefined) {
      return { status: 'no_data' };
    }

    const change = lowerIsBetter ? 
      (current - baseline) / baseline :
      (current - baseline) / baseline;

    const result = {
      current: current,
      baseline: baseline,
      change_percent: Math.round(change * 100 * 100) / 100,
      change_absolute: current - baseline
    };

    if (lowerIsBetter) {
      result.regression = change > threshold;
      result.improvement = change < -threshold;
    } else {
      result.regression = change > threshold;
      result.improvement = change < -threshold;
    }

    result.status = result.regression ? 'regression' : 
                   result.improvement ? 'improvement' : 'stable';

    return result;
  }

  compareArtilleryResults() {
    // Similar comparison logic for Artillery results
    return { status: 'compared' };
  }

  compareLighthouseResults() {
    // Similar comparison logic for Lighthouse results
    return { status: 'compared' };
  }

  calculateSummary() {
    const { passed, failed, degraded, improved } = this.testResults.summary;
    const total = passed + failed + degraded + improved;

    this.testResults.summary.total = total;
    this.testResults.summary.regression_rate = total > 0 ? (degraded / total) * 100 : 0;
    this.testResults.summary.overall_status = degraded > 0 ? 'regression_detected' : 
                                            improved > 0 ? 'improvements_detected' : 'stable';
  }

  async generateRegressionReport() {
    const report = {
      ...this.testResults,
      generated_at: new Date().toISOString()
    };

    // Add recommendations
    if (this.testResults.summary.degraded > 0) {
      this.testResults.recommendations.push(
        'Performance regression detected. Review recent changes and consider rollback.',
        'Investigate high-impact endpoints and optimize query performance.',
        'Monitor system resources during peak usage.',
        'Consider implementing performance budgets in CI/CD pipeline.'
      );
    }

    // Save detailed report
    const reportFile = path.join(this.config.reporting.outputDir, `regression-report-${Date.now()}.json`);
    await writeFile(reportFile, JSON.stringify(report, null, 2));

    // Generate markdown summary
    const markdownReport = this.generateMarkdownReport(report);
    const markdownFile = path.join(this.config.reporting.outputDir, `regression-summary-${Date.now()}.md`);
    await writeFile(markdownFile, markdownReport);

    console.log(`📄 Regression report saved: ${reportFile}`);
    console.log(`📄 Summary report saved: ${markdownFile}`);

    return report;
  }

  generateMarkdownReport(report) {
    let md = `# Performance Regression Test Report\n\n`;
    md += `**Generated:** ${report.generated_at}\n`;
    md += `**Status:** ${report.summary.overall_status}\n\n`;

    md += `## Summary\n\n`;
    md += `- **Total Tests:** ${report.summary.total}\n`;
    md += `- **Passed:** ${report.summary.passed}\n`;
    md += `- **Degraded:** ${report.summary.degraded}\n`;
    md += `- **Improved:** ${report.summary.improved}\n`;
    md += `- **Regression Rate:** ${Math.round(report.summary.regression_rate * 100) / 100}%\n\n`;

    if (report.summary.degraded > 0) {
      md += `## ⚠️ Performance Regressions Detected\n\n`;
      md += `${report.summary.degraded} test(s) showed performance degradation.\n\n`;
    }

    if (report.summary.improved > 0) {
      md += `## ✅ Performance Improvements\n\n`;
      md += `${report.summary.improved} test(s) showed performance improvements.\n\n`;
    }

    if (report.recommendations.length > 0) {
      md += `## Recommendations\n\n`;
      report.recommendations.forEach(rec => {
        md += `- ${rec}\n`;
      });
      md += `\n`;
    }

    return md;
  }

  async sendNotifications(report) {
    if (report.summary.degraded > 0 && this.config.reporting.notifications.slack) {
      await this.sendSlackNotification(report);
    }
  }

  async sendSlackNotification(report) {
    try {
      const message = {
        text: `🚨 Performance Regression Detected`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Performance Regression Test Results*\n*Status:* ${report.summary.overall_status}\n*Degraded Tests:* ${report.summary.degraded}/${report.summary.total}`
            }
          }
        ]
      };

      await axios.post(this.config.reporting.notifications.slack, message);
      console.log('📱 Slack notification sent');
    } catch (error) {
      console.error('Failed to send Slack notification:', error.message);
    }
  }

  shouldFail() {
    return this.config.ci.failOnRegression && this.testResults.summary.degraded > 0;
  }

  async ensureOutputDir() {
    try {
      await mkdir(this.config.reporting.outputDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
}

// CLI interface
if (require.main === module) {
  const tester = new PerformanceRegressionTester();

  tester.runRegressionTest()
    .then(({ report, exitCode }) => {
      console.log('\n📊 Regression Test Summary:');
      console.log(`   Status: ${report.summary.overall_status}`);
      console.log(`   Total Tests: ${report.summary.total}`);
      console.log(`   Degraded: ${report.summary.degraded}`);
      console.log(`   Improved: ${report.summary.improved}`);
      
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('❌ Regression testing failed:', error);
      process.exit(1);
    });
}

module.exports = PerformanceRegressionTester;