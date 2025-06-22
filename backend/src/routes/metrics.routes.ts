import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { RedisService } from '../services/redisService';
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

const router = Router();
const redisService = new RedisService();

// Collect default Node.js metrics
collectDefaultMetrics({
  register,
  prefix: 'austa_backend_',
});

// Custom metrics
const httpRequestsTotal = new Counter({
  name: 'austa_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
  registers: [register]
});

const httpRequestDuration = new Histogram({
  name: 'austa_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

const businessMetrics = {
  casesProcessed: new Counter({
    name: 'austa_cases_processed_total',
    help: 'Total number of cases processed',
    labelNames: ['status', 'type'],
    registers: [register]
  }),
  
  caseProcessingTime: new Histogram({
    name: 'austa_case_processing_duration_seconds',
    help: 'Time taken to process cases',
    labelNames: ['type', 'complexity'],
    buckets: [1, 5, 10, 30, 60, 300, 600],
    registers: [register]
  }),
  
  pendingCases: new Gauge({
    name: 'austa_pending_cases_count',
    help: 'Number of pending cases',
    labelNames: ['priority'],
    registers: [register]
  }),
  
  aiAccuracy: new Gauge({
    name: 'austa_ai_prediction_accuracy',
    help: 'AI prediction accuracy score',
    labelNames: ['model', 'task'],
    registers: [register]
  }),
  
  fraudScore: new Histogram({
    name: 'austa_fraud_detection_score',
    help: 'Fraud detection scores',
    labelNames: ['case_type'],
    buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    registers: [register]
  })
};

const securityMetrics = {
  failedLogins: new Counter({
    name: 'austa_failed_login_attempts_total',
    help: 'Total number of failed login attempts',
    labelNames: ['ip_address', 'user_agent'],
    registers: [register]
  }),
  
  unauthorizedRequests: new Counter({
    name: 'austa_unauthorized_api_requests_total',
    help: 'Total number of unauthorized API requests',
    labelNames: ['endpoint', 'ip_address'],
    registers: [register]
  }),
  
  suspiciousActivity: new Gauge({
    name: 'austa_suspicious_activity_score',
    help: 'Suspicious activity detection score',
    labelNames: ['user_id', 'activity_type'],
    registers: [register]
  })
};

// Middleware to track HTTP metrics
export const metricsMiddleware = (req: Request, res: Response, next: Function) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
      service: 'backend'
    };
    
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);
  });
  
  next();
};

// Main metrics endpoint for Prometheus
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    // Update business metrics with current data
    await updateBusinessMetrics();
    
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Error generating metrics:', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

// Business metrics endpoint
router.get('/business-metrics', async (_req: Request, res: Response) => {
  try {
    const businessData = await getBusinessMetrics();
    
    // Update Prometheus metrics
    businessMetrics.pendingCases.set({ priority: 'high' }, businessData.pendingCases.high);
    businessMetrics.pendingCases.set({ priority: 'medium' }, businessData.pendingCases.medium);
    businessMetrics.pendingCases.set({ priority: 'low' }, businessData.pendingCases.low);
    
    businessMetrics.aiAccuracy.set({ model: 'fraud_detection', task: 'classification' }, businessData.aiAccuracy.fraudDetection);
    businessMetrics.aiAccuracy.set({ model: 'case_analysis', task: 'regression' }, businessData.aiAccuracy.caseAnalysis);
    
    const businessMetricsText = await register.getSingleMetricAsString('austa_pending_cases_count') +
                               await register.getSingleMetricAsString('austa_ai_prediction_accuracy') +
                               await register.getSingleMetricAsString('austa_cases_processed_total') +
                               await register.getSingleMetricAsString('austa_case_processing_duration_seconds') +
                               await register.getSingleMetricAsString('austa_fraud_detection_score');
    
    res.set('Content-Type', register.contentType);
    res.send(businessMetricsText);
  } catch (error) {
    logger.error('Error generating business metrics:', error);
    res.status(500).json({ error: 'Failed to generate business metrics' });
  }
});

