import winston from 'winston';
import { Request } from 'express';

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'austa-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ 
    filename: 'error.log', 
    level: 'error' 
  }));
  logger.add(new winston.transports.File({ 
    filename: 'combined.log' 
  }));
}

// Helper function to extract request context
function extractRequestContext(req: Request) {
  return {
    method: req.method,
    url: req.url,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
    userId: (req as any).user?.id,
    sessionId: (req as any).sessionId
  };
}

// Log with context
export function logWithContext(level: string, message: string, context?: any, req?: Request) {
  const logData: any = { message };
  
  if (req) {
    logData.request = extractRequestContext(req);
  }
  
  if (context) {
    logData.context = context;
  }
  
  logger.log(level, logData);
}

// Security event logging
export function logSecurityEvent(
  eventType: string,
  severity: string,
  details: string,
  metadata?: any
) {
  logger.warn({
    type: 'SECURITY_EVENT',
    eventType,
    severity,
    details,
    metadata,
    timestamp: new Date().toISOString()
  });
}

// Audit event logging
export function logAuditEvent(
  action: string,
  userId: string | undefined,
  resourceId: string,
  details?: any
) {
  logger.info({
    type: 'AUDIT_EVENT',
    action,
    userId: userId || 'system',
    resourceId,
    details,
    timestamp: new Date().toISOString()
  });
}

// Add logAudit method to logger object for compatibility
(logger as any).logAudit = function(action: string, userId: string | undefined, metadata?: any) {
  // Extract resourceId from metadata if available
  const resourceId = metadata?.caseId || metadata?.decisionId || metadata?.appealId || metadata?.id || '';
  logAuditEvent(action, userId, resourceId, metadata);
};

// Compatibility with existing code
export { logger };
export default logger;