import { Request, Response, NextFunction } from 'express';

/**
 * Async handler wrapper for Express routes
 * Ensures proper error handling and return types
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Type guard for error objects
 */
export const isError = (error: unknown): error is Error => {
  return error instanceof Error;
};

/**
 * Get error message from unknown error type
 */
export const getErrorMessage = (error: unknown): string => {
  if (isError(error)) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
};

/**
 * Get status code from error
 */
export const getErrorStatusCode = (error: unknown): number => {
  if (isError(error) && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  return 500;
};