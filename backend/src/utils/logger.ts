import winston from 'winston';
import { format } from 'date-fns';
import DailyRotateFile from 'winston-daily-rotate-file';
import { ElasticsearchTransport } from 'winston-elasticsearch';
import { Client } from '@elastic/elasticsearch';
import os from 'os';

// Service information
const serviceInfo = {
  service: 'austa-backend',
  version: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  hostname: os.hostname(),
  pid: process.pid,
};

// Log levels with numeric values for filtering
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Color scheme for console output
const logColors = {
  error: 'red',
  warn: 'yellow', 
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(logColors);

// Enhanced log format for structured logging
const enhancedLogFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, requestId, userId, ...metadata }) => {
    const logEntry = {
      '@timestamp': timestamp,
      level: level.toUpperCase(),
      message,
      ...serviceInfo,
      ...(requestId && { requestId }),
      ...(userId && { userId }),
      ...(stack && { stack }),
      ...metadata,
    };
    
    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, requestId, ...metadata }) => {
    const formattedDate = format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss');
    let msg = `${formattedDate} [${level}]: ${message}`;
    
    if (requestId) {
      msg += ` [${requestId}]`;
    }
    
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    
    return msg;
  })
);

// Create transports array
const transports: winston.transport[] = [
  // Console transport for development
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? enhancedLogFormat : consoleFormat,
    level: process.env.LOG_LEVEL || 'info'
  }),
];

// File transports with rotation
if (process.env.NODE_ENV !== 'test') {
  // Application logs with daily rotation
  transports.push(
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: enhancedLogFormat,
      level: 'info'
    })
  );

  // Error logs with daily rotation
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d',
      format: enhancedLogFormat,
      level: 'error'
    })
  );

  // Security and audit logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/security-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '365d',
      format: enhancedLogFormat,
      level: 'warn'
    })
  );

  // HTTP access logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/access-%DATE%.log',
      datePattern: 'YYYY-MM-DD-HH',
      maxSize: '100m',
      maxFiles: '7d',
      format: enhancedLogFormat,
      level: 'http'
    })
  );
}

// Elasticsearch transport for production
if (process.env.NODE_ENV === 'production' && process.env.ELASTICSEARCH_URL) {
  const esClient = new Client({
    node: process.env.ELASTICSEARCH_URL,
    auth: {
      username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
      password: process.env.ELASTICSEARCH_PASSWORD || 'changeme'
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  transports.push(
    new ElasticsearchTransport({
      client: esClient,
      level: 'info',
      index: 'austa-backend-logs',
      indexTemplate: {
        name: 'austa-backend-logs',
        patterns: ['austa-backend-logs-*'],
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
          'index.mapping.total_fields.limit': 2000
        },
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            level: { type: 'keyword' },
            message: { type: 'text' },
            service: { type: 'keyword' },
            environment: { type: 'keyword' },
            hostname: { type: 'keyword' },
            requestId: { type: 'keyword' },
            userId: { type: 'keyword' },
            responseTime: { type: 'integer' },
            statusCode: { type: 'integer' },
            method: { type: 'keyword' },
            url: { type: 'keyword' },
            ip: { type: 'ip' },
            userAgent: { type: 'text' }
          }
        }
      }
    })
  );
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: enhancedLogFormat,
  transports,
  exitOnError: false,
  silent: process.env.NODE_ENV === 'test'
});

// Enhanced logging methods with context
export const auditLogger = logger.child({ category: 'audit' });
export const securityLogger = logger.child({ category: 'security' });
export const performanceLogger = logger.child({ category: 'performance' });
export const businessLogger = logger.child({ category: 'business' });

// Context-aware logging functions
export const logWithContext = (level: string, message: string, context: Record<string, any> = {}) => {
  const contextInfo = {
    ...context,
    timestamp: new Date().toISOString(),
    traceId: context.traceId || generateTraceId(),
  };
  
  logger.log(level, message, contextInfo);
};

// Security event logging
export const logSecurityEvent = (event: string, details: Record<string, any> = {}) => {
  securityLogger.warn(`Security Event: ${event}`, {
    eventType: 'security',
    event,
    severity: 'high',
    ...details,
    timestamp: new Date().toISOString(),
  });
};

// Audit trail logging  
export const logAuditEvent = (action: string, userId: string, resource: string, details: Record<string, any> = {}) => {
  auditLogger.info(`Audit: ${action}`, {
    eventType: 'audit',
    action,
    userId,
    resource,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

// Performance monitoring
export const logPerformanceMetric = (metric: string, value: number, context: Record<string, any> = {}) => {
  performanceLogger.info(`Performance: ${metric}`, {
    eventType: 'performance',
    metric,
    value,
    unit: context.unit || 'ms',
    ...context,
    timestamp: new Date().toISOString(),
  });
};

// Business metrics logging
export const logBusinessEvent = (event: string, data: Record<string, any> = {}) => {
  businessLogger.info(`Business: ${event}`, {
    eventType: 'business',
    event,
    ...data,
    timestamp: new Date().toISOString(),
  });
};

// Error logging with enriched context
export const logError = (error: Error, context: Record<string, any> = {}) => {
  logger.error(error.message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
    timestamp: new Date().toISOString(),
  });
};

// Trace ID generation for distributed tracing
const generateTraceId = (): string => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// Create a stream object with a 'write' function for Morgan
export const stream = {
  write: (message: string) => {
    // Parse the morgan log format and extract relevant information
    const trimmedMessage = message.trim();
    logger.http('HTTP Access', { 
      message: trimmedMessage,
      category: 'http-access',
      timestamp: new Date().toISOString(),
    });
  }
};

// Log sampling for high-volume scenarios
export const createSampledLogger = (sampleRate: number = 0.1) => {
  return {
    info: (message: string, meta?: any) => {
      if (Math.random() < sampleRate) {
        logger.info(message, { ...meta, sampled: true });
      }
    },
    debug: (message: string, meta?: any) => {
      if (Math.random() < sampleRate) {
        logger.debug(message, { ...meta, sampled: true });
      }
    }
  };
};

// Graceful shutdown handling
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  logger.end();
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  logger.end();
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

// Export default logger for backward compatibility
export default logger;