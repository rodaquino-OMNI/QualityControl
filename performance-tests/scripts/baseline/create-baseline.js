/**
 * Performance Baseline Creator for AUSTA Cockpit
 * Establishes performance baselines and SLA definitions
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

class BaselineCreator {
  constructor(config = {}) {
    this.config = {
      targets: {
        backend: process.env.API_URL || 'http://localhost:8000',
        frontend: process.env.BASE_URL || 'http://localhost:3000',
        aiService: process.env.AI_SERVICE_URL || 'http://localhost:8001'
      },
      baseline: {
        iterations: config.iterations || 50,
        warmupIterations: config.warmupIterations || 10,
        timeout: config.timeout || 10000,
        concurrency: config.concurrency || 1
      },
      outputDir: config.outputDir || path.join(__dirname, '../../baselines'),
      ...config
    };

    this.testScenarios = [
      {
        name: 'user_authentication',
        description: 'User login and profile access',
        category: 'authentication',
        weight: 'high',
        tests: [
          { name: 'login', endpoint: '/api/auth/login', method: 'POST', payload: { email: 'admin@austa.com', password: 'admin123' } },
          { name: 'profile', endpoint: '/api/auth/profile', method: 'GET', requiresAuth: true },
          { name: 'logout', endpoint: '/api/auth/logout', method: 'POST', requiresAuth: true }
        ]
      },
      {
        name: 'case_management',
        description: 'Case creation and processing operations',
        category: 'core_functionality',
        weight: 'critical',
        tests: [
          { name: 'create_case', endpoint: '/api/cases', method: 'POST', requiresAuth: true, payload: this.generateCasePayload() },
          { name: 'get_cases', endpoint: '/api/cases', method: 'GET', requiresAuth: true },
          { name: 'get_case_detail', endpoint: '/api/cases/{id}', method: 'GET', requiresAuth: true, dynamic: true },
          { name: 'update_case', endpoint: '/api/cases/{id}', method: 'PUT', requiresAuth: true, dynamic: true, payload: { status: 'in_progress' } }
        ]
      },
      {
        name: 'ai_services',
        description: 'AI analysis and processing',
        category: 'ai_functionality',
        weight: 'high',
        tests: [
          { name: 'ai_analysis', endpoint: '/api/analyze', method: 'POST', baseUrl: 'aiService', payload: this.generateAIPayload() },
          { name: 'ai_chat', endpoint: '/api/chat', method: 'POST', baseUrl: 'aiService', payload: { query: 'What is the risk level?', context: { type: 'fraud_detection' } } }
        ]
      },
      {
        name: 'dashboard_analytics',
        description: 'Dashboard and analytics operations',
        category: 'analytics',
        weight: 'medium',
        tests: [
          { name: 'dashboard_overview', endpoint: '/api/dashboard/overview', method: 'GET', requiresAuth: true },
          { name: 'analytics_performance', endpoint: '/api/analytics/performance', method: 'GET', requiresAuth: true },
          { name: 'fraud_detection_metrics', endpoint: '/api/analytics/fraud-detection', method: 'GET', requiresAuth: true }
        ]
      },
      {
        name: 'search_operations',
        description: 'Search and filtering functionality',
        category: 'search',
        weight: 'medium',
        tests: [
          { name: 'case_search', endpoint: '/api/search/cases', method: 'POST', requiresAuth: true, payload: { query: 'fraud', filters: { status: ['open'] } } },
          { name: 'advanced_search', endpoint: '/api/search/advanced', method: 'POST', requiresAuth: true, payload: { query: { bool: { must: [{ term: { status: 'open' } }] } } } }
        ]
      }
    ];

    this.slaRequirements = {
      authentication: {
        response_time_p95: 1000,
        response_time_p99: 2000,
        availability: 99.9,
        error_rate: 0.1
      },
      core_functionality: {
        response_time_p95: 2000,
        response_time_p99: 5000,
        availability: 99.8,
        error_rate: 0.5
      },
      ai_functionality: {
        response_time_p95: 8000,
        response_time_p99: 15000,
        availability: 99.5,
        error_rate: 1.0
      },
      analytics: {
        response_time_p95: 3000,
        response_time_p99: 8000,
        availability: 99.0,
        error_rate: 1.0
      },
      search: {
        response_time_p95: 2000,
        response_time_p99: 5000,
        availability: 99.5,
        error_rate: 0.5
      }
    };
  }

  generateCasePayload() {
    return {
      type: 'fraud_detection',
      title: `Baseline Test Case ${Date.now()}`,
      description: 'Performance baseline test case',
      priority: 'medium',
      category: 'financial',
      amount: 25000,
      currency: 'USD',
      suspicious_patterns: ['unusual_transaction_time', 'high_amount'],
      metadata: { source: 'baseline_test' }
    };
  }

  generateAIPayload() {
    return {
      type: 'fraud_detection',
      data: {
        transaction_amount: 15000,
        transaction_time: new Date().toISOString(),
        merchant_category: 'high_risk',
        user_behavior: 'suspicious',
        device_fingerprint: 'unknown_device'
      }
    };
  }

  async createBaseline() {
    console.log('Creating performance baseline for AUSTA Cockpit...');
    await this.ensureOutputDir();

    const baselineResults = {
      metadata: {
        created: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        configuration: {
          iterations: this.config.baseline.iterations,
          warmupIterations: this.config.baseline.warmupIterations,
          timeout: this.config.baseline.timeout
        }
      },
      sla_requirements: this.slaRequirements,
      scenarios: []
    };

    // Authenticate once for tests that require it
    const authToken = await this.authenticate();

    for (const scenario of this.testScenarios) {
      console.log(`\nRunning baseline tests for: ${scenario.name}`);
      
      const scenarioResults = {
        name: scenario.name,
        description: scenario.description,
        category: scenario.category,
        weight: scenario.weight,
        tests: []
      };

      for (const test of scenario.tests) {
        console.log(`  Testing: ${test.name}`);
        
        try {
          const testResults = await this.runBaselineTest(test, authToken);
          scenarioResults.tests.push(testResults);
          
          console.log(`    ✓ ${test.name}: ${testResults.baseline_metrics.p95}ms (p95)`);
        } catch (error) {
          console.error(`    ✗ ${test.name}: ${error.message}`);
          scenarioResults.tests.push({
            name: test.name,
            error: error.message,
            baseline_metrics: null
          });
        }
      }

      baselineResults.scenarios.push(scenarioResults);
    }

    // Calculate overall baseline metrics
    baselineResults.overall_baseline = this.calculateOverallBaseline(baselineResults.scenarios);

    // Save baseline results
    const baselineFile = path.join(this.config.outputDir, `baseline-${Date.now()}.json`);
    await writeFile(baselineFile, JSON.stringify(baselineResults, null, 2));

    // Save as current baseline
    const currentBaselineFile = path.join(this.config.outputDir, 'current-baseline.json');
    await writeFile(currentBaselineFile, JSON.stringify(baselineResults, null, 2));

    console.log(`\nBaseline created successfully!`);
    console.log(`Baseline file: ${baselineFile}`);
    console.log(`Current baseline: ${currentBaselineFile}`);

    // Generate baseline report
    const report = this.generateBaselineReport(baselineResults);
    const reportFile = path.join(this.config.outputDir, `baseline-report-${Date.now()}.md`);
    await writeFile(reportFile, report);
    console.log(`Baseline report: ${reportFile}`);

    return baselineResults;
  }

  async authenticate() {
    try {
      const response = await axios.post(`${this.config.targets.backend}/api/auth/login`, {
        email: 'admin@austa.com',
        password: 'admin123'
      }, {
        timeout: this.config.baseline.timeout
      });

      if (response.status === 200 && response.data.token) {
        return response.data.token;
      }
    } catch (error) {
      console.error('Authentication failed:', error.message);
    }
    
    return null;
  }

  async runBaselineTest(test, authToken) {
    const baseUrl = test.baseUrl ? this.config.targets[test.baseUrl] : this.config.targets.backend;
    let endpoint = test.endpoint;
    let testId = null;

    // Handle dynamic endpoints (e.g., with {id})
    if (test.dynamic && endpoint.includes('{id}')) {
      if (test.name.includes('case')) {
        // Create a case first to get an ID
        const caseResponse = await axios.post(`${this.config.targets.backend}/api/cases`, 
          this.generateCasePayload(),
          {
            headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
            timeout: this.config.baseline.timeout
          }
        );
        testId = caseResponse.data.id;
        endpoint = endpoint.replace('{id}', testId);
      }
    }

    const measurements = [];
    const errors = [];

    // Warmup iterations
    console.log(`    Warming up (${this.config.baseline.warmupIterations} iterations)...`);
    for (let i = 0; i < this.config.baseline.warmupIterations; i++) {
      try {
        await this.executeRequest(baseUrl + endpoint, test, authToken);
      } catch (error) {
        // Ignore warmup errors
      }
    }

    // Actual measurements
    console.log(`    Measuring performance (${this.config.baseline.iterations} iterations)...`);
    for (let i = 0; i < this.config.baseline.iterations; i++) {
      try {
        const startTime = Date.now();
        const response = await this.executeRequest(baseUrl + endpoint, test, authToken);
        const endTime = Date.now();
        
        const measurement = {
          iteration: i + 1,
          response_time: endTime - startTime,
          status_code: response.status,
          success: response.status >= 200 && response.status < 400,
          response_size: JSON.stringify(response.data).length
        };
        
        measurements.push(measurement);
        
      } catch (error) {
        errors.push({
          iteration: i + 1,
          error: error.message,
          response_time: this.config.baseline.timeout
        });
      }
    }

    // Calculate baseline metrics
    const successfulMeasurements = measurements.filter(m => m.success);
    const responseTimes = successfulMeasurements.map(m => m.response_time);
    responseTimes.sort((a, b) => a - b);

    const baselineMetrics = {
      total_iterations: this.config.baseline.iterations,
      successful_iterations: successfulMeasurements.length,
      error_count: errors.length,
      error_rate: (errors.length / this.config.baseline.iterations) * 100,
      min: responseTimes.length > 0 ? Math.min(...responseTimes) : null,
      max: responseTimes.length > 0 ? Math.max(...responseTimes) : null,
      mean: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null,
      median: responseTimes.length > 0 ? this.percentile(responseTimes, 50) : null,
      p90: responseTimes.length > 0 ? this.percentile(responseTimes, 90) : null,
      p95: responseTimes.length > 0 ? this.percentile(responseTimes, 95) : null,
      p99: responseTimes.length > 0 ? this.percentile(responseTimes, 99) : null,
      std_dev: responseTimes.length > 0 ? this.standardDeviation(responseTimes) : null
    };

    return {
      name: test.name,
      endpoint: test.endpoint,
      method: test.method,
      baseline_metrics: baselineMetrics,
      measurements: measurements,
      errors: errors,
      timestamp: new Date().toISOString()
    };
  }

  async executeRequest(url, test, authToken) {
    const config = {
      method: test.method.toLowerCase(),
      url: url,
      timeout: this.config.baseline.timeout,
      headers: {}
    };

    if (test.requiresAuth && authToken) {
      config.headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (test.payload) {
      config.headers['Content-Type'] = 'application/json';
      config.data = test.payload;
    }

    return axios(config);
  }

  percentile(arr, p) {
    if (arr.length === 0) return null;
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  }

  standardDeviation(arr) {
    if (arr.length === 0) return null;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  calculateOverallBaseline(scenarios) {
    const allTests = scenarios.flatMap(s => s.tests.filter(t => t.baseline_metrics));
    
    if (allTests.length === 0) {
      return null;
    }

    const categoryStats = {};
    
    // Calculate stats by category
    scenarios.forEach(scenario => {
      const categoryTests = scenario.tests.filter(t => t.baseline_metrics);
      if (categoryTests.length === 0) return;

      const responseTimes = categoryTests.map(t => t.baseline_metrics.p95).filter(t => t !== null);
      const errorRates = categoryTests.map(t => t.baseline_metrics.error_rate);

      categoryStats[scenario.category] = {
        test_count: categoryTests.length,
        avg_p95_response_time: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null,
        max_p95_response_time: responseTimes.length > 0 ? Math.max(...responseTimes) : null,
        avg_error_rate: errorRates.reduce((a, b) => a + b, 0) / errorRates.length,
        max_error_rate: Math.max(...errorRates)
      };
    });

    return {
      total_tests: allTests.length,
      category_statistics: categoryStats,
      sla_compliance: this.checkSLACompliance(scenarios)
    };
  }

  checkSLACompliance(scenarios) {
    const compliance = {};

    scenarios.forEach(scenario => {
      const sla = this.slaRequirements[scenario.category];
      if (!sla) return;

      const tests = scenario.tests.filter(t => t.baseline_metrics);
      if (tests.length === 0) return;

      const avgP95 = tests.reduce((sum, t) => sum + (t.baseline_metrics.p95 || 0), 0) / tests.length;
      const maxP99 = Math.max(...tests.map(t => t.baseline_metrics.p99 || 0));
      const avgErrorRate = tests.reduce((sum, t) => sum + t.baseline_metrics.error_rate, 0) / tests.length;

      compliance[scenario.category] = {
        response_time_p95_compliant: avgP95 <= sla.response_time_p95,
        response_time_p99_compliant: maxP99 <= sla.response_time_p99,
        error_rate_compliant: avgErrorRate <= sla.error_rate,
        baseline_p95: Math.round(avgP95),
        baseline_p99: Math.round(maxP99),
        baseline_error_rate: Math.round(avgErrorRate * 100) / 100,
        sla_p95: sla.response_time_p95,
        sla_p99: sla.response_time_p99,
        sla_error_rate: sla.error_rate
      };
    });

    return compliance;
  }

  generateBaselineReport(baselineResults) {
    let report = `# AUSTA Cockpit Performance Baseline Report\n\n`;
    report += `**Generated:** ${baselineResults.metadata.created}\n`;
    report += `**Environment:** ${baselineResults.metadata.environment}\n`;
    report += `**Iterations:** ${baselineResults.metadata.configuration.iterations}\n\n`;

    report += `## Executive Summary\n\n`;
    if (baselineResults.overall_baseline) {
      report += `- **Total Tests:** ${baselineResults.overall_baseline.total_tests}\n`;
      report += `- **Categories Tested:** ${Object.keys(baselineResults.overall_baseline.category_statistics).length}\n`;
    }

    report += `\n## SLA Requirements vs Baseline Performance\n\n`;
    report += `| Category | SLA P95 (ms) | Baseline P95 (ms) | Status | SLA Error Rate (%) | Baseline Error Rate (%) | Status |\n`;
    report += `|----------|--------------|-------------------|--------|--------------------|-------------------------|--------|\n`;

    if (baselineResults.overall_baseline && baselineResults.overall_baseline.sla_compliance) {
      Object.entries(baselineResults.overall_baseline.sla_compliance).forEach(([category, compliance]) => {
        const p95Status = compliance.response_time_p95_compliant ? '✅ Pass' : '❌ Fail';
        const errorStatus = compliance.error_rate_compliant ? '✅ Pass' : '❌ Fail';
        
        report += `| ${category} | ${compliance.sla_p95} | ${compliance.baseline_p95} | ${p95Status} | ${compliance.sla_error_rate} | ${compliance.baseline_error_rate} | ${errorStatus} |\n`;
      });
    }

    report += `\n## Detailed Test Results\n\n`;

    baselineResults.scenarios.forEach(scenario => {
      report += `### ${scenario.name} (${scenario.category})\n\n`;
      report += `**Description:** ${scenario.description}\n`;
      report += `**Weight:** ${scenario.weight}\n\n`;

      report += `| Test | P95 (ms) | P99 (ms) | Mean (ms) | Error Rate (%) | Status |\n`;
      report += `|------|----------|----------|-----------|----------------|--------|\n`;

      scenario.tests.forEach(test => {
        if (test.baseline_metrics) {
          const metrics = test.baseline_metrics;
          const status = metrics.error_rate < 5 ? '✅ Good' : '⚠️ Poor';
          
          report += `| ${test.name} | ${Math.round(metrics.p95 || 0)} | ${Math.round(metrics.p99 || 0)} | ${Math.round(metrics.mean || 0)} | ${Math.round(metrics.error_rate * 100) / 100} | ${status} |\n`;
        } else {
          report += `| ${test.name} | - | - | - | - | ❌ Error |\n`;
        }
      });

      report += `\n`;
    });

    report += `## Recommendations\n\n`;
    
    if (baselineResults.overall_baseline && baselineResults.overall_baseline.sla_compliance) {
      const nonCompliant = Object.entries(baselineResults.overall_baseline.sla_compliance)
        .filter(([_, compliance]) => !compliance.response_time_p95_compliant || !compliance.error_rate_compliant);

      if (nonCompliant.length > 0) {
        report += `**⚠️ SLA Compliance Issues:**\n`;
        nonCompliant.forEach(([category, compliance]) => {
          if (!compliance.response_time_p95_compliant) {
            report += `- ${category}: Response time P95 (${compliance.baseline_p95}ms) exceeds SLA (${compliance.sla_p95}ms)\n`;
          }
          if (!compliance.error_rate_compliant) {
            report += `- ${category}: Error rate (${compliance.baseline_error_rate}%) exceeds SLA (${compliance.sla_error_rate}%)\n`;
          }
        });
        report += `\n`;
      } else {
        report += `✅ All categories meet SLA requirements.\n\n`;
      }
    }

    report += `**Performance Optimization Suggestions:**\n`;
    report += `- Monitor response times during peak usage\n`;
    report += `- Set up automated alerts for SLA threshold breaches\n`;
    report += `- Regular performance regression testing\n`;
    report += `- Database query optimization for slower endpoints\n`;
    report += `- Consider caching for frequently accessed data\n`;

    return report;
  }

  async ensureOutputDir() {
    try {
      await mkdir(this.config.outputDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async loadCurrentBaseline() {
    try {
      const baselineFile = path.join(this.config.outputDir, 'current-baseline.json');
      const data = await fs.promises.readFile(baselineFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async compareWithBaseline(testResults) {
    const currentBaseline = await this.loadCurrentBaseline();
    if (!currentBaseline) {
      return { comparison: 'no_baseline', message: 'No baseline available for comparison' };
    }

    // Implementation for comparing current test results with baseline
    // This would be used in regression testing
    return {
      comparison: 'compared',
      baseline_date: currentBaseline.metadata.created,
      // Additional comparison results...
    };
  }
}

// CLI interface
if (require.main === module) {
  const creator = new BaselineCreator();

  const command = process.argv[2];

  switch (command) {
    case 'create':
      creator.createBaseline()
        .then(results => {
          console.log('\n✅ Baseline creation completed successfully!');
          process.exit(0);
        })
        .catch(error => {
          console.error('❌ Baseline creation failed:', error);
          process.exit(1);
        });
      break;

    case 'compare':
      // Placeholder for comparison functionality
      console.log('Comparison functionality - implement with test results');
      break;

    default:
      console.log('Usage: node create-baseline.js [create|compare]');
      console.log('  create: Create new performance baseline');
      console.log('  compare: Compare results with current baseline');
      break;
  }
}

module.exports = BaselineCreator;