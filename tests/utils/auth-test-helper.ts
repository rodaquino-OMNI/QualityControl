/**
 * Authentication Test Helper Utilities
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';

export class AuthTestHelper {
  private jwtSecret: string;

  constructor(jwtSecret?: string) {
    this.jwtSecret = jwtSecret || process.env.JWT_SECRET || 'test-jwt-secret';
  }

  /**
   * Generate a JWT token for testing
   */
  async generateToken(user: any, options: any = {}): Promise<string> {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions || [],
      ...options.extraClaims
    };

    const tokenOptions = {
      expiresIn: options.expiresIn || '1h',
      issuer: 'austa-test',
      audience: 'austa-api',
      ...options.tokenOptions
    };

    return jwt.sign(payload, this.jwtSecret, tokenOptions);
  }

  /**
   * Generate an expired token for testing
   */
  async generateExpiredToken(user: any): Promise<string> {
    return this.generateToken(user, {
      tokenOptions: { expiresIn: '-1h' }
    });
  }

  /**
   * Generate an invalid token for testing
   */
  generateInvalidToken(): string {
    return jwt.sign({ invalid: true }, 'wrong-secret');
  }

  /**
   * Verify a token
   */
  verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  /**
   * Generate a hash for password testing
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate MFA secret for testing
   */
  generateMFASecret(): string {
    return authenticator.generateSecret();
  }

  /**
   * Generate MFA token for testing
   */
  generateMFAToken(secret: string): string {
    return authenticator.generate(secret);
  }

  /**
   * Generate test authentication headers
   */
  async generateAuthHeaders(user: any, options: any = {}): Promise<Record<string, string>> {
    const token = await this.generateToken(user, options);
    
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Client-Version': '1.0.0',
      'X-Request-ID': Math.random().toString(36).substring(7),
      ...options.extraHeaders
    };
  }

  /**
   * Generate session data for testing
   */
  generateSessionData(user: any, options: any = {}): any {
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      loginTime: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      ipAddress: options.ipAddress || '127.0.0.1',
      userAgent: options.userAgent || 'test-agent',
      csrfToken: Math.random().toString(36).substring(7),
      ...options.extraSessionData
    };
  }

  /**
   * Generate API key for testing
   */
  generateAPIKey(prefix: string = 'test'): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Generate OAuth state for testing
   */
  generateOAuthState(): string {
    return Buffer.from(JSON.stringify({
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(7),
      redirect: '/dashboard'
    })).toString('base64');
  }

  /**
   * Create test user credentials
   */
  createTestCredentials(overrides: any = {}): any {
    return {
      email: 'test@austa.com',
      password: 'TestPassword123!',
      name: 'Test User',
      role: 'auditor',
      ...overrides
    };
  }

  /**
   * Create admin test credentials
   */
  createAdminCredentials(overrides: any = {}): any {
    return this.createTestCredentials({
      email: 'admin@austa.com',
      name: 'Admin User',
      role: 'admin',
      ...overrides
    });
  }

  /**
   * Create multiple test users with different roles
   */
  createMultipleTestUsers(): any[] {
    return [
      this.createTestCredentials({
        email: 'auditor@austa.com',
        role: 'auditor',
        name: 'Test Auditor'
      }),
      this.createTestCredentials({
        email: 'manager@austa.com',
        role: 'manager',
        name: 'Test Manager'
      }),
      this.createAdminCredentials(),
      this.createTestCredentials({
        email: 'viewer@austa.com',
        role: 'viewer',
        name: 'Test Viewer'
      })
    ];
  }

  /**
   * Mock authentication middleware
   */
  mockAuthMiddleware(user: any) {
    return (req: any, res: any, next: any) => {
      req.user = user;
      req.session = this.generateSessionData(user);
      next();
    };
  }

  /**
   * Mock permission middleware
   */
  mockPermissionMiddleware(permissions: string[]) {
    return (req: any, res: any, next: any) => {
      req.user = req.user || {};
      req.user.permissions = permissions;
      next();
    };
  }

  /**
   * Generate test refresh token
   */
  generateRefreshToken(user: any): string {
    const payload = {
      userId: user.id,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, this.jwtSecret, { expiresIn: '7d' });
  }

  /**
   * Generate password reset token
   */
  generatePasswordResetToken(email: string): string {
    const payload = {
      email,
      type: 'password_reset',
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, this.jwtSecret, { expiresIn: '1h' });
  }

  /**
   * Generate email verification token
   */
  generateEmailVerificationToken(email: string): string {
    const payload = {
      email,
      type: 'email_verification',
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, this.jwtSecret, { expiresIn: '24h' });
  }

  /**
   * Create test request context
   */
  createTestContext(user: any, options: any = {}): any {
    return {
      user,
      session: this.generateSessionData(user, options),
      headers: options.headers || {},
      ip: options.ip || '127.0.0.1',
      userAgent: options.userAgent || 'test-agent',
      requestId: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate token structure
   */
  validateTokenStructure(token: string): boolean {
    try {
      const decoded = jwt.decode(token, { complete: true });
      
      if (!decoded || !decoded.header || !decoded.payload) {
        return false;
      }

      const payload = decoded.payload as any;
      
      // Check required fields
      return !!(
        payload.id &&
        payload.email &&
        payload.role &&
        payload.iat &&
        payload.exp
      );
    } catch {
      return false;
    }
  }

  /**
   * Generate test CSRF token
   */
  generateCSRFToken(): string {
    return Math.random().toString(36).substring(2) + 
           Date.now().toString(36);
  }

  /**
   * Mock external OAuth provider response
   */
  mockOAuthResponse(provider: string, user: any): any {
    const baseResponse = {
      id: user.id || Math.random().toString(36).substring(2),
      email: user.email,
      name: user.name,
      verified_email: true,
      provider
    };

    switch (provider) {
      case 'google':
        return {
          ...baseResponse,
          given_name: user.firstName || 'Test',
          family_name: user.lastName || 'User',
          picture: 'https://example.com/avatar.jpg'
        };
      
      case 'microsoft':
        return {
          ...baseResponse,
          givenName: user.firstName || 'Test',
          surname: user.lastName || 'User',
          userPrincipalName: user.email
        };
      
      default:
        return baseResponse;
    }
  }

  /**
   * Create rate limiting test data
   */
  createRateLimitData(identifier: string, attempts: number = 5): any {
    return {
      identifier,
      attempts,
      resetTime: Date.now() + (15 * 60 * 1000), // 15 minutes
      blocked: attempts >= 5
    };
  }

  /**
   * Generate test device fingerprint
   */
  generateDeviceFingerprint(): string {
    const components = [
      'Mozilla/5.0 (Test Browser)',
      'test-screen-1920x1080',
      'test-timezone-UTC',
      'test-language-en'
    ];
    
    return Buffer.from(components.join('|')).toString('base64');
  }
}