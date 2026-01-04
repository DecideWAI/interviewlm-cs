"""
Redis caching service for LangGraph agents.

Provides fast in-memory caching for:
- Interview metrics (hot path - updated frequently)
- Session state
- Agent checkpoints
"""

import json
from typing import Any

import redis.asyncio as redis

from config import settings
from models.state import InterviewMetrics


class CacheService:
    """
    Async Redis caching service for LangGraph agents.

    Provides:
    - Interview metrics caching (TTL: 1 hour)
    - Session state caching (TTL: 24 hours)
    - Distributed locking for concurrent operations
    """

    # Cache key prefixes
    PREFIX_METRICS = "ilm:metrics:"
    PREFIX_SESSION = "ilm:session:"
    PREFIX_AGENT = "ilm:agent:"
    PREFIX_LOCK = "ilm:lock:"

    # Default TTLs (in seconds)
    TTL_METRICS = 3600  # 1 hour
    TTL_SESSION = 86400  # 24 hours
    TTL_AGENT = 7200  # 2 hours
    TTL_LOCK = 30  # 30 seconds

    def __init__(self, redis_url: str | None = None):
        """Initialize cache service."""
        self.redis_url = redis_url or settings.redis_url
        self._client: redis.Redis | None = None

    async def connect(self) -> None:
        """Create Redis connection."""
        if self._client is None:
            self._client = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            # Test connection
            await self._client.ping()
            print("[Cache] Connected to Redis")

    async def disconnect(self) -> None:
        """Close Redis connection."""
        if self._client:
            await self._client.close()
            self._client = None
            print("[Cache] Disconnected from Redis")

    async def _get_client(self) -> redis.Redis:
        """Get or create Redis client."""
        if self._client is None:
            await self.connect()
        return self._client  # type: ignore

    # =========================================================================
    # Interview Metrics Caching
    # =========================================================================

    async def get_metrics(self, session_id: str) -> InterviewMetrics | None:
        """Get cached interview metrics."""
        client = await self._get_client()
        key = f"{self.PREFIX_METRICS}{session_id}"

        data = await client.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_metrics(
        self,
        session_id: str,
        metrics: InterviewMetrics,
        ttl: int | None = None,
    ) -> None:
        """Cache interview metrics."""
        client = await self._get_client()
        key = f"{self.PREFIX_METRICS}{session_id}"

        await client.set(
            key,
            json.dumps(dict(metrics)),
            ex=ttl or self.TTL_METRICS,
        )

    async def update_metrics(
        self,
        session_id: str,
        updates: dict[str, Any],
    ) -> InterviewMetrics | None:
        """Update specific fields in cached metrics."""
        client = await self._get_client()
        key = f"{self.PREFIX_METRICS}{session_id}"

        # Get existing
        data = await client.get(key)
        if not data:
            return None

        metrics = json.loads(data)
        metrics.update(updates)

        # Save back
        await client.set(key, json.dumps(metrics), ex=self.TTL_METRICS)
        return metrics

    async def delete_metrics(self, session_id: str) -> bool:
        """Delete cached metrics."""
        client = await self._get_client()
        key = f"{self.PREFIX_METRICS}{session_id}"
        result = await client.delete(key)
        return result > 0

    # =========================================================================
    # Session State Caching
    # =========================================================================

    async def get_session_state(self, session_id: str) -> dict | None:
        """Get cached session state."""
        client = await self._get_client()
        key = f"{self.PREFIX_SESSION}{session_id}"

        data = await client.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_session_state(
        self,
        session_id: str,
        state: dict,
        ttl: int | None = None,
    ) -> None:
        """Cache session state."""
        client = await self._get_client()
        key = f"{self.PREFIX_SESSION}{session_id}"

        await client.set(
            key,
            json.dumps(state),
            ex=ttl or self.TTL_SESSION,
        )

    async def delete_session_state(self, session_id: str) -> bool:
        """Delete cached session state."""
        client = await self._get_client()
        key = f"{self.PREFIX_SESSION}{session_id}"
        result = await client.delete(key)
        return result > 0

    # =========================================================================
    # Agent State Caching (for checkpoints)
    # =========================================================================

    async def get_agent_state(self, agent_type: str, session_id: str) -> dict | None:
        """Get cached agent state/checkpoint."""
        client = await self._get_client()
        key = f"{self.PREFIX_AGENT}{agent_type}:{session_id}"

        data = await client.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_agent_state(
        self,
        agent_type: str,
        session_id: str,
        state: dict,
        ttl: int | None = None,
    ) -> None:
        """Cache agent state/checkpoint."""
        client = await self._get_client()
        key = f"{self.PREFIX_AGENT}{agent_type}:{session_id}"

        await client.set(
            key,
            json.dumps(state),
            ex=ttl or self.TTL_AGENT,
        )

    async def delete_agent_state(self, agent_type: str, session_id: str) -> bool:
        """Delete cached agent state."""
        client = await self._get_client()
        key = f"{self.PREFIX_AGENT}{agent_type}:{session_id}"
        result = await client.delete(key)
        return result > 0

    # =========================================================================
    # Distributed Locking
    # =========================================================================

    async def acquire_lock(
        self,
        resource: str,
        ttl: int | None = None,
    ) -> bool:
        """
        Acquire a distributed lock.

        Args:
            resource: Resource identifier to lock
            ttl: Lock TTL in seconds (default: 30)

        Returns:
            True if lock acquired, False otherwise
        """
        client = await self._get_client()
        key = f"{self.PREFIX_LOCK}{resource}"

        # SET NX (only set if not exists) with TTL
        result = await client.set(
            key,
            "1",
            nx=True,
            ex=ttl or self.TTL_LOCK,
        )
        return result is not None

    async def release_lock(self, resource: str) -> bool:
        """Release a distributed lock."""
        client = await self._get_client()
        key = f"{self.PREFIX_LOCK}{resource}"
        result = await client.delete(key)
        return result > 0

    async def extend_lock(self, resource: str, ttl: int | None = None) -> bool:
        """Extend lock TTL."""
        client = await self._get_client()
        key = f"{self.PREFIX_LOCK}{resource}"

        # Only extend if lock exists
        if await client.exists(key):
            await client.expire(key, ttl or self.TTL_LOCK)
            return True
        return False

    # =========================================================================
    # Batch Operations
    # =========================================================================

    async def clear_session(self, session_id: str) -> int:
        """Clear all cached data for a session."""
        client = await self._get_client()

        keys_to_delete = [
            f"{self.PREFIX_METRICS}{session_id}",
            f"{self.PREFIX_SESSION}{session_id}",
            f"{self.PREFIX_AGENT}coding:{session_id}",
            f"{self.PREFIX_AGENT}interview:{session_id}",
            f"{self.PREFIX_AGENT}evaluation:{session_id}",
            f"{self.PREFIX_AGENT}supervisor:{session_id}",
        ]

        deleted = 0
        for key in keys_to_delete:
            deleted += await client.delete(key)

        return deleted

    async def get_session_keys(self, session_id: str) -> list[str]:
        """Get all cache keys for a session."""
        client = await self._get_client()

        # Use SCAN to find matching keys
        keys = []
        async for key in client.scan_iter(f"ilm:*{session_id}*"):
            keys.append(key)

        return keys

    # =========================================================================
    # Health Check
    # =========================================================================

    async def health_check(self) -> dict:
        """Check Redis connection health."""
        try:
            client = await self._get_client()
            info = await client.info("server")
            return {
                "healthy": True,
                "redis_version": info.get("redis_version"),
                "connected_clients": info.get("connected_clients"),
            }
        except Exception as e:
            return {
                "healthy": False,
                "error": str(e),
            }


# Global cache instance
_cache: CacheService | None = None


async def get_cache() -> CacheService:
    """Get or create the global cache service."""
    global _cache
    if _cache is None:
        _cache = CacheService()
        await _cache.connect()
    return _cache


async def close_cache() -> None:
    """Close the global cache connection."""
    global _cache
    if _cache:
        await _cache.disconnect()
        _cache = None
