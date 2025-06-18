/**
 * Lighthouse Performance Testing Runner for AUSTA Cockpit
 * Automated frontend performance testing and monitoring
 */

const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

class LighthouseRunner {
  constructor(config = {}) {
    this.config = {
      baseUrl: process.env.BASE_URL || 'http://localhost:3000',
      outputDir: config.outputDir || path.join(__dirname, '../../results/lighthouse'),
      chromeFlags: process.env.LIGHTHOUSE_CHROME_FLAGS?.split(',') || [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage'
      ],
      lighthouseConfig: {
        extends: 'lighthouse:default',
        settings: {
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'],
          formFactor: 'desktop',
          throttling: {
            rttMs: 40,
            throughputKbps: 10240,
            cpuSlowdownMultiplier: 1,
            requestLatencyMs: 0,
            downloadThroughputKbps: 0,
            uploadThroughputKbps: 0
          },
          emulatedUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      },
      ...config
    };

    this.testPages = [
      {
        name: 'login',
        url: '/login',
        description: 'Login page performance',
        auth: false
      },
      {
        name: 'dashboard',
        url: '/dashboard',
        description: 'Main dashboard performance',
        auth: true
      },
      {
        name: 'cases',
        url: '/cases',
        description: 'Cases list page performance',
        auth: true
      },
      {
        name: 'case-detail',
        url: '/cases/sample-case-id',
        description: 'Case detail page performance',
        auth: true
      },
      {
        name: 'analytics',
        url: '/analytics',
        description: 'Analytics dashboard performance',
        auth: true
      },
      {
        name: 'settings',
        url: '/settings',
        description: 'Settings page performance',
        auth: true
      }
    ];

    this.performanceThresholds = {
      performance: 90,
      accessibility: 95,
      bestPractices: 90,
      seo: 85,
      pwa: 80,
      firstContentfulPaint: 2000,
      largestContentfulPaint: 4000,
      speedIndex: 3000,
      cumulativeLayoutShift: 0.1,
      firstInputDelay: 100
    };
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

  async launchChrome() {
    return chromeLauncher.launch({
      chromeFlags: this.config.chromeFlags,
      logLevel: 'info'
    });
  }

  async runLighthouse(url, options = {}) {
    const chrome = await this.launchChrome();
    
    try {
      const result = await lighthouse(url, {
        port: chrome.port,
        ...options
      }, this.config.lighthouseConfig);
      
      return result;
    } finally {
      await chrome.kill();
    }
  }

  async authenticateUser(chrome) {
    // Note: This would need to be implemented based on your authentication flow
    // For now, we'll simulate authentication by setting cookies or localStorage
    console.log('Authentication simulation - implement based on your auth flow');
    
    return {
      cookies: [
        {
          name: 'auth_token',
          value: 'simulated_token_for_testing',
          domain: new URL(this.config.baseUrl).hostname
        }
      ]
    };
  }

  async runTestSuite() {
    console.log('Starting Lighthouse performance test suite...');
    await this.ensureOutputDir();

    const results = [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    for (const page of this.testPages) {
      console.log(`Testing ${page.name}: ${page.description}`);
      
      try {
        const fullUrl = `${this.config.baseUrl}${page.url}`;
        const options = {};
        
        // Add authentication if required
        if (page.auth) {
          const authData = await this.authenticateUser();
          if (authData.cookies) {
            options.extraHeaders = {
              'Cookie': authData.cookies.map(c => `${c.name}=${c.value}`).join('; ')
            };
          }
        }

        const result = await this.runLighthouse(fullUrl, options);
        
        // Extract key metrics
        const metrics = this.extractMetrics(result);
        const pageResult = {
          page: page.name,
          url: fullUrl,
          timestamp: new Date().toISOString(),
          scores: metrics.scores,
          metrics: metrics.performanceMetrics,
          diagnostics: metrics.diagnostics,
          opportunities: metrics.opportunities,
          passed: this.checkThresholds(metrics.scores, metrics.performanceMetrics)
        };

        results.push(pageResult);

        // Save individual report
        const reportPath = path.join(
          this.config.outputDir,
          `${page.name}-${timestamp}.html`
        );
        await writeFile(reportPath, result.report);
        
        console.log(`✓ ${page.name} test completed. Report saved to: ${reportPath}`);
        
      } catch (error) {
        console.error(`✗ Error testing ${page.name}:`, error.message);
        results.push({
          page: page.name,
          url: `${this.config.baseUrl}${page.url}`,
          timestamp: new Date().toISOString(),
          error: error.message,
          passed: false
        });
      }
    }

    // Generate summary report
    const summaryReport = this.generateSummaryReport(results);
    const summaryPath = path.join(
      this.config.outputDir,
      `summary-${timestamp}.json`
    );
    await writeFile(summaryPath, JSON.stringify(summaryReport, null, 2));

    console.log('\nLighthouse test suite completed!');
    console.log(`Summary report saved to: ${summaryPath}`);
    
    return summaryReport;
  }

  extractMetrics(lighthouseResult) {
    const { lhr } = lighthouseResult;
    
    return {
      scores: {
        performance: Math.round(lhr.categories.performance.score * 100),
        accessibility: Math.round(lhr.categories.accessibility.score * 100),
        bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
        seo: Math.round(lhr.categories.seo.score * 100),
        pwa: lhr.categories.pwa ? Math.round(lhr.categories.pwa.score * 100) : null
      },
      performanceMetrics: {
        firstContentfulPaint: lhr.audits['first-contentful-paint'].numericValue,
        largestContentfulPaint: lhr.audits['largest-contentful-paint'].numericValue,
        speedIndex: lhr.audits['speed-index'].numericValue,
        cumulativeLayoutShift: lhr.audits['cumulative-layout-shift'].numericValue,
        firstInputDelay: lhr.audits['max-potential-fid']?.numericValue || 0,
        totalBlockingTime: lhr.audits['total-blocking-time'].numericValue,
        timeToInteractive: lhr.audits['interactive'].numericValue
      },
      diagnostics: {
        mainThreadWorkBreakdown: lhr.audits['main-thread-tasks'].details?.items || [],
        unusedJavaScript: lhr.audits['unused-javascript'].details?.items || [],
        unusedCSS: lhr.audits['unused-css-rules'].details?.items || [],
        imageOptimization: lhr.audits['uses-optimized-images'].details?.items || []
      },
      opportunities: Object.values(lhr.audits)
        .filter(audit => audit.details?.type === 'opportunity')
        .map(audit => ({
          id: audit.id,
          title: audit.title,
          description: audit.description,
          numericValue: audit.numericValue,
          displayValue: audit.displayValue
        }))
    };
  }

  checkThresholds(scores, metrics) {
    const failures = [];
    
    // Check score thresholds
    if (scores.performance < this.performanceThresholds.performance) {
      failures.push(`Performance score ${scores.performance} below threshold ${this.performanceThresholds.performance}`);
    }
    if (scores.accessibility < this.performanceThresholds.accessibility) {
      failures.push(`Accessibility score ${scores.accessibility} below threshold ${this.performanceThresholds.accessibility}`);
    }
    if (scores.bestPractices < this.performanceThresholds.bestPractices) {
      failures.push(`Best practices score ${scores.bestPractices} below threshold ${this.performanceThresholds.bestPractices}`);
    }
    if (scores.seo < this.performanceThresholds.seo) {
      failures.push(`SEO score ${scores.seo} below threshold ${this.performanceThresholds.seo}`);
    }

    // Check performance metrics thresholds
    if (metrics.firstContentfulPaint > this.performanceThresholds.firstContentfulPaint) {
      failures.push(`FCP ${metrics.firstContentfulPaint}ms above threshold ${this.performanceThresholds.firstContentfulPaint}ms`);
    }
    if (metrics.largestContentfulPaint > this.performanceThresholds.largestContentfulPaint) {
      failures.push(`LCP ${metrics.largestContentfulPaint}ms above threshold ${this.performanceThresholds.largestContentfulPaint}ms`);
    }
    if (metrics.speedIndex > this.performanceThresholds.speedIndex) {
      failures.push(`Speed Index ${metrics.speedIndex}ms above threshold ${this.performanceThresholds.speedIndex}ms`);
    }
    if (metrics.cumulativeLayoutShift > this.performanceThresholds.cumulativeLayoutShift) {
      failures.push(`CLS ${metrics.cumulativeLayoutShift} above threshold ${this.performanceThresholds.cumulativeLayoutShift}`);
    }

    return {
      passed: failures.length === 0,
      failures: failures
    };
  }

  generateSummaryReport(results) {
    const summary = {
      timestamp: new Date().toISOString(),
      totalTests: results.length,
      passedTests: results.filter(r => r.passed).length,
      failedTests: results.filter(r => !r.passed).length,
      results: results,
      overallMetrics: {
        averagePerformanceScore: 0,
        averageAccessibilityScore: 0,
        averageBestPracticesScore: 0,
        averageSEOScore: 0,
        averageFCP: 0,
        averageLCP: 0,
        averageSpeedIndex: 0
      },
      recommendations: []
    };

    // Calculate averages
    const validResults = results.filter(r => r.scores);
    if (validResults.length > 0) {
      summary.overallMetrics.averagePerformanceScore = Math.round(
        validResults.reduce((sum, r) => sum + r.scores.performance, 0) / validResults.length
      );
      summary.overallMetrics.averageAccessibilityScore = Math.round(
        validResults.reduce((sum, r) => sum + r.scores.accessibility, 0) / validResults.length
      );
      summary.overallMetrics.averageBestPracticesScore = Math.round(
        validResults.reduce((sum, r) => sum + r.scores.bestPractices, 0) / validResults.length
      );
      summary.overallMetrics.averageSEOScore = Math.round(
        validResults.reduce((sum, r) => sum + r.scores.seo, 0) / validResults.length
      );
      summary.overallMetrics.averageFCP = Math.round(
        validResults.reduce((sum, r) => sum + r.metrics.firstContentfulPaint, 0) / validResults.length
      );
      summary.overallMetrics.averageLCP = Math.round(
        validResults.reduce((sum, r) => sum + r.metrics.largestContentfulPaint, 0) / validResults.length
      );
      summary.overallMetrics.averageSpeedIndex = Math.round(
        validResults.reduce((sum, r) => sum + r.metrics.speedIndex, 0) / validResults.length
      );
    }

    // Generate recommendations
    if (summary.overallMetrics.averagePerformanceScore < 90) {
      summary.recommendations.push('Consider optimizing images and reducing JavaScript bundle size');
    }
    if (summary.overallMetrics.averageFCP > 2000) {
      summary.recommendations.push('Implement critical CSS inlining and resource preloading');
    }
    if (summary.overallMetrics.averageLCP > 4000) {
      summary.recommendations.push('Optimize largest contentful paint by improving server response times');
    }

    return summary;
  }

  async runContinuousMonitoring(intervalMinutes = 60) {
    console.log(`Starting continuous Lighthouse monitoring (every ${intervalMinutes} minutes)...`);
    
    const runTests = async () => {
      try {
        const results = await this.runTestSuite();
        
        // Check for performance degradation
        const performanceAlert = results.results.some(r => 
          r.scores && r.scores.performance < this.performanceThresholds.performance
        );
        
        if (performanceAlert) {
          console.warn('⚠️ Performance degradation detected!');
          // Here you could send alerts to Slack, email, etc.
        }
        
        return results;
      } catch (error) {
        console.error('Error in continuous monitoring:', error);
      }
    };

    // Run initial test
    await runTests();
    
    // Schedule periodic tests
    setInterval(runTests, intervalMinutes * 60 * 1000);
  }
}

// CLI interface
if (require.main === module) {
  const runner = new LighthouseRunner();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'run':
      runner.runTestSuite()
        .then(results => {
          console.log('\n=== Lighthouse Test Results ===');
          console.log(`Total tests: ${results.totalTests}`);
          console.log(`Passed: ${results.passedTests}`);
          console.log(`Failed: ${results.failedTests}`);
          console.log(`Average Performance Score: ${results.overallMetrics.averagePerformanceScore}`);
          
          if (results.failedTests > 0) {
            process.exit(1);
          }
        })
        .catch(error => {
          console.error('Error running Lighthouse tests:', error);
          process.exit(1);
        });
      break;
      
    case 'monitor':
      const interval = parseInt(process.argv[3]) || 60;
      runner.runContinuousMonitoring(interval);
      break;
      
    default:
      console.log('Usage: node lighthouse-runner.js [run|monitor] [interval_minutes]');
      console.log('  run: Run Lighthouse tests once');
      console.log('  monitor: Run continuous monitoring (default: every 60 minutes)');
      break;
  }
}

module.exports = LighthouseRunner;