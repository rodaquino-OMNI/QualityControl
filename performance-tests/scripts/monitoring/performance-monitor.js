/**
 * Performance Monitoring System for AUSTA Cockpit
 * Real-time monitoring and metrics collection
 */

const axios = require('axios');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

class PerformanceMonitor {
  constructor(config = {}) {
    this.config = {
      targets: {
        backend: process.env.API_URL || 'http://localhost:8000',
        frontend: process.env.BASE_URL || 'http://localhost:3000',
        aiService: process.env.AI_SERVICE_URL || 'http://localhost:8001'
      },
      monitoring: {
        interval: config.interval || 30000, // 30 seconds
        timeout: config.timeout || 10000,   // 10 seconds
        retries: config.retries || 3
      },
      influxdb: {
        url: process.env.INFLUXDB_URL || 'http://localhost:8086',
        token: process.env.INFLUXDB_TOKEN || 'admin-token',
        org: process.env.INFLUXDB_ORG || 'austa',
        bucket: process.env.INFLUXDB_BUCKET || 'performance_metrics'
      },
      alerting: {
        responseTimeThreshold: 5000,
        errorRateThreshold: 0.05,
        availabilityThreshold: 0.99,
        webhookUrl: process.env.ALERT_WEBHOOK_URL
      },
      ...config
    };

    this.influxDB = new InfluxDB({
      url: this.config.influxdb.url,
      token: this.config.influxdb.token
    });

    this.writeAPI = this.influxDB.getWriteApi(
      this.config.influxdb.org,
      this.config.influxdb.bucket
    );

    this.metrics = {
      responseTime: new Map(),
      errorRate: new Map(),
      availability: new Map(),
      throughput: new Map()
    };

    this.alertHistory = [];
    this.isRunning = false;
  }

  async start() {
    console.log('Starting performance monitoring system...');
    this.isRunning = true;

    // Start monitoring loops
    this.startHealthChecks();
    this.startPerformanceChecks();
    this.startMetricsCollection();
    this.startAlerting();

    console.log(`Monitoring started with ${this.config.monitoring.interval}ms interval`);
  }

  async stop() {
    console.log('Stopping performance monitoring system...');
    this.isRunning = false;
    
    try {
      await this.writeAPI.close();
    } catch (error) {
      console.error('Error closing InfluxDB connection:', error);
    }
  }

  startHealthChecks() {
    const healthCheck = async () => {
      if (!this.isRunning) return;

      const timestamp = new Date();
      
      for (const [serviceName, serviceUrl] of Object.entries(this.config.targets)) {
        try {
          const startTime = Date.now();
          const response = await axios.get(`${serviceUrl}/health`, {
            timeout: this.config.monitoring.timeout,
            validateStatus: () => true // Accept any status code
          });
          const responseTime = Date.now() - startTime;

          const isHealthy = response.status >= 200 && response.status < 400;
          
          // Record metrics
          this.recordMetric('health_check', {
            service: serviceName,
            status: response.status,
            response_time: responseTime,
            healthy: isHealthy,
            timestamp: timestamp.toISOString()
          });

          // Update availability tracking
          this.updateAvailability(serviceName, isHealthy);

          console.log(`Health check - ${serviceName}: ${response.status} (${responseTime}ms)`);

        } catch (error) {
          console.error(`Health check failed for ${serviceName}:`, error.message);
          
          this.recordMetric('health_check', {
            service: serviceName,
            status: 0,
            response_time: this.config.monitoring.timeout,
            healthy: false,
            error: error.message,
            timestamp: timestamp.toISOString()
          });

          this.updateAvailability(serviceName, false);
        }
      }

      setTimeout(healthCheck, this.config.monitoring.interval);
    };

    healthCheck();
  }

  startPerformanceChecks() {
    const performanceCheck = async () => {
      if (!this.isRunning) return;

      const timestamp = new Date();

      // API Performance Tests
      const apiTests = [
        { name: 'dashboard', endpoint: '/api/dashboard/overview' },
        { name: 'cases_list', endpoint: '/api/cases?limit=10' },
        { name: 'analytics', endpoint: '/api/analytics/overview' },
        { name: 'user_profile', endpoint: '/api/auth/profile' }
      ];

      for (const test of apiTests) {
        try {
          const startTime = Date.now();
          const response = await axios.get(`${this.config.targets.backend}${test.endpoint}`, {
            timeout: this.config.monitoring.timeout,
            headers: {
              'Authorization': 'Bearer test-token' // Would be real token in production
            },
            validateStatus: () => true
          });
          const responseTime = Date.now() - startTime;

          this.recordMetric('api_performance', {
            test: test.name,
            endpoint: test.endpoint,
            status: response.status,
            response_time: responseTime,
            size: JSON.stringify(response.data).length,
            timestamp: timestamp.toISOString()
          });

          this.updateResponseTime(test.name, responseTime);

        } catch (error) {
          this.recordMetric('api_performance', {
            test: test.name,
            endpoint: test.endpoint,
            status: 0,
            response_time: this.config.monitoring.timeout,
            error: error.message,
            timestamp: timestamp.toISOString()
          });
        }
      }

      setTimeout(performanceCheck, this.config.monitoring.interval * 2);
    };

    performanceCheck();
  }

