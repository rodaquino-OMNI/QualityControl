/**
 * Integration Tests for Authentication Routes
 * Tests all /api/auth endpoints with various scenarios
 */

import request from 'supertest';
import { Express } from 'express';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../backend/src/app';
import { setupTestDatabase, cleanupTestDatabase } from '../utils/test-db-setup';
import { TestDataFactory } from '../utils/test-data-factory';
import { AuthTestHelper } from '../utils/auth-test-helper';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

describe('Authentication Routes Integration Tests', () => {
  let app: Express;
  let prisma: PrismaClient;
  let testDataFactory: TestDataFactory;
  let authHelper: AuthTestHelper;
  let testUser: any;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    testDataFactory = new TestDataFactory(prisma);
    authHelper = new AuthTestHelper();
    app = createApp();

    // Create test user for login tests
    testUser = await testDataFactory.createUser({
      email: 'existing@austa.com',
      password: await bcrypt.hash('TestPassword123!', 10),
      role: 'auditor',
      name: 'Test User'
    });
  });

  afterAll(async () => {
    await cleanupTestDatabase(prisma);
  });

  beforeEach(async () => {
    await testDataFactory.cleanup();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const userData = {
        email: 'newuser@austa.com',
        password: 'SecurePassword123!',
        name: 'New User',
        role: 'auditor'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            email: userData.email,
            name: userData.name,
            role: userData.role
          },
          token: expect.any(String)
        }
      });

      // Verify user was created in database
      const createdUser = await prisma.user.findUnique({
        where: { email: userData.email }
      });
      expect(createdUser).toBeTruthy();
      expect(createdUser?.isActive).toBe(true);
    });

    it('should reject registration with existing email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testUser.email,
          password: 'SecurePassword123!',
          name: 'Duplicate User',
          role: 'auditor'
        })
        .expect(400);

      expect(response.body.error).toContain('already exists');
    });

    it('should validate password strength', async () => {
      const weakPasswords = [
        'password',
        '12345678',
        'Password',
        'Password1',
        'password123!'
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: `test${Date.now()}@austa.com`,
            password,
            name: 'Test User',
            role: 'auditor'
          })
          .expect(400);

        expect(response.body.error).toMatch(/password/i);
      }
    });

    it('should validate email format', async () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@example',
        'user.example.com'
      ];

      for (const email of invalidEmails) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email,
            password: 'SecurePassword123!',
            name: 'Test User',
            role: 'auditor'
          })
          .expect(400);

        expect(response.body.error).toMatch(/email/i);
      }
    });

    it('should validate role values', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@austa.com',
          password: 'SecurePassword123!',
          name: 'Test User',
          role: 'invalid-role'
        })
        .expect(400);

      expect(response.body.error).toMatch(/role/i);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            id: testUser.id,
            email: testUser.email,
            name: testUser.name,
            role: testUser.role
          },
          token: expect.any(String),
          refreshToken: expect.any(String)
        }
      });

      // Verify token is valid
      const decoded = jwt.verify(
        response.body.data.token,
        process.env.JWT_SECRET || 'test-secret'
      );
      expect(decoded).toMatchObject({
        sub: testUser.id,
        email: testUser.email,
        roles: [testUser.role]
      });
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@austa.com',
          password: 'Password123!'
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should reject inactive user', async () => {
      const inactiveUser = await testDataFactory.createUser({
        email: 'inactive@austa.com',
        password: await bcrypt.hash('TestPassword123!', 10),
        isActive: false
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: inactiveUser.email,
          password: 'TestPassword123!'
        })
        .expect(401);

      expect(response.body.error).toContain('Account is disabled');
    });

    it('should handle rate limiting on multiple failed attempts', async () => {
      const attempts = [];
      
      // Make 6 failed login attempts
      for (let i = 0; i < 6; i++) {
        attempts.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: testUser.email,
              password: 'WrongPassword'
            })
        );
      }

      const responses = await Promise.all(attempts);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      expect(rateLimitedResponses[0].body.error).toContain('Too many');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      // First login to get tokens
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'TestPassword123!'
        })
        .expect(200);

      const refreshToken = loginResponse.body.data.refreshToken;

      // Wait a bit to ensure new token has different timestamp
      await new Promise(resolve => setTimeout(resolve, 1000));

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          token: expect.any(String),
          refreshToken: expect.any(String)
        }
      });

      // Verify new tokens are different
      expect(response.body.data.token).not.toBe(loginResponse.body.data.token);
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(401);

      expect(response.body.error).toContain('Invalid refresh token');
    });

    it('should reject expired refresh token', async () => {
      // Create an expired refresh token
      const expiredToken = jwt.sign(
        { sub: testUser.id, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'test-refresh-secret',
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: expiredToken })
        .expect(401);

      expect(response.body.error).toContain('expired');
    });
  });

  describe('POST /api/auth/logout', () => {
    let authToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'TestPassword123!'
        });
      authToken = loginResponse.body.data.token;
    });

    it('should logout successfully with valid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Logged out successfully'
      });

      // Verify token is invalidated
      const profileResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(401);

      expect(profileResponse.body.error).toContain('Token has been revoked');
    });

    it('should require authentication for logout', async () => {
      await request(app)
        .post('/api/auth/logout')
        .expect(401);
    });
  });

  describe('GET /api/auth/me', () => {
    let authToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'TestPassword123!'
        });
      authToken = loginResponse.body.data.token;
    });

    it('should get current user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            id: testUser.id,
            email: testUser.email,
            name: testUser.name,
            role: testUser.role
          }
        }
      });
    });

    it('should reject request without token', async () => {
      await request(app)
        .get('/api/auth/me')
        .expect(401);
    });

    it('should reject request with invalid token', async () => {
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('POST /api/auth/mfa/enable', () => {
    let authToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'TestPassword123!'
        });
      authToken = loginResponse.body.data.token;
    });

    it('should enable MFA for authenticated user', async () => {
      const response = await request(app)
        .post('/api/auth/mfa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          secret: expect.any(String),
          qrCode: expect.any(String),
          backupCodes: expect.arrayContaining([
            expect.any(String)
          ])
        }
      });

      // Verify MFA is enabled in database
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      });
      expect(updatedUser?.mfaEnabled).toBe(true);
    });
  });

  describe('POST /api/auth/mfa/verify', () => {
    it('should verify MFA code and complete login', async () => {
      // Create user with MFA enabled
      const mfaUser = await testDataFactory.createUserWithMFA({
        email: 'mfa@austa.com',
        password: await bcrypt.hash('TestPassword123!', 10)
      });

      // First step login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: mfaUser.email,
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(loginResponse.body.data.requiresMFA).toBe(true);
      expect(loginResponse.body.data.mfaToken).toBeDefined();

      // Generate valid TOTP code
      const validCode = await authHelper.generateTOTPCode(mfaUser.mfaSecret);

      // Verify MFA
      const response = await request(app)
        .post('/api/auth/mfa/verify')
        .send({
          mfaToken: loginResponse.body.data.mfaToken,
          code: validCode
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: expect.any(Object),
          token: expect.any(String),
          refreshToken: expect.any(String)
        }
      });
    });

    it('should reject invalid MFA code', async () => {
      const mfaUser = await testDataFactory.createUserWithMFA({
        email: 'mfa2@austa.com',
        password: await bcrypt.hash('TestPassword123!', 10)
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: mfaUser.email,
          password: 'TestPassword123!'
        });

      const response = await request(app)
        .post('/api/auth/mfa/verify')
        .send({
          mfaToken: loginResponse.body.data.mfaToken,
          code: '000000'
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid MFA code');
    });
  });

  describe('OAuth Integration', () => {
    describe('GET /api/auth/oauth/:provider', () => {
      it('should redirect to Google OAuth', async () => {
        const response = await request(app)
          .get('/api/auth/oauth/google')
          .expect(302);

        expect(response.headers.location).toContain('accounts.google.com');
        expect(response.headers.location).toContain('client_id');
        expect(response.headers.location).toContain('redirect_uri');
      });

      it('should redirect to Microsoft OAuth', async () => {
        const response = await request(app)
          .get('/api/auth/oauth/microsoft')
          .expect(302);

        expect(response.headers.location).toContain('login.microsoftonline.com');
      });

      it('should reject invalid OAuth provider', async () => {
        const response = await request(app)
          .get('/api/auth/oauth/invalid-provider')
          .expect(400);

        expect(response.body.error).toContain('Unsupported OAuth provider');
      });
    });

    describe('GET /api/auth/callback', () => {
      it('should handle OAuth callback with valid code', async () => {
        // Mock OAuth provider response
        const mockOAuthUser = {
          id: 'oauth-123',
          email: 'oauth@example.com',
          name: 'OAuth User',
          provider: 'google'
        };

        // This would typically involve mocking the OAuth provider
        // For integration tests, we might use a test OAuth provider
        const response = await request(app)
          .get('/api/auth/callback')
          .query({
            code: 'valid-oauth-code',
            state: 'valid-state'
          })
          .expect(302);

        expect(response.headers.location).toContain('/dashboard');
      });

      it('should handle OAuth callback errors', async () => {
        const response = await request(app)
          .get('/api/auth/callback')
          .query({
            error: 'access_denied',
            error_description: 'User denied access'
          })
          .expect(302);

        expect(response.headers.location).toContain('/login?error=oauth_failed');
      });
    });
  });

  describe('Security Headers', () => {
    it('should set secure headers on auth endpoints', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'TestPassword123!'
        });

      // Check security headers
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['referrer-policy']).toBeDefined();
    });
  });
});