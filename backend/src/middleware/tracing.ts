/**
 * Distributed Tracing Middleware for AUSTA Backend
 * Implements OpenTelemetry-based distributed tracing for request correlation
 */

import { Request, Response, NextFunction } from 'express';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { ConsoleSpanExporter, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { v4 as uuidv4 } from 'uuid';
import { logger, logWithContext } from '../utils/logger';

// Service configuration
const serviceName = 'austa-backend';
const serviceVersion = process.env.npm_package_version || '1.0.0';
const environment = process.env.NODE_ENV || 'development';

// Tracer configuration
let tracerProvider: NodeTracerProvider;
let tracer: any;

/**
 * Initialize OpenTelemetry tracing
 */
export function initializeTracing(): void {
  // Create resource with service information
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'austa',
  });

  // Create tracer provider
  tracerProvider = new NodeTracerProvider({
    resource,
  });

  // Configure exporters
  const exporters = [];

  // Console exporter for development
  if (environment === 'development') {
    exporters.push(new ConsoleSpanExporter());
  }

  // Jaeger exporter for production
  if (process.env.JAEGER_ENDPOINT) {
    exporters.push(
      new JaegerExporter({
        endpoint: process.env.JAEGER_ENDPOINT,
        headers: {},
        username: process.env.JAEGER_USERNAME,
        password: process.env.JAEGER_PASSWORD,
      })
    );
  }

  // Add batch span processors
  exporters.forEach(exporter => {
    tracerProvider.addSpanProcessor(new BatchSpanProcessor(exporter));
  });

  // Register tracer provider
  tracerProvider.register();

  // Register instrumentations
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        requestHook: (span, request) => {
          span.setAttributes({
            'http.request.header.user-agent': request.getHeader('user-agent'),
            'http.request.header.x-forwarded-for': request.getHeader('x-forwarded-for'),
          });
        },
        responseHook: (span, response) => {
          span.setAttributes({
            'http.response.header.content-type': response.getHeader('content-type'),
          });
        },
      }),
      new ExpressInstrumentation({
        requestHook: (span, info) => {
          span.setAttributes({
            'express.route': info.route,
            'express.request.route.path': info.request.route?.path,
          });
        },
      }),
    ],
  });

  // Get tracer instance
  tracer = trace.getTracer(serviceName, serviceVersion);

  logger.info('Distributed tracing initialized', {
    service: serviceName,
    version: serviceVersion,
    environment,
    exporters: exporters.length,
  });
}

/**
 * Express middleware for distributed tracing
 */
