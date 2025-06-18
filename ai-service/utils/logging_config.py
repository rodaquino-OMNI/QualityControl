"""
Enhanced Logging Configuration for AI Service
"""
import json
import logging
import logging.handlers
import os
import sys
import time
import uuid
from datetime import datetime
from typing import Any, Dict, Optional, Union
from pathlib import Path

from loguru import logger as loguru_logger
from pythonjsonlogger import jsonlogger
import structlog


# Service information
SERVICE_INFO = {
    "service": "austa-ai-service",
    "version": os.getenv("SERVICE_VERSION", "1.0.0"),
    "environment": os.getenv("ENVIRONMENT", "development"),
    "hostname": os.uname().nodename,
    "pid": os.getpid(),
}

# Log levels mapping
LOG_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}


class StructuredFormatter(jsonlogger.JsonFormatter):
    """Enhanced JSON formatter with service context."""
    
    def add_fields(self, log_record: Dict[str, Any], record: logging.LogRecord, message_dict: Dict[str, Any]) -> None:
        super().add_fields(log_record, record, message_dict)
        
        # Add service information
        log_record.update(SERVICE_INFO)
        
        # Standardize timestamp
        log_record["@timestamp"] = datetime.utcnow().isoformat() + "Z"
        
        # Add trace information if available
        if hasattr(record, 'trace_id'):
            log_record["trace_id"] = record.trace_id
        if hasattr(record, 'span_id'):
            log_record["span_id"] = record.span_id
        if hasattr(record, 'request_id'):
            log_record["request_id"] = record.request_id
        if hasattr(record, 'user_id'):
            log_record["user_id"] = record.user_id
            
        # Add performance metrics if available
        if hasattr(record, 'duration'):
            log_record["duration"] = record.duration
        if hasattr(record, 'memory_usage'):
            log_record["memory_usage"] = record.memory_usage


class SecurityLogFilter(logging.Filter):
    """Filter for security-related log entries."""
    
    def filter(self, record: logging.LogRecord) -> bool:
        # Mark security events
        security_keywords = ['auth', 'login', 'permission', 'access', 'security', 'unauthorized']
        if any(keyword in record.getMessage().lower() for keyword in security_keywords):
            record.security_event = True
        return True


class PerformanceLogFilter(logging.Filter):
    """Filter for performance-related log entries."""
    
    def filter(self, record: logging.LogRecord) -> bool:
        # Mark performance events
        performance_keywords = ['performance', 'latency', 'response_time', 'memory', 'cpu']
        if any(keyword in record.getMessage().lower() for keyword in performance_keywords):
            record.performance_event = True
        return True


def setup_file_logging(log_dir: str = "logs") -> None:
    """Setup file-based logging with rotation."""
    
    # Ensure log directory exists
    Path(log_dir).mkdir(parents=True, exist_ok=True)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(LOG_LEVELS.get(os.getenv("LOG_LEVEL", "INFO"), logging.INFO))
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Console handler for development
    console_handler = logging.StreamHandler(sys.stdout)
    if os.getenv("ENVIRONMENT") == "production":
        console_handler.setFormatter(StructuredFormatter())
    else:
        console_handler.setFormatter(logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        ))
    root_logger.addHandler(console_handler)
    
    # Application logs with daily rotation
    app_handler = logging.handlers.TimedRotatingFileHandler(
        filename=os.path.join(log_dir, "application.log"),
        when="midnight",
        interval=1,
        backupCount=30,
        encoding="utf-8"
    )
    app_handler.setFormatter(StructuredFormatter())
    app_handler.addFilter(logging.Filter(lambda record: record.levelno >= logging.INFO))
    root_logger.addHandler(app_handler)
    
    # Error logs with daily rotation
    error_handler = logging.handlers.TimedRotatingFileHandler(
        filename=os.path.join(log_dir, "error.log"),
        when="midnight",
        interval=1,
        backupCount=90,
        encoding="utf-8"
    )
    error_handler.setFormatter(StructuredFormatter())
    error_handler.addFilter(logging.Filter(lambda record: record.levelno >= logging.ERROR))
    root_logger.addHandler(error_handler)
    
    # Security logs with extended retention
    security_handler = logging.handlers.TimedRotatingFileHandler(
        filename=os.path.join(log_dir, "security.log"),
        when="midnight",
        interval=1,
        backupCount=365,
        encoding="utf-8"
    )
    security_handler.setFormatter(StructuredFormatter())
    security_handler.addFilter(SecurityLogFilter())
    root_logger.addHandler(security_handler)
    
    # Performance logs
    performance_handler = logging.handlers.TimedRotatingFileHandler(
        filename=os.path.join(log_dir, "performance.log"),
        when="midnight",
        interval=1,
        backupCount=7,
        encoding="utf-8"
    )
    performance_handler.setFormatter(StructuredFormatter())
    performance_handler.addFilter(PerformanceLogFilter())
    root_logger.addHandler(performance_handler)


