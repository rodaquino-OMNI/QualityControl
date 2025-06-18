import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;
  details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error
  logger.logError(err, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userId: (req as any).user?.id,
  });

  // Default error
  let error = {
    message: 'Internal Server Error',
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    details: null,
  };

  // Handle known errors
  if (err instanceof AppError) {
    error = {
      message: err.message,
      code: err.code || 'APP_ERROR',
      statusCode: err.statusCode,
      details: err.details,
    };
  } else if (err.name === 'ValidationError') {
    error = {
      message: 'Validation Error',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: err.message,
    };
  } else if (err.name === 'UnauthorizedError') {
    error = {
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
      statusCode: 401,
      details: null,
    };
  } else if (err.name === 'CastError') {
    error = {
      message: 'Invalid ID format',
      code: 'INVALID_ID',
      statusCode: 400,
      details: null,
    };
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && error.statusCode === 500) {
    error.details = null;
  }

  // Send error response
  res.status(error.statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
    timestamp: new Date().toISOString(),
    path: req.path,
  });
};