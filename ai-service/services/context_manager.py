"""
Context Manager Service
Manages conversation context and case history
"""
import redis.asyncio as redis
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import asyncio
from loguru import logger

from config.settings import settings


class ContextManager:
    """Manages context for cases and conversations."""
    
    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.context_ttl = 3600 * 24  # 24 hours
        self.history_ttl = 3600 * 24 * 30  # 30 days
        self._lock = asyncio.Lock()
    
    async def initialize(self):
        """Initialize Redis connection."""
        try:
            self.redis_client = await redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            await self.redis_client.ping()
            logger.info("Context Manager initialized with Redis")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            # Fallback to in-memory storage
            self.redis_client = None
            self._memory_store = {}
            logger.warning("Using in-memory context storage")
    
    async def store_analysis_context(self, case_id: str, case_data: Dict[str, Any], 
                                   analysis_result: Dict[str, Any]):
        """Store analysis context for a case."""
        context = {
            "case_data": case_data,
            "analysis_result": analysis_result,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        key = f"context:case:{case_id}"
        
        if self.redis_client:
            await self.redis_client.setex(
                key,
                self.context_ttl,
                json.dumps(context)
            )
        else:
            self._memory_store[key] = context
    
    async def get_case_context(self, case_id: str) -> Optional[Dict[str, Any]]:
        """Get context for a specific case."""
        key = f"context:case:{case_id}"
        
        if self.redis_client:
            data = await self.redis_client.get(key)
            if data:
                return json.loads(data)
        else:
            return self._memory_store.get(key)
        
        return None
    
    async def store_chat_message(self, case_id: str, user_message: str, 
                               ai_response: str):
        """Store chat message in history."""
        message = {
            "user": user_message,
            "assistant": ai_response,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        key = f"chat:history:{case_id}"
        
        if self.redis_client:
            # Store in a list
            await self.redis_client.lpush(key, json.dumps(message))
            await self.redis_client.expire(key, self.history_ttl)
            # Keep only last 100 messages
            await self.redis_client.ltrim(key, 0, 99)
        else:
            if key not in self._memory_store:
                self._memory_store[key] = []
            self._memory_store[key].insert(0, message)
            # Keep only last 100 messages
            self._memory_store[key] = self._memory_store[key][:100]
    
    async def get_chat_history(self, case_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Get chat history for a case."""
        key = f"chat:history:{case_id}"
        
        if self.redis_client:
            messages = await self.redis_client.lrange(key, 0, limit - 1)
            return [json.loads(msg) for msg in messages]
        else:
            history = self._memory_store.get(key, [])
            return history[:limit]
    
    async def get_case_history(self, case_id: str) -> Optional[Dict[str, Any]]:
        """Get complete history for a case including analysis and chat."""
        context = await self.get_case_context(case_id)
        chat_history = await self.get_chat_history(case_id)
        
        if not context and not chat_history:
            return None
        
        return {
            "case_id": case_id,
            "context": context,
            "chat_history": chat_history,
            "retrieved_at": datetime.utcnow().isoformat()
        }
    
    async def clear_case_context(self, case_id: str):
        """Clear all context for a specific case."""
        keys = [
            f"context:case:{case_id}",
            f"chat:history:{case_id}"
        ]
        
        if self.redis_client:
            await self.redis_client.delete(*keys)
        else:
            for key in keys:
                self._memory_store.pop(key, None)
    
    async def search_cases_by_pattern(self, pattern: str) -> List[str]:
        """Search for cases matching a pattern."""
        if self.redis_client:
            keys = await self.redis_client.keys(f"context:case:*{pattern}*")
            return [key.replace("context:case:", "") for key in keys]
        else:
            matching = []
            for key in self._memory_store:
                if key.startswith("context:case:") and pattern in key:
                    matching.append(key.replace("context:case:", ""))
            return matching
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Get context manager statistics."""
        if self.redis_client:
            info = await self.redis_client.info()
            case_keys = await self.redis_client.keys("context:case:*")
            chat_keys = await self.redis_client.keys("chat:history:*")
            
            return {
                "total_cases": len(case_keys),
                "total_conversations": len(chat_keys),
                "redis_memory_used": info.get("used_memory_human", "N/A"),
                "redis_connected": True
            }
        else:
            case_count = sum(1 for k in self._memory_store if k.startswith("context:case:"))
            chat_count = sum(1 for k in self._memory_store if k.startswith("chat:history:"))
            
            return {
                "total_cases": case_count,
                "total_conversations": chat_count,
                "memory_storage": True,
                "redis_connected": False
            }
    
    async def cleanup_old_contexts(self, days: int = 30):
        """Clean up contexts older than specified days."""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        cleaned = 0
        
        if self.redis_client:
            # Would need to iterate through keys and check timestamps
            # This is a simplified version
            pass
        else:
            keys_to_remove = []
            for key, value in self._memory_store.items():
                if isinstance(value, dict) and "timestamp" in value:
                    timestamp = datetime.fromisoformat(value["timestamp"])
                    if timestamp < cutoff_date:
                        keys_to_remove.append(key)
            
            for key in keys_to_remove:
                del self._memory_store[key]
                cleaned += 1
        
        logger.info(f"Cleaned up {cleaned} old contexts")
        return cleaned
    
    async def shutdown(self):
        """Shutdown context manager."""
        if self.redis_client:
            await self.redis_client.close()


# Singleton instance
_context_manager: Optional[ContextManager] = None


async def get_context_manager() -> ContextManager:
    """Get context manager instance."""
    global _context_manager
    
    if _context_manager is None:
        _context_manager = ContextManager()
        await _context_manager.initialize()
    
    return _context_manager