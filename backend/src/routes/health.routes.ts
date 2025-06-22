import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { queueUtils } from '../config/queues';
import axios from 'axios';
import { promisify } from 'util';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger';

// Circuit breaker implementation
class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000, // 1 minute
    private resetTimeout: number = 30000 // 30 seconds
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailTime < this.resetTimeout) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }
    
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), this.timeout)
        )
      ]);
      
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'OPEN';
      }
      
      throw error;
    }
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailTime: this.lastFailTime
    };
  }
}

// Circuit breakers for different services
const circuitBreakers = {
  database: new CircuitBreaker(3, 5000, 30000),
  redis: new CircuitBreaker(3, 3000, 15000),
  aiService: new CircuitBreaker(5, 10000, 60000),
  queues: new CircuitBreaker(3, 5000, 30000)
};

// Health check cache
interface HealthCache {
  data: any;
  timestamp: number;
  ttl: number;
}

const healthCache = new Map<string, HealthCache>();
const CACHE_TTL = 30000; // 30 seconds

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 */
router.get('/', (req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     summary: Comprehensive health check with all dependencies and circuit breaker status
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Detailed health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded, unhealthy]
 *                 uptime:
 *                   type: number
 *                 memory:
 *                   type: object
 *                 services:
 *                   type: object
 *                 circuit_breakers:
 *                   type: object
 *                 performance:
 *                   type: object
 */
router.get('/detailed', async (req: Request, res: Response): Promise<void> => {
  const cacheKey = 'detailed-health';
  const cached = getCachedHealth(cacheKey);
  if (cached) {
    res.status(cached.status === 'healthy' ? 200 : 503).json(cached);
    return;
  }
  const startTime = performance.now();
  const healthChecks = {
    database: { status: 'unknown', latency: 0, circuit_breaker: 'unknown' },
    redis: { status: 'unknown', latency: 0, circuit_breaker: 'unknown' },
    queues: { status: 'unknown', details: {}, circuit_breaker: 'unknown' },
    ai_service: { status: 'unknown', latency: 0, circuit_breaker: 'unknown' },
    external_apis: { status: 'unknown', details: {} }
  };

  // Check database with circuit breaker
  try {
    const result = await circuitBreakers.database.execute(async () => {
      const start = performance.now();
      await prisma.$queryRaw`SELECT 1`;
      const latency = performance.now() - start;
      
      // Additional database health checks
      const connectionCount = await prisma.$queryRaw`SELECT count(*) as count FROM pg_stat_activity`;
      const dbSize = await prisma.$queryRaw`SELECT pg_database_size(current_database()) as size`;
      
      return {
        latency,
        connectionCount: (connectionCount as any)[0]?.count || 0,
        dbSize: (dbSize as any)[0]?.size || 0
      };
    });
    
    const status = result.latency > 1000 ? 'degraded' : 'healthy';
    healthChecks.database = {
      status,
      latency: result.latency,
      circuit_breaker: circuitBreakers.database.getState().state,
      connection_count: result.connectionCount,
      database_size: result.dbSize
    } as any;
  } catch (error) {
    logger.error('Database health check failed:', error);
    healthChecks.database = {
      status: 'unhealthy',
      latency: 0,
      circuit_breaker: circuitBreakers.database.getState().state,
      error: error instanceof Error ? error.message : 'Unknown error'
    } as any;
  }

  // Check Redis with circuit breaker
  try {
    const result = await circuitBreakers.redis.execute(async () => {
      const start = performance.now();
      const pong = await redis.ping();
      const latency = performance.now() - start;
      
      // Additional Redis health checks
      const info = await redis.info();
      const memoryUsage = await redis.memory('STATS');
      
      return {
        latency,
        pong,
        info: parseRedisInfo(info),
        memoryUsage
      };
    });
    
    const status = result.latency > 500 ? 'degraded' : 'healthy';
    healthChecks.redis = {
      status,
      latency: result.latency,
      circuit_breaker: circuitBreakers.redis.getState().state,
      memory_usage: result.memoryUsage,
      connected_clients: result.info.connected_clients || 0
    } as any;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    healthChecks.redis = {
      status: 'unhealthy',
      latency: 0,
      circuit_breaker: circuitBreakers.redis.getState().state,
      error: error instanceof Error ? error.message : 'Unknown error'
    } as any;
  }

  // Check queues with circuit breaker
  try {
    const result = await circuitBreakers.queues.execute(async () => {
      const queueStatuses = await queueUtils.getAllQueuesStatus();
      return queueStatuses;
    });
    
    // Analyze queue health
    const failedJobs = Object.values(result).reduce((sum: number, queue: any) => sum + (queue.failed || 0), 0);
    const status = failedJobs > 10 ? 'degraded' : 'healthy';
    
    healthChecks.queues = {
      status,
      details: result,
      circuit_breaker: circuitBreakers.queues.getState().state,
      failed_jobs_count: failedJobs
    } as any;
  } catch (error) {
    logger.error('Queue health check failed:', error);
    healthChecks.queues = {
      status: 'unhealthy',
      details: {},
      circuit_breaker: circuitBreakers.queues.getState().state,
      error: error instanceof Error ? error.message : 'Unknown error'
    } as any;
  }
  
  // Check AI service
  try {
    const result = await circuitBreakers.aiService.execute(async () => {
      const start = performance.now();
      const response = await axios.get(`${process.env.AI_SERVICE_URL}/health`, {
        timeout: 5000
      });
      const latency = performance.now() - start;
      return { latency, data: response.data };
    });
    
    const status = result.latency > 2000 ? 'degraded' : 'healthy';
    healthChecks.ai_service = {
      status,
      latency: result.latency,
      circuit_breaker: circuitBreakers.aiService.getState().state,
      ai_status: result.data.status
    } as any;
  } catch (error) {
    logger.error('AI service health check failed:', error);
    healthChecks.ai_service = {
      status: 'unhealthy',
      latency: 0,
      circuit_breaker: circuitBreakers.aiService.getState().state,
      error: error instanceof Error ? error.message : 'Unknown error'
    } as any;
  }
  
  // Check external APIs
  healthChecks.external_apis = await checkExternalAPIs();

  // Determine overall status
  const healthyCount = Object.values(healthChecks).filter(
    (check) => check.status === 'healthy'
  ).length;
  const degradedCount = Object.values(healthChecks).filter(
    (check) => check.status === 'degraded'
  ).length;
  const unhealthyCount = Object.values(healthChecks).filter(
    (check) => check.status === 'unhealthy'
  ).length;
  
  let overallStatus: string;
  if (unhealthyCount > 0) {
    overallStatus = unhealthyCount > 2 ? 'unhealthy' : 'degraded';
  } else if (degradedCount > 0) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  const statusCode = overallStatus === 'healthy' ? 200 : 503;
  const responseTime = performance.now() - startTime;
  
  const healthResponse = {
    status: overallStatus,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    response_time_ms: responseTime,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100,
      external: Math.round(process.memoryUsage().external / 1024 / 1024 * 100) / 100
    },
    cpu: {
      usage: process.cpuUsage(),
      load_average: require('os').loadavg()
    },
    services: healthChecks,
    circuit_breakers: {
      database: circuitBreakers.database.getState(),
      redis: circuitBreakers.redis.getState(),
      ai_service: circuitBreakers.aiService.getState(),
      queues: circuitBreakers.queues.getState()
    },
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    node_version: process.version,
    summary: {
      total_checks: Object.keys(healthChecks).length,
      healthy: healthyCount,
      degraded: degradedCount,
      unhealthy: unhealthyCount
    }
  };
  
  // Cache the response
  setCachedHealth(cacheKey, healthResponse, statusCode);
  
  res.status(statusCode).json(healthResponse);
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness check for Kubernetes
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false });
  }
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness check for Kubernetes
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get('/live', (req: Request, res: Response): void => {
  res.status(200).json({ alive: true });
});