def setup_elasticsearch_logging() -> None:
    """Setup Elasticsearch logging for production."""
    
    if os.getenv("ENVIRONMENT") != "production" or not os.getenv("ELASTICSEARCH_URL"):
        return
    
    try:
        from elasticsearch import Elasticsearch
        from ecs_logging import StdlibFormatter
        from ecs_logging.handlers import ElasticsearchHandler
        
        # Create Elasticsearch client
        es_client = Elasticsearch(
            [os.getenv("ELASTICSEARCH_URL")],
            http_auth=(
                os.getenv("ELASTICSEARCH_USERNAME", "elastic"),
                os.getenv("ELASTICSEARCH_PASSWORD", "changeme")
            ),
            verify_certs=False
        )
        
        # Create Elasticsearch handler
        es_handler = ElasticsearchHandler(
            es_client=es_client,
            index_name="austa-ai-service-logs",
            doc_type="_doc"
        )
        es_handler.setFormatter(StdlibFormatter())
        
        # Add to root logger
        logging.getLogger().addHandler(es_handler)
        
    except ImportError:
        logging.warning("Elasticsearch logging dependencies not available")
    except Exception as e:
        logging.error(f"Failed to setup Elasticsearch logging: {e}")


def configure_loguru() -> None:
    """Configure Loguru for enhanced logging."""
    
    # Remove default handler
    loguru_logger.remove()
    
    # Console handler
    log_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "<level>{message}</level>"
    )
    
    if os.getenv("ENVIRONMENT") == "production":
        log_format = json.dumps({
            "@timestamp": "{time:YYYY-MM-DD HH:mm:ss.SSSZ}",
            "level": "{level}",
            "logger": "{name}",
            "function": "{function}",
            "line": "{line}",
            "message": "{message}",
            **SERVICE_INFO
        })
    
    loguru_logger.add(
        sys.stdout,
        format=log_format,
        level=os.getenv("LOG_LEVEL", "INFO"),
        colorize=os.getenv("ENVIRONMENT") != "production"
    )
    
    # File handlers
    if os.getenv("ENVIRONMENT") != "test":
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        
        # Application logs
        loguru_logger.add(
            log_dir / "application.log",
            format=json.dumps({
                "@timestamp": "{time:YYYY-MM-DD HH:mm:ss.SSSZ}",
                "level": "{level}",
                "logger": "{name}",
                "function": "{function}",
                "line": "{line}",
                "message": "{message}",
                **SERVICE_INFO
            }),
            level="INFO",
            rotation="1 day",
            retention="30 days",
            compression="gz"
        )
        
        # Error logs
        loguru_logger.add(
            log_dir / "error.log",
            format=json.dumps({
                "@timestamp": "{time:YYYY-MM-DD HH:mm:ss.SSSZ}",
                "level": "{level}",
                "logger": "{name}",
                "function": "{function}",
                "line": "{line}",
                "message": "{message}",
                "stack": "{exception}",
                **SERVICE_INFO
            }),
            level="ERROR",
            rotation="1 day",
            retention="90 days",
            compression="gz"
        )


# Logging utility functions
def get_logger(name: str) -> logging.Logger:
    """Get a configured logger instance."""
    return logging.getLogger(name)


