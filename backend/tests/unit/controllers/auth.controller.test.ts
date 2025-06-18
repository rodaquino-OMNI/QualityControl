import { Request, Response, NextFunction } from 'express';
import { AuthController } from '@/controllers/auth.controller';
import { AuthService } from '@/services/auth.service';
import { jest } from '@jest/globals';

// Mock the auth service
jest.mock('@/services/auth.service');

describe('AuthController', () => {
  let authController: AuthController;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Initialize mocked service
    mockAuthService = new AuthService() as jest.Mocked<AuthService>;
    authController = new AuthController(mockAuthService);
    
    // Create mock request and response
    mockRequest = global.testUtils.createMockRequest();
    mockResponse = global.testUtils.createMockResponse();
    mockNext = global.testUtils.createMockNext();
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
        role: 'auditor',
      };
      const mockToken = 'mock-jwt-token';

      mockRequest.body = loginData;
      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        token: mockToken,
      });

      // Act
      await authController.login(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledWith(
        loginData.email,
        loginData.password
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          user: mockUser,
          token: mockToken,
        },
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
      await authController.login(
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
      await authController.login(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('validation'),
        }),
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
        name: 'New User',
        role: 'auditor',
      };
      const mockUser = {
        id: '2',
        email: registerData.email,
        name: registerData.name,
        role: registerData.role,
      };

      mockRequest.body = registerData;
      mockAuthService.register.mockResolvedValue(mockUser);

      // Act
      await authController.register(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockAuthService.register).toHaveBeenCalledWith(registerData);
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
        name: 'Existing User',
        role: 'auditor',
      };
      mockAuthService.register.mockRejectedValue(
        new Error('Email already exists')
      );

      // Act
      await authController.register(
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
      mockRequest.user = { id: '1' };
      mockAuthService.logout.mockResolvedValue(undefined);

      // Act
      await authController.logout(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockAuthService.logout).toHaveBeenCalledWith('1');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logged out successfully',
      });
    });
  });

  describe('refreshToken', () => {
    it('should refresh authentication token', async () => {
      // Arrange
      const oldToken = 'old-token';
      const newToken = 'new-token';
      mockRequest.headers.authorization = `Bearer ${oldToken}`;
      mockAuthService.refreshToken.mockResolvedValue(newToken);

      // Act
      await authController.refreshToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(oldToken);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { token: newToken },
      });
    });

    it('should handle missing authorization header', async () => {
      // Arrange
      mockRequest.headers = {};

      // Act
      await authController.refreshToken(
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
    });
  });
});