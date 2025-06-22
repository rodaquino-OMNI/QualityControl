import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { AppError } from './errorHandler';
import { CSRFSession } from '../types/express';

// CSRF session data stored in req.session
// Session interface extended in types/express.d.ts

/**
 * CSRF Protection Middleware
 * Implements double submit cookie pattern with additional validation
 */
export class CSRFProtection {
  private static readonly TOKEN_LENGTH = 32;
  private static readonly HEADER_NAME = 'x-csrf-token';
  private static readonly COOKIE_NAME = 'csrfToken';
  private static readonly SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

  /**
   * Generate cryptographically secure CSRF token
   */
  private static generateToken(): string {
    return crypto.randomBytes(this.TOKEN_LENGTH).toString('hex');
  }

  /**
   * Generate CSRF secret for session
   */
  private static generateSecret(): string {
    return crypto.randomBytes(this.TOKEN_LENGTH).toString('hex');
  }

  /**
   * Create CSRF token from secret and salt
   */
  private static createToken(secret: string, salt: string): string {
    const hash = crypto.createHmac('sha256', secret);
    hash.update(salt);
    return salt + '.' + hash.digest('hex');
  }

  /**
   * Verify CSRF token against secret
   */
  private static verifyToken(token: string, secret: string): boolean {
    try {
      const [salt, hash] = token.split('.');
      if (!salt || !hash) return false;

      const expectedHash = crypto.createHmac('sha256', secret);
      expectedHash.update(salt);
      const expectedToken = salt + '.' + expectedHash.digest('hex');

      // Use constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(token),
        Buffer.from(expectedToken)
      );
    } catch {
      return false;
    }
  }

  /**
   * Generate CSRF token for client
   */
  static generateCSRFToken(req: Request): string {
    if (!req.session) {
      throw new AppError('Session required for CSRF protection', 500, 'SESSION_REQUIRED');
    }

    // Cast session to include CSRF properties
    const csrfSession = req.session as CSRFSession;
    
    // Generate or reuse secret
    if (!csrfSession.csrfSecret) {
      csrfSession.csrfSecret = this.generateSecret();
    }

    // Generate token with random salt
    const salt = crypto.randomBytes(16).toString('hex');
    const token = this.createToken(csrfSession.csrfSecret, salt);
    csrfSession.csrfToken = token;

    return token;
  }

  /**
   * CSRF protection middleware
   */
  static protect(options: {
    ignoreMethods?: string[];
    value?: (req: Request) => string | undefined;
    skipFailures?: boolean;
  } = {}) {
    const ignoreMethods = options.ignoreMethods || this.SAFE_METHODS;
    
    return (req: Request, res: Response, next: NextFunction): void => {
      // Skip safe methods
      if (ignoreMethods.includes(req.method || '')) {
        return next();
      }

      try {
        // Check if session exists
        if (!req.session) {
          throw new AppError('Session required', 403, 'SESSION_REQUIRED');
        }

        // Get token from request
        let token: string | undefined;
        
        if (options.value) {
          token = options.value(req);
        } else {
          // Try header first, then body
          token = req.headers[this.HEADER_NAME] as string ||
                  req.body._token ||
                  req.body._csrf ||
                  req.query._token as string;
        }

        if (!token) {
          throw new AppError('CSRF token missing', 403, 'CSRF_TOKEN_MISSING');
        }

        // Cast session to include CSRF properties and verify token
        const csrfSession = req.session as CSRFSession;
        if (!csrfSession?.csrfSecret || !this.verifyToken(token, csrfSession.csrfSecret)) {
          throw new AppError('CSRF token invalid', 403, 'CSRF_TOKEN_INVALID');
        }

        next();
      } catch (error) {
        if (options.skipFailures) {
          return next();
        }
        next(error);
      }
    };
  }

  /**
   * Double submit cookie CSRF protection
   */
  static doubleSubmitCookie(options: {
    cookieName?: string;
    headerName?: string;
    signed?: boolean;
  } = {}) {
    const cookieName = options.cookieName || this.COOKIE_NAME;
    const headerName = options.headerName || this.HEADER_NAME;

    return (req: Request, res: Response, next: NextFunction): void => {
      // Skip safe methods
      if (this.SAFE_METHODS.includes(req.method || '')) {
        return next();
      }

      try {
        // Get tokens from header and cookie
        const headerToken = req.headers[headerName] as string;
        const cookieToken = options.signed 
          ? req.signedCookies[cookieName]
          : req.cookies[cookieName];

        if (!headerToken) {
          throw new AppError('CSRF token missing from header', 403, 'CSRF_HEADER_MISSING');
        }

        if (!cookieToken) {
          throw new AppError('CSRF token missing from cookie', 403, 'CSRF_COOKIE_MISSING');
        }

        // Use constant-time comparison
        if (!crypto.timingSafeEqual(
          Buffer.from(headerToken),
          Buffer.from(cookieToken)
        )) {
          throw new AppError('CSRF token mismatch', 403, 'CSRF_TOKEN_MISMATCH');
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Origin validation for CSRF protection
   */
  static validateOrigin(allowedOrigins: string[] = []) {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Skip safe methods
      if (this.SAFE_METHODS.includes(req.method || '')) {
        return next();
      }

      const origin = req.headers.origin;
      const referer = req.headers.referer;
      const host = req.headers.host;

      try {
        // Check origin header
        if (origin) {
          if (!this.isAllowedOrigin(origin, allowedOrigins, host)) {
            throw new AppError('Invalid origin', 403, 'INVALID_ORIGIN');
          }
        } 
        // Fallback to referer if no origin
        else if (referer) {
          const refererOrigin = new URL(referer).origin;
          if (!this.isAllowedOrigin(refererOrigin, allowedOrigins, host)) {
            throw new AppError('Invalid referer', 403, 'INVALID_REFERER');
          }
        } 
        // Neither origin nor referer present
        else {
          throw new AppError('Missing origin and referer headers', 403, 'MISSING_ORIGIN_REFERER');
        }

        next();
      } catch (error) {
        if (error instanceof AppError) {
          next(error);
        } else {
          next(new AppError('Origin validation failed', 403, 'ORIGIN_VALIDATION_FAILED'));
        }
      }
    };
  }

  /**
   * Check if origin is allowed
   */
  private static isAllowedOrigin(origin: string, allowedOrigins: string[], host?: string): boolean {
    // If specific origins are configured, check against them
    if (allowedOrigins.length > 0) {
      return allowedOrigins.includes(origin);
    }

    // Otherwise, check against request host
    if (host) {
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const expectedOrigin = `${protocol}://${host}`;
      return origin === expectedOrigin;
    }

    return false;
  }

  /**
   * Set CSRF token in cookie
   */
  static setCookie(cookieName: string = 'csrfToken', options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    maxAge?: number;
    signed?: boolean;
  } = {}) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const token = this.generateCSRFToken(req);
      
      const cookieOptions = {
        httpOnly: options.httpOnly ?? false, // CSRF tokens need to be readable by JS
        secure: options.secure ?? (process.env.NODE_ENV === 'production'),
        sameSite: options.sameSite ?? 'strict' as const,
        maxAge: options.maxAge ?? 24 * 60 * 60 * 1000, // 24 hours
        signed: options.signed ?? false
      };

      res.cookie(cookieName, token, cookieOptions);
      next();
    };
  }

  /**
   * Add CSRF token to response locals for template rendering
   */
  static addToLocals(req: Request, res: Response, next: NextFunction): void {
    try {
      const token = this.generateCSRFToken(req);
      res.locals.csrfToken = token;
      next();
    } catch (error) {
      next(error);
    }
  }
}

/**
 * Enhanced security headers middleware
 */
export const enhancedSecurityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Content Security Policy with strict settings
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // TODO: Remove unsafe-inline and use nonces
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://api.austa.com.br",
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; '));

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Feature Policy / Permissions Policy
  res.setHeader('Permissions-Policy', [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'interest-cohort=()',
    'payment=()',
    'usb=()'
  ].join(', '));

  // HSTS (only in production with HTTPS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Cache control for sensitive endpoints
  if (req.path.includes('/api/auth') || 
      req.path.includes('/api/users') || 
      req.path.includes('/api/admin')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
};

/**
 * Request origin validation middleware
 */
export const validateRequestOrigin = (allowedOrigins: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    const host = req.headers.host;

    // Skip for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method || '')) {
      return next();
    }

    // Development mode - allow localhost
    if (process.env.NODE_ENV === 'development') {
      const localhostOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173'
      ];
      allowedOrigins = [...allowedOrigins, ...localhostOrigins];
    }

    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({
        error: 'Request origin not allowed',
        code: 'ORIGIN_NOT_ALLOWED'
      });
      return;
    }

    next();
  };
};