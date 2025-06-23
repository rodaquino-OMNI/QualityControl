/**
 * Auth middleware exports for backward compatibility
 * Provides function-based middleware exports
 */

import { AuthMiddleware } from './auth.middleware';
import { prisma } from '../config/database';
import { RBACService } from '../services/rbac.service';
import { RedisService } from '../services/redisService';

// Create singleton instances
const rbacService = new RBACService(prisma);
const redisService = new RedisService();
const authMiddleware = new AuthMiddleware(prisma, rbacService, redisService);

// Export function-based middleware for backward compatibility
export const authenticate = authMiddleware.authenticate;
export const requireRole = authMiddleware.requireRole;
export const requireAnyRole = authMiddleware.requireAnyRole;
export const auditLog = authMiddleware.auditLog;

// Add authorize as an alias for requireAnyRole for backward compatibility
export const authorize = (...roles: string[]) => authMiddleware.requireAnyRole(roles);

// Export the class instance as well
export const authMiddlewareInstance = authMiddleware;
export { AuthMiddleware } from './auth.middleware';