/// <reference path="../../globals.d.ts" />
import { Request, Response, NextFunction } from 'express';
import { AuthController } from '../../../src/controllers/auth.controller';
import { AuthService } from '../../../src/services/auth.service';
import { jest } from '@jest/globals';

// Mock the auth service
jest.mock('../../../src/services/auth.service');

describe('AuthController', () => {
  let authController: AuthController;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock Prisma client
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    } as any;
    
    // Create mock Redis service
    const mockRedis = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    } as any;
    
    // Initialize mocked service with proper constructor
    mockAuthService = new AuthService(mockPrisma, mockRedis) as jest.Mocked<AuthService>;
    authController = new AuthController(mockAuthService, mockPrisma);
    
    // Create mock request and response
    mockRequest = (global as any).testUtils.createMockRequest();
    mockResponse = (global as any).testUtils.createMockResponse();
    mockNext = (global as any).testUtils.createMockNext();
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };
      const mockUser = {
        id: '1',
        email: loginData.email,
        name: 'Test User',
        organizationId: null,
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User',
        username: null,
        avatar: null,
        isActive: true,
        isEmailVerified: true,
        mfaEnabled: false,
        mfaSecret: null,
        role: 'auditor',
        department: null,
        jobTitle: null,
        phone: null,
        lastLoginAt: null,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        passwordResetToken: null,
        passwordResetExpires: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockResult = {
        user: mockUser,
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      };

      mockRequest.body = loginData;
      mockAuthService.login.mockResolvedValue(mockResult);

      // Act
      const loginArray = authController.login;
      const actualHandler = loginArray[loginArray.length - 1];
      await actualHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledWith(
        loginData.email,
        loginData.password,
        undefined
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        user: {
          id: mockResult.user.id,
          email: mockResult.user.email,
          firstName: mockResult.user.firstName,
          lastName: mockResult.user.lastName,
          avatar: mockResult.user.avatar,
        },
        accessToken: mockResult.accessToken,
        refreshToken: mockResult.refreshToken,
      });
    });

    it('should handle invalid credentials', async () => {
      // Arrange
      mockRequest.body = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };
      mockAuthService.login.mockRejectedValue(
        new Error('Invalid credentials')
      );

      // Act
      const loginArray = authController.login;
      const actualHandler = loginArray[loginArray.length - 1];
      await actualHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid credentials',
        })
      );
    });

    it('should validate request body', async () => {
      // Arrange
      mockRequest.body = {
        email: 'invalid-email',
        password: '123', // Too short
      };

      // Act
      // Mock validation result to show errors
      const { validationResult } = require('express-validator');
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'Validation error' }],
      });
      
      const loginArray = authController.login;
      const actualHandler = loginArray[loginArray.length - 1];
      await actualHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        errors: [{ msg: 'Validation error' }],
      });
      expect(mockAuthService.login).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      // Arrange
      const registerData = {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        firstName: 'New',
        lastName: 'User',
        username: 'newuser',
      };
      const mockUser = {
        id: '2',
        email: registerData.email,
        name: 'New User',
        organizationId: null,
        password: 'hashedpassword',
        firstName: registerData.firstName,
        lastName: registerData.lastName,
        username: registerData.username,
        avatar: null,
        isActive: true,
        isEmailVerified: true,
        mfaEnabled: false,
        mfaSecret: null,
        role: 'auditor',
        department: null,
        jobTitle: null,
        phone: null,
        lastLoginAt: null,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        passwordResetToken: null,
        passwordResetExpires: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      mockRequest.body = registerData;
      mockAuthService.register.mockResolvedValue(mockUser);

      // Act
      const registerArray = authController.register;
      const actualHandler = registerArray[registerArray.length - 1];
      await actualHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockAuthService.register).toHaveBeenCalledWith(
        registerData.email,
        registerData.password,
        registerData.firstName,
        registerData.lastName,
        registerData.username
      );
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockUser,
      });
    });

    it('should handle duplicate email registration', async () => {
      // Arrange
      mockRequest.body = {
        email: 'existing@example.com',
        password: 'SecurePass123!',
        firstName: 'Existing',
        lastName: 'User',
      };
      mockAuthService.register.mockRejectedValue(
        new Error('Email already exists')
      );

      // Act
      const registerArray = authController.register;
      const actualHandler = registerArray[registerArray.length - 1];
      await actualHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Email already exists',
        })
      );
    });
  });

  describe('logout', () => {
    it('should successfully logout user', async () => {
      // Arrange
      mockRequest.user = { id: '1', email: 'test@example.com', roles: ['auditor'] };
      mockRequest.body = { refreshToken: 'refresh-token' };
      mockAuthService.logout.mockResolvedValue(undefined);

      // Act
      await authController.logout(
        mockRequest as Request,
        mockResponse as Response
      );

      // Assert
      expect(mockAuthService.logout).toHaveBeenCalledWith('1', 'refresh-token');
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Logged out successfully',
      });
    });
  });

  describe('refreshToken', () => {
    it('should refresh authentication token', async () => {
      // Arrange
      const oldRefreshToken = 'old-refresh-token';
      const newTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };
      mockRequest.body = { refreshToken: oldRefreshToken };
      mockAuthService.refreshToken.mockResolvedValue(newTokens);

      // Act
      const refreshArray = authController.refreshToken;
      const actualHandler = refreshArray[refreshArray.length - 1];
      await actualHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(oldRefreshToken);
      expect(mockResponse.json).toHaveBeenCalledWith(newTokens);
    });

    it('should handle missing refresh token', async () => {
      // Arrange
      mockRequest.body = {};
      
      // Mock validation result to show errors
      const { validationResult } = require('express-validator');
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'refreshToken is required' }],
      });

      // Act
      const refreshArray = authController.refreshToken;
      const actualHandler = refreshArray[refreshArray.length - 1];
      await actualHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        errors: [{ msg: 'refreshToken is required' }],
      });
    });
  });
});