def log_with_context(
    logger_instance: logging.Logger,
    level: str,
    message: str,
    **context: Any
) -> None:
    """Log message with additional context."""
    
    # Create a log record with context
    record = logging.LogRecord(
        name=logger_instance.name,
        level=LOG_LEVELS.get(level.upper(), logging.INFO),
        pathname="",
        lineno=0,
        msg=message,
        args=(),
        exc_info=None
    )
    
    # Add context attributes
    for key, value in context.items():
        setattr(record, key, value)
    
    logger_instance.handle(record)


def log_security_event(event: str, **details: Any) -> None:
    """Log security-related events."""
    security_logger = get_logger("security")
    log_with_context(
        security_logger,
        "WARNING",
        f"Security Event: {event}",
        event_type="security",
        event=event,
        severity="high",
        timestamp=datetime.utcnow().isoformat(),
        **details
    )


def log_audit_event(action: str, user_id: str, resource: str, **details: Any) -> None:
    """Log audit trail events."""
    audit_logger = get_logger("audit")
    log_with_context(
        audit_logger,
        "INFO",
        f"Audit: {action}",
        event_type="audit",
        action=action,
        user_id=user_id,
        resource=resource,
        timestamp=datetime.utcnow().isoformat(),
        **details
    )


def log_performance_metric(metric: str, value: float, **context: Any) -> None:
    """Log performance metrics."""
    perf_logger = get_logger("performance")
    log_with_context(
        perf_logger,
        "INFO",
        f"Performance: {metric}",
        event_type="performance",
        metric=metric,
        value=value,
        unit=context.get("unit", "ms"),
        timestamp=datetime.utcnow().isoformat(),
        **context
    )


def log_business_event(event: str, **data: Any) -> None:
    """Log business-related events."""
    business_logger = get_logger("business")
    log_with_context(
        business_logger,
        "INFO",
        f"Business: {event}",
        event_type="business",
        event=event,
        timestamp=datetime.utcnow().isoformat(),
        **data
    )


def generate_trace_id() -> str:
    """Generate a unique trace ID."""
    return str(uuid.uuid4())


def generate_request_id() -> str:
    """Generate a unique request ID."""
    return str(uuid.uuid4())


class LogContext:
    """Context manager for adding logging context."""
    
    def __init__(self, **context: Any):
        self.context = context
        self.original_record_factory = logging.getLogRecordFactory()
    
    def __enter__(self):
        def record_factory(*args, **kwargs):
            record = self.original_record_factory(*args, **kwargs)
            for key, value in self.context.items():
                setattr(record, key, value)
            return record
        
        logging.setLogRecordFactory(record_factory)
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        logging.setLogRecordFactory(self.original_record_factory)


# Performance monitoring decorator
def log_performance(func_name: Optional[str] = None):
    """Decorator to log function performance."""
    def decorator(func):
        def wrapper(*args, **kwargs):
            start_time = time.time()
            func_name_actual = func_name or func.__name__
            
            try:
                result = func(*args, **kwargs)
                duration = (time.time() - start_time) * 1000  # Convert to milliseconds
                
                log_performance_metric(
                    f"function_execution_{func_name_actual}",
                    duration,
                    function=func_name_actual,
                    success=True
                )
                
                return result
            except Exception as e:
                duration = (time.time() - start_time) * 1000
                
                log_performance_metric(
                    f"function_execution_{func_name_actual}",
                    duration,
                    function=func_name_actual,
                    success=False,
                    error=str(e)
                )
                
                raise
        
        return wrapper
    return decorator


# Initialize logging configuration
def initialize_logging() -> None:
    """Initialize comprehensive logging configuration."""
    
    # Setup file logging
    setup_file_logging()
    
    # Setup Elasticsearch logging for production
    setup_elasticsearch_logging()
    
    # Configure Loguru
    configure_loguru()
    
    # Log initialization
    logger = get_logger(__name__)
    logger.info("Logging configuration initialized", extra={
        "environment": SERVICE_INFO["environment"],
        "service": SERVICE_INFO["service"],
        "version": SERVICE_INFO["version"]
    })


# Auto-initialize when module is imported
if __name__ != "__main__":
    initialize_logging()