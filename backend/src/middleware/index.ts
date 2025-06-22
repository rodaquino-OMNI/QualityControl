/**
 * Central middleware export file
 * This consolidates all middleware exports for easier imports
 */

// Error handling
export { errorHandler, AppError } from './errorHandler';
export { notFoundHandler } from './notFoundHandler';

// Authentication and authorization
export { AuthMiddleware } from './auth.middleware';
export { validateApiKey } from './validateApiKey';

// Security
export {
  corsMiddleware,
  helmetMiddleware,
  securityHeaders,
  sanitizeRequest,
  requestSizeLimit,
  ipFilter
} from './security.middleware';

// Logging and monitoring
export { requestLogger } from './requestLogger';
export { tracingMiddleware } from './tracing.middleware';

// Audit
export { securityAuditMiddleware } from './securityAudit';