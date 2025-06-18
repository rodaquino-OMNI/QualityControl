import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware, requireRole } from '@/middleware/auth.middleware';
import { UserService } from '@/services/user.service';
import { jest } from '@jest/globals';

jest.mock('@/services/user.service');
jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockUserService: jest.Mocked<UserService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = global.testUtils.createMockRequest();
    mockResponse = global.testUtils.createMockResponse();
    mockNext = global.testUtils.createMockNext();
    mockUserService = new UserService() as jest.Mocked<UserService>;
  });

  describe('authMiddleware', () => {
    it('should authenticate valid token', async () => {
      // Arrange
      const token = 'valid-token';
      const decodedToken = {
        id: '1',
        email: 'test@example.com',
        role: 'auditor',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };
      const user = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'auditor',
      };

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };
      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);
      mockUserService.findById.mockResolvedValue(user);

      // Act
      await authMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(mockUserService.findById).toHaveBeenCalledWith('1');
      expect(mockRequest.user).toEqual(user);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing authorization header', async () => {
      // Arrange
      mockRequest.headers = {};

      // Act
      await authMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'No token provided',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token format', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'InvalidFormat token',
      };

      // Act
      await authMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid token format',
        },
      });
    });

    it('should reject expired token', async () => {
      // Arrange
      const token = 'expired-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        const error: any = new Error('jwt expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      // Act
      await authMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Token expired',
        },
      });
    });

    it('should reject invalid token', async () => {
      // Arrange
      const token = 'invalid-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid token');
      });

      // Act
      await authMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid token',
        },
      });
    });

    it('should handle user not found', async () => {
      // Arrange
      const token = 'valid-token';
      const decodedToken = {
        id: 'non-existent-id',
        email: 'test@example.com',
        role: 'auditor',
      };

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };
      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);
      mockUserService.findById.mockResolvedValue(null);

      // Act
      await authMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'User not found',
        },
      });
    });
  });

  describe('requireRole', () => {
    it('should allow access for matching role', () => {
      // Arrange
      mockRequest.user = {
        id: '1',
        email: 'test@example.com',
        role: 'admin',
      };
      const middleware = requireRole('admin');

      // Act
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should allow access for multiple roles', () => {
      // Arrange
      mockRequest.user = {
        id: '1',
        email: 'test@example.com',
        role: 'auditor',
      };
      const middleware = requireRole(['admin', 'auditor', 'reviewer']);

      // Act
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access for non-matching role', () => {
      // Arrange
      mockRequest.user = {
        id: '1',
        email: 'test@example.com',
        role: 'viewer',
      };
      const middleware = requireRole('admin');

      // Act
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Insufficient permissions',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle missing user', () => {
      // Arrange
      mockRequest.user = undefined;
      const middleware = requireRole('admin');

      // Act
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Authentication required',
        },
      });
    });
  });
});