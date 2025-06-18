"""
Distributed Tracing Configuration for AUSTA AI Service
Implements OpenTelemetry-based distributed tracing for request correlation
"""
import os
import time
import uuid
from typing import Dict, Any, Optional, Callable
from contextlib import contextmanager

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentation
from opentelemetry.instrumentation.requests import RequestsInstrumentation
from opentelemetry.instrumentation.psycopg2 import Psycopg2Instrumentation
from opentelemetry.instrumentation.redis import RedisInstrumentation
from opentelemetry.trace import Status, StatusCode, SpanKind
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

import logging
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from utils.logging_config import log_with_context, log_performance_metric

# Service configuration
SERVICE_NAME = "austa-ai-service"
SERVICE_VERSION = os.getenv("SERVICE_VERSION", "1.0.0")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Global tracer instance
tracer: Optional[trace.Tracer] = None
propagator = TraceContextTextMapPropagator()

logger = logging.getLogger(__name__)


def initialize_tracing() -> None:
    """Initialize OpenTelemetry tracing for the AI service."""
    global tracer
    
    # Create resource with service information
    resource = Resource.create({
        ResourceAttributes.SERVICE_NAME: SERVICE_NAME,
        ResourceAttributes.SERVICE_VERSION: SERVICE_VERSION,
        ResourceAttributes.DEPLOYMENT_ENVIRONMENT: ENVIRONMENT,
        ResourceAttributes.SERVICE_NAMESPACE: "austa",
    })
    
    # Create tracer provider
    provider = TracerProvider(resource=resource)
    
    # Configure exporters
    exporters = []
    
    # Console exporter for development
    if ENVIRONMENT == "development":
        exporters.append(ConsoleSpanExporter())
    
    # Jaeger exporter for production
    jaeger_endpoint = os.getenv("JAEGER_ENDPOINT")
    if jaeger_endpoint:
        jaeger_exporter = JaegerExporter(
            agent_host_name=os.getenv("JAEGER_AGENT_HOST", "localhost"),
            agent_port=int(os.getenv("JAEGER_AGENT_PORT", "6831")),
            collector_endpoint=jaeger_endpoint,
            username=os.getenv("JAEGER_USERNAME"),
            password=os.getenv("JAEGER_PASSWORD"),
        )
        exporters.append(jaeger_exporter)
    
    # Add batch span processors
    for exporter in exporters:
        processor = BatchSpanProcessor(exporter)
        provider.add_span_processor(processor)
    
    # Set the tracer provider
    trace.set_tracer_provider(provider)
    
    # Get tracer instance
    tracer = trace.get_tracer(SERVICE_NAME, SERVICE_VERSION)
    
    # Instrument libraries
    FastAPIInstrumentation.instrument()
    RequestsInstrumentation.instrument()
    Psycopg2Instrumentation.instrument()
    RedisInstrumentation.instrument()
    
    logger.info(
        "Distributed tracing initialized",
        extra={
            "service": SERVICE_NAME,
            "version": SERVICE_VERSION,
            "environment": ENVIRONMENT,
            "exporters": len(exporters),
        }
    )


class TracingMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for distributed tracing."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Extract or generate trace ID
        trace_id = (
            request.headers.get("x-trace-id") or
            request.headers.get("traceparent") or
            str(uuid.uuid4())
        )
        
        # Generate span ID
        span_id = str(uuid.uuid4())
        
        # Store tracing information in request state
        request.state.trace_id = trace_id
        request.state.span_id = span_id
        
        # Extract trace context from headers
        headers = dict(request.headers)
        ctx = propagator.extract(headers)
        
        # Create span for the request
        with tracer.start_as_current_span(
            f"{request.method} {request.url.path}",
            context=ctx,
            kind=SpanKind.SERVER,
        ) as span:
            
            # Set span attributes
            span.set_attributes({
                "http.method": request.method,
                "http.url": str(request.url),
                "http.scheme": request.url.scheme,
                "http.host": request.url.hostname,
                "http.user_agent": request.headers.get("user-agent", ""),
                "http.request_content_length": request.headers.get("content-length"),
                "trace.id": trace_id,
                "span.id": span_id,
            })
            
            # Store span in request state
            request.state.span = span
            
            # Log request with tracing context
            log_with_context(
                logger,
                "INFO",
                "HTTP Request received",
                trace_id=trace_id,
                span_id=span_id,
                method=request.method,
                url=str(request.url),
                user_agent=request.headers.get("user-agent", ""),
                ip=request.client.host if request.client else None,
            )
            
            start_time = time.time()
            
            try:
                # Process request
                response = await call_next(request)
                
                # Calculate duration
                duration = (time.time() - start_time) * 1000  # Convert to milliseconds
                
                # Update span with response information
                span.set_attributes({
                    "http.status_code": response.status_code,
                    "http.response_content_length": response.headers.get("content-length"),
                    "http.duration": duration,
                })
                
                # Set span status
                if response.status_code >= 400:
                    span.set_status(Status(StatusCode.ERROR, f"HTTP {response.status_code}"))
                else:
                    span.set_status(Status(StatusCode.OK))
                
                # Add tracing headers to response
                response.headers["X-Trace-ID"] = trace_id
                response.headers["X-Span-ID"] = span_id
                
                # Inject trace context into response headers
                propagator.inject(response.headers)
                
                # Log response with tracing context
                log_with_context(
                    logger,
                    "INFO",
                    "HTTP Response sent",
                    trace_id=trace_id,
                    span_id=span_id,
                    status_code=response.status_code,
                    duration=duration,
                )
                
                # Log performance metric
                log_performance_metric(
                    f"http_request_{request.method.lower()}",
                    duration,
                    trace_id=trace_id,
                    endpoint=request.url.path,
                    status_code=response.status_code,
                )
                
                return response
                
            except Exception as e:
                # Handle errors
                duration = (time.time() - start_time) * 1000
                
                span.set_attributes({
                    "http.duration": duration,
                    "error.message": str(e),
                    "error.type": type(e).__name__,
                })
                
                span.set_status(Status(StatusCode.ERROR, str(e)))
                
                logger.error(
                    f"Request failed: {e}",
                    extra={
                        "trace_id": trace_id,
                        "span_id": span_id,
                        "error_type": type(e).__name__,
                        "duration": duration,
                    }
                )
                
                raise


