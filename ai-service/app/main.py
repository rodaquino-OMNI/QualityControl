"""
Main FastAPI Application for AI Service
"""
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import uvicorn
from loguru import logger
from utils.logging_config import (
    initialize_logging, 
    log_security_event, 
    log_audit_event, 
    log_performance_metric,
    log_business_event,
    LogContext,
    generate_trace_id
)
import sentry_sdk
from sentry_sdk.integrations.asgi import SentryAsgiMiddleware
from prometheus_client import Counter, Histogram, generate_latest
from prometheus_client.core import CollectorRegistry
import time

from config.settings import settings
from app.routers import models, health, chat, analysis, metrics
from services.model_manager import ModelManager
from utils.middleware import TimingMiddleware, AuthMiddleware


# Metrics
REQUEST_COUNT = Counter(
    'ai_service_requests_total',
    'Total number of requests to AI service',
    ['method', 'endpoint', 'status']
)
REQUEST_DURATION = Histogram(
    'ai_service_request_duration_seconds',
    'Request duration in seconds',
    ['method', 'endpoint']
)


# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown."""
    # Initialize comprehensive logging
    initialize_logging()
    
    # Startup
    with LogContext(trace_id=generate_trace_id()):
        logger.info("Starting AI Service...", extra={
            "event_type": "service_lifecycle",
            "action": "startup"
        })
        
        # Initialize Sentry if configured
        if settings.sentry_dsn:
            sentry_sdk.init(dsn=settings.sentry_dsn)
            logger.info("Sentry monitoring initialized")
        
        # Initialize model manager
        model_manager = ModelManager()
        await model_manager.initialize()
        app.state.model_manager = model_manager
        
        log_business_event("service_started", {
            "service": "ai-service",
            "version": "1.0.0",
            "models_loaded": True
        })
        
        logger.info("AI Service started successfully")
    
    yield
    
    # Shutdown
    with LogContext(trace_id=generate_trace_id()):
        logger.info("Shutting down AI Service...", extra={
            "event_type": "service_lifecycle",
            "action": "shutdown"
        })
        
        await model_manager.shutdown()
        
        log_business_event("service_stopped", {
            "service": "ai-service",
            "graceful_shutdown": True
        })
        
        logger.info("AI Service shut down successfully")


# Create FastAPI app
app = FastAPI(
    title="AUSTA AI Service",
    description="AI Service for Medical Audit Decision Support",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure based on environment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Add custom middleware
app.add_middleware(TimingMiddleware)
app.add_middleware(AuthMiddleware)

# Add Sentry middleware
if settings.sentry_dsn:
    app.add_middleware(SentryAsgiMiddleware)

# Include routers
app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(models.router, prefix="/models", tags=["models"])
app.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(metrics.router, tags=["metrics"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "AUSTA AI Service",
        "version": "1.0.0",
        "status": "operational"
    }


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    registry = CollectorRegistry()
    registry.register(REQUEST_COUNT)
    registry.register(REQUEST_DURATION)
    
    metrics_data = generate_latest(registry)
    return JSONResponse(
        content=metrics_data.decode('utf-8'),
        media_type="text/plain"
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions."""
    request_id = getattr(request.state, 'request_id', 'unknown')
    
    logger.warning(f"HTTP Exception: {exc.detail}", extra={
        "status_code": exc.status_code,
        "request_id": request_id,
        "url": str(request.url),
        "method": request.method,
        "event_type": "http_exception"
    })
    
    if exc.status_code >= 400 and exc.status_code < 500:
        log_security_event("http_client_error", {
            "status_code": exc.status_code,
            "request_id": request_id,
            "url": str(request.url),
            "method": request.method,
            "detail": exc.detail
        })
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "request_id": request_id
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions."""
    request_id = getattr(request.state, 'request_id', 'unknown')
    
    logger.error(f"Unhandled exception: {exc}", extra={
        "exception_type": type(exc).__name__,
        "exception_message": str(exc),
        "request_id": request_id,
        "url": str(request.url),
        "method": request.method,
        "event_type": "unhandled_exception"
    })
    
    log_security_event("unhandled_exception", {
        "exception_type": type(exc).__name__,
        "exception_message": str(exc),
        "request_id": request_id,
        "url": str(request.url),
        "method": request.method
    })
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "status_code": 500,
            "request_id": request_id
        }
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower()
    )