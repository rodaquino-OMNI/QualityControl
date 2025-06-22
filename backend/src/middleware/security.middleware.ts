import { Request, Response, NextFunction, RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { authConfig } from '../config/auth.config';

/**
 * Configure CORS middleware
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);

    if (authConfig.cors.origin.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: authConfig.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400, // 24 hours
});

/**
 * Configure Helmet for security headers with strict CSP
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'", "'nonce-${res.locals.cspNonce}'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.austa.com.br'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

/**
 * Additional security headers
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );
  
  // Cache control for sensitive data
  if (req.path.includes('/api/auth') || req.path.includes('/api/users')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  next();
};

/**
 * Enhanced request sanitization middleware
 */
export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction) => {
  // Dangerous patterns to remove
  const dangerousPatterns = [
    // XSS patterns
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:text\/html/gi,
    /on\w+\s*=/gi, // Event handlers like onclick, onload
    
    // SQL injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
    /(\'|\")(\s*(OR|AND)\s+\1\s*=\s*\1)/gi,
    
    // Command injection patterns
    /[;&|`$]/g,
    /\b(cat|ls|dir|whoami|id|uname|wget|curl|nc|netcat)\b/gi,
    
    // Path traversal
    /\.\.[\/\\]/g,
    /%2e%2e[\/\\]/gi,
    /%252e%252e/gi,
    
    // LDAP injection
    /\*\)/g,
    /\(\&/g,
    /\|\(/g,
    
    // NoSQL injection
    /\$\w+/g,
    
    // Header injection
    /\r\n|\r|\n/g,
    /%0d%0a|%0a%0d|%0a|%0d/gi
  ];

  const sanitize = (obj: any, depth = 0): any => {
    // Prevent deep recursion attacks
    if (depth > 50) {
      return {};
    }

    if (typeof obj === 'string') {
      let sanitized = obj;
      
      // Remove null bytes
      sanitized = sanitized.replace(/\0/g, '');
      
      // Remove dangerous patterns
      dangerousPatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '');
      });
      
      // HTML encode remaining potential XSS chars
      sanitized = sanitized
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
      
      return sanitized;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => sanitize(item, depth + 1));
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          // Skip prototype pollution attempts
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
          }
          
          // Sanitize key name as well
          const sanitizedKey = sanitize(key, depth + 1);
          sanitized[sanitizedKey] = sanitize(obj[key], depth + 1);
        }
      }
      return sanitized;
    }
    
    return obj;
  };

  try {
    req.body = sanitize(req.body);
    req.query = sanitize(req.query);
    req.params = sanitize(req.params);
  } catch (error) {
    // Log sanitization errors but don't block the request
    console.error('Sanitization error:', error);
  }

  next();
};

/**
 * Request size limiting
 */
export const requestSizeLimit = (limit: string = '10mb'): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers['content-length'];
    if (contentLength) {
      const bytes = parseInt(contentLength);
      const maxBytes = parseSize(limit);
      
      if (bytes > maxBytes) {
        return res.status(413).json({
          error: 'Payload too large',
          code: 'PAYLOAD_TOO_LARGE',
          maxSize: limit,
        });
      }
    }
    return next();
  };
};

/**
 * Parse size string to bytes
 */
function parseSize(size: string): number {
  const units: { [key: string]: number } = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }
  
  const [, num, unit] = match;
  const multiplier = units[unit];
  
  if (!multiplier) {
    throw new Error(`Invalid size unit: ${unit}`);
  }
  
  return parseFloat(num) * multiplier;
}

/**
 * IP whitelist/blacklist middleware
 */
export const ipFilter = (options: {
  whitelist?: string[];
  blacklist?: string[];
  trustProxy?: boolean;
}): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = options.trustProxy
      ? req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip
      : req.ip;

    if (!ip) {
      return res.status(400).json({
        error: 'Unable to determine IP address',
        code: 'NO_IP',
      });
    }

    // Check blacklist first
    if (options.blacklist && options.blacklist.includes(ip)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'IP_BLOCKED',
      });
    }

    // Check whitelist if provided
    if (options.whitelist && !options.whitelist.includes(ip)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'IP_NOT_ALLOWED',
      });
    }

    return next();
  };
};