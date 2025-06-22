import { Request, Response, NextFunction } from 'express';
import { logger, logSecurityEvent, logAuditEvent } from '../utils/logger';
import { ErrorResponse, ValidationError } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Error categories for monitoring
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  DATABASE = 'database',
  EXTERNAL_SERVICE = 'external_service',
  RATE_LIMIT = 'rate_limit',
  FILE_UPLOAD = 'file_upload',
  NETWORK = 'network',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  SECURITY = 'security'
}

export interface ExtendedError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
  isOperational?: boolean;
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  correlationId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export class AppError extends Error implements ExtendedError {
  statusCode: number;
  isOperational: boolean;
  code?: string;
  details?: unknown;
  severity: ErrorSeverity;
  category: ErrorCategory;
  correlationId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: unknown,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    category: ErrorCategory = ErrorCategory.SYSTEM
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.details = details;
    this.severity = severity;
    this.category = category;
    this.correlationId = uuidv4();
    Error.captureStackTrace(this, this.constructor);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(message, 400, 'VALIDATION_ERROR', details, ErrorSeverity.LOW, ErrorCategory.VALIDATION);
  }

  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED', null, ErrorSeverity.MEDIUM, ErrorCategory.AUTHENTICATION);
  }

  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError(message, 403, 'FORBIDDEN', null, ErrorSeverity.MEDIUM, ErrorCategory.AUTHORIZATION);
  }

  static notFound(message: string = 'Resource not found'): AppError {
    return new AppError(message, 404, 'NOT_FOUND', null, ErrorSeverity.LOW, ErrorCategory.BUSINESS_LOGIC);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(message, 409, 'CONFLICT', details, ErrorSeverity.MEDIUM, ErrorCategory.BUSINESS_LOGIC);
  }

  static rateLimit(message: string = 'Rate limit exceeded'): AppError {
    return new AppError(message, 429, 'RATE_LIMIT_EXCEEDED', null, ErrorSeverity.HIGH, ErrorCategory.RATE_LIMIT);
  }

  static internal(message: string = 'Internal server error', details?: unknown): AppError {
    return new AppError(message, 500, 'INTERNAL_ERROR', details, ErrorSeverity.CRITICAL, ErrorCategory.SYSTEM);
  }
}

// Enhanced error response structure
interface EnhancedErrorResponse extends ErrorResponse {
  correlationId: string;
  path: string;
  method: string;
  timestamp: string;
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  requestId?: string;
}

// Sanitize sensitive data from error details
function sanitizeErrorDetails(details: unknown, isProduction: boolean): unknown {
  if (!details || isProduction) return null;
  
  if (typeof details === 'string') return details;
  
  if (typeof details === 'object') {
    const sanitized = { ...details } as Record<string, any>;
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization', 'cookie'];
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        delete sanitized[field];
      }
    }
    
    return sanitized;
  }
  
  return details;
}

// Enhanced error classification
function classifyError(err: Error): {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  severity: ErrorSeverity;
  category: ErrorCategory;
} {
  // MongoDB/Mongoose errors
  if (err.name === 'ValidationError') {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: err.message,
      severity: ErrorSeverity.LOW,
      category: ErrorCategory.VALIDATION
    };
  }

  if (err.name === 'CastError') {
    return {
      statusCode: 400,
      code: 'INVALID_ID_FORMAT',
      message: 'Invalid ID format provided',
      severity: ErrorSeverity.LOW,
      category: ErrorCategory.VALIDATION
    };
  }

  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    const mongoErr = err as { code?: number; message?: string };
    if (mongoErr.code === 11000) {
      return {
        statusCode: 409,
        code: 'DUPLICATE_KEY',
        message: 'Resource already exists',
        details: 'A record with this information already exists',
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.DATABASE
      };
    }
    return {
      statusCode: 500,
      code: 'DATABASE_ERROR',
      message: 'Database operation failed',
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.DATABASE
    };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return {
      statusCode: 401,
      code: 'INVALID_TOKEN',
      message: 'Invalid or malformed token',
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.AUTHENTICATION
    };
  }

  if (err.name === 'TokenExpiredError') {
    return {
      statusCode: 401,
      code: 'TOKEN_EXPIRED',
      message: 'Token has expired',
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.AUTHENTICATION
    };
  }

  if (err.name === 'NotBeforeError') {
    return {
      statusCode: 401,
      code: 'TOKEN_NOT_ACTIVE',
      message: 'Token not active yet',
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.AUTHENTICATION
    };
  }

  // Multer errors (file upload)
  if (err.name === 'MulterError') {
    const multerErr = err as { code?: string; message?: string };
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      return {
        statusCode: 413,
        code: 'FILE_TOO_LARGE',
        message: 'File size exceeds allowed limit',
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.FILE_UPLOAD
      };
    }
    if (multerErr.code === 'LIMIT_FILE_COUNT') {
      return {
        statusCode: 400,
        code: 'TOO_MANY_FILES',
        message: 'Too many files uploaded',
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.FILE_UPLOAD
      };
    }
    return {
      statusCode: 400,
      code: 'FILE_UPLOAD_ERROR',
      message: 'File upload failed',
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.FILE_UPLOAD
    };
  }

  // Rate limiting errors
  if (err.name === 'TooManyRequestsError' || err.message.includes('rate limit')) {
    return {
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded. Please try again later',
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.RATE_LIMIT
    };
  }

  // Network/timeout errors
  if (err.name === 'TimeoutError' || err.message.includes('timeout')) {
    return {
      statusCode: 408,
      code: 'REQUEST_TIMEOUT',
      message: 'Request timed out',
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.NETWORK
    };
  }

  // External service errors
  if (err.name === 'AxiosError' || err.message.includes('ECONNREFUSED')) {
    return {
      statusCode: 503,
      code: 'EXTERNAL_SERVICE_ERROR',
      message: 'External service unavailable',
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.EXTERNAL_SERVICE
    };
  }

  // Security-related errors
  if (err.name === 'UnauthorizedError' || err.message.includes('unauthorized')) {
    return {
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.AUTHENTICATION
    };
  }

  if (err.name === 'ForbiddenError' || err.message.includes('forbidden')) {
    return {
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Access denied',
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.AUTHORIZATION
    };
  }

  // Default system error
  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    severity: ErrorSeverity.CRITICAL,
    category: ErrorCategory.SYSTEM
  };
}

