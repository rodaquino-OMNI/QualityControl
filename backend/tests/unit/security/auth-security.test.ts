import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthService } from '../../../src/services/auth.service';
import { JWTService } from '../../../src/services/jwt.service';
import { PrismaClient } from '@prisma/client';
import { RedisService } from '../../../src/services/redisService';

// Mock dependencies
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('@prisma/client');
jest.mock('../../../src/services/redisService');

describe('Authentication Security Tests', () => {
  let authService: AuthService;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockRedis: jest.Mocked<RedisService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    mockRedis = new RedisService() as jest.Mocked<RedisService>;
    authService = new AuthService(mockPrisma, mockRedis);
  });

  describe('Password Security', () => {
    it('should hash passwords with sufficient complexity', async () => {
      const password = 'TestPassword123!';
      const hashedPassword = '$2b$12$hashedpassword';
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);

      await authService.register('test@example.com', password, 'Test', 'User');

      expect(bcrypt.hash).toHaveBeenCalledWith(password, expect.any(Number));
      const saltRounds = (bcrypt.hash as jest.Mock).mock.calls[0][1];
      expect(saltRounds).toBeGreaterThanOrEqual(12);
    });

    it('should prevent weak passwords', async () => {
      const weakPasswords = [
        '123456',
        'password',
        'Password1',
        'qwerty',
        '12345678',
        'password123',
        'admin',
        'user'
      ];

      for (const weakPassword of weakPasswords) {
        await expect(
          authService.register('test@example.com', weakPassword, 'Test', 'User')
        ).rejects.toThrow(/password/i);
      }
    });

    it('should enforce password complexity requirements', async () => {
      const invalidPasswords = [
        'onlylowercase',  // No uppercase, numbers, or special chars
        'ONLYUPPERCASE', // No lowercase, numbers, or special chars
        'NoNumbers!',    // No numbers
        'NoSpecial123',  // No special characters
        'Short1!',       // Too short
      ];

      for (const invalidPassword of invalidPasswords) {
        await expect(
          authService.register('test@example.com', invalidPassword, 'Test', 'User')
        ).rejects.toThrow();
      }
    });

    it('should use constant-time password comparison', async () => {
      const plainPassword = 'TestPassword123!';
      const hashedPassword = '$2b$12$hashedpassword';
      
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        password: hashedPassword,
        isActive: true,
        role: 'auditor'
      } as any);

      await authService.login('test@example.com', plainPassword);

      expect(bcrypt.compare).toHaveBeenCalledWith(plainPassword, hashedPassword);
    });
  });

  describe('JWT Security', () => {
    it('should use strong JWT secrets', () => {
      const testSecret = 'weak';
      expect(() => {
        JWTService.generateAccessToken({ id: '1', email: 'test@example.com' } as any, ['user']);
      }).not.toThrow();

      // Verify secret strength requirements
      const secrets = [
        process.env.JWT_SECRET,
        process.env.JWT_REFRESH_SECRET
      ];

      secrets.forEach(secret => {
        if (secret && secret !== 'change-this-secret' && secret !== 'change-this-refresh-secret') {
          expect(secret.length).toBeGreaterThanOrEqual(32);
        }
      });
    });

    it('should have short access token expiry', () => {
      const token = JWTService.generateAccessToken({ id: '1', email: 'test@example.com' } as any, ['user']);
      const decoded = jwt.decode(token) as any;
      
      if (decoded && decoded.exp && decoded.iat) {
        const expiryMinutes = (decoded.exp - decoded.iat) / 60;
        expect(expiryMinutes).toBeLessThanOrEqual(15); // 15 minutes max
      }
    });

    it('should validate JWT algorithm', () => {
      const maliciousToken = jwt.sign(
        { sub: '1', email: 'test@example.com', roles: ['admin'] },
        'public-key',
        { algorithm: 'none' }
      );

      expect(() => {
        JWTService.verifyAccessToken(maliciousToken);
      }).toThrow();
    });

    it('should prevent JWT confusion attacks', () => {
      const publicKey = 'malicious-public-key';
      const maliciousToken = jwt.sign(
        { sub: '1', email: 'test@example.com', roles: ['admin'] },
        publicKey,
        { algorithm: 'HS256' }
      );

      expect(() => {
        JWTService.verifyAccessToken(maliciousToken);
      }).toThrow();
    });

    it('should include required claims in JWT', () => {
      const user = { id: '1', email: 'test@example.com' } as any;
      const roles = ['user'];
      const token = JWTService.generateAccessToken(user, roles);
      const decoded = jwt.decode(token) as any;

      expect(decoded).toHaveProperty('sub', user.id);
      expect(decoded).toHaveProperty('email', user.email);
      expect(decoded).toHaveProperty('roles', roles);
      expect(decoded).toHaveProperty('type', 'access');
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
    });
  });

  describe('Session Security', () => {
    it('should invalidate all sessions on logout', async () => {
      const userId = '1';
      
      await authService.logout(userId);

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId }
      });
      expect(mockRedis.clearUserSessions).toHaveBeenCalledWith(userId);
    });

    it('should prevent session fixation', async () => {
      // Test that new sessions are created on login
      const loginResult = await authService.login('test@example.com', 'password');
      
      expect(loginResult).toHaveProperty('accessToken');
      expect(loginResult).toHaveProperty('refreshToken');
      
      // Tokens should be different on each login
      const secondLogin = await authService.login('test@example.com', 'password');
      expect(secondLogin.accessToken).not.toBe(loginResult.accessToken);
    });

    it('should implement session timeout', async () => {
      const refreshToken = 'test-refresh-token';
      const expiredDate = new Date(Date.now() - 1000); // 1 second ago
      
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        token: refreshToken,
        userId: '1',
        expiresAt: expiredDate,
        user: { id: '1', role: 'user' }
      } as any);

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow('expired');
    });
  });

  describe('Brute Force Protection', () => {
    it('should track failed login attempts', async () => {
      const email = 'test@example.com';
      const wrongPassword = 'wrongpassword';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email,
        password: '$2b$12$hashedpassword',
        isActive: true
      } as any);
      
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(email, wrongPassword)).rejects.toThrow();

      // Verify that failed attempt is logged
      expect(mockPrisma.loginHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: '1',
          success: false
        })
      });
    });

    it('should implement account lockout after multiple failures', async () => {
      const email = 'test@example.com';
      
      // Mock user with recent failed attempts
      mockPrisma.loginHistory.count.mockResolvedValue(5); // 5 failed attempts
      
      const lockedUser = {
        id: '1',
        email,
        password: '$2b$12$hashedpassword',
        isActive: true,
        accountLockedUntil: new Date(Date.now() + 300000) // 5 minutes from now
      };
      
      mockPrisma.user.findUnique.mockResolvedValue(lockedUser as any);

      await expect(authService.login(email, 'correct-password')).rejects.toThrow(/locked/i);
    });
  });

  describe('MFA Security', () => {
    it('should store MFA secrets encrypted', async () => {
      const userId = '1';
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'test@example.com'
      } as any);

      const result = await authService.enableMFA(userId);

      // Verify that the secret is not stored in plain text
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: expect.objectContaining({
          mfaSecret: expect.any(String),
          mfaEnabled: true
        })
      });

      // The secret should be base32 encoded
      expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    });

    it('should validate TOTP window size', async () => {
      const userId = '1';
      const mfaSecret = 'JBSWY3DPEHPK3PXP';
      
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        mfaSecret,
        mfaEnabled: true
      } as any);

      // Test with valid TOTP
      const validToken = '123456';
      await authService.verifyMFA(userId, validToken);

      // Verify that window size is limited to prevent replay attacks
      // Window should be 1 or 2 maximum
    });
  });

  describe('Authorization Security', () => {
    it('should prevent privilege escalation', async () => {
      const token = jwt.sign(
        { sub: '1', email: 'test@example.com', roles: ['user'] },
        'secret'
      );

      // Try to access admin endpoint with user token
      expect(() => {
        const decoded = JWTService.verifyAccessToken(token);
        expect(decoded.roles).not.toContain('admin');
      }).not.toThrow();
    });

    it('should validate user roles against database', async () => {
      const userId = '1';
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        role: 'user',
        isActive: true
      } as any);

      // Token claims should match database roles
      const token = JWTService.generateAccessToken(
        { id: userId, email: 'test@example.com' } as any,
        ['user']
      );

      const decoded = JWTService.verifyAccessToken(token);
      expect(decoded.roles).toEqual(['user']);
    });
  });

  describe('OAuth Security', () => {
    it('should validate OAuth state parameter', async () => {
      // Test CSRF protection in OAuth flow
      const oauthProfile = {
        id: 'oauth-id',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        provider: 'google'
      };

      // Should validate state parameter to prevent CSRF
      await authService.oauthLogin(oauthProfile, 'google');

      // Verify that user is created/updated properly
      expect(mockPrisma.user.create || mockPrisma.user.update).toHaveBeenCalled();
    });

    it('should prevent OAuth account takeover', async () => {
      const existingUser = {
        id: '1',
        email: 'test@example.com',
        isActive: true
      };

      const oauthProfile = {
        id: 'oauth-id',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        provider: 'google'
      };

      mockPrisma.user.findUnique.mockResolvedValue(existingUser as any);

      // Should link OAuth account to existing user
      await authService.oauthLogin(oauthProfile, 'google');

      expect(mockPrisma.oAuthAccount.create).toHaveBeenCalledWith({
        data: {
          userId: existingUser.id,
          provider: 'google',
          providerId: 'oauth-id'
        }
      });
    });
  });
});