import express from 'express';
import compression from 'compression';
import dotenv from 'dotenv';

// Middleware imports
import {
  errorHandler,
  notFoundHandler,
  corsMiddleware,
  helmetMiddleware,
  securityHeaders,
  sanitizeRequest,
  requestSizeLimit,
  requestLogger,
} from './middleware';
import { responseFormatter, responseTime, noCache } from './middleware/responseFormatter';
import { createRateLimiters } from './middleware/rateLimiter';

// Service imports
import { logger } from './utils/logger';
import { RedisService } from './services/redisService';
import { DataAggregationService } from './services/dataAggregationService';
import { PrismaClient } from '@prisma/client';

// Route imports
import analyticsRoutes from './routes/analytics.routes';
import metricsRoutes, { metricsMiddleware } from './routes/metrics.routes';
import { createAuthRoutes } from './routes/auth.routes';
import { createUserRoutes } from './routes/user.routes';
import { caseRoutes } from './routes/case.routes';
import { decisionRoutes } from './routes/decision.routes';
import { notificationRoutes } from './routes/notification.routes';
import { auditRoutes } from './routes/audit.routes';
import { aiRoutes } from './routes/ai.routes';
import { healthRoutes } from './routes/health.routes';
import mlRoutes from './routes/ml.routes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const redisService = new RedisService();
const aggregationService = new DataAggregationService(redisService);
const rateLimiters = createRateLimiters(redisService);

// Initialize Prisma client
const prisma = new PrismaClient();

// Create router instances for factory functions
const authRoutes = createAuthRoutes(prisma, redisService);
const userRoutes = createUserRoutes(prisma, redisService);

// Basic middleware
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware
app.use(securityHeaders);
app.use(sanitizeRequest);
app.use(requestSizeLimit('10mb'));

// Monitoring middleware
app.use(metricsMiddleware);
app.use(requestLogger);
app.use(responseTime);
app.use(responseFormatter);

// Global rate limiting
app.use('/api/', rateLimiters.api);

// Health check endpoint (no rate limiting)
app.use('/health', healthRoutes);

// API Routes with versioning
const v1Router = express.Router();

// Apply specific rate limiters to auth routes
v1Router.use('/auth/login', rateLimiters.auth);
v1Router.use('/auth/register', rateLimiters.auth);
v1Router.use('/auth/password-reset', rateLimiters.passwordReset);

// Mount routes
v1Router.use('/auth', authRoutes);
v1Router.use('/users', userRoutes);
v1Router.use('/cases', caseRoutes);
v1Router.use('/decisions', decisionRoutes);
v1Router.use('/notifications', notificationRoutes);
v1Router.use('/audit', auditRoutes);
v1Router.use('/ai', aiRoutes);
v1Router.use('/analytics', analyticsRoutes);
v1Router.use('/metrics', metricsRoutes);
v1Router.use('/ml', mlRoutes);

// Apply no-cache to sensitive routes
v1Router.use('/auth/*', noCache);
v1Router.use('/users/*', noCache);

// Mount versioned API
app.use('/api/v1', v1Router);

// Legacy route support (redirect to v1)
app.use('/api', (req, res, next) => {
  if (!req.path.startsWith('/v1')) {
    return res.redirect(301, `/api/v1${req.path}`);
  }
  next();
});

// Swagger documentation (only in development)
if (process.env.NODE_ENV !== 'production') {
  const swaggerUi = require('swagger-ui-express');
  const swaggerDocument = require('./swagger.json');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Error handling middleware - must be last
app.use(errorHandler);

// Graceful shutdown handler
let server: any;

const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, starting graceful shutdown`);

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Wait for existing connections to close (with timeout)
  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000); // 30 seconds timeout

  try {
    // Stop background jobs
    await aggregationService.stopAllJobs();
    logger.info('Background jobs stopped');

    // Disconnect from Redis
    await redisService.disconnect();
    logger.info('Redis disconnected');

    // Clear timeout and exit
    clearTimeout(shutdownTimeout);
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

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

    await aggregationService.startAggregation({
      interval: 'weekly',
      metrics: ['cases', 'performance', 'fraud', 'ai'],
      retentionDays: 90
    });

    await aggregationService.startAggregation({
      interval: 'monthly',
      metrics: ['cases', 'performance', 'fraud', 'ai'],
      retentionDays: 365
    });

    logger.info('Data aggregation jobs started successfully');
  } catch (error) {
    logger.error('Failed to start aggregation jobs:', error);
    // Don't fail startup if aggregation jobs fail
  }
};

// Start server
const startServer = async () => {
  try {
    // Wait for Redis connection
    await redisService.client.ping();
    logger.info('Redis connection established');

    // Start HTTP server
    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`API Version: v1`);
      
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`API Documentation: http://localhost:${PORT}/api-docs`);
      }
    });

    // Start background jobs after server is running
    await startAggregationJobs();

    // Setup graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Export createApp function for testing
export const createApp = () => {
  return app;
};

export default app;