  startMetricsCollection() {
    const collectMetrics = async () => {
      if (!this.isRunning) return;

      try {
        // Collect system metrics from backend
        const systemMetrics = await this.collectSystemMetrics();
        if (systemMetrics) {
          this.recordMetric('system_metrics', systemMetrics);
        }

        // Collect database metrics
        const dbMetrics = await this.collectDatabaseMetrics();
        if (dbMetrics) {
          this.recordMetric('database_metrics', dbMetrics);
        }

        // Collect AI service metrics
        const aiMetrics = await this.collectAIMetrics();
        if (aiMetrics) {
          this.recordMetric('ai_service_metrics', aiMetrics);
        }

      } catch (error) {
        console.error('Error collecting metrics:', error);
      }

      setTimeout(collectMetrics, this.config.monitoring.interval * 3);
    };

    collectMetrics();
  }

  async collectSystemMetrics() {
    try {
      const response = await axios.get(`${this.config.targets.backend}/api/metrics/system`, {
        timeout: this.config.monitoring.timeout
      });

      return {
        cpu_usage: response.data.cpu || 0,
        memory_usage: response.data.memory || 0,
        disk_usage: response.data.disk || 0,
        active_connections: response.data.connections || 0,
        request_rate: response.data.requestRate || 0,
        error_rate: response.data.errorRate || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to collect system metrics:', error.message);
      return null;
    }
  }

  async collectDatabaseMetrics() {
    try {
      const response = await axios.get(`${this.config.targets.backend}/api/metrics/database`, {
        timeout: this.config.monitoring.timeout
      });

      return {
        connection_pool_active: response.data.connectionPool?.active || 0,
        connection_pool_idle: response.data.connectionPool?.idle || 0,
        query_avg_time: response.data.queries?.averageTime || 0,
        query_slow_count: response.data.queries?.slowQueries || 0,
        transaction_rate: response.data.transactions?.rate || 0,
        lock_wait_time: response.data.locks?.waitTime || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to collect database metrics:', error.message);
      return null;
    }
  }

  async collectAIMetrics() {
    try {
      const response = await axios.get(`${this.config.targets.aiService}/api/metrics`, {
        timeout: this.config.monitoring.timeout
      });

      return {
        model_load_time: response.data.models?.loadTime || 0,
        inference_time: response.data.inference?.averageTime || 0,
        queue_size: response.data.queue?.size || 0,
        accuracy_score: response.data.accuracy?.current || 0,
        gpu_usage: response.data.gpu?.usage || 0,
        memory_usage: response.data.memory?.usage || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to collect AI metrics:', error.message);
      return null;
    }
  }

  recordMetric(measurement, fields) {
    try {
      const point = new Point(measurement);
      
      for (const [key, value] of Object.entries(fields)) {
        if (typeof value === 'number') {
          point.floatField(key, value);
        } else if (typeof value === 'boolean') {
          point.booleanField(key, value);
        } else {
          point.stringField(key, String(value));
        }
      }

      point.timestamp(new Date());
      this.writeAPI.writePoint(point);

    } catch (error) {
      console.error('Error recording metric:', error);
    }
  }

  updateAvailability(service, isAvailable) {
    if (!this.metrics.availability.has(service)) {
      this.metrics.availability.set(service, []);
    }

    const history = this.metrics.availability.get(service);
    history.push({ timestamp: Date.now(), available: isAvailable });

    // Keep only last 100 data points
    if (history.length > 100) {
      history.shift();
    }

    // Calculate availability percentage
    const availableCount = history.filter(h => h.available).length;
    const availability = availableCount / history.length;

    // Check alert threshold
    if (availability < this.config.alerting.availabilityThreshold) {
      this.triggerAlert('availability', `${service} availability (${(availability * 100).toFixed(2)}%) below threshold`);
    }
  }

  updateResponseTime(test, responseTime) {
    if (!this.metrics.responseTime.has(test)) {
      this.metrics.responseTime.set(test, []);
    }

    const history = this.metrics.responseTime.get(test);
    history.push({ timestamp: Date.now(), time: responseTime });

    // Keep only last 50 data points
    if (history.length > 50) {
      history.shift();
    }

    // Check alert threshold
    if (responseTime > this.config.alerting.responseTimeThreshold) {
      this.triggerAlert('response_time', `${test} response time (${responseTime}ms) exceeds threshold`);
    }
  }

  startAlerting() {
    const checkAlerts = async () => {
      if (!this.isRunning) return;

      // Check for performance degradation patterns
      this.checkPerformanceTrends();
      
      // Check error rate trends
      this.checkErrorRates();

      setTimeout(checkAlerts, this.config.monitoring.interval * 2);
    };

    checkAlerts();
  }

  checkPerformanceTrends() {
    for (const [test, history] of this.metrics.responseTime.entries()) {
      if (history.length < 10) continue;

      const recent = history.slice(-10);
      const average = recent.reduce((sum, h) => sum + h.time, 0) / recent.length;

      if (average > this.config.alerting.responseTimeThreshold) {
        this.triggerAlert('performance_trend', 
          `${test} average response time (${average.toFixed(0)}ms) degraded over last 10 checks`);
      }
    }
  }

  checkErrorRates() {
    // Implementation would depend on how error rates are tracked
    // This is a placeholder for error rate trend analysis
  }

  async triggerAlert(type, message) {
    const alert = {
      id: `alert_${Date.now()}`,
      type: type,
      message: message,
      timestamp: new Date().toISOString(),
      severity: this.getAlertSeverity(type)
    };

    // Avoid duplicate alerts
    const recentAlerts = this.alertHistory.filter(a => 
      Date.now() - new Date(a.timestamp).getTime() < 300000 // 5 minutes
    );

    if (recentAlerts.some(a => a.message === message)) {
      return; // Skip duplicate alert
    }

    this.alertHistory.push(alert);
    console.warn(`🚨 ALERT [${alert.severity}]: ${message}`);

    // Record alert as metric
    this.recordMetric('alerts', {
      type: type,
      message: message,
      severity: alert.severity,
      timestamp: alert.timestamp
    });

    // Send webhook notification if configured
    if (this.config.alerting.webhookUrl) {
      try {
        await axios.post(this.config.alerting.webhookUrl, {
          alert: alert,
          system: 'AUSTA Cockpit Performance Monitor'
        });
      } catch (error) {
        console.error('Failed to send alert webhook:', error.message);
      }
    }

    // Clean up old alerts
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(-50);
    }
  }

  getAlertSeverity(type) {
    const severityMap = {
      availability: 'critical',
      response_time: 'warning',
      performance_trend: 'warning',
      error_rate: 'critical',
      system_metrics: 'info'
    };

    return severityMap[type] || 'info';
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        monitoring_duration: this.isRunning ? 'Active' : 'Stopped',
        total_alerts: this.alertHistory.length,
        services_monitored: Object.keys(this.config.targets).length
      },
      availability: {},
      performance: {},
      recent_alerts: this.alertHistory.slice(-10)
    };

    // Calculate availability summary
    for (const [service, history] of this.metrics.availability.entries()) {
      if (history.length > 0) {
        const availableCount = history.filter(h => h.available).length;
        report.availability[service] = {
          percentage: (availableCount / history.length * 100).toFixed(2),
          total_checks: history.length,
          last_check: new Date(history[history.length - 1].timestamp).toISOString()
        };
      }
    }

    // Calculate performance summary
    for (const [test, history] of this.metrics.responseTime.entries()) {
      if (history.length > 0) {
        const times = history.map(h => h.time);
        report.performance[test] = {
          average_ms: (times.reduce((sum, t) => sum + t, 0) / times.length).toFixed(0),
          min_ms: Math.min(...times),
          max_ms: Math.max(...times),
          checks: times.length
        };
      }
    }

    return report;
  }

  async saveReport(outputPath) {
    const report = await this.generateReport();
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2));
    console.log(`Performance report saved to: ${outputPath}`);
    return report;
  }
}

// CLI interface
if (require.main === module) {
  const monitor = new PerformanceMonitor();

  const command = process.argv[2];
  
  switch (command) {
    case 'start':
      monitor.start().catch(error => {
        console.error('Failed to start monitoring:', error);
        process.exit(1);
      });
      
      // Graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\nShutting down performance monitor...');
        await monitor.stop();
        process.exit(0);
      });
      
      break;
      
    case 'report':
      const outputPath = process.argv[3] || `./reports/performance-report-${Date.now()}.json`;
      monitor.generateReport()
        .then(report => {
          console.log(JSON.stringify(report, null, 2));
          return monitor.saveReport(outputPath);
        })
        .catch(error => {
          console.error('Failed to generate report:', error);
          process.exit(1);
        });
      break;
      
    default:
      console.log('Usage: node performance-monitor.js [start|report] [output_path]');
      console.log('  start: Start continuous performance monitoring');
      console.log('  report: Generate performance report');
      break;
  }
}

module.exports = PerformanceMonitor;