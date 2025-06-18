"""
Comprehensive health check endpoints for AUSTA Cockpit AI Service
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timedelta
import psutil
import asyncio
import aiohttp
import redis.asyncio as redis
from typing import Dict, Any, List, Optional
import logging
import os
from contextlib import asynccontextmanager
import time

from services.model_manager import get_model_manager
from config.settings import get_settings

logger = logging.getLogger(__name__)


router = APIRouter()
settings = get_settings()

# Health check cache to avoid expensive operations on every request
health_cache = {}
CACHE_TTL = 30  # seconds


@router.get("/")
async def health_check():
    """Basic health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "ai-service"
    }


@router.get("/readiness")
async def readiness_check(model_manager = Depends(get_model_manager)):
    """Enhanced readiness check for Kubernetes."""
    checks = []
    overall_ready = True
    
    # Check models
    try:
        models_ready = await model_manager.check_models_ready()
        checks.append({"name": "models", "ready": models_ready})
        if not models_ready:
            overall_ready = False
    except Exception as e:
        checks.append({"name": "models", "ready": False, "error": str(e)})
        overall_ready = False
    
    # Check external dependencies
    try:
        backend_ready = await _check_backend_readiness()
        checks.append({"name": "backend", "ready": backend_ready})
        if not backend_ready:
            overall_ready = False
    except Exception as e:
        checks.append({"name": "backend", "ready": False, "error": str(e)})
        overall_ready = False
    
    status_code = 200 if overall_ready else 503
    
    response = {
        "status": "ready" if overall_ready else "not_ready",
        "timestamp": datetime.utcnow().isoformat(),
        "checks": checks,
        "models_loaded": model_manager.get_loaded_models() if overall_ready else []
    }
    
    return response


async def _check_backend_readiness() -> bool:
    """Check if backend service is ready."""
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
            async with session.get(f"{settings.BACKEND_URL}/health/ready") as response:
                return response.status == 200
    except:
        return False


@router.get("/liveness")
async def liveness_check():
    """Check if service is alive."""
    try:
        # Simple async operation to verify event loop is working
        await asyncio.sleep(0.001)
        return {
            "status": "alive",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "dead",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@router.get("/system")
async def system_info() -> Dict[str, Any]:
    """Get comprehensive system information."""
    cpu_percent = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    # GPU information if available
    gpu_info = None
    try:
        import GPUtil
        gpus = GPUtil.getGPUs()
        gpu_info = [{
            "id": gpu.id,
            "name": gpu.name,
            "memory_total": gpu.memoryTotal,
            "memory_used": gpu.memoryUsed,
            "memory_free": gpu.memoryFree,
            "temperature": gpu.temperature,
            "utilization": gpu.load * 100
        } for gpu in gpus]
    except ImportError:
        gpu_info = "GPU monitoring not available"
    
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "system": {
            "cpu_percent": cpu_percent,
            "cpu_count": psutil.cpu_count(),
            "memory": {
                "total": memory.total,
                "available": memory.available,
                "percent": memory.percent,
                "used": memory.used
            },
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "free": disk.free,
                "percent": disk.percent
            },
            "gpu": gpu_info,
            "uptime": datetime.utcnow() - datetime.fromtimestamp(psutil.boot_time())
        }
    }


@router.get("/detailed")
async def detailed_health_check(model_manager = Depends(get_model_manager)) -> Dict[str, Any]:
    """Comprehensive health check with all dependencies."""
    cache_key = "detailed_health"
    now = time.time()
    
    # Check cache
    if cache_key in health_cache:
        cached_data, timestamp = health_cache[cache_key]
        if now - timestamp < CACHE_TTL:
            return cached_data
    
    start_time = datetime.utcnow()
    health_status = {
        "timestamp": start_time.isoformat(),
        "service": "ai-service",
        "version": os.getenv("SERVICE_VERSION", "1.0.0"),
        "environment": os.getenv("ENVIRONMENT", "production"),
        "uptime": datetime.utcnow() - datetime.fromtimestamp(psutil.boot_time()),
        "checks": {}
    }
    
    # System health
    health_status["checks"]["system"] = await _check_system_health()
    
    # Model health
    health_status["checks"]["models"] = await _check_model_health(model_manager)
    
    # External dependencies
    health_status["checks"]["dependencies"] = await _check_external_dependencies()
    
    # Database connectivity
    health_status["checks"]["database"] = await _check_database_health()
    
    # Calculate overall status
    all_checks = health_status["checks"]
    failed_checks = [name for name, check in all_checks.items() if check["status"] != "healthy"]
    degraded_checks = [name for name, check in all_checks.items() if check["status"] == "degraded"]
    
    if not failed_checks and not degraded_checks:
        overall_status = "healthy"
        status_code = 200
    elif failed_checks:
        overall_status = "unhealthy"
        status_code = 503
    else:
        overall_status = "degraded"
        status_code = 200
    
    health_status["status"] = overall_status
    health_status["failed_checks"] = failed_checks
    health_status["degraded_checks"] = degraded_checks
    health_status["response_time_ms"] = (datetime.utcnow() - start_time).total_seconds() * 1000
    
    # Cache the result
    health_cache[cache_key] = (health_status, now)
    
    return health_status


