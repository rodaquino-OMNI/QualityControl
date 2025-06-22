/**
 * Enhanced Lighthouse Performance Testing
 * Comprehensive frontend performance auditing with detailed analysis
 */

import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnhancedLighthouseRunner {
  constructor(config = {}) {
    this.config = {
      outputDir: config.outputDir || path.join(__dirname, '../reports/lighthouse'),
      urls: config.urls || [
        'http://localhost:3000',
        'http://localhost:3000/dashboard',
        'http://localhost:3000/cases',
        'http://localhost:3000/analytics'
      ],
      devices: config.devices || ['desktop', 'mobile'],
      categories: config.categories || [
        'performance',
        'accessibility',
        'best-practices',
        'seo',
        'pwa'
      ],
      runs: config.runs || 3, // Multiple runs for statistical significance
      throttling: config.throttling || 'simulated3G'
    };

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Run comprehensive Lighthouse audits
   */
  async runComprehensiveAudits() {
    console.log('🚀 Starting Enhanced Lighthouse Performance Audits...');
    console.log(`📱 Testing devices: ${this.config.devices.join(', ')}`);
    console.log(`🌐 Testing ${this.config.urls.length} URLs`);
    console.log(`🔄 Running ${this.config.runs} iterations per URL/device combination`);

    const results = {
      timestamp: new Date().toISOString(),
      config: this.config,
      audits: [],
      summary: {},
      recommendations: []
    };

    try {
      // Launch browser
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      });

      for (const device of this.config.devices) {
        for (const url of this.config.urls) {
          console.log(`\n🔍 Testing ${url} on ${device}...`);
          
          const urlResults = await this.auditUrl(browser, url, device);
          results.audits.push(urlResults);
        }
      }

      await browser.close();

      // Generate analysis and recommendations
      results.summary = this.generateSummary(results.audits);
      results.recommendations = this.generateRecommendations(results.audits);

      // Save results
      await this.saveResults(results);

      console.log('\n✅ Lighthouse audits completed successfully!');
      console.log(`📊 Performance Score: ${results.summary.averagePerformance}/100`);
      console.log(`♿ Accessibility Score: ${results.summary.averageAccessibility}/100`);
      console.log(`📋 Best Practices Score: ${results.summary.averageBestPractices}/100`);

      return results;
    } catch (error) {
      console.error('❌ Lighthouse audits failed:', error);
      throw error;
    }
  }

  /**
   * Audit a specific URL on a specific device
   */
  async auditUrl(browser, url, device) {
    const urlResults = {
      url,
      device,
      runs: [],
      averages: {},
      metrics: {}
    };

    for (let run = 1; run <= this.config.runs; run++) {
      console.log(`  Run ${run}/${this.config.runs}...`);
      
      try {
        const runResult = await this.performSingleAudit(browser, url, device, run);
        urlResults.runs.push(runResult);
      } catch (error) {
        console.error(`    Run ${run} failed:`, error.message);
        urlResults.runs.push({ run, error: error.message });
      }
    }

    // Calculate averages
    urlResults.averages = this.calculateAverages(urlResults.runs);
    urlResults.metrics = this.extractKeyMetrics(urlResults.runs);

    return urlResults;
  }

  /**
   * Perform a single Lighthouse audit
   */
  async performSingleAudit(browser, url, device, run) {
    const page = await browser.newPage();

    try {
      // Configure device emulation
      if (device === 'mobile') {
        await page.emulate(puppeteer.devices['iPhone 12']);
      } else {
        await page.setViewport({ width: 1920, height: 1080 });
      }

      // Lighthouse configuration
      const config = {
        extends: 'lighthouse:default',
        settings: {
          onlyCategories: this.config.categories,
          throttling: this.getThrottlingConfig(),
          emulatedFormFactor: device,
          skipAudits: ['screenshot-thumbnails'],
          maxWaitForLoad: 45000
        }
      };

      const options = {
        port: new URL(page.target()._targetInfo.url).port,
        disableStorageReset: false
      };

      // Run Lighthouse
      const runnerResult = await lighthouse(url, options, config);
      
      if (!runnerResult || !runnerResult.lhr) {
        throw new Error('Lighthouse audit failed to produce results');
      }

      const lhr = runnerResult.lhr;

      // Extract detailed metrics
      const result = {
        run,
        timestamp: new Date().toISOString(),
        scores: {
          performance: Math.round(lhr.categories.performance?.score * 100) || 0,
          accessibility: Math.round(lhr.categories.accessibility?.score * 100) || 0,
          bestPractices: Math.round(lhr.categories['best-practices']?.score * 100) || 0,
          seo: Math.round(lhr.categories.seo?.score * 100) || 0,
          pwa: Math.round(lhr.categories.pwa?.score * 100) || 0
        },
        metrics: {
          firstContentfulPaint: lhr.audits['first-contentful-paint']?.numericValue || 0,
          largestContentfulPaint: lhr.audits['largest-contentful-paint']?.numericValue || 0,
          cumulativeLayoutShift: lhr.audits['cumulative-layout-shift']?.numericValue || 0,
          totalBlockingTime: lhr.audits['total-blocking-time']?.numericValue || 0,
          speedIndex: lhr.audits['speed-index']?.numericValue || 0,
          interactive: lhr.audits['interactive']?.numericValue || 0
        },
        opportunities: this.extractOpportunities(lhr),
        diagnostics: this.extractDiagnostics(lhr),
        resources: this.analyzeResources(lhr)
      };

      return result;
    } finally {
      await page.close();
    }
  }

  /**
   * Get throttling configuration
   */
  getThrottlingConfig() {
    const throttlingConfigs = {
      simulated3G: {
        rttMs: 300,
        throughputKbps: 1.6 * 1024,
        cpuSlowdownMultiplier: 4,
        requestLatencyMs: 300,
        downloadThroughputKbps: 1.6 * 1024,
        uploadThroughputKbps: 750
      },
      simulatedSlow4G: {
        rttMs: 150,
        throughputKbps: 1.6 * 1024,
        cpuSlowdownMultiplier: 4,
        requestLatencyMs: 150,
        downloadThroughputKbps: 1.6 * 1024,
        uploadThroughputKbps: 750
      },
      none: null
    };

    return throttlingConfigs[this.config.throttling] || throttlingConfigs.simulated3G;
  }

  /**
   * Extract performance opportunities
   */
  extractOpportunities(lhr) {
    const opportunities = [];
    
    const opportunityAudits = [
      'render-blocking-resources',
      'unused-css-rules',
      'unused-javascript',
      'modern-image-formats',
      'offscreen-images',
      'unminified-css',
      'unminified-javascript',
      'efficient-animated-content',
      'uses-text-compression',
      'uses-responsive-images'
    ];

    opportunityAudits.forEach(auditId => {
      const audit = lhr.audits[auditId];
      if (audit && audit.details && audit.details.overallSavingsMs > 0) {
        opportunities.push({
          id: auditId,
          title: audit.title,
          description: audit.description,
          savingsMs: audit.details.overallSavingsMs,
          savingsBytes: audit.details.overallSavingsBytes || 0,
          score: audit.score
        });
      }
    });

    return opportunities.sort((a, b) => b.savingsMs - a.savingsMs);
  }

  /**
   * Extract diagnostics information
   */
  extractDiagnostics(lhr) {
    const diagnostics = [];
    
    const diagnosticAudits = [
      'mainthread-work-breakdown',
      'bootup-time',
      'uses-long-cache-ttl',
      'total-byte-weight',
      'dom-size',
      'critical-request-chains',
      'user-timing',
      'third-party-summary'
    ];

    diagnosticAudits.forEach(auditId => {
      const audit = lhr.audits[auditId];
      if (audit) {
        diagnostics.push({
          id: auditId,
          title: audit.title,
          description: audit.description,
          displayValue: audit.displayValue,
          score: audit.score,
          details: audit.details
        });
      }
    });

    return diagnostics;
  }

  /**
   * Analyze resource loading
   */
  analyzeResources(lhr) {
    const resourceSummary = lhr.audits['resource-summary'];
    const networkRequests = lhr.audits['network-requests'];

    const analysis = {
      summary: {
        totalRequests: 0,
        totalBytes: 0,
        requestsByType: {},
        bytesByType: {}
      },
      largestResources: [],
      slowestResources: []
    };

    if (resourceSummary?.details?.items) {
      resourceSummary.details.items.forEach(item => {
        analysis.summary.requestsByType[item.resourceType] = item.requestCount;
        analysis.summary.bytesByType[item.resourceType] = item.transferSize;
        analysis.summary.totalRequests += item.requestCount;
        analysis.summary.totalBytes += item.transferSize;
      });
    }

    if (networkRequests?.details?.items) {
      const requests = networkRequests.details.items
        .filter(item => item.finished)
        .sort((a, b) => b.transferSize - a.transferSize);

      analysis.largestResources = requests.slice(0, 10).map(item => ({
        url: item.url,
        transferSize: item.transferSize,
        resourceType: item.resourceType,
        mimeType: item.mimeType
      }));

      analysis.slowestResources = requests
        .sort((a, b) => b.networkEndTime - a.networkRequestTime - (b.networkEndTime - a.networkRequestTime))
        .slice(0, 10)
        .map(item => ({
          url: item.url,
          loadTime: item.networkEndTime - item.networkRequestTime,
          transferSize: item.transferSize,
          resourceType: item.resourceType
        }));
    }

    return analysis;
  }

  /**
   * Calculate averages across multiple runs
   */
  calculateAverages(runs) {
    const validRuns = runs.filter(run => !run.error);
    if (validRuns.length === 0) return {};

    const averages = {
      scores: {},
      metrics: {}
    };

    // Calculate average scores
    Object.keys(validRuns[0].scores).forEach(category => {
      const sum = validRuns.reduce((acc, run) => acc + run.scores[category], 0);
      averages.scores[category] = Math.round(sum / validRuns.length);
    });

    // Calculate average metrics
    Object.keys(validRuns[0].metrics).forEach(metric => {
      const sum = validRuns.reduce((acc, run) => acc + run.metrics[metric], 0);
      averages.metrics[metric] = Math.round(sum / validRuns.length);
    });

    return averages;
  }

  /**
   * Extract key metrics for analysis
   */
  extractKeyMetrics(runs) {
    const validRuns = runs.filter(run => !run.error);
    if (validRuns.length === 0) return {};

    return {
      coreWebVitals: {
        lcp: validRuns[0]?.metrics?.largestContentfulPaint || 0,
        fid: 0, // Not directly measurable in Lighthouse
        cls: validRuns[0]?.metrics?.cumulativeLayoutShift || 0
      },
      loadingMetrics: {
        fcp: validRuns[0]?.metrics?.firstContentfulPaint || 0,
        speedIndex: validRuns[0]?.metrics?.speedIndex || 0,
        tti: validRuns[0]?.metrics?.interactive || 0,
        tbt: validRuns[0]?.metrics?.totalBlockingTime || 0
      },
      opportunitiesCount: validRuns[0]?.opportunities?.length || 0,
      totalSavingsPotential: validRuns[0]?.opportunities?.reduce((sum, opp) => sum + opp.savingsMs, 0) || 0
    };
  }

  /**
   * Generate summary statistics
   */
  generateSummary(audits) {
    const summary = {
      totalAudits: audits.length,
      deviceBreakdown: {},
      urlBreakdown: {},
      averagePerformance: 0,
      averageAccessibility: 0,
      averageBestPractices: 0,
      averageSeo: 0,
      averagePwa: 0,
      coreWebVitals: {
        lcp: { good: 0, needsImprovement: 0, poor: 0 },
        cls: { good: 0, needsImprovement: 0, poor: 0 },
        tbt: { good: 0, needsImprovement: 0, poor: 0 }
      }
    };

    // Count by device and URL
    audits.forEach(audit => {
      summary.deviceBreakdown[audit.device] = (summary.deviceBreakdown[audit.device] || 0) + 1;
      summary.urlBreakdown[audit.url] = (summary.urlBreakdown[audit.url] || 0) + 1;
    });

    // Calculate average scores
    const validAudits = audits.filter(audit => audit.averages.scores);
    if (validAudits.length > 0) {
      summary.averagePerformance = Math.round(
        validAudits.reduce((sum, audit) => sum + audit.averages.scores.performance, 0) / validAudits.length
      );
      summary.averageAccessibility = Math.round(
        validAudits.reduce((sum, audit) => sum + audit.averages.scores.accessibility, 0) / validAudits.length
      );
      summary.averageBestPractices = Math.round(
        validAudits.reduce((sum, audit) => sum + audit.averages.scores.bestPractices, 0) / validAudits.length
      );
      summary.averageSeo = Math.round(
        validAudits.reduce((sum, audit) => sum + audit.averages.scores.seo, 0) / validAudits.length
      );
      summary.averagePwa = Math.round(
        validAudits.reduce((sum, audit) => sum + audit.averages.scores.pwa, 0) / validAudits.length
      );
    }

    // Analyze Core Web Vitals
    validAudits.forEach(audit => {
      const lcp = audit.metrics.coreWebVitals?.lcp || 0;
      const cls = audit.metrics.coreWebVitals?.cls || 0;
      const tbt = audit.metrics.loadingMetrics?.tbt || 0;

      // LCP thresholds: Good <2.5s, Needs Improvement 2.5-4s, Poor >4s
      if (lcp < 2500) summary.coreWebVitals.lcp.good++;
      else if (lcp < 4000) summary.coreWebVitals.lcp.needsImprovement++;
      else summary.coreWebVitals.lcp.poor++;

      // CLS thresholds: Good <0.1, Needs Improvement 0.1-0.25, Poor >0.25
      if (cls < 0.1) summary.coreWebVitals.cls.good++;
      else if (cls < 0.25) summary.coreWebVitals.cls.needsImprovement++;
      else summary.coreWebVitals.cls.poor++;

      // TBT thresholds: Good <200ms, Needs Improvement 200-600ms, Poor >600ms
      if (tbt < 200) summary.coreWebVitals.tbt.good++;
      else if (tbt < 600) summary.coreWebVitals.tbt.needsImprovement++;
      else summary.coreWebVitals.tbt.poor++;
    });

    return summary;
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(audits) {
    const recommendations = [];
    const commonOpportunities = {};

    // Aggregate opportunities across all audits
    audits.forEach(audit => {
      if (audit.runs && audit.runs.length > 0) {
        const validRuns = audit.runs.filter(run => !run.error);
        validRuns.forEach(run => {
          if (run.opportunities) {
            run.opportunities.forEach(opp => {
              if (!commonOpportunities[opp.id]) {
                commonOpportunities[opp.id] = {
                  title: opp.title,
                  description: opp.description,
                  occurrences: 0,
                  totalSavingsMs: 0,
                  totalSavingsBytes: 0
                };
              }
              commonOpportunities[opp.id].occurrences++;
              commonOpportunities[opp.id].totalSavingsMs += opp.savingsMs;
              commonOpportunities[opp.id].totalSavingsBytes += opp.savingsBytes;
            });
          }
        });
      }
    });

    // Convert to sorted recommendations
    Object.entries(commonOpportunities)
      .sort(([,a], [,b]) => b.totalSavingsMs - a.totalSavingsMs)
      .forEach(([id, data]) => {
        recommendations.push({
          id,
          title: data.title,
          description: data.description,
          priority: data.totalSavingsMs > 1000 ? 'high' : data.totalSavingsMs > 500 ? 'medium' : 'low',
          impact: `${Math.round(data.totalSavingsMs)}ms potential savings`,
          occurrences: data.occurrences,
          implementation: this.getImplementationGuide(id)
        });
      });

    return recommendations;
  }

  /**
   * Get implementation guide for specific optimization
   */
  getImplementationGuide(opportunityId) {
    const guides = {
      'render-blocking-resources': 'Move critical CSS inline and defer non-critical CSS/JS',
      'unused-css-rules': 'Remove unused CSS rules or implement CSS purging',
      'unused-javascript': 'Remove unused JavaScript or implement code splitting',
      'modern-image-formats': 'Convert images to WebP or AVIF format',
      'offscreen-images': 'Implement lazy loading for images below the fold',
      'unminified-css': 'Minify CSS files during build process',
      'unminified-javascript': 'Minify JavaScript files during build process',
      'uses-text-compression': 'Enable gzip or brotli compression on server',
      'uses-responsive-images': 'Serve appropriately sized images for different screen sizes'
    };

    return guides[opportunityId] || 'Refer to Lighthouse documentation for implementation details';
  }

  /**
   * Save results to files
   */
  async saveResults(results) {
    const timestamp = Date.now();
    
    // Save detailed JSON report
    const jsonPath = path.join(this.config.outputDir, `lighthouse-detailed-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

    // Save summary HTML report
    const htmlPath = path.join(this.config.outputDir, `lighthouse-summary-${timestamp}.html`);
    const htmlReport = this.generateHtmlReport(results);
    fs.writeFileSync(htmlPath, htmlReport);

    // Save CSV for data analysis
    const csvPath = path.join(this.config.outputDir, `lighthouse-metrics-${timestamp}.csv`);
    const csvReport = this.generateCsvReport(results);
    fs.writeFileSync(csvPath, csvReport);

    console.log(`\n📄 Reports saved:`);
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   HTML: ${htmlPath}`);
    console.log(`   CSV: ${csvPath}`);
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(results) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Lighthouse Performance Report</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 40px; }
        .score { display: inline-block; margin: 0 20px; text-align: center; }
        .score-value { font-size: 3em; font-weight: bold; margin: 10px 0; }
        .score-label { font-size: 1.2em; color: #666; }
        .performance { color: ${results.summary.averagePerformance > 90 ? '#0cce6b' : results.summary.averagePerformance > 50 ? '#ffa400' : '#ff5722'}; }
        .accessibility { color: ${results.summary.averageAccessibility > 90 ? '#0cce6b' : results.summary.averageAccessibility > 50 ? '#ffa400' : '#ff5722'}; }
        .best-practices { color: ${results.summary.averageBestPractices > 90 ? '#0cce6b' : results.summary.averageBestPractices > 50 ? '#ffa400' : '#ff5722'}; }
        .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 30px 0; }
        .metric-card { background: #f9f9f9; padding: 20px; border-radius: 6px; border-left: 4px solid #2196f3; }
        .recommendations { margin: 30px 0; }
        .rec-item { background: #fff3cd; padding: 15px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #ffc107; }
        .high-priority { border-left-color: #dc3545; background: #f8d7da; }
        .medium-priority { border-left-color: #fd7e14; background: #fff3cd; }
        .low-priority { border-left-color: #28a745; background: #d4edda; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Lighthouse Performance Report</h1>
            <p><strong>Generated:</strong> ${results.timestamp}</p>
            <p><strong>URLs Tested:</strong> ${results.config.urls.length} | <strong>Devices:</strong> ${results.config.devices.join(', ')}</p>
            
            <div style="margin: 30px 0;">
                <div class="score">
                    <div class="score-value performance">${results.summary.averagePerformance}</div>
                    <div class="score-label">Performance</div>
                </div>
                <div class="score">
                    <div class="score-value accessibility">${results.summary.averageAccessibility}</div>
                    <div class="score-label">Accessibility</div>
                </div>
                <div class="score">
                    <div class="score-value best-practices">${results.summary.averageBestPractices}</div>
                    <div class="score-label">Best Practices</div>
                </div>
            </div>
        </div>

        <h2>Core Web Vitals Summary</h2>
        <div class="metric-grid">
            <div class="metric-card">
                <h3>Largest Contentful Paint (LCP)</h3>
                <p>Good: ${results.summary.coreWebVitals.lcp.good} | Needs Improvement: ${results.summary.coreWebVitals.lcp.needsImprovement} | Poor: ${results.summary.coreWebVitals.lcp.poor}</p>
            </div>
            <div class="metric-card">
                <h3>Cumulative Layout Shift (CLS)</h3>
                <p>Good: ${results.summary.coreWebVitals.cls.good} | Needs Improvement: ${results.summary.coreWebVitals.cls.needsImprovement} | Poor: ${results.summary.coreWebVitals.cls.poor}</p>
            </div>
            <div class="metric-card">
                <h3>Total Blocking Time (TBT)</h3>
                <p>Good: ${results.summary.coreWebVitals.tbt.good} | Needs Improvement: ${results.summary.coreWebVitals.tbt.needsImprovement} | Poor: ${results.summary.coreWebVitals.tbt.poor}</p>
            </div>
        </div>

        <h2>Optimization Recommendations</h2>
        <div class="recommendations">
            ${results.recommendations.map(rec => `
                <div class="rec-item ${rec.priority}-priority">
                    <h4>${rec.title} (${rec.priority.toUpperCase()} Priority)</h4>
                    <p><strong>Impact:</strong> ${rec.impact}</p>
                    <p><strong>Implementation:</strong> ${rec.implementation}</p>
                    <p><strong>Occurrences:</strong> ${rec.occurrences} audit(s)</p>
                </div>
            `).join('')}
        </div>

        <h2>Detailed Results by URL</h2>
        <table>
            <thead>
                <tr>
                    <th>URL</th>
                    <th>Device</th>
                    <th>Performance</th>
                    <th>Accessibility</th>
                    <th>Best Practices</th>
                    <th>LCP (ms)</th>
                    <th>CLS</th>
                </tr>
            </thead>
            <tbody>
                ${results.audits.map(audit => `
                    <tr>
                        <td>${audit.url}</td>
                        <td>${audit.device}</td>
                        <td>${audit.averages.scores?.performance || 'N/A'}</td>
                        <td>${audit.averages.scores?.accessibility || 'N/A'}</td>
                        <td>${audit.averages.scores?.bestPractices || 'N/A'}</td>
                        <td>${audit.metrics.coreWebVitals?.lcp || 'N/A'}</td>
                        <td>${audit.metrics.coreWebVitals?.cls || 'N/A'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>
    `;
  }

  /**
   * Generate CSV report for data analysis
   */
  generateCsvReport(results) {
    const headers = [
      'URL', 'Device', 'Performance', 'Accessibility', 'Best_Practices', 'SEO', 'PWA',
      'FCP_ms', 'LCP_ms', 'CLS', 'TBT_ms', 'Speed_Index_ms', 'TTI_ms'
    ];

    const rows = results.audits.map(audit => [
      audit.url,
      audit.device,
      audit.averages.scores?.performance || '',
      audit.averages.scores?.accessibility || '',
      audit.averages.scores?.bestPractices || '',
      audit.averages.scores?.seo || '',
      audit.averages.scores?.pwa || '',
      audit.averages.metrics?.firstContentfulPaint || '',
      audit.averages.metrics?.largestContentfulPaint || '',
      audit.averages.metrics?.cumulativeLayoutShift || '',
      audit.averages.metrics?.totalBlockingTime || '',
      audit.averages.metrics?.speedIndex || '',
      audit.averages.metrics?.interactive || ''
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}

// Export for use as module
export default EnhancedLighthouseRunner;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new EnhancedLighthouseRunner({
    urls: ['http://localhost:3000'], // Single URL for testing
    devices: ['desktop'],
    runs: 1
  });

  runner.runComprehensiveAudits()
    .then(results => {
      console.log('Enhanced Lighthouse audits completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Enhanced Lighthouse audits failed:', error);
      process.exit(1);
    });
}