/**
 * Express Application Setup
 * Main application configuration and middleware setup
 */

import express, { Express, Request, Response } from 'express';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { RBACService } from './services/rbac.service';
import { RedisService } from './services/redisService';

// Import middleware
import { AuthMiddleware } from './middleware/auth.middleware';
import { errorHandler } from './middleware/errorHandler';
import { corsMiddleware, helmetMiddleware, securityHeaders } from './middleware/security.middleware';
import { tracingMiddleware } from './middleware/tracing.middleware';

// Import routes
import { createAuthRoutes } from './routes/auth.routes';
import { caseRoutes } from './routes/case.routes';
import { createUserRoutes } from './routes/user.routes';
import { analyticsRoutes } from './routes/analytics.routes';
import { healthRoutes } from './routes/health.routes';
import { errorRoutes } from './routes/error.routes';

export function createApp(): Express {
  const app = express();

  // Basic middleware
  app.use(helmetMiddleware);

  app.use(corsMiddleware);

  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
  });

  app.use('/api', limiter as any);

  // Custom middleware
  app.use(tracingMiddleware);
  app.use(securityHeaders);

  // Health check endpoint (before auth)
  app.use('/health', healthRoutes);
  app.use('/api/health', healthRoutes);

  // API routes
  // Setup services
  const prisma = new PrismaClient();
  const rbacService = new RBACService(prisma);
  const redisService = new RedisService();
  
  const authRoutes = createAuthRoutes(prisma, redisService);
  app.use('/api/auth', authRoutes);
  
  // Error reporting routes (no auth required for frontend error reporting)
  app.use('/api/errors', errorRoutes);

  // Protected routes (require authentication)
  const authMiddleware = new AuthMiddleware(prisma, rbacService, redisService);
  app.use('/api', authMiddleware.authenticate);
  const userRoutes = createUserRoutes(prisma, redisService);
  app.use('/api/cases', caseRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/analytics', analyticsRoutes);

  // 404 handler
  app.use('*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        type: 'not_found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      }
    });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}

export default createApp;