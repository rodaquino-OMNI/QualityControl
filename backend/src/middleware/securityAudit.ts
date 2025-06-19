/**
 * Security Audit Middleware for AUSTA Backend
 * Enhanced security event logging and audit trail management
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { 
  logger, 
  logSecurityEvent, 
  logAuditEvent, 
  logWithContext 
} from '../utils/logger';

// Security event types
export enum SecurityEventType {
  LOGIN_ATTEMPT = 'login_attempt',
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  PERMISSION_DENIED = 'permission_denied',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  DATA_ACCESS = 'data_access',
  DATA_MODIFICATION = 'data_modification',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  API_KEY_USAGE = 'api_key_usage',
  PASSWORD_CHANGE = 'password_change',
  MFA_CHALLENGE = 'mfa_challenge',
  SESSION_TIMEOUT = 'session_timeout',
  BRUTE_FORCE_ATTEMPT = 'brute_force_attempt'
}

// Audit action types
export enum AuditActionType {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  EXPORT = 'export',
  IMPORT = 'import',
  APPROVE = 'approve',
  REJECT = 'reject',
  SUBMIT = 'submit',
  CANCEL = 'cancel'
}

// Security risk levels
export enum SecurityRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// IP address tracking for rate limiting and suspicious activity detection
const ipAttempts = new Map<string, { count: number; lastAttempt: Date; blocked: boolean }>();
const suspiciousIPs = new Set<string>();

// User activity tracking
const userSessions = new Map<string, { 
  loginTime: Date; 
  lastActivity: Date; 
  ipAddress: string;
  userAgent: string;
  actions: number;
}>();

/**
 * Security audit middleware
 */
