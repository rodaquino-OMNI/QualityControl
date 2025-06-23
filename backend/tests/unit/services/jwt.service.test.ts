import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { sign, verify, decode, TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { JWTService, TokenPayload, RefreshTokenPayload } from '../../../src/services/jwt.service';
import { authConfig } from '../../../src/config/auth.config';

// Mock jsonwebtoken
jest.mock('jsonwebtoken');
jest.mock('../../../src/config/auth.config');

describe('JWTService', () => {
  const mockedSign = sign as jest.MockedFunction<typeof sign>;
  const mockedVerify = verify as jest.MockedFunction<typeof verify>;
  const mockedDecode = decode as jest.MockedFunction<typeof decode>;
  
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
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
  
  const mockRoles = ['auditor', 'user'];
  const mockConfig = {
    jwt: {
      accessTokenSecret: 'access-secret',
      refreshTokenSecret: 'refresh-secret',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      issuer: 'austa-platform',
      audience: 'austa-users',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (authConfig as any) = mockConfig;
  });

  describe('generateAccessToken', () => {
    it('should generate access token with correct payload and options', () => {
      const expectedToken = 'mock-access-token';
      mockedSign.mockReturnValue(expectedToken as any);

      const result = JWTService.generateAccessToken(mockUser, mockRoles);

      expect(mockedSign).toHaveBeenCalledWith(
        {
          sub: mockUser.id,
          email: mockUser.email,
          roles: mockRoles,
          type: 'access',
        },
        mockConfig.jwt.accessTokenSecret,
        {
          expiresIn: mockConfig.jwt.accessTokenExpiry,
          issuer: mockConfig.jwt.issuer,
          audience: mockConfig.jwt.audience,
        }
      );
      expect(result).toBe(expectedToken);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate refresh token without device ID', () => {
      const expectedToken = 'mock-refresh-token';
      mockedSign.mockReturnValue(expectedToken as any);

      const result = JWTService.generateRefreshToken(mockUser, mockRoles);

      expect(mockedSign).toHaveBeenCalledWith(
        {
          sub: mockUser.id,
          email: mockUser.email,
          roles: mockRoles,
          type: 'refresh',
        },
        mockConfig.jwt.refreshTokenSecret,
        {
          expiresIn: mockConfig.jwt.refreshTokenExpiry,
          issuer: mockConfig.jwt.issuer,
          audience: mockConfig.jwt.audience,
        }
      );
      expect(result).toBe(expectedToken);
    });

    it('should generate refresh token with device ID', () => {
      const expectedToken = 'mock-refresh-token';
      const deviceId = 'device-123';
      mockedSign.mockReturnValue(expectedToken as any);

      const result = JWTService.generateRefreshToken(mockUser, mockRoles, deviceId);

      expect(mockedSign).toHaveBeenCalledWith(
        {
          sub: mockUser.id,
          email: mockUser.email,
          roles: mockRoles,
          type: 'refresh',
          deviceId,
        },
        mockConfig.jwt.refreshTokenSecret,
        {
          expiresIn: mockConfig.jwt.refreshTokenExpiry,
          issuer: mockConfig.jwt.issuer,
          audience: mockConfig.jwt.audience,
        }
      );
      expect(result).toBe(expectedToken);
    });
  });

  describe('verifyAccessToken', () => {
    const mockToken = 'valid-access-token';
    const mockPayload: TokenPayload = {
      sub: mockUser.id,
      email: mockUser.email,
      roles: mockRoles,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    };

    it('should verify valid access token', () => {
      mockedVerify.mockReturnValue(mockPayload as any);

      const result = JWTService.verifyAccessToken(mockToken);

      expect(mockedVerify).toHaveBeenCalledWith(
        mockToken,
        mockConfig.jwt.accessTokenSecret,
        {
          issuer: mockConfig.jwt.issuer,
          audience: mockConfig.jwt.audience,
        }
      );
      expect(result).toEqual(mockPayload);
    });

    it('should throw error for wrong token type', () => {
      const invalidPayload = { ...mockPayload, type: 'refresh' as const };
      mockedVerify.mockReturnValue(invalidPayload as any);

      expect(() => JWTService.verifyAccessToken(mockToken))
        .toThrow('Invalid token type');
    });

    it('should handle expired token', () => {
      mockedVerify.mockImplementation(() => {
        throw new TokenExpiredError('Token expired', new Date());
      });

      expect(() => JWTService.verifyAccessToken(mockToken))
        .toThrow('Access token expired');
    });

    it('should handle invalid token', () => {
      mockedVerify.mockImplementation(() => {
        throw new JsonWebTokenError('Invalid token');
      });

      expect(() => JWTService.verifyAccessToken(mockToken))
        .toThrow('Invalid access token');
    });

    it('should propagate other errors', () => {
      const customError = new Error('Custom error');
      mockedVerify.mockImplementation(() => {
        throw customError;
      });

      expect(() => JWTService.verifyAccessToken(mockToken))
        .toThrow(customError);
    });
  });

  describe('verifyRefreshToken', () => {
    const mockToken = 'valid-refresh-token';
    const mockPayload: RefreshTokenPayload = {
      sub: mockUser.id,
      email: mockUser.email,
      roles: mockRoles,
      type: 'refresh',
      deviceId: 'device-123',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 604800,
    };

    it('should verify valid refresh token', () => {
      mockedVerify.mockReturnValue(mockPayload as any);

      const result = JWTService.verifyRefreshToken(mockToken);

      expect(mockedVerify).toHaveBeenCalledWith(
        mockToken,
        mockConfig.jwt.refreshTokenSecret,
        {
          issuer: mockConfig.jwt.issuer,
          audience: mockConfig.jwt.audience,
        }
      );
      expect(result).toEqual(mockPayload);
    });

    it('should throw error for wrong token type', () => {
      const invalidPayload = { ...mockPayload, type: 'access' as const };
      mockedVerify.mockReturnValue(invalidPayload as any);

      expect(() => JWTService.verifyRefreshToken(mockToken))
        .toThrow('Invalid token type');
    });

    it('should handle expired refresh token', () => {
      mockedVerify.mockImplementation(() => {
        throw new TokenExpiredError('Token expired', new Date());
      });

      expect(() => JWTService.verifyRefreshToken(mockToken))
        .toThrow('Refresh token expired');
    });

    it('should handle invalid refresh token', () => {
      mockedVerify.mockImplementation(() => {
        throw new JsonWebTokenError('Invalid token');
      });

      expect(() => JWTService.verifyRefreshToken(mockToken))
        .toThrow('Invalid refresh token');
    });
  });

  describe('generateTokenPair', () => {
    it('should generate both access and refresh tokens', () => {
      mockedSign
        .mockReturnValueOnce('mock-access-token' as any)
        .mockReturnValueOnce('mock-refresh-token' as any);

      const result = JWTService.generateTokenPair(mockUser, mockRoles, 'device-123');

      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
      expect(mockedSign).toHaveBeenCalledTimes(2);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'valid-token';
      const header = `Bearer ${token}`;

      const result = JWTService.extractTokenFromHeader(header);

      expect(result).toBe(token);
    });

    it('should return null for undefined header', () => {
      const result = JWTService.extractTokenFromHeader(undefined);
      expect(result).toBeNull();
    });

    it('should return null for non-Bearer header', () => {
      const result = JWTService.extractTokenFromHeader('Basic dGVzdA==');
      expect(result).toBeNull();
    });

    it('should return null for malformed Bearer header', () => {
      const result = JWTService.extractTokenFromHeader('Bearer');
      expect(result).toBe('');
    });

    it('should handle Bearer header with extra spaces', () => {
      const token = 'valid-token';
      const header = `Bearer  ${token}`;

      const result = JWTService.extractTokenFromHeader(header);

      expect(result).toBe(` ${token}`);
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const mockDecodedToken = {
        sub: mockUser.id,
        email: mockUser.email,
        type: 'access',
      };
      mockedDecode.mockReturnValue(mockDecodedToken);

      const result = JWTService.decodeToken('any-token');

      expect(mockedDecode).toHaveBeenCalledWith('any-token');
      expect(result).toEqual(mockDecodedToken);
    });

    it('should handle null return from decode', () => {
      mockedDecode.mockReturnValue(null);

      const result = JWTService.decodeToken('invalid-token');

      expect(result).toBeNull();
    });
  });
});
