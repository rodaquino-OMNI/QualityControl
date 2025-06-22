/**
 * Real-time Performance Monitoring and Alerting System
 * Monitors application performance and sends alerts when thresholds are exceeded
 */

import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RealTimePerformanceMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      monitoringInterval: config.monitoringInterval || 5000, // 5 seconds
      alertThresholds: {
        memoryUsageMB: config.memoryThreshold || 200,
        cpuUsagePercent: config.cpuThreshold || 80,
        responseTimeMs: config.responseTimeThreshold || 2000,
        errorRate: config.errorRateThreshold || 0.05, // 5%
        bundleSizeMB: config.bundleSizeThreshold || 3,
        buildTimeSeconds: config.buildTimeThreshold || 60
      },
      alertCooldown: config.alertCooldown || 300000, // 5 minutes
      dataRetention: config.dataRetention || 86400000, // 24 hours
      outputDir: config.outputDir || path.join(__dirname, '../reports/monitoring')
    };

    this.metrics = {
      memory: [],
      cpu: [],
      responseTime: [],
      errorRate: [],
      buildMetrics: [],
      alerts: []
    };

    this.lastAlerts = new Map();
    this.isMonitoring = false;
    this.monitoringInterval = null;

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    this.setupEventListeners();
  }

  /**
   * Set up event listeners for different types of monitoring
   */
  setupEventListeners() {
    this.on('memory_alert', (data) => this.handleAlert('memory', data));
    this.on('cpu_alert', (data) => this.handleAlert('cpu', data));
    this.on('response_time_alert', (data) => this.handleAlert('response_time', data));
    this.on('error_rate_alert', (data) => this.handleAlert('error_rate', data));
    this.on('build_performance_alert', (data) => this.handleAlert('build_performance', data));
  }

  /**
   * Start real-time monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('Monitoring is already running');
      return;
    }

    console.log('🔍 Starting real-time performance monitoring...');
    console.log(`📊 Monitoring interval: ${this.config.monitoringInterval}ms`);
    console.log(`🚨 Alert thresholds:`, this.config.alertThresholds);

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoringInterval);

    // Initial metrics collection
    this.collectMetrics();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('Monitoring is not running');
      return;
    }

    console.log('⏹️ Stopping performance monitoring...');
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Save final report
    this.generateMonitoringReport();
  }

  /**
   * Collect current system metrics
   */
  collectMetrics() {
    const timestamp = new Date();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Memory metrics
    const memoryData = {
      timestamp,
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      rssMB: Math.round(memoryUsage.rss / 1024 / 1024)
    };

    // CPU metrics
    const cpuData = {
      timestamp,
      user: cpuUsage.user,
      system: cpuUsage.system,
      total: cpuUsage.user + cpuUsage.system
    };

    // Store metrics
    this.metrics.memory.push(memoryData);
    this.metrics.cpu.push(cpuData);

    // Check thresholds
    this.checkMemoryThreshold(memoryData);
    this.checkCPUThreshold(cpuData);

    // Clean old data
    this.cleanOldData();

    // Log current status
    if (this.metrics.memory.length % 12 === 0) { // Every minute with 5s interval
      console.log(`📈 Memory: ${memoryData.heapUsedMB}MB | CPU: ${cpuData.total}μs | Alerts: ${this.metrics.alerts.length}`);
    }
  }

  /**
   * Check memory usage threshold
   */
  checkMemoryThreshold(memoryData) {
    if (memoryData.heapUsedMB > this.config.alertThresholds.memoryUsageMB) {
      const alertData = {
        threshold: this.config.alertThresholds.memoryUsageMB,
        current: memoryData.heapUsedMB,
        severity: memoryData.heapUsedMB > this.config.alertThresholds.memoryUsageMB * 1.5 ? 'critical' : 'warning',
        timestamp: memoryData.timestamp
      };

      if (this.shouldAlert('memory')) {
        this.emit('memory_alert', alertData);
      }
    }
  }

  /**
   * Check CPU usage threshold
   */
  checkCPUThreshold(cpuData) {
    // Calculate CPU percentage (simplified)
    const cpuPercent = (cpuData.total / 1000000) * 100; // Convert to percentage
    
    if (cpuPercent > this.config.alertThresholds.cpuUsagePercent) {
      const alertData = {
        threshold: this.config.alertThresholds.cpuUsagePercent,
        current: cpuPercent,
        severity: cpuPercent > this.config.alertThresholds.cpuUsagePercent * 1.2 ? 'critical' : 'warning',
        timestamp: cpuData.timestamp
      };

      if (this.shouldAlert('cpu')) {
        this.emit('cpu_alert', alertData);
      }
    }
  }

  /**
   * Monitor response time for API calls
   */
  trackResponseTime(endpoint, duration) {
    const responseData = {
      timestamp: new Date(),
      endpoint,
      duration,
      slow: duration > this.config.alertThresholds.responseTimeMs
    };

    this.metrics.responseTime.push(responseData);

    if (responseData.slow) {
      const alertData = {
        threshold: this.config.alertThresholds.responseTimeMs,
        current: duration,
        endpoint,
        severity: duration > this.config.alertThresholds.responseTimeMs * 2 ? 'critical' : 'warning',
        timestamp: responseData.timestamp
      };

      if (this.shouldAlert('response_time')) {
        this.emit('response_time_alert', alertData);
      }
    }
  }

  /**
   * Monitor error rates
   */
  trackErrorRate(totalRequests, errorCount) {
    const errorRate = errorCount / totalRequests;
    const errorData = {
      timestamp: new Date(),
      totalRequests,
      errorCount,
      errorRate,
      high: errorRate > this.config.alertThresholds.errorRate
    };

    this.metrics.errorRate.push(errorData);

    if (errorData.high) {
      const alertData = {
        threshold: this.config.alertThresholds.errorRate,
        current: errorRate,
        totalRequests,
        errorCount,
        severity: errorRate > this.config.alertThresholds.errorRate * 2 ? 'critical' : 'warning',
        timestamp: errorData.timestamp
      };

      if (this.shouldAlert('error_rate')) {
        this.emit('error_rate_alert', alertData);
      }
    }
  }

  /**
   * Monitor build performance
   */
  trackBuildPerformance(buildData) {
    const { buildTime, bundleSize, success } = buildData;
    
    const buildMetric = {
      timestamp: new Date(),
      buildTime,
      bundleSize,
      bundleSizeMB: bundleSize / 1024 / 1024,
      success,
      slow: buildTime > this.config.alertThresholds.buildTimeSeconds * 1000,
      large: bundleSize > this.config.alertThresholds.bundleSizeMB * 1024 * 1024
    };

    this.metrics.buildMetrics.push(buildMetric);

    // Check build time threshold
    if (buildMetric.slow) {
      const alertData = {
        type: 'build_time',
        threshold: this.config.alertThresholds.buildTimeSeconds,
        current: buildTime / 1000,
        severity: buildTime > this.config.alertThresholds.buildTimeSeconds * 1500 ? 'critical' : 'warning',
        timestamp: buildMetric.timestamp
      };

      if (this.shouldAlert('build_performance')) {
        this.emit('build_performance_alert', alertData);
      }
    }

    // Check bundle size threshold
    if (buildMetric.large) {
      const alertData = {
        type: 'bundle_size',
        threshold: this.config.alertThresholds.bundleSizeMB,
        current: buildMetric.bundleSizeMB,
        severity: buildMetric.bundleSizeMB > this.config.alertThresholds.bundleSizeMB * 1.5 ? 'critical' : 'warning',
        timestamp: buildMetric.timestamp
      };

      if (this.shouldAlert('build_performance')) {
        this.emit('build_performance_alert', alertData);
      }
    }
  }

  /**
   * Check if alert should be sent (considering cooldown)
   */
  shouldAlert(alertType) {
    const now = Date.now();
    const lastAlert = this.lastAlerts.get(alertType);
    
    if (!lastAlert || (now - lastAlert) > this.config.alertCooldown) {
      this.lastAlerts.set(alertType, now);
      return true;
    }
    
    return false;
  }

  /**
   * Handle different types of alerts
   */
  handleAlert(type, data) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: new Date(),
      severity: data.severity,
      data
    };

    this.metrics.alerts.push(alert);

    // Log alert
    const severityEmoji = alert.severity === 'critical' ? '🚨' : '⚠️';
    console.log(`${severityEmoji} ${alert.severity.toUpperCase()} ALERT: ${type}`);
    console.log(`   Threshold: ${data.threshold}`);
    console.log(`   Current: ${data.current}`);
    console.log(`   Time: ${alert.timestamp.toISOString()}`);

    // Save alert to file
    this.saveAlert(alert);

    // Could integrate with external alerting systems here
    // this.sendToSlack(alert);
    // this.sendEmail(alert);
    // this.sendToWebhook(alert);
  }

  /**
   * Save alert to file
   */
  saveAlert(alert) {
    const alertsFile = path.join(this.config.outputDir, 'alerts.jsonl');
    const alertLine = JSON.stringify(alert) + '\n';
    
    fs.appendFileSync(alertsFile, alertLine);
  }

  /**
   * Clean old data to prevent memory leaks
   */
  cleanOldData() {
    const cutoff = new Date(Date.now() - this.config.dataRetention);

    this.metrics.memory = this.metrics.memory.filter(m => m.timestamp > cutoff);
    this.metrics.cpu = this.metrics.cpu.filter(c => c.timestamp > cutoff);
    this.metrics.responseTime = this.metrics.responseTime.filter(r => r.timestamp > cutoff);
    this.metrics.errorRate = this.metrics.errorRate.filter(e => e.timestamp > cutoff);
    this.metrics.buildMetrics = this.metrics.buildMetrics.filter(b => b.timestamp > cutoff);
  }

  /**
   * Get current performance summary
   */
  getPerformanceSummary() {
    const now = new Date();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);

    // Recent memory usage
    const recentMemory = this.metrics.memory.filter(m => m.timestamp > last5Minutes);
    const avgMemoryMB = recentMemory.length > 0 
      ? recentMemory.reduce((sum, m) => sum + m.heapUsedMB, 0) / recentMemory.length 
      : 0;

    // Recent alerts
    const recentAlerts = this.metrics.alerts.filter(a => a.timestamp > last5Minutes);

    // Response time stats
    const recentResponseTimes = this.metrics.responseTime.filter(r => r.timestamp > last5Minutes);
    const avgResponseTime = recentResponseTimes.length > 0
      ? recentResponseTimes.reduce((sum, r) => sum + r.duration, 0) / recentResponseTimes.length
      : 0;

    return {
      timestamp: now,
      monitoring: {
        isActive: this.isMonitoring,
        dataPoints: {
          memory: this.metrics.memory.length,
          cpu: this.metrics.cpu.length,
          responseTime: this.metrics.responseTime.length,
          alerts: this.metrics.alerts.length
        }
      },
      recent: {
        avgMemoryMB: Math.round(avgMemoryMB),
        alertCount: recentAlerts.length,
        avgResponseTimeMs: Math.round(avgResponseTime),
        slowRequests: recentResponseTimes.filter(r => r.slow).length
      },
      thresholds: this.config.alertThresholds,
      alerts: {
        total: this.metrics.alerts.length,
        critical: this.metrics.alerts.filter(a => a.severity === 'critical').length,
        warnings: this.metrics.alerts.filter(a => a.severity === 'warning').length
      }
    };
  }

  /**
   * Generate detailed monitoring report
   */
  generateMonitoringReport() {
    const summary = this.getPerformanceSummary();
    const report = {
      summary,
      metrics: {
        memoryTrend: this.calculateTrend(this.metrics.memory, 'heapUsedMB'),
        cpuTrend: this.calculateTrend(this.metrics.cpu, 'total'),
        responseTimeTrend: this.calculateTrend(this.metrics.responseTime, 'duration'),
        errorRateTrend: this.calculateTrend(this.metrics.errorRate, 'errorRate')
      },
      recommendations: this.generateRecommendations()
    };

    // Save report
    const reportPath = path.join(this.config.outputDir, `monitoring-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📊 Monitoring report saved to: ${reportPath}`);
    return report;
  }

  /**
   * Calculate trend for metrics
   */
  calculateTrend(data, field) {
    if (data.length < 2) return { trend: 'stable', change: 0 };

    const recent = data.slice(-10); // Last 10 data points
    const first = recent[0][field];
    const last = recent[recent.length - 1][field];
    const change = ((last - first) / first) * 100;

    let trend = 'stable';
    if (change > 10) trend = 'increasing';
    else if (change < -10) trend = 'decreasing';

    return { trend, change: Math.round(change) };
  }

  /**
   * Generate optimization recommendations based on monitoring data
   */
  generateRecommendations() {
    const recommendations = [];
    const summary = this.getPerformanceSummary();

    if (summary.recent.avgMemoryMB > this.config.alertThresholds.memoryUsageMB * 0.8) {
      recommendations.push({
        type: 'memory',
        priority: 'high',
        description: 'Memory usage is approaching threshold',
        action: 'Review memory leaks and optimize data structures'
      });
    }

    if (summary.recent.alertCount > 5) {
      recommendations.push({
        type: 'alerts',
        priority: 'medium',
        description: 'High number of recent alerts',
        action: 'Investigate and address recurring performance issues'
      });
    }

    if (summary.recent.avgResponseTimeMs > this.config.alertThresholds.responseTimeMs * 0.7) {
      recommendations.push({
        type: 'response_time',
        priority: 'medium',
        description: 'Response times are approaching threshold',
        action: 'Optimize API endpoints and database queries'
      });
    }

    return recommendations;
  }

  /**
   * Create performance dashboard data
   */
  getDashboardData() {
    const now = new Date();
    const last1Hour = new Date(now.getTime() - 60 * 60 * 1000);

    return {
      timestamp: now,
      charts: {
        memory: this.metrics.memory
          .filter(m => m.timestamp > last1Hour)
          .map(m => ({ x: m.timestamp, y: m.heapUsedMB })),
        responseTime: this.metrics.responseTime
          .filter(r => r.timestamp > last1Hour)
          .map(r => ({ x: r.timestamp, y: r.duration, endpoint: r.endpoint })),
        alerts: this.metrics.alerts
          .filter(a => a.timestamp > last1Hour)
          .map(a => ({ x: a.timestamp, severity: a.severity, type: a.type }))
      },
      summary: this.getPerformanceSummary()
    };
  }
}

// Export for use as module
export default RealTimePerformanceMonitor;

// Example usage if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new RealTimePerformanceMonitor({
    monitoringInterval: 2000, // 2 seconds for demo
    memoryThreshold: 150, // 150MB
    responseTimeThreshold: 1000 // 1 second
  });

  // Start monitoring
  monitor.startMonitoring();

  // Simulate some performance tracking
  setTimeout(() => {
    monitor.trackResponseTime('/api/dashboard', 1500);
    monitor.trackResponseTime('/api/cases', 800);
    monitor.trackErrorRate(100, 3);
    monitor.trackBuildPerformance({
      buildTime: 45000,
      bundleSize: 2.5 * 1024 * 1024,
      success: true
    });
  }, 5000);

  // Stop monitoring after 30 seconds
  setTimeout(() => {
    monitor.stopMonitoring();
    process.exit(0);
  }, 30000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nGracefully shutting down monitoring...');
    monitor.stopMonitoring();
    process.exit(0);
  });
}