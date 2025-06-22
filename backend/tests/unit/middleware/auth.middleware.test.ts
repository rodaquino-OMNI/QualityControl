/// <reference path="../../globals.d.ts" />
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthMiddleware } from '../../../src/middleware/auth.middleware';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../../src/services/jwt.service');
jest.mock('../../../src/services/rbac.service');
jest.mock('../../../src/services/redisService');
jest.mock('@prisma/client');
jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let authMiddleware: AuthMiddleware;
  let mockPrisma: any;
  let mockRbacService: any;
  let mockRedisService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = (global as any).testUtils.createMockRequest();
    mockResponse = (global as any).testUtils.createMockResponse();
    mockNext = (global as any).testUtils.createMockNext();
    
    // Create mock services
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    mockRbacService = {
      hasPermission: jest.fn(),
      hasRole: jest.fn(),
    };
    mockRedisService = {
      checkRateLimit: jest.fn(),
    };
    
    authMiddleware = new AuthMiddleware(mockPrisma, mockRbacService, mockRedisService);
  });

  describe('authenticate middleware', () => {
    it('should authenticate valid token', async () => {
      // Arrange
      const token = 'valid-token';
      const decodedToken = {
        sub: '1',
        email: 'test@example.com',
        roles: ['auditor'],
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const user = {
        id: '1',
        email: 'test@example.com',
        isActive: true,
      };

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };
      
      // Mock JWTService
      const { JWTService } = require('../../../src/services/jwt.service');
      JWTService.extractTokenFromHeader = jest.fn().mockReturnValue(token);
      JWTService.verifyAccessToken = jest.fn().mockReturnValue(decodedToken);
      
      mockPrisma.user.findUnique.mockResolvedValue(user);

      // Act
      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(JWTService.extractTokenFromHeader).toHaveBeenCalledWith(`Bearer ${token}`);
      expect(JWTService.verifyAccessToken).toHaveBeenCalledWith(token);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        select: {
          id: true,
          email: true,
          isActive: true,
        },
      });
      expect(mockRequest.user).toEqual({
        id: '1',
        email: 'test@example.com',
        roles: ['auditor'],
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing authorization header', async () => {
      // Arrange
      mockRequest.headers = {};
      
      const { JWTService } = require('../../../src/services/jwt.service');
      JWTService.extractTokenFromHeader = jest.fn().mockReturnValue(null);

      // Act
      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'NO_TOKEN',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token format', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'InvalidFormat token',
      };
      
      const { JWTService } = require('../../../src/services/jwt.service');
      JWTService.extractTokenFromHeader = jest.fn().mockReturnValue(null);

      // Act
      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'NO_TOKEN',
      });
    });

    it('should reject expired token', async () => {
      // Arrange
      const token = 'expired-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };
      
      const { JWTService } = require('../../../src/services/jwt.service');
      JWTService.extractTokenFromHeader = jest.fn().mockReturnValue(token);
      JWTService.verifyAccessToken = jest.fn().mockImplementation(() => {
        const error = new Error('Access token expired');
        throw error;
      });

      // Act
      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    });

    it('should reject invalid token', async () => {
      // Arrange
      const token = 'invalid-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };
      
      const { JWTService } = require('../../../src/services/jwt.service');
      JWTService.extractTokenFromHeader = jest.fn().mockReturnValue(token);
      JWTService.verifyAccessToken = jest.fn().mockImplementation(() => {
        throw new Error('invalid token');
      });

      // Act
      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    });

    it('should handle user not found', async () => {
      // Arrange
      const token = 'valid-token';
      const decodedToken = {
        sub: 'non-existent-id',
        email: 'test@example.com',
        roles: ['auditor'],
        type: 'access',
      };

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };
      
      const { JWTService } = require('../../../src/services/jwt.service');
      JWTService.extractTokenFromHeader = jest.fn().mockReturnValue(token);
      JWTService.verifyAccessToken = jest.fn().mockReturnValue(decodedToken);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Act
      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid token',
        code: 'INVALID_USER',
      });
    });
  });

  describe('requireRole', () => {
    it('should allow access for matching role', async () => {
      // Arrange
      mockRequest.user = {
        id: '1',
        email: 'test@example.com',
        roles: ['admin'],
      };
      mockRbacService.hasRole.mockResolvedValue(true);
      const middleware = authMiddleware.requireRole('admin');

      // Act
      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockRbacService.hasRole).toHaveBeenCalledWith('1', 'admin');
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should allow access for any role using requireAnyRole', async () => {
      // Arrange
      mockRequest.user = {
        id: '1',
        email: 'test@example.com',
        roles: ['auditor'],
      };
      mockRbacService.hasAnyRole.mockResolvedValue(true);
      const middleware = authMiddleware.requireAnyRole(['admin', 'auditor', 'reviewer']);

      // Act
      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockRbacService.hasAnyRole).toHaveBeenCalledWith('1', ['admin', 'auditor', 'reviewer']);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access for non-matching role', async () => {
      // Arrange
      mockRequest.user = {
        id: '1',
        email: 'test@example.com',
        roles: ['viewer'],
      };
      mockRbacService.hasRole.mockResolvedValue(false);
      const middleware = authMiddleware.requireRole('admin');

      // Act
      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Insufficient role',
        code: 'FORBIDDEN',
        required: 'admin',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle missing user', async () => {
      // Arrange
      mockRequest.user = undefined;
      const middleware = authMiddleware.requireRole('admin');

      // Act
      await middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'NO_AUTH',
      });
    });
  });
});