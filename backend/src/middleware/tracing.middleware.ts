import { Request, Response, NextFunction } from 'express';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ConsoleSpanExporter, BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Initialize OpenTelemetry
const init = () => {
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'austa-backend',
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    }),
  });

  // Configure Jaeger exporter
  const jaegerExporter = new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT || 'http://jaeger:14268/api/traces',
  });

  // Configure console exporter for development
  const consoleExporter = new ConsoleSpanExporter();

  // Add span processors
  provider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));
  
  if (process.env.NODE_ENV === 'development') {
    provider.addSpanProcessor(new BatchSpanProcessor(consoleExporter));
  }

  // Register the provider
  provider.register();

  // Register instrumentations
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        responseHook: (span, response) => {
          span.setAttributes({
            'http.response.status_code': response.statusCode,
            'http.response.status_text': response.statusMessage || '',
          });
        },
      }),
      new ExpressInstrumentation({
        applyCustomAttributesOnSpan: (span: any, request: any, response: any) => {
          span.setAttributes({
            'express.route': info.route || 'unknown',
            'express.method': info.request.method,
          });
        },
      }),
      new RedisInstrumentation(),
      new PgInstrumentation(),
    ],
  });

  logger.info('OpenTelemetry initialized successfully');
};

// Initialize tracing
init();

// Get tracer instance
const tracer = trace.getTracer('austa-backend', '1.0.0');

// Express middleware for tracing
export const tracingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const traceId = uuidv4();
  const spanName = `${req.method} ${req.path}`;
  
  const span = tracer.startSpan(spanName, {
    kind: SpanKind.SERVER,
    attributes: {
      'http.method': req.method,
      'http.url': req.url,
      'http.route': req.route?.path || req.path,
      'http.user_agent': req.get('user-agent') || '',
      'http.client_ip': req.ip,
      'austa.trace_id': traceId,
      'austa.service': 'backend',
    },
  });

  // Add trace ID to request for logging
  req.traceId = traceId;
  req.span = span;

  // Add trace ID to response headers
  res.setHeader('X-Trace-ID', traceId);

  // Continue with the request in the span context
  context.with(trace.setSpan(context.active(), span), () => {
    res.on('finish', () => {
      span.setAttributes({
        'http.status_code': res.statusCode,
        'http.response.size': res.get('content-length') || 0,
      });

      if (res.statusCode >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${res.statusCode}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      span.end();
    });

    next();
  });
};

// Helper function to create child spans
export const createChildSpan = (name: string, attributes?: Record<string, string | number>) => {
  const span = tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes,
  });
  
  return span;
};

// Helper function to trace async operations
export const traceAsyncOperation = async <T>(
  name: string,
  operation: () => Promise<T>,
  attributes?: Record<string, string | number>
): Promise<T> => {
  const span = tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes,
  });

  try {
    const result = await context.with(trace.setSpan(context.active(), span), operation);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    span.setAttributes({
      'error.type': error instanceof Error ? error.constructor.name : 'Unknown',
      'error.message': error instanceof Error ? error.message : 'Unknown error',
    });
    
    throw error;
  } finally {
    span.end();
  }
};

// Helper function to trace database operations
export const traceDatabaseOperation = async <T>(
  operation: string,
  query: string,
  params: any[],
  executor: () => Promise<T>
): Promise<T> => {
  return traceAsyncOperation(
    `db.${operation}`,
    executor,
    {
      'db.system': 'postgresql',
      'db.operation': operation,
      'db.statement': query,
      'db.parameters.count': params.length,
    }
  );
};

// Helper function to trace external API calls
export const traceExternalApiCall = async <T>(
  serviceName: string,
  endpoint: string,
  method: string,
  executor: () => Promise<T>
): Promise<T> => {
  return traceAsyncOperation(
    `external.${serviceName}`,
    executor,
    {
      'http.method': method,
      'http.url': endpoint,
      'external.service': serviceName,
      'span.kind': 'client',
    }
  );
};

// Helper function to trace business operations
export const traceBusinessOperation = async <T>(
  operationName: string,
  businessContext: Record<string, string | number>,
  executor: () => Promise<T>
): Promise<T> => {
  return traceAsyncOperation(
    `business.${operationName}`,
    executor,
    {
      ...businessContext,
      'austa.operation.type': 'business',
    }
  );
};

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      traceId?: string;
      span?: any;
    }
  }
}

export { tracer };