// Security metrics endpoint
router.get('/security-metrics', async (_req: Request, res: Response) => {
  try {
    const securityData = await getSecurityMetrics();
    
    // Update security metrics based on recent data
    for (const event of securityData.recentEvents) {
      if (event.type === 'failed_login') {
        securityMetrics.failedLogins.inc({
          ip_address: event.ipAddress,
          user_agent: event.userAgent
        });
      } else if (event.type === 'unauthorized_request') {
        securityMetrics.unauthorizedRequests.inc({
          endpoint: (event as any).endpoint,
          ip_address: event.ipAddress
        });
      }
    }
    
    const securityMetricsText = await register.getSingleMetricAsString('austa_failed_login_attempts_total') +
                               await register.getSingleMetricAsString('austa_unauthorized_api_requests_total') +
                               await register.getSingleMetricAsString('austa_suspicious_activity_score');
    
    res.set('Content-Type', register.contentType);
    res.send(securityMetricsText);
  } catch (error) {
    logger.error('Error generating security metrics:', error);
    res.status(500).json({ error: 'Failed to generate security metrics' });
  }
});

// APM metrics endpoint
router.get('/apm-metrics', async (_req: Request, res: Response) => {
  try {
    // Get APM metrics data for monitoring purposes
    await getAPMMetrics();
    
    const apmMetricsText = await register.getSingleMetricAsString('austa_http_requests_total') +
                          await register.getSingleMetricAsString('austa_http_request_duration_seconds') +
                          await register.getSingleMetricAsString('austa_backend_nodejs_heap_size_used_bytes') +
                          await register.getSingleMetricAsString('austa_backend_process_cpu_user_seconds_total');
    
    res.set('Content-Type', register.contentType);
    res.send(apmMetricsText);
  } catch (error) {
    logger.error('Error generating APM metrics:', error);
    res.status(500).json({ error: 'Failed to generate APM metrics' });
  }
});

// Case processing metrics endpoint
router.get('/case-metrics', async (_req: Request, res: Response) => {
  try {
    const caseData = await getCaseMetrics();
    
    // Update case processing metrics
    for (const caseMetric of caseData.processed) {
      businessMetrics.casesProcessed.inc({
        status: caseMetric.status,
        type: caseMetric.type
      });
      
      businessMetrics.caseProcessingTime.observe({
        type: caseMetric.type,
        complexity: caseMetric.complexity
      }, caseMetric.processingTimeSeconds);
    }
    
    const caseMetricsText = await register.getSingleMetricAsString('austa_cases_processed_total') +
                           await register.getSingleMetricAsString('austa_case_processing_duration_seconds') +
                           await register.getSingleMetricAsString('austa_pending_cases_count');
    
    res.set('Content-Type', register.contentType);
    res.send(caseMetricsText);
  } catch (error) {
    logger.error('Error generating case metrics:', error);
    res.status(500).json({ error: 'Failed to generate case metrics' });
  }
});

// Helper functions to fetch data from database/cache
async function updateBusinessMetrics() {
  try {
    const cachedMetrics = await redisService.get('business_metrics');
    if (cachedMetrics) {
      const metrics = JSON.parse(cachedMetrics);
      
      businessMetrics.pendingCases.set({ priority: 'high' }, metrics.pendingCases?.high || 0);
      businessMetrics.pendingCases.set({ priority: 'medium' }, metrics.pendingCases?.medium || 0);
      businessMetrics.pendingCases.set({ priority: 'low' }, metrics.pendingCases?.low || 0);
      
      businessMetrics.aiAccuracy.set(
        { model: 'fraud_detection', task: 'classification' },
        metrics.aiAccuracy?.fraudDetection || 0.85
      );
    }
  } catch (error) {
    logger.error('Error updating business metrics:', error);
  }
}

async function getBusinessMetrics() {
  // Mock data - replace with actual database queries
  return {
    pendingCases: {
      high: Math.floor(Math.random() * 100),
      medium: Math.floor(Math.random() * 200),
      low: Math.floor(Math.random() * 300)
    },
    aiAccuracy: {
      fraudDetection: 0.85 + Math.random() * 0.1,
      caseAnalysis: 0.82 + Math.random() * 0.1
    }
  };
}

async function getSecurityMetrics() {
  // Mock data - replace with actual security log queries
  return {
    recentEvents: [
      {
        type: 'failed_login',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0...',
        timestamp: new Date()
      },
      {
        type: 'unauthorized_request',
        ipAddress: '192.168.1.101',
        endpoint: '/api/admin',
        timestamp: new Date()
      }
    ]
  };
}

async function getAPMMetrics() {
  return {
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
    uptime: process.uptime()
  };
}

async function getCaseMetrics() {
  // Mock data - replace with actual case processing data
  return {
    processed: [
      {
        status: 'completed',
        type: 'fraud_investigation',
        complexity: 'medium',
        processingTimeSeconds: 120
      }
    ]
  };
}

// Export metrics instances for use in other parts of the application
export { businessMetrics, securityMetrics, httpRequestsTotal, httpRequestDuration };

export default router;