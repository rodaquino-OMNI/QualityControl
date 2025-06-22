import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { RBACService } from '../services/rbac.service';
import { RedisService } from '../services/redisService';
import { PrismaClient } from '@prisma/client';

export function createUserRoutes(
  prisma: PrismaClient,
  redisService: RedisService
): Router {
  const router = Router();
  
  // Initialize services
  const rbacService = new RBACService(prisma);
  const authMiddleware = new AuthMiddleware(prisma, rbacService, redisService);
  const userController = new UserController(prisma, rbacService);

  // All user routes require authentication
  router.use(authMiddleware.authenticate);

  // User management routes
  router.get(
    '/',
    authMiddleware.requirePermission('users', 'read'),
    authMiddleware.auditLog('list', 'users'),
    userController.getUsers
  );

  router.get(
    '/:id',
    authMiddleware.requirePermission('users', 'read'),
    authMiddleware.auditLog('view', 'users'),
    userController.getUserById
  );

  router.post(
    '/',
    authMiddleware.requirePermission('users', 'create'),
    authMiddleware.auditLog('create', 'users'),
    userController.createUser
  );

  router.put(
    '/:id',
    authMiddleware.requirePermission('users', 'update'),
    authMiddleware.auditLog('update', 'users'),
    userController.updateUser
  );

  router.delete(
    '/:id',
    authMiddleware.requirePermission('users', 'delete'),
    authMiddleware.auditLog('delete', 'users'),
    userController.deleteUser
  );

  router.put(
    '/:id/roles',
    authMiddleware.requireRole('admin'),
    authMiddleware.auditLog('update-roles', 'users'),
    userController.updateUserRoles
  );

  router.post(
    '/:id/reset-password',
    authMiddleware.requireRole('admin'),
    authMiddleware.auditLog('reset-password', 'users'),
    userController.resetPassword
  );

  return router;
}