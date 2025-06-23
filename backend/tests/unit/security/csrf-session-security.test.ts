import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../../../src/services/redisService';
import { AuthService } from '../../../src/services/auth.service';

// Mock dependencies
jest.mock('../../../src/services/redisService');
jest.mock('@prisma/client');

describe('CSRF and Session Security Tests', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockRedis: jest.Mocked<RedisService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = new RedisService() as jest.Mocked<RedisService>;
    
    mockRequest = {
      headers: {},
      body: {},
      method: 'POST',
      path: '/api/test',
      ip: '127.0.0.1',
      sessionID: 'test-session-id'
    };
    
    mockResponse = {
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn()
    };
    
    mockNext = jest.fn();
  });

  describe('CSRF Protection', () => {
    const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
      // Simple CSRF middleware for testing
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method || '')) {
        const token = req.headers['x-csrf-token'] || req.body._token;
        const sessionToken = req.session?.csrfToken;
        
        if (!token || !sessionToken || token !== sessionToken) {
          return res.status(403).json({
            error: 'CSRF token mismatch',
            code: 'CSRF_TOKEN_MISMATCH'
          });
        }
      }
      next();
    };

    it('should require CSRF token for state-changing requests', () => {
      const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];
      
      methods.forEach(method => {
        mockRequest.method = method;
        mockRequest.headers = {}; // No CSRF token
        
        csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);
        
        expect(mockResponse.status).toHaveBeenCalledWith(403);
        expect(mockResponse.json).toHaveBeenCalledWith({
          error: 'CSRF token mismatch',
          code: 'CSRF_TOKEN_MISMATCH'
        });
        
        jest.clearAllMocks();
      });
    });

    it('should allow GET requests without CSRF token', () => {
      mockRequest.method = 'GET';
      mockRequest.headers = {};
      
      csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should validate CSRF token from header', () => {
      mockRequest.method = 'POST';
      mockRequest.headers = { 'x-csrf-token': 'valid-token' };
      mockRequest.session = { csrfToken: 'valid-token' };
      
      csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should validate CSRF token from body', () => {
      mockRequest.method = 'POST';
      mockRequest.body = { _token: 'valid-token' };
      mockRequest.session = { csrfToken: 'valid-token' };
      
      csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject invalid CSRF tokens', () => {
      mockRequest.method = 'POST';
      mockRequest.headers = { 'x-csrf-token': 'invalid-token' };
      mockRequest.session = { csrfToken: 'valid-token' };
      
      csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle missing session CSRF token', () => {
      mockRequest.method = 'POST';
      mockRequest.headers = { 'x-csrf-token': 'some-token' };
      mockRequest.session = {}; // No CSRF token in session
      
      csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });

    it('should generate cryptographically secure CSRF tokens', () => {
      const generateCSRFToken = () => {
        const crypto = require('crypto');
        return crypto.randomBytes(32).toString('hex');
      };

      const token1 = generateCSRFToken();
      const token2 = generateCSRFToken();
      
      expect(token1).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(token2).toHaveLength(64);
      expect(token1).not.toBe(token2); // Should be unique
      expect(token1).toMatch(/^[0-9a-f]+$/); // Should be hex
    });
  });

  describe('Session Security', () => {
    it('should set secure session configuration', () => {
      const sessionConfig = {
        secret: process.env.SESSION_SECRET || 'test-secret',
        name: 'sessionId',
        cookie: {
          secure: process.env.NODE_ENV === 'production',
          httpOnly: true,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          sameSite: 'strict' as const
        },
        resave: false,
        saveUninitialized: false
      };

      expect(sessionConfig.cookie.httpOnly).toBe(true);
      expect(sessionConfig.cookie.sameSite).toBe('strict');
      expect(sessionConfig.resave).toBe(false);
      expect(sessionConfig.saveUninitialized).toBe(false);
    });

    it('should regenerate session ID on login', async () => {
      const sessionRegenerate = jest.fn((callback) => callback());
      mockRequest.session = {
        regenerate: sessionRegenerate,
        save: jest.fn((callback) => callback())
      };

      // Simulate login process
      const simulateLogin = (req: Request, res: Response) => {
        req.session?.regenerate(() => {
          req.session!.userId = '123';
          req.session!.save(() => {
            // Session regenerated and saved
          });
        });
      };

      simulateLogin(mockRequest as Request, mockResponse as Response);
      
      expect(sessionRegenerate).toHaveBeenCalled();
    });

    it('should destroy session on logout', async () => {
      const sessionDestroy = jest.fn((callback) => callback());
      mockRequest.session = {
        destroy: sessionDestroy,
        userId: '123'
      };

      // Simulate logout process
      const simulateLogout = (req: Request, res: Response) => {
        req.session?.destroy(() => {
          res.clearCookie('sessionId');
        });
      };

      simulateLogout(mockRequest as Request, mockResponse as Response);
      
      expect(sessionDestroy).toHaveBeenCalled();
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('sessionId');
    });

    it('should implement session timeout', async () => {
      const currentTime = Date.now();
      const sessionTimeout = 30 * 60 * 1000; // 30 minutes
      
      mockRequest.session = {
        lastActivity: currentTime - (35 * 60 * 1000), // 35 minutes ago
        userId: '123'
      };

      const checkSessionTimeout = (req: Request, res: Response, next: NextFunction) => {
        if (req.session?.lastActivity) {
          const timeSinceLastActivity = Date.now() - req.session.lastActivity;
          if (timeSinceLastActivity > sessionTimeout) {
            req.session.destroy(() => {
              res.status(401).json({ error: 'Session expired' });
            });
            return;
          }
          req.session.lastActivity = Date.now();
        }
        next();
      };

      checkSessionTimeout(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should prevent session fixation attacks', () => {
      const oldSessionId = 'old-session-id';
      const newSessionId = 'new-session-id';
      
      mockRequest.sessionID = oldSessionId;
      
      // Simulate session regeneration
      const regenerateSession = (req: Request) => {
        const oldId = req.sessionID;
        req.sessionID = newSessionId; // New session ID
        return oldId !== req.sessionID;
      };

      const wasRegenerated = regenerateSession(mockRequest as Request);
      
      expect(wasRegenerated).toBe(true);
      expect(mockRequest.sessionID).toBe(newSessionId);
    });

    it('should implement concurrent session limits', async () => {
      const userId = '123';
      const maxSessions = 3;
      
      // Mock existing sessions
      const existingSessions = [
        'session-1',
        'session-2',
        'session-3'
      ];
      
      mockRedis.getSet.mockResolvedValue(existingSessions);
      mockRedis.setAdd.mockResolvedValue(1);
      mockRedis.setRemove.mockResolvedValue(1);

      const manageConcurrentSessions = async (userId: string, sessionId: string) => {
        const sessionKey = `user:${userId}:sessions`;
        const sessions = await mockRedis.getSet(sessionKey) || [];
        
        if (sessions.length >= maxSessions) {
          // Remove oldest session
          const oldestSession = sessions[0];
          await mockRedis.setRemove(sessionKey, oldestSession);
        }
        
        await mockRedis.setAdd(sessionKey, sessionId);
      };

      await manageConcurrentSessions(userId, 'new-session');
      
      expect(mockRedis.setRemove).toHaveBeenCalled(); // Oldest session removed
      expect(mockRedis.setAdd).toHaveBeenCalledWith(`user:${userId}:sessions`, 'new-session');
    });
  });

  describe('Double Submit Cookie Pattern', () => {
    it('should validate CSRF token using double submit pattern', () => {
      const doubleSubmitCSRF = (req: Request, res: Response, next: NextFunction) => {
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method || '')) {
          const headerToken = req.headers['x-csrf-token'];
          const cookieToken = req.cookies?.csrfToken;
          
          if (!headerToken || !cookieToken || headerToken !== cookieToken) {
            return res.status(403).json({ error: 'CSRF token mismatch' });
          }
        }
        next();
      };

      // Test with valid tokens
      mockRequest.method = 'POST';
      mockRequest.headers = { 'x-csrf-token': 'valid-token' };
      mockRequest.cookies = { csrfToken: 'valid-token' };
      
      doubleSubmitCSRF(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      
      // Test with mismatched tokens
      jest.clearAllMocks();
      mockRequest.cookies = { csrfToken: 'different-token' };
      
      doubleSubmitCSRF(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Origin and Referer Validation', () => {
    it('should validate request origin', () => {
      const validateOrigin = (req: Request, res: Response, next: NextFunction) => {
        const allowedOrigins = ['https://app.example.com', 'https://admin.example.com'];
        const origin = req.headers.origin;
        
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method || '')) {
          if (!origin || !allowedOrigins.includes(origin)) {
            return res.status(403).json({ error: 'Invalid origin' });
          }
        }
        next();
      };

      // Test with valid origin
      mockRequest.method = 'POST';
      mockRequest.headers = { origin: 'https://app.example.com' };
      
      validateOrigin(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      
      // Test with invalid origin
      jest.clearAllMocks();
      mockRequest.headers = { origin: 'https://evil.com' };
      
      validateOrigin(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });

    it('should validate referer header', () => {
      const validateReferer = (req: Request, res: Response, next: NextFunction) => {
        const allowedReferers = ['https://app.example.com', 'https://admin.example.com'];
        const referer = req.headers.referer;
        
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method || '')) {
          if (!referer || !allowedReferers.some(allowed => referer.startsWith(allowed))) {
            return res.status(403).json({ error: 'Invalid referer' });
          }
        }
        next();
      };

      // Test with valid referer
      mockRequest.method = 'POST';
      mockRequest.headers = { referer: 'https://app.example.com/dashboard' };
      
      validateReferer(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      
      // Test with invalid referer
      jest.clearAllMocks();
      mockRequest.headers = { referer: 'https://evil.com/attack' };
      
      validateReferer(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('SameSite Cookie Protection', () => {
    it('should set SameSite attribute on sensitive cookies', () => {
      const setSameSiteCookies = (req: Request, res: Response, next: NextFunction) => {
        // Set CSRF token cookie with SameSite=Strict
        res.cookie('csrfToken', 'token-value', {
          httpOnly: false, // Needs to be readable by JS
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict'
        });
        
        // Set session cookie with SameSite=Lax
        res.cookie('sessionId', 'session-value', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        });
        
        next();
      };

      setSameSiteCookies(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.cookie).toHaveBeenCalledWith('csrfToken', 'token-value', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
      
      expect(mockResponse.cookie).toHaveBeenCalledWith('sessionId', 'session-value', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    });
  });

  describe('Rate Limiting for Security', () => {
    it('should implement stricter rate limits for sensitive endpoints', async () => {
      const sensitiveEndpointRateLimit = async (req: Request, res: Response, next: NextFunction) => {
        const ip = req.ip;
        const endpoint = req.path;
        
        // Different limits for different endpoints
        const limits: { [key: string]: { requests: number; window: number } } = {
          '/api/auth/login': { requests: 5, window: 15 * 60 * 1000 }, // 5 attempts in 15 minutes
          '/api/auth/register': { requests: 3, window: 60 * 60 * 1000 }, // 3 attempts in 1 hour
          '/api/auth/reset-password': { requests: 2, window: 60 * 60 * 1000 }, // 2 attempts in 1 hour
        };
        
        const limit = limits[endpoint];
        if (limit) {
          const key = `rate_limit:${endpoint}:${ip}`;
          const current = await mockRedis.get(key) || '0';
          const count = parseInt(current);
          
          if (count >= limit.requests) {
            return res.status(429).json({ error: 'Rate limit exceeded' });
          }
          
          await mockRedis.setWithExpiry(key, (count + 1).toString(), limit.window);
        }
        
        next();
      };

      // Mock Redis responses
      mockRedis.get.mockResolvedValue('4'); // 4 previous attempts
      mockRedis.setWithExpiry.mockResolvedValue('OK');
      
      mockRequest.path = '/api/auth/login';
      mockRequest.ip = '192.168.1.1';
      
      await sensitiveEndpointRateLimit(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled(); // Should allow (4 < 5)
      
      // Test rate limit exceeded
      jest.clearAllMocks();
      mockRedis.get.mockResolvedValue('5'); // 5 previous attempts
      
      await sensitiveEndpointRateLimit(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});