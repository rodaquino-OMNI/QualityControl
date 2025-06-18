"""
Custom Middleware for FastAPI
"""
from fastapi import Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import time
import jwt
from typing import Optional
from loguru import logger

from config.settings import settings


class TimingMiddleware(BaseHTTPMiddleware):
    """Add request timing headers."""
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        response = await call_next(request)
        
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        
        # Log slow requests
        if process_time > 5.0:
            logger.warning(
                f"Slow request: {request.method} {request.url.path} "
                f"took {process_time:.2f}s"
            )
        
        return response


class AuthMiddleware(BaseHTTPMiddleware):
    """Handle authentication."""
    
    def __init__(self, app, exclude_paths: Optional[list] = None):
        super().__init__(app)
        self.exclude_paths = exclude_paths or ["/", "/health", "/docs", "/openapi.json"]
    
    async def dispatch(self, request: Request, call_next):
        # Skip auth for excluded paths
        if any(request.url.path.startswith(path) for path in self.exclude_paths):
            return await call_next(request)
        
        # Check for API key or JWT token
        auth_header = request.headers.get("Authorization")
        api_key = request.headers.get("X-API-Key")
        
        if api_key:
            # Validate API key
            if not self._validate_api_key(api_key):
                return Response(
                    content="Invalid API key",
                    status_code=401
                )
        elif auth_header:
            # Validate JWT token
            try:
                scheme, token = auth_header.split()
                if scheme.lower() != "bearer":
                    return Response(
                        content="Invalid authentication scheme",
                        status_code=401
                    )
                
                payload = jwt.decode(
                    token,
                    settings.jwt_secret_key,
                    algorithms=["HS256"]
                )
                request.state.user = payload
            except (ValueError, jwt.InvalidTokenError) as e:
                return Response(
                    content="Invalid token",
                    status_code=401
                )
        else:
            # No authentication provided
            return Response(
                content="Authentication required",
                status_code=401
            )
        
        response = await call_next(request)
        return response
    
    def _validate_api_key(self, api_key: str) -> bool:
        """Validate API key (simplified)."""
        # In production, check against database or secure storage
        return len(api_key) == 32  # Simple length check for demo


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware."""
    
    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.request_counts = {}
    
    async def dispatch(self, request: Request, call_next):
        # Get client identifier (IP or user ID)
        client_id = request.client.host if request.client else "unknown"
        
        # Check rate limit
        current_time = time.time()
        minute_window = int(current_time // 60)
        
        key = f"{client_id}:{minute_window}"
        
        if key not in self.request_counts:
            self.request_counts[key] = 0
        
        self.request_counts[key] += 1
        
        if self.request_counts[key] > self.requests_per_minute:
            return Response(
                content="Rate limit exceeded",
                status_code=429,
                headers={"Retry-After": "60"}
            )
        
        # Clean old entries
        self._cleanup_old_entries(minute_window)
        
        response = await call_next(request)
        return response
    
    def _cleanup_old_entries(self, current_window: int):
        """Remove entries older than 2 minutes."""
        keys_to_remove = []
        for key in self.request_counts:
            window = int(key.split(":")[1])
            if window < current_window - 2:
                keys_to_remove.append(key)
        
        for key in keys_to_remove:
            del self.request_counts[key]