// Error monitoring hook (can be extended for Sentry, DataDog, etc.)
function reportError(error: ExtendedError, context: { request: any; user: any }): void {
  // Log to structured logger
  logger.error('Application error', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode,
      severity: error.severity,
      category: error.category,
      correlationId: error.correlationId,
      isOperational: error.isOperational
    },
    request: context.request,
    user: context.user,
    timestamp: new Date().toISOString()
  });

  // Log security events for suspicious errors
  if (error.category === ErrorCategory.SECURITY || 
      error.category === ErrorCategory.AUTHENTICATION ||
      error.severity === ErrorSeverity.CRITICAL) {
    logSecurityEvent(
      'ERROR_OCCURRED',
      error.severity || 'medium',
      `${error.category}: ${error.message}`,
      {
        correlationId: error.correlationId,
        statusCode: error.statusCode,
        ip: context.request?.ip,
        userAgent: context.request?.userAgent,
        userId: context.user?.id
      }
    );
  }

  // Audit critical system errors
  if (error.severity === ErrorSeverity.CRITICAL) {
    logAuditEvent(
      'CRITICAL_ERROR',
      context.user?.id,
      error.correlationId || '',
      {
        error: error.message,
        category: error.category,
        statusCode: error.statusCode,
        url: context.request?.url,
        method: context.request?.method
      }
    );
  }

  // TODO: Integrate with external monitoring services
  // - Sentry: Sentry.captureException(error, { contexts: { request: context.request } });
  // - DataDog: statsd.increment('error.count', 1, { category: error.category });
  // - CloudWatch: cloudWatch.putMetricData({ ... });
}

export const errorHandler = (
  err: Error | AppError | ExtendedError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isProduction = process.env.NODE_ENV === 'production';
  const correlationId = (req as Request & { requestId?: string; context?: { correlationId?: string } }).requestId || (req as Request & { requestId?: string; context?: { correlationId?: string } }).context?.correlationId || uuidv4();
  
  // Extract request context with proper typing
  const requestContext = {
    method: req.method,
    url: req.url,
    path: req.path,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
    correlationId,
    sessionId: req.sessionId,
    apiVersion: (req as Request & { apiVersion?: string }).apiVersion
  };

  const userContext = req.user ? {
    id: req.user.id,
    email: req.user.email,
    roles: req.user.roles
  } : undefined;

  let errorResponse: {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
    severity: ErrorSeverity;
    category: ErrorCategory;
  };

  // Handle AppError instances
  if (err instanceof AppError) {
    err.correlationId = correlationId;
    err.userId = userContext?.id;
    
    errorResponse = {
      statusCode: err.statusCode,
      code: err.code || 'APP_ERROR',
      message: err.message,
      details: sanitizeErrorDetails(err.details, isProduction),
      severity: err.severity,
      category: err.category
    };
  } else {
    // Classify and handle other error types
    const classified = classifyError(err);
    const extendedErr: ExtendedError = {
      ...err,
      ...classified,
      correlationId,
      userId: userContext?.id,
      isOperational: false
    };

    errorResponse = {
      ...classified,
      details: sanitizeErrorDetails(classified.details, isProduction)
    };

    // Report the extended error
    reportError(extendedErr, {
      request: requestContext,
      user: userContext
    });
  }

  // Don't expose internal error details in production
  if (isProduction && errorResponse.statusCode >= 500) {
    errorResponse.details = undefined;
    errorResponse.message = 'Internal server error';
  }

  // Enhanced error response
  const response: EnhancedErrorResponse = {
    error: errorResponse.message,
    code: errorResponse.code,
    details: errorResponse.details as ValidationError[] | undefined,
    correlationId,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    severity: errorResponse.severity,
    category: errorResponse.category,
    requestId: (req as Request & { requestId?: string }).requestId
  };

  // Set appropriate headers
  res.set({
    'X-Correlation-ID': correlationId,
    'X-Error-Code': errorResponse.code,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });

  // Send error response
  res.status(errorResponse.statusCode).json({
    success: false,
    ...response
  });
};