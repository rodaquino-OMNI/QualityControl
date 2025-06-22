/**
 * Performance Test Runner & Analyzer
 * Orchestrates all performance tests and provides optimization recommendations
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PerformanceTestRunner {
  constructor() {
    this.testResults = {};
    this.startTime = new Date();
    this.config = {
      outputDir: path.join(__dirname, '../reports'),
      testsDir: path.join(__dirname, '../scripts'),
      concurrent: false,
      includeBaseline: true,
      generateReport: true
    };
    
    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Run database benchmarks
   */
  async runDatabaseBenchmarks() {
    console.log('\n🔍 Running Database Performance Benchmarks...');
    
    try {
      // Import and run database benchmark
      const DatabaseBenchmark = (await import('./benchmarks/database-benchmark.js')).default;
      const dbBenchmark = new DatabaseBenchmark();
      
      const results = await dbBenchmark.runAllBenchmarks();
      this.testResults.database = results;
      
      console.log('✅ Database benchmarks completed');
      return results;
    } catch (error) {
      console.error('❌ Database benchmarks failed:', error.message);
      this.testResults.database = { error: error.message };
      return null;
    }
  }

  /**
   * Run Redis benchmarks
   */
  async runRedisBenchmarks() {
    console.log('\n🔍 Running Redis Performance Benchmarks...');
    
    try {
      // Import and run Redis benchmark
      const RedisBenchmark = (await import('./benchmarks/redis-benchmark.js')).default;
      const redisBenchmark = new RedisBenchmark();
      
      const results = await redisBenchmark.runAllBenchmarks();
      this.testResults.redis = results;
      
      console.log('✅ Redis benchmarks completed');
      return results;
    } catch (error) {
      console.error('❌ Redis benchmarks failed:', error.message);
      this.testResults.redis = { error: error.message };
      return null;
    }
  }

  /**
   * Run K6 load tests
   */
  async runLoadTests() {
    console.log('\n🔍 Running K6 Load Tests...');
    
    const testFiles = [
      'k6/auth-load-test.js',
      'k6/case-processing-test.js',
      'k6/ai-service-test.js',
      'k6/dashboard-stress-test.js',
      'benchmarks/load-test-scenarios.js'
    ];

    const results = {};

    for (const testFile of testFiles) {
      const testPath = path.join(this.config.testsDir, testFile);
      
      if (!fs.existsSync(testPath)) {
        console.warn(`⚠️ Test file not found: ${testFile}`);
        continue;
      }

      try {
        console.log(`Running ${testFile}...`);
        
        const outputFile = path.join(this.config.outputDir, `${path.basename(testFile, '.js')}-results.json`);
        
        // Run K6 test with JSON output
        const command = `k6 run --out json=${outputFile} ${testPath}`;
        const output = execSync(command, { 
          encoding: 'utf8',
          timeout: 300000, // 5 minutes
          env: {
            ...process.env,
            API_URL: process.env.API_URL || 'http://localhost:8000'
          }
        });
        
        // Parse K6 results
        if (fs.existsSync(outputFile)) {
          const k6Results = this.parseK6Results(outputFile);
          results[path.basename(testFile, '.js')] = k6Results;
          console.log(`✅ ${testFile} completed`);
        }
        
      } catch (error) {
        console.error(`❌ ${testFile} failed:`, error.message);
        results[path.basename(testFile, '.js')] = { error: error.message };
      }
    }

    this.testResults.loadTests = results;
    return results;
  }

  /**
   * Parse K6 JSON results
   */
  parseK6Results(filePath) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split('\n').filter(line => line.trim());
      
      const metrics = {};
      const checks = {};
      
      lines.forEach(line => {
        try {
          const data = JSON.parse(line);
          
          if (data.type === 'Point' && data.data) {
            const metricName = data.metric;
            if (!metrics[metricName]) {
              metrics[metricName] = [];
            }
            metrics[metricName].push(data.data.value);
          }
          
          if (data.type === 'Point' && data.data && data.data.tags && data.data.tags.check) {
            const checkName = data.data.tags.check;
            if (!checks[checkName]) {
              checks[checkName] = { passed: 0, failed: 0 };
            }
            if (data.data.value === 1) {
              checks[checkName].passed++;
            } else {
              checks[checkName].failed++;
            }
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      });

      // Calculate summary statistics
      const summary = {};
      Object.keys(metrics).forEach(metric => {
        const values = metrics[metric].sort((a, b) => a - b);
        if (values.length > 0) {
          summary[metric] = {
            count: values.length,
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            p50: values[Math.floor(values.length * 0.5)],
            p95: values[Math.floor(values.length * 0.95)],
            p99: values[Math.floor(values.length * 0.99)]
          };
        }
      });

      return {
        summary,
        checks,
        totalPoints: lines.length
      };
    } catch (error) {
      console.error(`Error parsing K6 results from ${filePath}:`, error.message);
      return { error: error.message };
    }
  }

  /**
   * Run Lighthouse performance audits
   */
  async runLighthouseAudits() {
    console.log('\n🔍 Running Lighthouse Performance Audits...');
    
    try {
      const lighthouseScript = path.join(this.config.testsDir, 'lighthouse/lighthouse-runner.js');
      
      if (!fs.existsSync(lighthouseScript)) {
        console.warn('⚠️ Lighthouse runner not found, skipping...');
        return null;
      }

      const output = execSync(`node ${lighthouseScript}`, { 
        encoding: 'utf8',
        timeout: 180000 // 3 minutes
      });
      
      const results = JSON.parse(output);
      this.testResults.lighthouse = results;
      
      console.log('✅ Lighthouse audits completed');
      return results;
    } catch (error) {
      console.error('❌ Lighthouse audits failed:', error.message);
      this.testResults.lighthouse = { error: error.message };
      return null;
    }
  }

  /**
   * Analyze performance bottlenecks
   */
  analyzeBottlenecks() {
    console.log('\n📊 Analyzing Performance Bottlenecks...');
    
    const analysis = {
      critical_issues: [],
      warnings: [],
      recommendations: [],
      score: 100
    };

    // Analyze database performance
    if (this.testResults.database && this.testResults.database.results) {
      const dbResults = this.testResults.database.results;
      
      dbResults.forEach(result => {
        if (result.p95 > 2000) {
          analysis.critical_issues.push({
            type: 'database',
            issue: `${result.testName} P95 latency is ${result.p95.toFixed(2)}ms (threshold: 2000ms)`,
            impact: 'high',
            recommendation: 'Optimize database queries, add indexes, or implement caching'
          });
          analysis.score -= 15;
        } else if (result.p95 > 1000) {
          analysis.warnings.push({
            type: 'database',
            issue: `${result.testName} P95 latency is ${result.p95.toFixed(2)}ms`,
            recommendation: 'Consider query optimization or caching'
          });
          analysis.score -= 5;
        }
      });
    }

    // Analyze Redis performance
    if (this.testResults.redis && this.testResults.redis.results) {
      const redisResults = this.testResults.redis.results;
      
      Object.values(redisResults).forEach(result => {
        if (result.p95 > 100) {
          analysis.warnings.push({
            type: 'redis',
            issue: `${result.testName} P95 latency is ${result.p95.toFixed(2)}ms`,
            recommendation: 'Check Redis memory usage and connection pooling'
          });
          analysis.score -= 3;
        }
        
        if (result.throughput < 1000) {
          analysis.warnings.push({
            type: 'redis',
            issue: `${result.testName} throughput is ${result.throughput.toFixed(0)} ops/sec`,
            recommendation: 'Consider Redis clustering or pipeline optimization'
          });
          analysis.score -= 3;
        }
      });
    }

    // Analyze load test results
    if (this.testResults.loadTests) {
      Object.entries(this.testResults.loadTests).forEach(([testName, results]) => {
        if (results.summary && results.summary.http_req_duration) {
          const responseTime = results.summary.http_req_duration;
          
          if (responseTime.p95 > 3000) {
            analysis.critical_issues.push({
              type: 'load_test',
              issue: `${testName} P95 response time is ${responseTime.p95.toFixed(2)}ms`,
              impact: 'high',
              recommendation: 'Scale application resources or optimize critical paths'
            });
            analysis.score -= 20;
          }
        }
        
        if (results.summary && results.summary.http_req_failed) {
          const errorRate = results.summary.http_req_failed.avg;
          
          if (errorRate > 0.02) {
            analysis.critical_issues.push({
              type: 'reliability',
              issue: `${testName} error rate is ${(errorRate * 100).toFixed(2)}%`,
              impact: 'critical',
              recommendation: 'Investigate and fix application errors'
            });
            analysis.score -= 25;
          }
        }
      });
    }

    // Generate general recommendations
    analysis.recommendations = [
      'Implement database query optimization and indexing strategy',
      'Set up comprehensive caching layer with Redis',
      'Monitor and optimize AI processing pipeline',
      'Implement connection pooling and resource management',
      'Set up real-time performance monitoring',
      'Consider implementing CDN for static assets',
      'Optimize frontend bundle size and loading strategies',
      'Implement graceful degradation for high-load scenarios'
    ];

    this.testResults.analysis = analysis;
    return analysis;
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport() {
    console.log('\n📝 Generating Performance Report...');
    
    const endTime = new Date();
    const duration = endTime - this.startTime;

    const report = {
      metadata: {
        timestamp: endTime.toISOString(),
        duration: `${Math.floor(duration / 1000)}s`,
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        }
      },
      results: this.testResults,
      summary: {
        totalTests: Object.keys(this.testResults).length,
        overallScore: this.testResults.analysis ? this.testResults.analysis.score : 0,
        criticalIssues: this.testResults.analysis ? this.testResults.analysis.critical_issues.length : 0,
        warnings: this.testResults.analysis ? this.testResults.analysis.warnings.length : 0
      },
      recommendations: this.testResults.analysis ? this.testResults.analysis.recommendations : []
    };

    // Save detailed report
    const reportPath = path.join(this.config.outputDir, `performance-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Generate summary HTML report
    const htmlReport = this.generateHtmlReport(report);
    const htmlPath = path.join(this.config.outputDir, `performance-report-${Date.now()}.html`);
    fs.writeFileSync(htmlPath, htmlReport);

    console.log(`📄 Performance report saved to: ${reportPath}`);
    console.log(`🌐 HTML report saved to: ${htmlPath}`);

    return report;
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .metric { margin: 10px 0; padding: 10px; border-left: 4px solid #007cba; background: #f9f9f9; }
        .critical { border-left-color: #d32f2f; }
        .warning { border-left-color: #f57c00; }
        .good { border-left-color: #388e3c; }
        .score { font-size: 2em; font-weight: bold; color: ${report.summary.overallScore > 80 ? '#388e3c' : report.summary.overallScore > 60 ? '#f57c00' : '#d32f2f'}; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Test Report</h1>
        <p><strong>Generated:</strong> ${report.metadata.timestamp}</p>
        <p><strong>Duration:</strong> ${report.metadata.duration}</p>
        <div class="score">Overall Score: ${report.summary.overallScore}/100</div>
    </div>

    <h2>Summary</h2>
    <table>
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Total Tests</td><td>${report.summary.totalTests}</td></tr>
        <tr><td>Critical Issues</td><td>${report.summary.criticalIssues}</td></tr>
        <tr><td>Warnings</td><td>${report.summary.warnings}</td></tr>
    </table>

    ${report.results.analysis ? `
    <h2>Critical Issues</h2>
    ${report.results.analysis.critical_issues.map(issue => `
        <div class="metric critical">
            <strong>${issue.type.toUpperCase()}:</strong> ${issue.issue}<br>
            <em>Recommendation:</em> ${issue.recommendation}
        </div>
    `).join('')}

    <h2>Warnings</h2>
    ${report.results.analysis.warnings.map(warning => `
        <div class="metric warning">
            <strong>${warning.type.toUpperCase()}:</strong> ${warning.issue}<br>
            <em>Recommendation:</em> ${warning.recommendation}
        </div>
    `).join('')}
    ` : ''}

    <h2>Recommendations</h2>
    <ul>
        ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
    </ul>

    <h2>Detailed Results</h2>
    <pre>${JSON.stringify(report.results, null, 2)}</pre>
</body>
</html>
    `;
  }

  /**
   * Run all performance tests
   */
  async runAllTests() {
    console.log('🚀 Starting Comprehensive Performance Testing Suite...');
    console.log(`Output directory: ${this.config.outputDir}`);

    try {
      // Run all test suites
      await this.runDatabaseBenchmarks();
      await this.runRedisBenchmarks();
      await this.runLoadTests();
      await this.runLighthouseAudits();

      // Analyze results
      this.analyzeBottlenecks();

      // Generate report
      const report = this.generateReport();

      console.log('\n🎉 Performance testing completed!');
      console.log(`Overall Score: ${report.summary.overallScore}/100`);
      
      if (report.summary.criticalIssues > 0) {
        console.log(`⚠️ Found ${report.summary.criticalIssues} critical issues that need immediate attention`);
      }
      
      if (report.summary.warnings > 0) {
        console.log(`⚠️ Found ${report.summary.warnings} warnings that should be addressed`);
      }

      return report;
    } catch (error) {
      console.error('❌ Performance testing failed:', error);
      throw error;
    }
  }
}

// Export for use as module
export default PerformanceTestRunner;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new PerformanceTestRunner();
  runner.runAllTests()
    .then(report => {
      console.log('Performance testing completed successfully');
      process.exit(report.summary.criticalIssues > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Performance testing failed:', error);
      process.exit(1);
    });
}