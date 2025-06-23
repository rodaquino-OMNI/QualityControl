import { Request, Response, NextFunction } from 'express';
import { logger, logAuditEvent } from './logger';
import { AppError, ErrorSeverity, ErrorCategory } from '../middleware/errorHandler';
import { PrismaClient } from '@prisma/client';

// Type guard for error handling
function isError(error: unknown): error is Error {
  return error instanceof Error;
}

function getErrorMessage(error: unknown): string {
  if (isError(error)) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) return error.stack;
  return undefined;
}

// Async operation configuration
interface AsyncConfig {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeout: number;
  };
}

// Circuit breaker state
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

// Database transaction wrapper with retry logic
export const withDatabaseTransaction = async <T>(
  prisma: PrismaClient,
  operation: (tx: PrismaClient) => Promise<T>,
  config: AsyncConfig = {}
): Promise<T> => {
  const { retries = 3, retryDelay = 1000 } = config;
  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        return await operation(tx);
      });
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is retryable
      const isRetryable = isRetryableError(error as Error);
      
      if (!isRetryable || attempt === retries) {
        logger.error('Database transaction failed', {
          attempt: attempt + 1,
          totalAttempts: retries + 1,
          error: (error as Error).message,
          isRetryable,
          errorCode: (error as any).code,
        });
        
        throw new AppError(
          'Database operation failed',
          500,
          'DATABASE_TRANSACTION_FAILED',
          { 
            originalError: (error as Error).message,
            attempts: attempt + 1,
            isRetryable,
          },
          ErrorSeverity.HIGH,
          ErrorCategory.DATABASE
        );
      }

      // Wait before retry with exponential backoff
      const delay = retryDelay * Math.pow(2, attempt);
      logger.warn(`Database transaction retry ${attempt + 1}/${retries + 1} after ${delay}ms`, {
        error: (error as Error).message,
        errorCode: (error as any).code,
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
};

// External service call wrapper with circuit breaker
export const withExternalService = async <T>(
  serviceName: string,
  operation: () => Promise<T>,
  config: AsyncConfig = {}
): Promise<T> => {
  const {
    timeout = 30000,
    retries = 3,
    retryDelay = 1000,
    circuitBreaker = { failureThreshold: 5, resetTimeout: 60000 }
  } = config;

  // Check circuit breaker state
  const cbKey = `external_service_${serviceName}`;
  const cbState = circuitBreakers.get(cbKey) || {
    failures: 0,
    lastFailureTime: 0,
    state: 'CLOSED' as const,
  };

  // Circuit breaker logic
  if (cbState.state === 'OPEN') {
    if (Date.now() - cbState.lastFailureTime > circuitBreaker.resetTimeout) {
      cbState.state = 'HALF_OPEN';
      logger.info(`Circuit breaker for ${serviceName} moving to HALF_OPEN`);
    } else {
      throw new AppError(
        `External service ${serviceName} is currently unavailable (circuit breaker OPEN)`,
        503,
        'SERVICE_UNAVAILABLE',
        { serviceName, circuitBreakerState: cbState.state },
        ErrorSeverity.HIGH,
        ErrorCategory.EXTERNAL_SERVICE
      );
    }
  }

  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new AppError(
            `External service ${serviceName} timed out after ${timeout}ms`,
            408,
            'SERVICE_TIMEOUT',
            { serviceName, timeout },
            ErrorSeverity.MEDIUM,
            ErrorCategory.EXTERNAL_SERVICE
          ));
        }, timeout);
      });

      // Race between operation and timeout
      const result = await Promise.race([
        operation(),
        timeoutPromise,
      ]);

      // Success - reset circuit breaker
      if (cbState.state === 'HALF_OPEN' || cbState.failures > 0) {
        cbState.failures = 0;
        cbState.state = 'CLOSED';
        circuitBreakers.set(cbKey, cbState);
        logger.info(`Circuit breaker for ${serviceName} reset to CLOSED`);
      }

      return result;

    } catch (error) {
      lastError = error as Error;
      
      // Update circuit breaker on failure
      cbState.failures++;
      cbState.lastFailureTime = Date.now();
      
      if (cbState.failures >= circuitBreaker.failureThreshold) {
        cbState.state = 'OPEN';
        logger.warn(`Circuit breaker for ${serviceName} opened after ${cbState.failures} failures`);
      }
      
      circuitBreakers.set(cbKey, cbState);

      // Check if error is retryable
      const isRetryable = isRetryableExternalError(error);
      
      if (!isRetryable || attempt === retries) {
        logger.error(`External service ${serviceName} call failed`, {
          attempt: attempt + 1,
          totalAttempts: retries + 1,
          error: getErrorMessage(error),
          isRetryable,
          circuitBreakerState: cbState.state,
        });
        
        throw new AppError(
          `External service ${serviceName} call failed`,
          (error as any).statusCode || 502,
          'EXTERNAL_SERVICE_ERROR',
          { 
            serviceName,
            originalError: getErrorMessage(error),
            attempts: attempt + 1,
            isRetryable,
            circuitBreakerState: cbState.state,
          },
          ErrorSeverity.HIGH,
          ErrorCategory.EXTERNAL_SERVICE
        );
      }

      // Wait before retry with exponential backoff
      const delay = retryDelay * Math.pow(2, attempt);
      logger.warn(`External service ${serviceName} retry ${attempt + 1}/${retries + 1} after ${delay}ms`, {
        error: getErrorMessage(error),
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
};

// Express route wrapper with comprehensive error handling
export const asyncRouteHandler = (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      // Log the error with request context
      logger.error('Route handler error', {
        method: req.method,
        url: req.url,
        path: req.path,
        params: req.params,
        query: req.query,
        headers: {
          'user-agent': req.get('user-agent'),
          'x-forwarded-for': req.get('x-forwarded-for'),
          'x-correlation-id': req.get('x-correlation-id'),
        },
        user: req.user?.id,
        error: {
          name: getErrorMessage(error),
          message: getErrorMessage(error),
          stack: getErrorStack(error),
        },
      });

      // Audit critical operations
      if (req.method !== 'GET' && req.user?.id) {
        logAuditEvent(
          'route.error',
          req.user.id,
          `${req.method} ${req.path}`,
          {
            error: getErrorMessage(error),
            statusCode: (error as any).statusCode || 500,
          }
        );
      }

      next(error);
    }
  };
};

