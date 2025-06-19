import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import analyticsRoutes from './routes/analyticsRoutes';
import metricsRoutes, { metricsMiddleware } from './routes/metrics.routes';
import { RedisService } from './services/redisService';
import { DataAggregationService } from './services/dataAggregationService';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const redisService = new RedisService();
const aggregationService = new DataAggregationService(redisService);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Metrics middleware for tracking HTTP requests
app.use(metricsMiddleware);

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Routes
app.use('/api', analyticsRoutes);
app.use('/', metricsRoutes);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: {
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Start aggregation jobs
const startAggregationJobs = async () => {
  try {
    await aggregationService.startAggregation({
      interval: 'hourly',
      metrics: ['cases', 'performance', 'fraud', 'ai'],
      retentionDays: 7
    });

    await aggregationService.startAggregation({
      interval: 'daily',
      metrics: ['cases', 'performance', 'fraud', 'ai'],
      retentionDays: 30
    });

    logger.info('Data aggregation jobs started successfully');
  } catch (error) {
    logger.error('Failed to start aggregation jobs:', error);
  }
};

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Start background jobs
  startAggregationJobs();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  server.close(() => {
    logger.info('Server closed');
    
    // Stop aggregation jobs
    aggregationService.stopAllJobs().then(() => {
      logger.info('Aggregation jobs stopped');
      
      // Disconnect from Redis
      redisService.disconnect().then(() => {
        logger.info('Redis disconnected');
        process.exit(0);
      });
    });
  });
});

export default app;