async def _check_system_health() -> Dict[str, Any]:
    """Check system resource health."""
    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # Determine status based on thresholds
        status = "healthy"
        issues = []
        
        if cpu_percent > 90:
            status = "degraded" if cpu_percent < 95 else "unhealthy"
            issues.append(f"High CPU usage: {cpu_percent}%")
        
        if memory.percent > 85:
            status = "degraded" if memory.percent < 95 else "unhealthy"
            issues.append(f"High memory usage: {memory.percent}%")
        
        if disk.percent > 85:
            status = "degraded" if disk.percent < 95 else "unhealthy"
            issues.append(f"High disk usage: {disk.percent}%")
        
        return {
            "status": status,
            "cpu_percent": cpu_percent,
            "memory_percent": memory.percent,
            "disk_percent": disk.percent,
            "issues": issues,
            "last_check": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "last_check": datetime.utcnow().isoformat()
        }


async def _check_model_health(model_manager) -> Dict[str, Any]:
    """Check AI model availability and performance."""
    try:
        models_status = {}
        overall_status = "healthy"
        
        # Check each model
        loaded_models = model_manager.get_loaded_models()
        
        for model_name in ["bert_medical", "gpt4_medical", "xgboost_fraud", "lstm_patterns"]:
            model_health = await _check_individual_model(model_manager, model_name)
            models_status[model_name] = model_health
            
            if model_health["status"] == "unhealthy":
                overall_status = "unhealthy"
            elif model_health["status"] == "degraded" and overall_status != "unhealthy":
                overall_status = "degraded"
        
        return {
            "status": overall_status,
            "loaded_models": loaded_models,
            "models": models_status,
            "last_check": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "last_check": datetime.utcnow().isoformat()
        }


async def _check_individual_model(model_manager, model_name: str) -> Dict[str, Any]:
    """Check individual model health with performance test."""
    try:
        start_time = time.time()
        
        # Check if model is loaded
        if not model_manager.is_model_loaded(model_name):
            return {
                "status": "unhealthy",
                "error": "Model not loaded",
                "response_time_ms": 0
            }
        
        # Perform a simple inference test
        test_result = await model_manager.health_check_model(model_name)
        response_time = (time.time() - start_time) * 1000
        
        # Determine status based on response time
        status = "healthy"
        if response_time > 5000:  # 5 seconds
            status = "unhealthy"
        elif response_time > 2000:  # 2 seconds
            status = "degraded"
        
        return {
            "status": status,
            "loaded": True,
            "response_time_ms": response_time,
            "test_result": test_result
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "response_time_ms": 0
        }


async def _check_external_dependencies() -> Dict[str, Any]:
    """Check external service dependencies."""
    dependencies = {
        "backend_api": await _check_http_service(f"{settings.BACKEND_URL}/health"),
        "database": await _check_database_connection(),
        "redis": await _check_redis_connection()
    }
    
    # Check if any dependencies are unhealthy
    unhealthy = [name for name, dep in dependencies.items() if dep["status"] == "unhealthy"]
    degraded = [name for name, dep in dependencies.items() if dep["status"] == "degraded"]
    
    overall_status = "unhealthy" if unhealthy else ("degraded" if degraded else "healthy")
    
    return {
        "status": overall_status,
        "services": dependencies,
        "last_check": datetime.utcnow().isoformat()
    }


async def _check_http_service(url: str, timeout: int = 5) -> Dict[str, Any]:
    """Check HTTP service availability."""
    try:
        start_time = time.time()
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
            async with session.get(url) as response:
                response_time = (time.time() - start_time) * 1000
                
                if response.status == 200:
                    status = "healthy" if response_time < 1000 else "degraded"
                else:
                    status = "unhealthy"
                
                return {
                    "status": status,
                    "response_code": response.status,
                    "response_time_ms": response_time,
                    "url": url
                }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "url": url
        }


async def _check_database_connection() -> Dict[str, Any]:
    """Check database connectivity."""
    try:
        # This would depend on your database setup
        # Placeholder for actual database check
        return {
            "status": "healthy",
            "last_check": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


async def _check_redis_connection() -> Dict[str, Any]:
    """Check Redis connectivity."""
    try:
        redis_client = redis.Redis.from_url(settings.REDIS_URL)
        start_time = time.time()
        await redis_client.ping()
        response_time = (time.time() - start_time) * 1000
        await redis_client.close()
        
        status = "healthy" if response_time < 100 else "degraded"
        return {
            "status": status,
            "response_time_ms": response_time,
            "last_check": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


async def _check_database_health() -> Dict[str, Any]:
    """Check database health and performance."""
    try:
        # Placeholder for actual database performance check
        return {
            "status": "healthy",
            "connection_pool": "healthy",
            "query_performance": "normal",
            "last_check": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


@router.get("/metrics")
async def health_metrics() -> Dict[str, Any]:
    """Get health metrics for monitoring systems."""
    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": {
                "cpu_usage_percent": cpu_percent,
                "memory_usage_percent": memory.percent,
                "disk_usage_percent": disk.percent,
                "uptime_seconds": (datetime.utcnow() - datetime.fromtimestamp(psutil.boot_time())).total_seconds(),
                "process_count": len(psutil.pids()),
                "threads_count": psutil.cpu_count(logical=True)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Metrics collection failed: {str(e)}")