export const tracingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Extract or generate trace ID
  let traceId = req.headers['x-trace-id'] as string || 
                req.headers['traceparent'] as string ||
                uuidv4();

  // Generate span ID
  const spanId = uuidv4();

  // Store tracing information in request
  req.traceId = traceId;
  req.spanId = spanId;

  // Create span for the request
  const span = tracer.startSpan(`${req.method} ${req.route?.path || req.path}`, {
    kind: SpanKind.SERVER,
    attributes: {
      'http.method': req.method,
      'http.url': req.url,
      'http.scheme': req.protocol,
      'http.host': req.get('host'),
      'http.user_agent': req.get('user-agent'),
      'http.request_content_length': req.get('content-length'),
      'user.id': req.user?.id,
      'user.role': req.user?.role,
      'request.id': req.id,
      'trace.id': traceId,
      'span.id': spanId,
    },
  });

  // Set trace context
  const traceContext = trace.setSpan(context.active(), span);

  // Store span in request for later use
  req.span = span;

  // Add tracing headers to response
  res.setHeader('X-Trace-ID', traceId);
  res.setHeader('X-Span-ID', spanId);

  // Log request with tracing context
  logWithContext('info', 'HTTP Request received', {
    traceId,
    spanId,
    method: req.method,
    url: req.url,
    userAgent: req.get('user-agent'),
    ip: req.ip,
  });

  // Intercept response to add span information
  const originalSend = res.send;
  res.send = function(data) {
    res.send = originalSend;

    // Update span with response information
    span.setAttributes({
      'http.status_code': res.statusCode,
      'http.response_content_length': Buffer.byteLength(data || ''),
    });

    // Set span status
    if (res.statusCode >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${res.statusCode}`,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    // Log response with tracing context
    logWithContext('info', 'HTTP Response sent', {
      traceId,
      spanId,
      statusCode: res.statusCode,
      duration: Date.now() - req.startTime!,
    });

    // End span
    span.end();

    return originalSend.call(this, data);
  };

  // Run in trace context
  context.with(traceContext, () => {
    next();
  });
};

/**
 * Create a child span for operations within a request
 */
export function createChildSpan(
  req: Request,
  operationName: string,
  attributes: Record<string, any> = {}
): any {
  if (!req.span) {
    logger.warn('No parent span found in request', { operationName });
    return null;
  }

  const childSpan = tracer.startSpan(operationName, {
    parent: req.span,
    attributes: {
      ...attributes,
      'trace.id': req.traceId,
      'parent.span.id': req.spanId,
    },
  });

  return childSpan;
}

/**
 * Add trace context to external service calls
 */
export function getTraceHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};

  if (req.traceId) {
    headers['X-Trace-ID'] = req.traceId;
    headers['X-Parent-Span-ID'] = req.spanId;
  }

  // Add W3C Trace Context header
  if (req.span) {
    const spanContext = req.span.spanContext();
    if (spanContext.traceId && spanContext.spanId) {
      headers['traceparent'] = `00-${spanContext.traceId}-${spanContext.spanId}-01`;
    }
  }

  return headers;
}

/**
 * Instrument database operations
 */
export function instrumentDatabaseOperation<T>(
  req: Request,
  operation: string,
  query: string,
  executor: () => Promise<T>
): Promise<T> {
  const span = createChildSpan(req, `db.${operation}`, {
    'db.operation': operation,
    'db.statement': query,
    'db.type': 'postgresql',
  });

  if (!span) {
    return executor();
  }

  const startTime = Date.now();

  return executor()
    .then(result => {
      span.setAttributes({
        'db.duration': Date.now() - startTime,
        'db.success': true,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    })
    .catch(error => {
      span.setAttributes({
        'db.duration': Date.now() - startTime,
        'db.success': false,
        'db.error': error.message,
      });
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      throw error;
    })
    .finally(() => {
      span.end();
    });
}

/**
 * Instrument external API calls
 */
export function instrumentExternalCall<T>(
  req: Request,
  serviceName: string,
  operation: string,
  url: string,
  executor: () => Promise<T>
): Promise<T> {
  const span = createChildSpan(req, `external.${serviceName}.${operation}`, {
    'http.url': url,
    'service.name': serviceName,
    'operation.name': operation,
  });

  if (!span) {
    return executor();
  }

  const startTime = Date.now();

  return executor()
    .then(result => {
      span.setAttributes({
        'http.duration': Date.now() - startTime,
        'http.success': true,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    })
    .catch(error => {
      span.setAttributes({
        'http.duration': Date.now() - startTime,
        'http.success': false,
        'http.error': error.message,
      });
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      throw error;
    })
    .finally(() => {
      span.end();
    });
}

/**
 * Add business context to span
 */
export function addBusinessContext(
  req: Request,
  context: {
    caseId?: string;
    userId?: string;
    auditAction?: string;
    businessProcess?: string;
  }
): void {
  if (req.span) {
    req.span.setAttributes({
      'business.case_id': context.caseId,
      'business.user_id': context.userId,
      'business.audit_action': context.auditAction,
      'business.process': context.businessProcess,
    });
  }
}

/**
 * Gracefully shutdown tracing
 */
export async function shutdownTracing(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    logger.info('Distributed tracing shutdown completed');
  }
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      traceId?: string;
      spanId?: string;
      span?: any;
    }
  }
}

export default {
  initializeTracing,
  tracingMiddleware,
  createChildSpan,
  getTraceHeaders,
  instrumentDatabaseOperation,
  instrumentExternalCall,
  addBusinessContext,
  shutdownTracing,
};