export const securityAuditMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const clientIP = getClientIP(req);
  const userAgent = req.get('user-agent') || 'unknown';
  const userId = req.user?.id;
  const sessionId = req.sessionID;

  // Track IP activity
  trackIPActivity(clientIP);

  // Check for suspicious activity
  const riskLevel = assessSecurityRisk(req, clientIP, userAgent);

  // Log security context
  const securityContext = {
    requestId: req.id,
    traceId: req.traceId,
    clientIP,
    userAgent,
    userId,
    sessionId,
    riskLevel,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    referer: req.get('referer'),
    origin: req.get('origin'),
  };

  // Enhanced request logging with security context
  logWithContext('info', 'Security Context Established', securityContext);

  // Check for blocked IPs
  if (isIPBlocked(clientIP)) {
    logSecurityEvent(SecurityEventType.UNAUTHORIZED_ACCESS, {
      ...securityContext,
      reason: 'blocked_ip',
      severity: SecurityRiskLevel.HIGH,
    });

    res.status(403).json({ 
      error: 'Access denied',
      code: 'IP_BLOCKED',
      requestId: req.id 
    });
    return;
  }

  // Track user session
  if (userId) {
    trackUserSession(userId, clientIP, userAgent);
  }

  // Intercept response to log completion
  const originalSend = res.send;
  res.send = function(data) {
    res.send = originalSend;

    const duration = Date.now() - startTime;
    const responseSize = Buffer.byteLength(data || '');

    // Log response security context
    logWithContext('info', 'Request Completed', {
      ...securityContext,
      statusCode: res.statusCode,
      duration,
      responseSize,
      success: res.statusCode < 400,
    });

    // Log security events based on response
    if (res.statusCode === 401) {
      logSecurityEvent(SecurityEventType.UNAUTHORIZED_ACCESS, {
        ...securityContext,
        reason: 'authentication_required',
        severity: SecurityRiskLevel.MEDIUM,
      });
    } else if (res.statusCode === 403) {
      logSecurityEvent(SecurityEventType.PERMISSION_DENIED, {
        ...securityContext,
        reason: 'insufficient_permissions',
        severity: SecurityRiskLevel.HIGH,
      });
    } else if (res.statusCode >= 500) {
      logSecurityEvent(SecurityEventType.SUSPICIOUS_ACTIVITY, {
        ...securityContext,
        reason: 'server_error',
        severity: SecurityRiskLevel.MEDIUM,
      });
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Audit trail middleware for sensitive operations
 */
export const auditTrailMiddleware = (action: AuditActionType, resourceType: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.user?.id || 'anonymous';
    const clientIP = getClientIP(req);
    const resourceId = req.params.id || req.body?.id || 'unknown';

    // Capture request data for audit
    const auditData = {
      action,
      resourceType,
      resourceId,
      userId,
      clientIP,
      userAgent: req.get('user-agent'),
      requestId: req.id,
      traceId: req.traceId,
      timestamp: new Date().toISOString(),
      requestData: sanitizeRequestData(req.body),
      queryParams: req.query,
    };

    // Log audit event
    logAuditEvent(action, userId, `${resourceType}:${resourceId}`, auditData);

    // Intercept response to log outcome
    const originalSend = res.send;
    res.send = function(data) {
      res.send = originalSend;

      // Log audit completion
      logAuditEvent(`${action}_completed`, userId, `${resourceType}:${resourceId}`, {
        ...auditData,
        statusCode: res.statusCode,
        success: res.statusCode < 400,
        responseData: sanitizeResponseData(data),
        completedAt: new Date().toISOString(),
      });

      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Authentication event logger
 */
export const logAuthenticationEvent = (
  eventType: SecurityEventType,
  req: Request,
  userId?: string,
  success: boolean = true,
  details: Record<string, any> = {}
): void => {
  const clientIP = getClientIP(req);
  const userAgent = req.get('user-agent') || 'unknown';

  logSecurityEvent(eventType, {
    userId,
    clientIP,
    userAgent,
    success,
    requestId: req.id,
    traceId: req.traceId,
    timestamp: new Date().toISOString(),
    severity: success ? SecurityRiskLevel.LOW : SecurityRiskLevel.HIGH,
    ...details,
  });

  // Track failed login attempts
  if (!success && eventType === SecurityEventType.LOGIN_FAILURE) {
    trackFailedLogin(clientIP, userId);
  }

  // Track successful logins
  if (success && eventType === SecurityEventType.LOGIN_SUCCESS && userId) {
    trackUserSession(userId, clientIP, userAgent);
  }
};

/**
 * Data access logger
 */
export const logDataAccess = (
  req: Request,
  dataType: string,
  dataId: string,
  sensitive: boolean = false,
  personalData: boolean = false
): void => {
  const userId = req.user?.id || 'anonymous';
  const clientIP = getClientIP(req);

  logAuditEvent(AuditActionType.READ, userId, `${dataType}:${dataId}`, {
    dataType,
    dataId,
    sensitive,
    personalData,
    clientIP,
    userAgent: req.get('user-agent'),
    requestId: req.id,
    traceId: req.traceId,
    timestamp: new Date().toISOString(),
    complianceRequired: sensitive || personalData,
  });

  // Log security event for sensitive data access
  if (sensitive || personalData) {
    logSecurityEvent(SecurityEventType.DATA_ACCESS, {
      userId,
      dataType,
      dataId,
      sensitive,
      personalData,
      clientIP,
      severity: personalData ? SecurityRiskLevel.HIGH : SecurityRiskLevel.MEDIUM,
      requestId: req.id,
      traceId: req.traceId,
    });
  }
};

/**
 * Data modification logger
 */
export const logDataModification = (
  req: Request,
  action: AuditActionType,
  dataType: string,
  dataId: string,
  changes: Record<string, any>,
  sensitive: boolean = false
): void => {
  const userId = req.user?.id || 'anonymous';
  const clientIP = getClientIP(req);

  logAuditEvent(action, userId, `${dataType}:${dataId}`, {
    dataType,
    dataId,
    changes: sanitizeChanges(changes),
    sensitive,
    clientIP,
    userAgent: req.get('user-agent'),
    requestId: req.id,
    traceId: req.traceId,
    timestamp: new Date().toISOString(),
    changeCount: Object.keys(changes).length,
  });

  // Log security event for sensitive data modification
  if (sensitive) {
    logSecurityEvent(SecurityEventType.DATA_MODIFICATION, {
      userId,
      action,
      dataType,
      dataId,
      changeCount: Object.keys(changes).length,
      clientIP,
      severity: SecurityRiskLevel.HIGH,
      requestId: req.id,
      traceId: req.traceId,
    });
  }
};

/**
 * Helper functions
 */

function getClientIP(req: Request): string {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         'unknown';
}

function trackIPActivity(ip: string): void {
  const now = new Date();
  const activity = ipAttempts.get(ip) || { count: 0, lastAttempt: now, blocked: false };
  
  activity.count++;
  activity.lastAttempt = now;
  
  ipAttempts.set(ip, activity);
  
  // Check for suspicious activity (more than 100 requests per minute)
  if (activity.count > 100 && (now.getTime() - activity.lastAttempt.getTime()) < 60000) {
    suspiciousIPs.add(ip);
  }
  
  // Reset counter every hour
  if ((now.getTime() - activity.lastAttempt.getTime()) > 3600000) {
    activity.count = 1;
  }
}

function trackFailedLogin(ip: string, userId?: string): void {
  const activity = ipAttempts.get(ip);
  if (activity) {
    activity.count += 10; // Heavily weight failed logins
    
    // Block IP after 5 failed attempts in 15 minutes
    if (activity.count > 50) {
      activity.blocked = true;
      suspiciousIPs.add(ip);
      
      logSecurityEvent(SecurityEventType.BRUTE_FORCE_ATTEMPT, {
        ip,
        userId,
        attempts: activity.count,
        severity: SecurityRiskLevel.CRITICAL,
        autoBlocked: true,
      });
    }
  }
}

function trackUserSession(userId: string, ip: string, userAgent: string): void {
  const now = new Date();
  userSessions.set(userId, {
    loginTime: now,
    lastActivity: now,
    ipAddress: ip,
    userAgent,
    actions: 0,
  });
}

function isIPBlocked(ip: string): boolean {
  const activity = ipAttempts.get(ip);
  return activity?.blocked || suspiciousIPs.has(ip);
}

function assessSecurityRisk(req: Request, ip: string, userAgent: string): SecurityRiskLevel {
  let riskScore = 0;
  
  // Check IP reputation
  if (suspiciousIPs.has(ip)) riskScore += 50;
  
  // Check user agent
  if (!userAgent || userAgent === 'unknown') riskScore += 20;
  
  // Check request patterns
  const activity = ipAttempts.get(ip);
  if (activity && activity.count > 50) riskScore += 30;
  
  // Check for common attack patterns
  if (req.url.includes('..') || req.url.includes('<script>')) riskScore += 100;
  
  // Determine risk level
  if (riskScore >= 100) return SecurityRiskLevel.CRITICAL;
  if (riskScore >= 70) return SecurityRiskLevel.HIGH;
  if (riskScore >= 40) return SecurityRiskLevel.MEDIUM;
  return SecurityRiskLevel.LOW;
}

function sanitizeRequestData(data: any): any {
  if (!data) return null;
  
  const sanitized = { ...data };
  
  // Remove sensitive fields
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

function sanitizeResponseData(data: any): any {
  if (!data) return null;
  
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    const sanitized = { ...parsed };
    
    // Remove sensitive response fields
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  } catch {
    return '[NON_JSON_RESPONSE]';
  }
}

function sanitizeChanges(changes: Record<string, any>): Record<string, any> {
  const sanitized = { ...changes };
  
  // Hash sensitive field changes
  const sensitiveFields = ['password', 'ssn', 'creditCard', 'bankAccount'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = {
        changed: true,
        hash: crypto.createHash('sha256').update(String(sanitized[field])).digest('hex').substring(0, 8)
      };
    }
  });
  
  return sanitized;
}

// Cleanup functions
setInterval(() => {
  const now = Date.now();
  
  // Clean up old IP tracking data
  for (const [ip, activity] of ipAttempts.entries()) {
    if (now - activity.lastAttempt.getTime() > 86400000) { // 24 hours
      ipAttempts.delete(ip);
    }
  }
  
  // Clean up old user sessions
  for (const [userId, session] of userSessions.entries()) {
    if (now - session.lastActivity.getTime() > 86400000) { // 24 hours
      userSessions.delete(userId);
    }
  }
}, 3600000); // Run every hour

// Enums are already exported at their definition