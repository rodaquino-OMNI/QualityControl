import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { AuthService } from '../services/auth.service';
import { RBACService } from '../services/rbac.service';
import { RedisService } from '../services/redis.service';
import { PrismaClient } from '@prisma/client';

export function createAuthRoutes(
  prisma: PrismaClient,
  redisService: RedisService
): Router {
  const router = Router();
  
  // Initialize services
  const authService = new AuthService(prisma, redisService);
  const rbacService = new RBACService(prisma);
  const authMiddleware = new AuthMiddleware(prisma, rbacService, redisService);
  const authController = new AuthController(authService, prisma);

  // Public routes
  router.post('/register', authController.register);
  router.post('/login', authController.login);
  router.post('/refresh', authController.refreshToken);
  router.post('/mfa/verify', authController.verifyMFA);
  
  // OAuth routes
  router.get('/oauth/:provider', authController.initiateOAuth);
  router.get('/callback', authController.handleOAuthCallback);

  // Protected routes
  router.use(authMiddleware.authenticate);
  
  router.get('/me', authController.getCurrentUser);
  router.post('/logout', authController.logout);
  router.post('/mfa/enable', authController.enableMFA);
  router.post('/mfa/disable', authController.disableMFA);

  return router;
}