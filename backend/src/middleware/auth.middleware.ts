import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { JWTService } from '../services/jwt.service';
import { RBACService } from '../services/rbac.service';
import { RedisService } from '../services/redisService';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        roles: string[];
      };
      sessionId?: string;
    }
  }
}

export class AuthMiddleware {
  private prisma: PrismaClient;
  private rbacService: RBACService;
  private redisService: RedisService;

  constructor(prisma: PrismaClient, rbacService: RBACService, redisService: RedisService) {
    this.prisma = prisma;
    this.rbacService = rbacService;
    this.redisService = redisService;
  }

  /**
   * Authenticate user from JWT token
   */
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract token from header
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (!token) {
        res.status(401).json({
          error: 'Authentication required',
          code: 'NO_TOKEN',
        });
        return;
      }

      // Verify token
      const payload = JWTService.verifyAccessToken(token);

      // Check if user exists and is active
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        res.status(401).json({
          error: 'Invalid token',
          code: 'INVALID_USER',
        });
        return;
      }

      // Attach user to request
      req.user = {
        id: user.id,
        email: user.email,
        roles: payload.roles,
      };

      next();
    } catch (error: any) {
      if (error.message === 'Access token expired') {
        res.status(401).json({
          error: 'Token expired',
          code: 'TOKEN_EXPIRED',
        });
        return;
      }

      res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }
  };

  /**
   * Optional authentication - doesn't fail if no token
   */
  optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (token) {
        const payload = JWTService.verifyAccessToken(token);
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: {
            id: true,
            email: true,
            isActive: true,
          },
        });

        if (user && user.isActive) {
          req.user = {
            id: user.id,
            email: user.email,
            roles: payload.roles,
          };
        }
      }
    } catch {
      // Ignore errors for optional auth
    }

    next();
  };

  /**
   * Require specific permission
   */
  requirePermission = (resource: string, action: string) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          code: 'NO_AUTH',
        });
        return;
      }

      const hasPermission = await this.rbacService.hasPermission(
        req.user.id,
        resource,
        action
      );

      if (!hasPermission) {
        res.status(403).json({
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: `${resource}:${action}`,
        });
        return;
      }

      next();
    };
  };

  /**
   * Require any of the specified permissions
   */
  requireAnyPermission = (permissions: Array<{ resource: string; action: string }>) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          code: 'NO_AUTH',
        });
        return;
      }

      const hasPermission = await this.rbacService.hasAnyPermission(
        req.user.id,
        permissions
      );

      if (!hasPermission) {
        res.status(403).json({
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: permissions.map((p) => `${p.resource}:${p.action}`),
        });
        return;
      }

      next();
    };
  };

  /**
   * Require all of the specified permissions
   */
  requireAllPermissions = (permissions: Array<{ resource: string; action: string }>) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          code: 'NO_AUTH',
        });
        return;
      }

      const hasPermissions = await this.rbacService.hasAllPermissions(
        req.user.id,
        permissions
      );

      if (!hasPermissions) {
        res.status(403).json({
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: permissions.map((p) => `${p.resource}:${p.action}`),
        });
        return;
      }

      next();
    };
  };

  /**
   * Require specific role
   */
  requireRole = (role: string) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          code: 'NO_AUTH',
        });
        return;
      }

      const hasRole = await this.rbacService.hasRole(req.user.id, role);

      if (!hasRole) {
        res.status(403).json({
          error: 'Insufficient role',
          code: 'FORBIDDEN',
          required: role,
        });
        return;
      }

      next();
    };
  };

  /**
   * Require any of the specified roles
   */
  requireAnyRole = (roles: string[]) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          code: 'NO_AUTH',
        });
        return;
      }

      const hasRole = await this.rbacService.hasAnyRole(req.user.id, roles);

      if (!hasRole) {
        res.status(403).json({
          error: 'Insufficient role',
          code: 'FORBIDDEN',
          required: roles,
        });
        return;
      }

      next();
    };
  };

  /**
   * Rate limiting middleware
   */
  rateLimit = (options?: {
    windowMs?: number;
    max?: number;
    keyGenerator?: (req: Request) => string;
  }) => {
    const windowMs = options?.windowMs || 15 * 60 * 1000; // 15 minutes
    const max = options?.max || 100;
    const keyGenerator = options?.keyGenerator || ((req) => req.ip || 'unknown');

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const key = keyGenerator(req);
      const result = await this.redisService.checkRateLimit(key, max, windowMs);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

      if (!result.allowed) {
        res.status(429).json({
          error: 'Too many requests',
          code: 'RATE_LIMITED',
          retryAfter: result.resetAt,
        });
        return;
      }

      next();
    };
  };

  /**
   * Log audit event
   */
  auditLog = (action: string, resource: string) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Log on response finish
      res.on('finish', async () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          await this.prisma.activityLog.create({
            data: {
              userId: req.user?.id,
              action,
              entityType: resource,
              entityId: req.params.id,
              ipAddress: req.ip || 'unknown',
              userAgent: req.get('user-agent'),
            },
          });
        }
      });

      next();
    };
  };
}