def create_child_span(
    request: Request,
    operation_name: str,
    attributes: Optional[Dict[str, Any]] = None
) -> Optional[trace.Span]:
    """Create a child span for operations within a request."""
    if not hasattr(request.state, "span"):
        logger.warning(f"No parent span found in request for operation: {operation_name}")
        return None
    
    if not tracer:
        return None
    
    span = tracer.start_span(
        operation_name,
        attributes={
            **(attributes or {}),
            "trace.id": getattr(request.state, "trace_id", ""),
            "parent.span.id": getattr(request.state, "span_id", ""),
        }
    )
    
    return span


def get_trace_headers(request: Request) -> Dict[str, str]:
    """Get trace headers for external service calls."""
    headers = {}
    
    if hasattr(request.state, "trace_id"):
        headers["X-Trace-ID"] = request.state.trace_id
        headers["X-Parent-Span-ID"] = request.state.span_id
    
    # Add W3C Trace Context header
    if hasattr(request.state, "span"):
        span_context = request.state.span.get_span_context()
        if span_context.trace_id and span_context.span_id:
            headers["traceparent"] = f"00-{span_context.trace_id:032x}-{span_context.span_id:016x}-01"
    
    return headers


@contextmanager
def instrument_model_operation(
    request: Request,
    model_name: str,
    operation: str,
    input_data: Optional[Dict[str, Any]] = None
):
    """Context manager to instrument ML model operations."""
    span = create_child_span(
        request,
        f"ml.{model_name}.{operation}",
        {
            "ml.model.name": model_name,
            "ml.operation": operation,
            "ml.input.size": len(str(input_data)) if input_data else 0,
        }
    )
    
    if not span:
        yield None
        return
    
    start_time = time.time()
    
    try:
        yield span
        
        duration = (time.time() - start_time) * 1000
        span.set_attributes({
            "ml.duration": duration,
            "ml.success": True,
        })
        span.set_status(Status(StatusCode.OK))
        
        # Log model performance
        log_performance_metric(
            f"ml_model_{model_name}_{operation}",
            duration,
            trace_id=getattr(request.state, "trace_id", ""),
            model=model_name,
            operation=operation,
        )
        
    except Exception as e:
        duration = (time.time() - start_time) * 1000
        span.set_attributes({
            "ml.duration": duration,
            "ml.success": False,
            "ml.error": str(e),
            "error.type": type(e).__name__,
        })
        span.set_status(Status(StatusCode.ERROR, str(e)))
        
        logger.error(
            f"Model operation failed: {e}",
            extra={
                "trace_id": getattr(request.state, "trace_id", ""),
                "model": model_name,
                "operation": operation,
                "duration": duration,
            }
        )
        
        raise
        
    finally:
        span.end()


@contextmanager
def instrument_database_operation(
    request: Request,
    operation: str,
    query: Optional[str] = None
):
    """Context manager to instrument database operations."""
    span = create_child_span(
        request,
        f"db.{operation}",
        {
            "db.operation": operation,
            "db.statement": query,
            "db.type": "postgresql",
        }
    )
    
    if not span:
        yield None
        return
    
    start_time = time.time()
    
    try:
        yield span
        
        duration = (time.time() - start_time) * 1000
        span.set_attributes({
            "db.duration": duration,
            "db.success": True,
        })
        span.set_status(Status(StatusCode.OK))
        
    except Exception as e:
        duration = (time.time() - start_time) * 1000
        span.set_attributes({
            "db.duration": duration,
            "db.success": False,
            "db.error": str(e),
        })
        span.set_status(Status(StatusCode.ERROR, str(e)))
        raise
        
    finally:
        span.end()


@contextmanager
def instrument_external_call(
    request: Request,
    service_name: str,
    operation: str,
    url: str
):
    """Context manager to instrument external API calls."""
    span = create_child_span(
        request,
        f"external.{service_name}.{operation}",
        {
            "http.url": url,
            "service.name": service_name,
            "operation.name": operation,
        }
    )
    
    if not span:
        yield None
        return
    
    start_time = time.time()
    
    try:
        yield span
        
        duration = (time.time() - start_time) * 1000
        span.set_attributes({
            "http.duration": duration,
            "http.success": True,
        })
        span.set_status(Status(StatusCode.OK))
        
    except Exception as e:
        duration = (time.time() - start_time) * 1000
        span.set_attributes({
            "http.duration": duration,
            "http.success": False,
            "http.error": str(e),
        })
        span.set_status(Status(StatusCode.ERROR, str(e)))
        raise
        
    finally:
        span.end()


def add_business_context(
    request: Request,
    context: Dict[str, Any]
) -> None:
    """Add business context to the current span."""
    if hasattr(request.state, "span") and request.state.span:
        business_attributes = {}
        
        for key, value in context.items():
            business_attributes[f"business.{key}"] = value
        
        request.state.span.set_attributes(business_attributes)


def shutdown_tracing() -> None:
    """Gracefully shutdown tracing."""
    provider = trace.get_tracer_provider()
    if hasattr(provider, "shutdown"):
        provider.shutdown()
        logger.info("Distributed tracing shutdown completed")


# Auto-initialize when module is imported
if __name__ != "__main__":
    initialize_tracing()