// Business operation wrapper with timing and logging
export const withBusinessOperation = async <T>(
  operationName: string,
  userId: string | undefined,
  operation: () => Promise<T>,
  config: AsyncConfig = {}
): Promise<T> => {
  const startTime = Date.now();
  const { timeout = 60000 } = config;

  try {
    logger.info(`Starting business operation: ${operationName}`, {
      operationName,
      userId,
      startTime,
    });

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new AppError(
          `Business operation ${operationName} timed out after ${timeout}ms`,
          408,
          'OPERATION_TIMEOUT',
          { operationName, timeout },
          ErrorSeverity.MEDIUM,
          ErrorCategory.BUSINESS_LOGIC
        ));
      }, timeout);
    });

    // Race between operation and timeout
    const result = await Promise.race([
      operation(),
      timeoutPromise,
    ]);

    const duration = Date.now() - startTime;
    
    logger.info(`Completed business operation: ${operationName}`, {
      operationName,
      userId,
      duration,
      success: true,
    });

    // Audit successful operations
    if (userId) {
      logAuditEvent(
        'business.operation.completed',
        userId,
        operationName,
        { duration, success: true }
      );
    }

    return result;

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error(`Failed business operation: ${operationName}`, {
      operationName,
      userId,
      duration,
      error: getErrorMessage(error),
      success: false,
    });

    // Audit failed operations
    if (userId) {
      logAuditEvent(
        'business.operation.failed',
        userId,
        operationName,
        { 
          duration,
          error: getErrorMessage(error),
          success: false,
        }
      );
    }

    // Re-throw as business logic error if not already an AppError
    if (!(isError(error) && AppError)) {
      throw new AppError(
        `Business operation ${operationName} failed: ${getErrorMessage(error)}`,
        500,
        'BUSINESS_OPERATION_FAILED',
        { 
          operationName,
          originalError: getErrorMessage(error),
          duration,
        },
        ErrorSeverity.HIGH,
        ErrorCategory.BUSINESS_LOGIC
      );
    }

    throw error;
  }
};

// Cache operation wrapper with error fallback
export const withCacheOperation = async <T>(
  operation: () => Promise<T>,
  fallback: () => Promise<T>,
  cacheKey: string
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    logger.warn(`Cache operation failed for key ${cacheKey}, falling back`, {
      cacheKey,
      error: getErrorMessage(error),
    });
    
    return await fallback();
  }
};

// Validation wrapper with detailed error reporting
export const withValidation = async <T, D = unknown>(
  data: D,
  validator: (data: D) => Promise<T> | T,
  context: string
): Promise<T> => {
  try {
    return await validator(data);
  } catch (error: any) {
    logger.error(`Validation failed for ${context}`, {
      context,
      data: sanitizeDataForLogging(data),
      error: getErrorMessage(error),
    });

    throw new AppError(
      `Validation failed: ${getErrorMessage(error)}`,
      400,
      'VALIDATION_FAILED',
      { 
        context,
        validationErrors: error.details || getErrorMessage(error),
      },
      ErrorSeverity.LOW,
      ErrorCategory.VALIDATION
    );
  }
};

// Helper functions

function isRetryableError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  // Database connection errors that might be temporary
  const retryableCodes = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'P1001', // Prisma connection error
    'P1008', // Prisma timeout
    'P1017', // Prisma connection lost
  ];

  return retryableCodes.includes(err.code || '') || 
         (err.message?.includes('connection') ?? false) ||
         (err.message?.includes('timeout') ?? false);
}

function isRetryableExternalError(error: unknown): boolean {
  const err = error as { status?: number; statusCode?: number; code?: string };
  // HTTP status codes that are worth retrying
  const retryableStatusCodes = [408, 429, 502, 503, 504];
  
  return retryableStatusCodes.includes(err.status || 0) ||
         retryableStatusCodes.includes(err.statusCode || 0) ||
         err.code === 'ECONNRESET' ||
         err.code === 'ETIMEDOUT' ||
         err.code === 'ECONNREFUSED';
}

function sanitizeDataForLogging(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;

  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'key',
    'authorization',
    'cookie',
    'ssn',
    'creditCard',
    'bankAccount',
  ];

  const sanitized = { ...(data as Record<string, unknown>) };
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

// Get circuit breaker status for monitoring
export const getCircuitBreakerStatus = (): Record<string, CircuitBreakerState> => {
  const status: Record<string, CircuitBreakerState> = {};
  
  for (const [key, state] of circuitBreakers.entries()) {
    status[key] = { ...state };
  }
  
  return status;
};

// Reset circuit breaker manually
export const resetCircuitBreaker = (serviceName: string): boolean => {
  const cbKey = `external_service_${serviceName}`;
  const cbState = circuitBreakers.get(cbKey);
  
  if (cbState) {
    cbState.failures = 0;
    cbState.state = 'CLOSED';
    circuitBreakers.set(cbKey, cbState);
    logger.info(`Circuit breaker for ${serviceName} manually reset`);
    return true;
  }
  
  return false;
};