// Helper functions
function getCachedHealth(key: string): any | null {
  const cached = healthCache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data;
  }
  return null;
}

function setCachedHealth(key: string, data: any, statusCode: number): void {
  const ttl = statusCode === 200 ? CACHE_TTL : CACHE_TTL / 2; // Cache failures for shorter time
  healthCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl
  });
}

function parseRedisInfo(info: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = info.split('\r\n');
  
  for (const line of lines) {
    if (line.includes(':')) {
      const [key, value] = line.split(':');
      result[key] = isNaN(Number(value)) ? value : Number(value);
    }
  }
  
  return result;
}

async function checkExternalAPIs(): Promise<any> {
  const apis = [
    { name: 'fraud_detection_api', url: process.env.FRAUD_API_URL },
    { name: 'notification_service', url: process.env.NOTIFICATION_SERVICE_URL },
    { name: 'audit_service', url: process.env.AUDIT_SERVICE_URL }
  ].filter(api => api.url);
  
  const results: Record<string, any> = {};
  
  for (const api of apis) {
    try {
      const start = performance.now();
      const response = await axios.get(`${api.url}/health`, {
        timeout: 3000
      });
      const latency = performance.now() - start;
      
      results[api.name] = {
        status: response.status === 200 ? 'healthy' : 'degraded',
        latency,
        response_code: response.status
      };
    } catch (error) {
      results[api.name] = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  return {
    status: Object.values(results).every((r: any) => r.status === 'healthy') ? 'healthy' : 'degraded',
    details: results
  };
}

/**
 * @swagger
 * /health/metrics:
 *   get:
 *     summary: Get health metrics for monitoring
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Health metrics
 */
router.get('/metrics', (req: Request, res: Response): void => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  res.json({
    timestamp: new Date().toISOString(),
    uptime_seconds: process.uptime(),
    memory_heap_used_bytes: memUsage.heapUsed,
    memory_heap_total_bytes: memUsage.heapTotal,
    memory_rss_bytes: memUsage.rss,
    memory_external_bytes: memUsage.external,
    cpu_user_microseconds: cpuUsage.user,
    cpu_system_microseconds: cpuUsage.system,
    event_loop_lag: getEventLoopLag(),
    active_handles: (process as any)._getActiveHandles().length,
    active_requests: (process as any)._getActiveRequests().length
  });
});

function getEventLoopLag(): number {
  const start = process.hrtime.bigint();
  setImmediate(() => {
    const delta = process.hrtime.bigint() - start;
    return Number(delta) / 1000000; // Convert to milliseconds
  });
  return 0; // Simplified for now
}

/**
 * @swagger
 * /health/circuit-breakers:
 *   get:
 *     summary: Get circuit breaker status
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Circuit breaker status
 */
router.get('/circuit-breakers', (req: Request, res: Response): void => {
  res.json({
    timestamp: new Date().toISOString(),
    circuit_breakers: {
      database: circuitBreakers.database.getState(),
      redis: circuitBreakers.redis.getState(),
      ai_service: circuitBreakers.aiService.getState(),
      queues: circuitBreakers.queues.getState()
    }
  });
});

export { router as healthRoutes };
export { circuitBreakers };