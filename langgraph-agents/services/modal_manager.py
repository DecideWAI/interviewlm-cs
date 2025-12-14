"""
Modal Sandbox Manager Service.

Manages Modal Sandbox sessions per candidate with features matching
the TypeScript implementation in lib/services/modal.ts:
- Reconnection retry with exponential backoff
- Universal image selection with language-specific fallbacks
- File system tree traversal
- Health checks
- Write queue for serialized operations

Each session gets an isolated container with:
- 2 CPU cores, 2GB RAM
- 1 hour timeout
- Persistent filesystem within session
- Pre-installed: Python 3.11, Node 20, Go 1.21, Rust
"""

import os
import re
import asyncio
import time
import logging
from datetime import datetime
from typing import Any, Optional, Dict
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

from config import settings

logger = logging.getLogger(__name__)

# =============================================================================
# Configuration Constants
# Primary configs come from database, with fallback defaults for robustness
# =============================================================================

# Default sandbox configuration (fallback when DB unavailable)
DEFAULT_SANDBOX_CPU = 2
DEFAULT_SANDBOX_MEMORY_MB = 2048
DEFAULT_SANDBOX_TIMEOUT_S = 3600  # 1 hour

# Reconnection configuration (matching TypeScript)
RECONNECT_TIMEOUT_S = 5  # 5 seconds per attempt
RECONNECT_MAX_RETRIES = 2  # Total 3 attempts (1 initial + 2 retries)
RECONNECT_RETRY_DELAY_S = 1  # Base delay, doubles each retry

# File system limits (matching TypeScript)
MAX_DEPTH = 10
MAX_FILES = 500
WORKSPACE_ROOT = "/workspace"

# Keep-alive configuration (matching TypeScript)
# Reduced from 30s to 10s - Modal suspends sandboxes after ~10-15s inactivity
KEEPALIVE_INTERVAL_S = 10  # Send heartbeat every 10 seconds
KEEPALIVE_TIMEOUT_S = 5    # Timeout for heartbeat command
KEEPALIVE_MAX_RETRIES = 2  # Retry 2 times before marking sandbox as dead

# Output limits
MAX_OUTPUT_SIZE = 50000  # 50KB

# Tool timeout
TOOL_TIMEOUT_SECONDS = 30

# Universal image ID (set via environment)
UNIVERSAL_IMAGE_ID = os.environ.get("MODAL_UNIVERSAL_IMAGE_ID")


# =============================================================================
# Volume Naming (must match TypeScript lib/services/modal.ts)
# =============================================================================

def get_volume_name(session_id: str) -> str:
    """
    Get deterministic volume name for a session.
    MUST match TypeScript: getVolumeName() in lib/services/modal.ts
    """
    return f"interview-volume-{session_id}"

# =============================================================================
# Config Service Integration (DB-backed configs - NO FALLBACKS)
# =============================================================================

# Config service import (lazy to avoid circular imports)
_config_service = None

def _get_config_service():
    """Get config service instance (lazy initialization)."""
    global _config_service
    if _config_service is None:
        try:
            from services.config_service import get_config_service
            _config_service = get_config_service()
        except ImportError as e:
            logger.error(f"Config service not available: {e}")
            raise RuntimeError("Config service is required but not available") from e
    return _config_service


def _run_async(coro):
    """Run async coroutine in sync context."""
    try:
        # Check if there's a running event loop
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # No running loop, we can use asyncio.run directly
            return asyncio.run(coro)

        # Loop is running, need to run in a separate thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, coro)
            return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Failed to run async config call: {e}")
        raise


def get_sandbox_config_sync(language: str) -> Dict[str, Any]:
    """
    Get sandbox config from DB with fallback defaults.

    Returns dict with: cpu, memoryMb, timeoutSeconds, dockerImage
    """
    # Fallback config when DB is unavailable
    FALLBACK_CONFIG = {
        'cpu': DEFAULT_SANDBOX_CPU,
        'memoryMb': DEFAULT_SANDBOX_MEMORY_MB,
        'timeoutSeconds': DEFAULT_SANDBOX_TIMEOUT_S,
    }

    try:
        config_service = _get_config_service()
        config = _run_async(config_service.get_sandbox_config(language))
        if config:
            logger.debug(f"Using DB sandbox config for {language}: {config}")
            return config
    except Exception as e:
        logger.warning(f"Failed to get sandbox config from DB: {e}")

    # Use fallback config
    logger.info(f"Using fallback sandbox config for {language}")
    return FALLBACK_CONFIG


def get_image_map_sync() -> Dict[str, str]:
    """Get image map from DB with fallback defaults."""
    # Fallback image map when DB is unavailable
    FALLBACK_IMAGE_MAP = {
        'python': 'python:3.11-bookworm-slim',
        'py': 'python:3.11-bookworm-slim',
        'javascript': 'node:20-bookworm-slim',
        'js': 'node:20-bookworm-slim',
        'typescript': 'node:20-bookworm-slim',
        'ts': 'node:20-bookworm-slim',
        'go': 'golang:1.21-bookworm',
        'golang': 'golang:1.21-bookworm',
        'rust': 'rust:1.75-bookworm',
    }

    try:
        config_service = _get_config_service()
        image_map = _run_async(config_service.get_image_map())

        if image_map:
            # Add aliases pointing to same images
            if 'python' in image_map:
                image_map['py'] = image_map['python']
            if 'javascript' in image_map:
                image_map['js'] = image_map['javascript']
            if 'typescript' in image_map:
                image_map['ts'] = image_map['typescript']
            if 'go' in image_map:
                image_map['golang'] = image_map['go']

            logger.debug(f"Using DB image map: {image_map}")
            return image_map
    except Exception as e:
        logger.warning(f"Failed to get image map from DB: {e}")

    # Use fallback image map
    logger.info("Using fallback image map (DB unavailable)")
    return FALLBACK_IMAGE_MAP

# =============================================================================
# Optional Dependencies
# =============================================================================

# Modal SDK
try:
    import modal
    MODAL_AVAILABLE = True
except ImportError:
    MODAL_AVAILABLE = False
    modal = None

# Database for sandbox persistence
try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    ASYNCPG_AVAILABLE = False
    asyncpg = None

# Redis for distributed locking
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None

# =============================================================================
# Thread Pool for Timeouts
# =============================================================================

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="modal_timeout")


def run_with_timeout(func, *args, timeout: float = TOOL_TIMEOUT_SECONDS, **kwargs):
    """
    Run a synchronous function with a timeout.

    Prevents tools from hanging indefinitely when:
    - Sandbox creation takes too long
    - Redis lock acquisition hangs
    - Modal API is slow or unresponsive
    """
    future = _executor.submit(func, *args, **kwargs)
    try:
        return future.result(timeout=timeout)
    except FuturesTimeoutError:
        raise TimeoutError(f"Operation timed out after {timeout}s")


def run_with_retry(func, *args, max_retries: int = 2, timeout: float = TOOL_TIMEOUT_SECONDS, **kwargs):
    """
    Run a function with timeout and retry logic.

    Retries on TimeoutError or sandbox connection errors.

    Args:
        func: Function to run
        *args: Arguments to pass to the function
        max_retries: Maximum number of retries (default: 2)
        timeout: Timeout per attempt in seconds
        **kwargs: Keyword arguments to pass to the function

    Returns:
        Function result

    Raises:
        Last exception if all retries fail
    """
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return run_with_timeout(func, *args, timeout=timeout, **kwargs)
        except (TimeoutError, Exception) as e:
            last_error = e
            error_msg = str(e).lower()
            # Retry on timeout or connection errors
            if attempt < max_retries and (
                "timeout" in error_msg or
                "connection" in error_msg or
                "sandbox" in error_msg
            ):
                logger.warning(f"Retry {attempt + 1}/{max_retries} after error: {e}")
                time.sleep(1 * (attempt + 1))  # Exponential backoff
                continue
            raise
    raise last_error


# =============================================================================
# Sandbox Helper Function
# =============================================================================

import threading

# Per-sandbox locks to serialize operations (Modal sandboxes may not handle concurrent calls well)
_sandbox_locks: Dict[str, threading.Lock] = {}
_sandbox_locks_lock = threading.Lock()


def _get_sandbox_lock(sandbox_id: str) -> threading.Lock:
    """Get or create a lock for a specific sandbox."""
    with _sandbox_locks_lock:
        if sandbox_id not in _sandbox_locks:
            _sandbox_locks[sandbox_id] = threading.Lock()
            logger.debug(f"[SandboxLock] Created new lock for sandbox: {sandbox_id}")
        return _sandbox_locks[sandbox_id]


def run_in_sandbox(sandbox, *args, sandbox_id: str = None, timeout: int = 60, **kwargs):
    """
    Run a command in a Modal Sandbox with serialized access.

    Modal sandboxes may not handle concurrent operations well.
    This function serializes operations per sandbox to prevent hangs.

    Args:
        sandbox: Modal Sandbox instance
        *args: Command arguments (e.g., "bash", "-c", "ls")
        sandbox_id: Optional sandbox ID for lock selection
        timeout: Maximum time to wait for command (default: 60 seconds)
        **kwargs: Additional options passed to sandbox.exec

    Returns:
        Process result with stdout, stderr, returncode

    Raises:
        TimeoutError: If command exceeds timeout
    """
    # Get lock for this sandbox (use object id if no sandbox_id provided)
    lock_key = sandbox_id or str(id(sandbox))
    lock = _get_sandbox_lock(lock_key)

    # Extract command for logging
    cmd_preview = " ".join(str(a)[:50] for a in args[:3]) if args else "unknown"
    thread_id = threading.current_thread().name

    logger.debug(f"[SandboxLock] Thread {thread_id} waiting for lock {lock_key[:20]}... (cmd: {cmd_preview})")

    # Use a reasonable max timeout to prevent infinite hangs
    effective_timeout = min(timeout, 600)  # Cap at 10 minutes

    with lock:
        logger.debug(f"[SandboxLock] Thread {thread_id} acquired lock {lock_key[:20]}, executing (timeout={effective_timeout}s)...")
        try:
            # Get the execute method from sandbox
            run_method = getattr(sandbox, "exec")
            # Pass timeout to Modal's exec if supported
            proc = run_method(*args, timeout=effective_timeout, **kwargs)
            # wait() with timeout - Modal may not support this, but we try
            try:
                proc.wait(timeout=effective_timeout)
            except TypeError:
                # If wait() doesn't support timeout, just call it
                proc.wait()
            logger.debug(f"[SandboxLock] Thread {thread_id} completed, releasing lock {lock_key[:20]}")
            return proc
        except TimeoutError as e:
            logger.error(f"[SandboxLock] Thread {thread_id} TIMEOUT after {effective_timeout}s: {cmd_preview}")
            raise TimeoutError(f"Command timed out after {effective_timeout}s: {cmd_preview}") from e
        except Exception as e:
            logger.error(f"[SandboxLock] Thread {thread_id} error in sandbox exec: {e}")
            raise


# =============================================================================
# File Node Type (matching TypeScript)
# =============================================================================

class FileNode:
    """Represents a file or directory in the workspace."""

    def __init__(
        self,
        name: str,
        path: str,
        type: str,  # "file" or "directory"
        size: int = 0,
        children: Optional[list["FileNode"]] = None
    ):
        self.name = name
        self.path = path
        self.type = type
        self.size = size
        self.children = children or []

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        result = {
            "name": self.name,
            "path": self.path,
            "type": self.type,
            "size": self.size,
        }
        if self.type == "directory":
            result["children"] = [c.to_dict() for c in self.children]
        return result


# =============================================================================
# Sandbox Manager Class
# =============================================================================

class SandboxManager:
    """
    Manages Modal Sandbox sessions per candidate.

    Features:
    - In-memory caching for fast access
    - Database persistence for restart recovery
    - Redis distributed locking for multi-instance safety
    - Reconnection with retry and exponential backoff
    - Universal/language-specific image selection
    - Keep-alive pings to prevent sandbox suspension
    - Write queue for serialized file operations
    - Health checks and status monitoring
    """

    # Class-level state
    _sandboxes: dict[str, Any] = {}  # session_id -> sandbox
    _sandbox_ids: dict[str, str] = {}  # session_id -> sandbox_id
    _sandbox_created_at: dict[str, datetime] = {}  # session_id -> created_at
    _sandbox_language: dict[str, str] = {}  # session_id -> language
    _pending: dict[str, bool] = {}  # session_id -> is_pending
    _keepalive_tasks: dict[str, asyncio.Task] = {}  # session_id -> task
    _write_queues: dict[str, asyncio.Queue] = {}  # session_id -> queue
    _app: Optional[Any] = None
    _image_cache: dict[str, Any] = {}  # language -> image
    _redis_client: Optional[Any] = None

    # =========================================================================
    # Redis Distributed Locking
    # =========================================================================

    @classmethod
    def _get_redis(cls) -> Optional[Any]:
        """Get Redis client for distributed locking."""
        if not REDIS_AVAILABLE:
            return None
        if cls._redis_client is None:
            redis_url = getattr(settings, 'redis_url', None) or os.environ.get('REDIS_URL')
            if redis_url:
                try:
                    cls._redis_client = redis.from_url(redis_url)
                    cls._redis_client.ping()
                    print("[SandboxManager] Redis connected for distributed locking")
                except Exception as e:
                    print(f"[SandboxManager] Failed to connect to Redis: {e}")
                    cls._redis_client = None
        return cls._redis_client

    @classmethod
    async def _acquire_lock_or_wait_for_sandbox_async(
        cls,
        session_id: str,
        timeout: int = 120,
        wait_timeout: int = 120,
        retry_interval: float = 1.0,
    ) -> tuple[Optional[Any], bool, Optional[Any]]:
        """
        Acquire distributed lock OR wait for sandbox to be created by another process.

        This implements the wait-and-check pattern:
        1. Try to acquire lock
        2. If lock held by another process, check if sandbox exists in DB
        3. If sandbox exists and is alive, return it
        4. If not, wait and retry
        5. Continue until lock acquired OR sandbox appears OR timeout

        Returns:
            Tuple of (lock, acquired, existing_sandbox):
            - (lock, True, None): Lock acquired successfully, proceed to create
            - (None, True, None): No Redis available, proceed without lock (graceful degradation)
            - (None, False, sandbox): Found existing sandbox created by another process
            - (None, False, None): Timeout - no lock and no sandbox (should not happen in normal operation)
        """
        redis_client = cls._get_redis()
        if not redis_client:
            # No Redis = graceful degradation, proceed without lock
            logger.info(f"[SandboxManager] No Redis available, proceeding without lock for {session_id}")
            return (None, True, None)

        start_time = time.time()
        check_count = 0

        while (time.time() - start_time) < wait_timeout:
            check_count += 1
            try:
                # IMPORTANT: Key must match TypeScript redis-lock.ts which uses "lock:sandbox:{id}"
                lock = redis_client.lock(
                    f"lock:sandbox:{session_id}",
                    timeout=timeout,
                    blocking=False,  # Non-blocking so we can implement our own retry
                )
                if lock.acquire(blocking=False):
                    logger.info(f"[SandboxManager] Acquired lock for lock:sandbox:{session_id}")
                    return (lock, True, None)

                # Lock held by another process - check if sandbox was created
                logger.debug(f"[SandboxManager] Lock held by another process for {session_id}, checking for sandbox... (attempt {check_count})")

                # Check DB for sandbox created by the process holding the lock
                try:
                    sandbox_id = await cls._get_sandbox_id_from_db(session_id)

                    if sandbox_id:
                        logger.info(f"[SandboxManager] Found sandbox {sandbox_id} in DB while waiting for lock")
                        sandbox = cls._reconnect_to_sandbox(sandbox_id)
                        if sandbox and cls._is_sandbox_alive(sandbox, sandbox_id):
                            logger.info(f"[SandboxManager] Sandbox {sandbox_id} is alive, using it instead of waiting for lock")
                            # Cache the sandbox
                            cls._sandboxes[session_id] = sandbox
                            cls._sandbox_ids[session_id] = sandbox_id
                            cls._sandbox_created_at[session_id] = datetime.now()
                            return (None, False, sandbox)
                        else:
                            logger.debug(f"[SandboxManager] Sandbox {sandbox_id} exists but not alive yet, continuing to wait...")
                except Exception as e:
                    logger.debug(f"[SandboxManager] Error checking DB while waiting: {e}")

                # Wait before retry (async sleep)
                await asyncio.sleep(retry_interval)

            except Exception as e:
                # On Redis error, allow operation to proceed (graceful degradation)
                logger.warning(f"[SandboxManager] Redis error acquiring lock: {e}, proceeding without lock")
                return (None, True, None)

        # Timeout waiting for lock - final check for sandbox
        logger.warning(f"[SandboxManager] Lock acquisition timed out after {wait_timeout}s for {session_id}, final sandbox check...")
        try:
            sandbox_id = await cls._get_sandbox_id_from_db(session_id)

            if sandbox_id:
                sandbox = cls._reconnect_to_sandbox(sandbox_id)
                if sandbox and cls._is_sandbox_alive(sandbox, sandbox_id):
                    logger.info(f"[SandboxManager] Found live sandbox {sandbox_id} on final check")
                    cls._sandboxes[session_id] = sandbox
                    cls._sandbox_ids[session_id] = sandbox_id
                    cls._sandbox_created_at[session_id] = datetime.now()
                    return (None, False, sandbox)
        except Exception as e:
            logger.warning(f"[SandboxManager] Final sandbox check failed: {e}")

        return (None, False, None)

    @classmethod
    def _acquire_lock_or_wait_for_sandbox(
        cls,
        session_id: str,
        timeout: int = 120,
        wait_timeout: int = 120,
        retry_interval: float = 1.0,
    ) -> tuple[Optional[Any], bool, Optional[Any]]:
        """Sync wrapper for _acquire_lock_or_wait_for_sandbox_async."""
        try:
            loop = asyncio.get_running_loop()
            # Already in async context - run coroutine directly via task
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    cls._acquire_lock_or_wait_for_sandbox_async(session_id, timeout, wait_timeout, retry_interval)
                )
                return future.result(timeout=wait_timeout + 10)
        except RuntimeError:
            # No running loop - safe to use asyncio.run
            return asyncio.run(
                cls._acquire_lock_or_wait_for_sandbox_async(session_id, timeout, wait_timeout, retry_interval)
            )

    @classmethod
    async def _acquire_lock_async(
        cls,
        session_id: str,
        timeout: int = 120,
        wait_timeout: int = 60,
        retry_interval: float = 0.5,
    ) -> tuple[Optional[Any], bool]:
        """
        Acquire distributed lock for sandbox creation with retry (async version).

        Returns:
            Tuple of (lock, acquired):
            - (lock, True): Lock acquired successfully
            - (None, True): No Redis available, proceed without lock (graceful degradation)
            - (None, False): Lock acquisition failed after retries
        """
        redis_client = cls._get_redis()
        if not redis_client:
            # No Redis = graceful degradation, proceed without lock
            logger.info(f"[SandboxManager] No Redis available, proceeding without lock for {session_id}")
            return (None, True)

        start_time = time.time()

        while (time.time() - start_time) < wait_timeout:
            try:
                # IMPORTANT: Key must match TypeScript redis-lock.ts which uses "lock:sandbox:{id}"
                lock = redis_client.lock(
                    f"lock:sandbox:{session_id}",
                    timeout=timeout,
                    blocking=False,  # Non-blocking so we can implement our own retry
                )
                if lock.acquire(blocking=False):
                    logger.info(f"[SandboxManager] Acquired lock for lock:sandbox:{session_id}")
                    return (lock, True)

                # Lock held by another process, wait and retry
                logger.debug(f"[SandboxManager] Lock held by another process for {session_id}, retrying...")
                await asyncio.sleep(retry_interval)

            except Exception as e:
                # On Redis error, allow operation to proceed (graceful degradation)
                logger.warning(f"[SandboxManager] Redis error acquiring lock: {e}, proceeding without lock")
                return (None, True)

        # Timeout waiting for lock
        logger.warning(f"[SandboxManager] Lock acquisition timed out after {wait_timeout}s for {session_id}")
        return (None, False)

    @classmethod
    def _acquire_lock(
        cls,
        session_id: str,
        timeout: int = 120,
        wait_timeout: int = 60,
        retry_interval: float = 0.5,
    ) -> tuple[Optional[Any], bool]:
        """Sync wrapper for _acquire_lock_async."""
        try:
            loop = asyncio.get_running_loop()
            # Already in async context - run in thread pool
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    cls._acquire_lock_async(session_id, timeout, wait_timeout, retry_interval)
                )
                return future.result(timeout=wait_timeout + 10)
        except RuntimeError:
            # No running loop - safe to use asyncio.run
            return asyncio.run(
                cls._acquire_lock_async(session_id, timeout, wait_timeout, retry_interval)
            )

    @classmethod
    def _release_lock(cls, lock: Any) -> None:
        """Release distributed lock."""
        if lock:
            try:
                lock.release()
                print("[SandboxManager] Released lock")
            except Exception as e:
                print(f"[SandboxManager] Failed to release lock: {e}")

    # =========================================================================
    # Modal App and Image Management
    # =========================================================================

    @classmethod
    def _get_app(cls) -> Any:
        """Get or create the Modal app."""
        if cls._app is None:
            cls._app = modal.App.lookup("interviewlm-executor", create_if_missing=True)
        return cls._app

    @classmethod
    def _get_image_for_language(cls, language: Optional[str] = None) -> Any:
        """
        Get the appropriate image for a language.

        Priority:
        1. Universal image (MODAL_UNIVERSAL_IMAGE_ID) if set
        2. Language-specific registry image
        3. Default to Node.js image
        """
        # Check for universal image first
        if UNIVERSAL_IMAGE_ID:
            if "universal" not in cls._image_cache:
                print(f"[SandboxManager] Using universal image: {UNIVERSAL_IMAGE_ID}")
                cls._image_cache["universal"] = modal.Image.from_id(UNIVERSAL_IMAGE_ID)
            return cls._image_cache["universal"]

        # Language-specific image
        lang = (language or 'javascript').lower()
        if lang in cls._image_cache:
            return cls._image_cache[lang]

        # Get image from DB config (with fallback to defaults)
        image_map = get_image_map_sync()
        registry_image = image_map.get(lang, 'node:20-bookworm-slim')
        print(f"[SandboxManager] Using registry image for {lang}: {registry_image}")

        # Build image with common tools
        image = (
            modal.Image.from_registry(registry_image)
            .apt_install("build-essential", "git", "curl", "wget", "unzip", "vim")
        )

        # Add language-specific tools
        if lang in ('python', 'py'):
            image = image.run_commands(
                "pip install --upgrade pip setuptools wheel",
                "pip install pytest pytest-json-report black pylint mypy ipython",
            )
        elif lang in ('javascript', 'typescript', 'js', 'ts'):
            image = image.run_commands(
                "npm install -g typescript ts-node jest @types/node yarn pnpm",
            )

        cls._image_cache[lang] = image
        return image

    @classmethod
    def _get_default_image(cls) -> Any:
        """Get the default comprehensive image with all languages."""
        if "default" in cls._image_cache:
            return cls._image_cache["default"]

        # Check for universal image
        if UNIVERSAL_IMAGE_ID:
            return cls._get_image_for_language(None)

        # Build comprehensive image
        image = (
            modal.Image.debian_slim(python_version="3.11")
            .apt_install(
                "build-essential", "git", "curl", "wget", "unzip", "vim",
                "ca-certificates", "gnupg",
            )
            .run_commands(
                # Node.js 20.x LTS
                "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
                "apt-get install -y nodejs",
                # Python tools
                "pip install --upgrade pip setuptools wheel",
                "pip install pytest pytest-json-report black pylint mypy ipython",
                # Go 1.21
                "curl -fsSL https://go.dev/dl/go1.21.5.linux-amd64.tar.gz | tar -C /usr/local -xzf -",
                # Rust
                "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
                # Common npm packages
                "npm install -g typescript ts-node jest @types/node yarn pnpm",
            )
            .env({
                "PATH": "/usr/local/go/bin:/root/.cargo/bin:/root/go/bin:$PATH",
                "GOPATH": "/root/go",
            })
        )

        cls._image_cache["default"] = image
        return image

    # =========================================================================
    # Database Operations
    # =========================================================================

    @classmethod
    async def _get_sandbox_id_from_db(cls, session_id: str) -> Optional[str]:
        """Get sandbox ID from database."""
        if not ASYNCPG_AVAILABLE:
            return None
        try:
            conn = await asyncpg.connect(settings.database_url)
            try:
                # Try session recording ID first
                row = await conn.fetchrow(
                    """SELECT c.volume_id
                       FROM session_recordings sr
                       JOIN candidates c ON c.id = sr.candidate_id
                       WHERE sr.id = $1""",
                    session_id
                )
                if row and row["volume_id"]:
                    return row["volume_id"]

                # Fallback to candidate ID
                row = await conn.fetchrow(
                    "SELECT volume_id FROM candidates WHERE id = $1",
                    session_id
                )
                return row["volume_id"] if row and row["volume_id"] else None
            finally:
                await conn.close()
        except Exception as e:
            print(f"[SandboxManager] DB lookup failed: {e}")
            return None

    @classmethod
    async def _save_sandbox_id_to_db(cls, session_id: str, sandbox_id: str, language: str = "javascript") -> None:
        """Persist sandbox ID to database."""
        if not ASYNCPG_AVAILABLE:
            return
        try:
            conn = await asyncpg.connect(settings.database_url)
            try:
                # Try session recording ID first
                result = await conn.execute(
                    """UPDATE candidates SET volume_id = $1, updated_at = NOW()
                       WHERE id = (SELECT candidate_id FROM session_recordings WHERE id = $2)""",
                    sandbox_id, session_id
                )
                if result == "UPDATE 1":
                    print(f"[SandboxManager] Persisted sandbox {sandbox_id} for session recording {session_id}")
                    return

                # Fallback to candidate ID
                await conn.execute(
                    'UPDATE candidates SET volume_id = $1, updated_at = NOW() WHERE id = $2',
                    sandbox_id, session_id
                )
                print(f"[SandboxManager] Persisted sandbox {sandbox_id} for candidate {session_id}")
            finally:
                await conn.close()
        except Exception as e:
            print(f"[SandboxManager] Failed to persist sandbox ID: {e}")

    @classmethod
    async def _clear_sandbox_id_from_db(cls, session_id: str) -> None:
        """Clear sandbox ID from database."""
        if not ASYNCPG_AVAILABLE:
            return
        try:
            conn = await asyncpg.connect(settings.database_url)
            try:
                # Try session recording ID first
                result = await conn.execute(
                    """UPDATE candidates SET volume_id = NULL, updated_at = NOW()
                       WHERE id = (SELECT candidate_id FROM session_recordings WHERE id = $1)""",
                    session_id
                )
                if result == "UPDATE 1":
                    return

                # Fallback to candidate ID
                await conn.execute(
                    'UPDATE candidates SET volume_id = NULL, updated_at = NOW() WHERE id = $1',
                    session_id
                )
            finally:
                await conn.close()
        except Exception:
            pass

    # =========================================================================
    # Reconnection with Retry (matching TypeScript)
    # =========================================================================

    @classmethod
    def _attempt_reconnect(cls, sandbox_id: str, timeout_s: float) -> Optional[Any]:
        """
        Single reconnection attempt with timeout.

        Returns sandbox if successful, None if sandbox is terminated/inaccessible.
        Raises TimeoutError if attempt times out.
        """
        start_time = time.time()

        def do_reconnect():
            sandbox = modal.Sandbox.from_id(sandbox_id)
            # Verify sandbox is alive by running a simple command
            proc = run_in_sandbox(sandbox, "echo", "alive")
            if proc.returncode == 0:
                return sandbox
            return None

        try:
            sandbox = run_with_timeout(do_reconnect, timeout=timeout_s)
            elapsed = time.time() - start_time
            print(f"[SandboxManager] fromId completed in {elapsed:.2f}s")
            return sandbox
        except TimeoutError:
            raise
        except Exception as e:
            error_msg = str(e).lower()
            # Handle all cases where sandbox is no longer accessible:
            # - terminated/finished: sandbox lifecycle ended
            # - permission_denied: sandbox created by different app/credentials or expired
            # - not found: sandbox ID doesn't exist
            if any(x in error_msg for x in ['terminated', 'finished', 'permission_denied', 'permission denied', 'not found']):
                print(f"[SandboxManager] Sandbox {sandbox_id} is inaccessible: {e}")
                return None
            raise

    @classmethod
    def _reconnect_to_sandbox(cls, sandbox_id: str) -> Optional[Any]:
        """
        Reconnect to existing sandbox with retry logic.

        Uses exponential backoff for retries to handle cold sandbox wake-up.
        Cold sandboxes can take 2-5+ seconds to wake up.
        """
        last_error = None

        for attempt in range(RECONNECT_MAX_RETRIES + 1):
            try:
                attempt_num = attempt + 1
                total_attempts = RECONNECT_MAX_RETRIES + 1
                print(f"[SandboxManager] Reconnect attempt {attempt_num}/{total_attempts} to {sandbox_id}...")

                sandbox = cls._attempt_reconnect(sandbox_id, RECONNECT_TIMEOUT_S)

                if sandbox:
                    if attempt > 0:
                        print(f"[SandboxManager] Reconnect succeeded on attempt {attempt_num} (sandbox was cold)")
                    return sandbox

                # _attempt_reconnect returned None (sandbox inaccessible/terminated)
                print(f"[SandboxManager] Sandbox {sandbox_id} is inaccessible, no retry needed")
                return None

            except TimeoutError as e:
                last_error = e
                print(f"[SandboxManager] Reconnect attempt {attempt + 1} timed out")

                # Wait before retry with exponential backoff
                if attempt < RECONNECT_MAX_RETRIES:
                    delay = RECONNECT_RETRY_DELAY_S * (2 ** attempt)
                    print(f"[SandboxManager] Waiting {delay}s before retry...")
                    time.sleep(delay)

            except Exception as e:
                last_error = e
                print(f"[SandboxManager] Reconnect attempt {attempt + 1} failed: {e}")
                # Non-timeout errors - don't retry
                return None

        print(f"[SandboxManager] All {RECONNECT_MAX_RETRIES + 1} reconnect attempts failed")
        return None

    # =========================================================================
    # Sandbox Creation
    # =========================================================================

    @classmethod
    def _create_new_sandbox(cls, session_id: str, language: Optional[str] = None) -> Any:
        """Create a new sandbox for a session."""
        import os

        # CRITICAL: Verify Modal credentials are available
        # This prevents cryptic "PERMISSION_DENIED" errors later
        if not os.getenv("MODAL_TOKEN_ID") or not os.getenv("MODAL_TOKEN_SECRET"):
            raise ValueError(
                "Modal credentials not found in environment. "
                "Set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET environment variables. "
                "Check that load_dotenv() is loading the .env file."
            )

        # Get image based on language
        if language:
            image = cls._get_image_for_language(language)
        else:
            image = cls._get_default_image()

        # Get sandbox config from DB (with fallback to defaults)
        sandbox_config = get_sandbox_config_sync(language or 'javascript')
        sandbox_cpu = sandbox_config.get('cpu', DEFAULT_SANDBOX_CPU)
        sandbox_memory = sandbox_config.get('memoryMb', DEFAULT_SANDBOX_MEMORY_MB)
        sandbox_timeout = sandbox_config.get('timeoutSeconds', DEFAULT_SANDBOX_TIMEOUT_S)

        print(f"[SandboxManager] Sandbox config: cpu={sandbox_cpu}, memory={sandbox_memory}MB, timeout={sandbox_timeout}s")

        # Get or create persistent volume (matching TypeScript implementation)
        # Volume name is deterministic based on session_id so files persist across sandbox restarts
        volume_name = get_volume_name(session_id)
        print(f"[SandboxManager] Getting/creating volume: {volume_name}")
        volume = modal.Volume.from_name(volume_name, create_if_missing=True)
        print(f"[SandboxManager] Volume ready: {volume_name}")

        # Create sandbox with keep-alive command AND mounted volume
        # The "tail -f /dev/null" keeps the sandbox alive without consuming resources
        # Volume at /workspace ensures files persist and are shared with TypeScript side
        sandbox = modal.Sandbox.create(
            "tail", "-f", "/dev/null",  # Keep-alive command
            app=cls._get_app(),
            image=image,
            timeout=sandbox_timeout,
            workdir="/workspace",
            cpu=sandbox_cpu,
            memory=sandbox_memory,
            volumes={"/workspace": volume},  # Mount persistent volume
        )

        # Note: No need to mkdir /workspace - Modal creates it when mounting volume

        # Get sandbox ID and store metadata
        sandbox_id = sandbox.object_id
        cls._sandbox_ids[session_id] = sandbox_id
        cls._sandbox_created_at[session_id] = datetime.now()
        cls._sandbox_language[session_id] = language or "javascript"

        # Persist to database
        try:
            asyncio.get_event_loop().run_until_complete(
                cls._save_sandbox_id_to_db(session_id, sandbox_id, language or "javascript")
            )
        except RuntimeError:
            asyncio.run(cls._save_sandbox_id_to_db(session_id, sandbox_id, language or "javascript"))

        print(f"[SandboxManager] Created new sandbox {sandbox_id} for session {session_id} (language: {language or 'default'})")
        return sandbox

    @classmethod
    async def get_sandbox_async(cls, session_id: str, language: Optional[str] = None) -> Any:
        """
        Get or create a sandbox for a session (async version).

        Priority:
        1. Return from in-memory cache (fastest)
        2. Check if creation is pending (same process)
        3. Acquire distributed lock OR wait for sandbox to be created
        4. Re-check cache after lock
        5. Reconnect from database with retry
        6. Create new sandbox
        """
        if not MODAL_AVAILABLE:
            raise RuntimeError("Modal SDK not available. Install with: pip install modal")

        # 1. Check in-memory cache
        if session_id in cls._sandboxes:
            print(f"[SandboxManager] Using cached sandbox for session {session_id}")
            return cls._sandboxes[session_id]

        # 2. Check if creation is pending
        if session_id in cls._pending:
            print(f"[SandboxManager] Waiting for pending sandbox creation for {session_id}")
            for _ in range(120):  # Wait up to 2 minutes
                if session_id in cls._sandboxes:
                    return cls._sandboxes[session_id]
                await asyncio.sleep(1)
            raise RuntimeError(f"Timeout waiting for sandbox creation for {session_id}")

        # Mark as pending
        cls._pending[session_id] = True

        # 3. Acquire distributed lock OR wait for sandbox to be created by another process
        # Returns: (lock, acquired, existing_sandbox)
        lock, acquired, existing_sandbox = await cls._acquire_lock_or_wait_for_sandbox_async(session_id)

        try:
            # If we found an existing sandbox while waiting, use it
            if existing_sandbox is not None:
                logger.info(f"[SandboxManager] Using sandbox created by another process for {session_id}")
                return existing_sandbox

            # 4. Re-check cache after lock attempt
            if session_id in cls._sandboxes:
                print(f"[SandboxManager] Found cached sandbox after lock for {session_id}")
                return cls._sandboxes[session_id]

            # If lock acquisition failed and no sandbox was found, raise error
            if not acquired:
                raise RuntimeError(f"Failed to acquire lock and no existing sandbox available for {session_id}")

            # 5. Try to reconnect from database with retry (we have the lock now)
            try:
                sandbox_id = await cls._get_sandbox_id_from_db(session_id)

                if sandbox_id:
                    print(f"[SandboxManager] Found sandbox ID {sandbox_id} in DB for {session_id}")
                    sandbox = cls._reconnect_to_sandbox(sandbox_id)
                    if sandbox:
                        cls._sandboxes[session_id] = sandbox
                        cls._sandbox_ids[session_id] = sandbox_id
                        cls._sandbox_created_at[session_id] = datetime.now()
                        return sandbox
                    else:
                        print(f"[SandboxManager] Clearing stale sandbox ID {sandbox_id}")
                else:
                    print(f"[SandboxManager] No existing sandbox found in DB for {session_id}")
            except Exception as e:
                print(f"[SandboxManager] Error checking DB for sandbox: {e}")

            # 6. Create new sandbox
            print(f"[SandboxManager] Creating NEW sandbox for session {session_id}")
            sandbox = cls._create_new_sandbox(session_id, language)
            cls._sandboxes[session_id] = sandbox
            return sandbox

        finally:
            cls._pending.pop(session_id, None)
            cls._release_lock(lock)

    @classmethod
    def get_sandbox(cls, session_id: str, language: Optional[str] = None) -> Any:
        """Sync wrapper for get_sandbox_async."""
        # Quick path: check cache first without async overhead
        if session_id in cls._sandboxes:
            print(f"[SandboxManager] Using cached sandbox for session {session_id}")
            return cls._sandboxes[session_id]

        try:
            loop = asyncio.get_running_loop()
            # Already in async context - run in thread pool to avoid blocking
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    cls.get_sandbox_async(session_id, language)
                )
                return future.result(timeout=180)  # 3 minute timeout
        except RuntimeError:
            # No running loop - safe to use asyncio.run
            return asyncio.run(cls.get_sandbox_async(session_id, language))

    # =========================================================================
    # Dead Container Detection & Auto-Recreation
    # =========================================================================

    @classmethod
    def _is_sandbox_alive(cls, sandbox: Any, sandbox_id: str) -> bool:
        """
        Check if a sandbox is still alive and usable.

        Returns True if sandbox responds to a simple command.
        Returns False if sandbox is terminated/finished.
        """
        try:
            proc = run_in_sandbox(sandbox, "echo", "alive", sandbox_id=sandbox_id, timeout=10)
            return proc.returncode == 0
        except Exception as e:
            error_msg = str(e).lower()
            if any(x in error_msg for x in ['finished', 'terminated', 'status=', 'permission_denied']):
                return False
            # Other errors might be transient
            logger.warning(f"[SandboxManager] Health check error (may be transient): {e}")
            return False

    @classmethod
    def _clear_dead_sandbox(cls, session_id: str) -> None:
        """Clear a dead sandbox from all caches."""
        logger.info(f"[SandboxManager] Clearing dead sandbox for session {session_id}")
        cls._sandboxes.pop(session_id, None)
        sandbox_id = cls._sandbox_ids.pop(session_id, None)
        cls._sandbox_created_at.pop(session_id, None)
        cls._sandbox_language.pop(session_id, None)
        cls._stop_keepalive(session_id)

        # Clear from database too
        if sandbox_id:
            try:
                try:
                    asyncio.get_event_loop().run_until_complete(
                        cls._clear_sandbox_id_from_db(session_id)
                    )
                except RuntimeError:
                    asyncio.run(cls._clear_sandbox_id_from_db(session_id))
            except Exception as e:
                logger.warning(f"[SandboxManager] Failed to clear sandbox from DB: {e}")

    @classmethod
    def get_or_recreate_sandbox(cls, session_id: str, language: Optional[str] = None) -> Any:
        """
        Get sandbox, validating it's alive. Recreate with Redis lock if dead.

        This is the preferred method for tools to get a sandbox, as it handles
        the case where a cached sandbox has died.

        Flow:
        1. Get sandbox (from cache, DB, or create new)
        2. Validate it's alive with a health check
        3. If dead: acquire Redis lock, clear cache, create new sandbox
        4. Return healthy sandbox

        Args:
            session_id: Session identifier
            language: Optional language for sandbox image

        Returns:
            Live sandbox instance
        """
        if not MODAL_AVAILABLE:
            raise RuntimeError("Modal SDK not available. Install with: pip install modal")

        # Get sandbox (may be from cache)
        sandbox = cls.get_sandbox(session_id, language)
        sandbox_id = cls._sandbox_ids.get(session_id)

        # Quick health check on cached sandbox
        if sandbox_id and session_id in cls._sandboxes:
            if cls._is_sandbox_alive(sandbox, sandbox_id):
                return sandbox

            # Sandbox is dead - need to recreate
            logger.warning(f"[SandboxManager] Sandbox {sandbox_id} is dead, recreating...")

            # Acquire Redis lock for recreation (returns tuple: lock, acquired)
            lock, acquired = cls._acquire_lock(session_id)
            try:
                # Double-check after acquiring lock (another process might have recreated)
                if session_id in cls._sandboxes:
                    existing_sandbox = cls._sandboxes[session_id]
                    existing_id = cls._sandbox_ids.get(session_id)
                    if existing_id != sandbox_id and cls._is_sandbox_alive(existing_sandbox, existing_id):
                        logger.info(f"[SandboxManager] Another process recreated sandbox {existing_id}")
                        return existing_sandbox

                # If lock acquisition failed, check DB for sandbox created by another process
                if not acquired:
                    logger.warning(f"[SandboxManager] Lock acquisition failed during recreation for {session_id}")
                    try:
                        try:
                            db_sandbox_id = asyncio.get_event_loop().run_until_complete(
                                cls._get_sandbox_id_from_db(session_id)
                            )
                        except RuntimeError:
                            db_sandbox_id = asyncio.run(cls._get_sandbox_id_from_db(session_id))

                        if db_sandbox_id and db_sandbox_id != sandbox_id:
                            logger.info(f"[SandboxManager] Found new sandbox {db_sandbox_id} in DB (created by another process)")
                            new_sandbox = cls._reconnect_to_sandbox(db_sandbox_id)
                            if new_sandbox and cls._is_sandbox_alive(new_sandbox, db_sandbox_id):
                                cls._sandboxes[session_id] = new_sandbox
                                cls._sandbox_ids[session_id] = db_sandbox_id
                                cls._sandbox_created_at[session_id] = datetime.now()
                                logger.info(f"[SandboxManager] Successfully connected to recreated sandbox {db_sandbox_id}")
                                return new_sandbox
                    except Exception as e:
                        logger.warning(f"[SandboxManager] Error checking DB after lock failure: {e}")

                    # Lock failed and no new sandbox found - raise error
                    raise RuntimeError(f"Failed to acquire lock for sandbox recreation and no new sandbox available for {session_id}")

                # Clear dead sandbox from cache and DB
                cls._clear_dead_sandbox(session_id)

                # Create new sandbox
                logger.info(f"[SandboxManager] Creating replacement sandbox for {session_id}")
                new_sandbox = cls._create_new_sandbox(session_id, language)
                cls._sandboxes[session_id] = new_sandbox
                return new_sandbox

            finally:
                cls._release_lock(lock)

        return sandbox

    # =========================================================================
    # Sandbox Lifecycle Management
    # =========================================================================

    @classmethod
    def terminate_sandbox(cls, session_id: str) -> bool:
        """Terminate a sandbox session."""
        # Stop keep-alive first
        cls._stop_keepalive(session_id)

        if session_id in cls._sandboxes:
            try:
                cls._sandboxes[session_id].terminate()
                del cls._sandboxes[session_id]
                cls._sandbox_ids.pop(session_id, None)
                cls._sandbox_created_at.pop(session_id, None)
                cls._sandbox_language.pop(session_id, None)
                cls._write_queues.pop(session_id, None)

                # Clear from database
                try:
                    asyncio.get_event_loop().run_until_complete(
                        cls._clear_sandbox_id_from_db(session_id)
                    )
                except RuntimeError:
                    asyncio.run(cls._clear_sandbox_id_from_db(session_id))

                print(f"[SandboxManager] Terminated sandbox for session {session_id}")
                return True
            except Exception as e:
                print(f"[SandboxManager] Error terminating sandbox: {e}")
                return False
        return False

    @classmethod
    def sandbox_exists(cls, session_id: str) -> bool:
        """Check if a sandbox exists for a session (in memory only)."""
        return session_id in cls._sandboxes

    @classmethod
    def clear_sandbox_cache(cls, session_id: str) -> bool:
        """Clear sandbox from cache (for testing)."""
        if session_id in cls._sandboxes:
            del cls._sandboxes[session_id]
            cls._sandbox_ids.pop(session_id, None)
            cls._sandbox_created_at.pop(session_id, None)
            return True
        return False

    # =========================================================================
    # Keep-Alive (matching TypeScript)
    # =========================================================================

    @classmethod
    async def _start_keepalive(cls, session_id: str, sandbox: Any) -> None:
        """Start keep-alive task for sandbox with retry logic."""
        cls._stop_keepalive(session_id)

        sandbox_id = cls._sandbox_ids.get(session_id)
        logger.info(f"[SandboxManager] Starting keep-alive for session {session_id} (interval: {KEEPALIVE_INTERVAL_S}s)")

        async def keepalive_loop():
            consecutive_failures = 0

            while session_id in cls._sandboxes:
                try:
                    # Use sandbox_id for proper locking
                    proc = run_with_timeout(
                        lambda: run_in_sandbox(sandbox, "true", sandbox_id=sandbox_id, timeout=KEEPALIVE_TIMEOUT_S),
                        timeout=KEEPALIVE_TIMEOUT_S + 2  # Slightly longer outer timeout
                    )
                    if proc.returncode == 0:
                        # Success - reset failure counter
                        consecutive_failures = 0
                        logger.debug(f"[SandboxManager] Keep-alive ping sent for session {session_id}")
                    else:
                        # Non-zero exit code
                        consecutive_failures += 1
                        logger.warning(f"[SandboxManager] Keep-alive returned non-zero for {session_id} (attempt {consecutive_failures}/{KEEPALIVE_MAX_RETRIES})")

                except Exception as e:
                    error_msg = str(e).lower()
                    consecutive_failures += 1

                    # Check for terminal errors (sandbox is definitely dead)
                    if any(x in error_msg for x in ['terminated', 'finished', 'status=', 'permission_denied', 'not found']):
                        logger.warning(f"[SandboxManager] Sandbox {session_id} is dead: {e}")
                        cls._clear_dead_sandbox(session_id)
                        return

                    logger.warning(f"[SandboxManager] Keep-alive failed for {session_id} (attempt {consecutive_failures}/{KEEPALIVE_MAX_RETRIES}): {e}")

                # Check if max retries exceeded
                if consecutive_failures >= KEEPALIVE_MAX_RETRIES:
                    logger.error(f"[SandboxManager] Keep-alive failed {KEEPALIVE_MAX_RETRIES} times for {session_id}, marking sandbox as dead")
                    cls._clear_dead_sandbox(session_id)
                    return

                await asyncio.sleep(KEEPALIVE_INTERVAL_S)

        task = asyncio.create_task(keepalive_loop())
        cls._keepalive_tasks[session_id] = task

    @classmethod
    def _stop_keepalive(cls, session_id: str) -> None:
        """Stop keep-alive task."""
        if session_id in cls._keepalive_tasks:
            cls._keepalive_tasks[session_id].cancel()
            del cls._keepalive_tasks[session_id]
            print(f"[SandboxManager] Stopped keep-alive for session {session_id}")

    @classmethod
    def has_keepalive(cls, session_id: str) -> bool:
        """Check if keep-alive is active."""
        return session_id in cls._keepalive_tasks

    # =========================================================================
    # Write Queue (matching TypeScript)
    # =========================================================================

    @classmethod
    async def _get_write_queue(cls, session_id: str) -> asyncio.Queue:
        """Get or create write queue for session."""
        if session_id not in cls._write_queues:
            cls._write_queues[session_id] = asyncio.Queue()
        return cls._write_queues[session_id]

    @classmethod
    async def queued_write(cls, session_id: str, write_func) -> Any:
        """
        Execute a write operation through the queue.

        This serializes writes to prevent conflicts on the same session.
        """
        queue = await cls._get_write_queue(session_id)
        result_future = asyncio.get_event_loop().create_future()

        async def do_write():
            try:
                result = await asyncio.get_event_loop().run_in_executor(
                    _executor, write_func
                )
                result_future.set_result(result)
            except Exception as e:
                result_future.set_exception(e)

        await queue.put(do_write)

        # Process the queue
        while not queue.empty():
            task = await queue.get()
            await task()
            queue.task_done()

        return await result_future

    # =========================================================================
    # File System Tree (matching TypeScript)
    # =========================================================================

    @classmethod
    def _is_within_workspace(cls, path: str) -> bool:
        """Check if path is safely within workspace."""
        normalized = path.replace('//', '/').rstrip('/')
        if not normalized.startswith(WORKSPACE_ROOT):
            return False
        if '/../' in normalized or normalized.endswith('/..'):
            return False
        return True

    @classmethod
    def _normalize_path(cls, path: str) -> str:
        """Normalize a path."""
        return path.replace('//', '/').rstrip('/') or '/'

    @classmethod
    def get_file_system(cls, session_id: str, root_path: str = "/workspace") -> list[dict]:
        """
        Get file system tree using single find command.

        Returns nested tree structure matching TypeScript getFileSystem().
        """
        if not cls._is_within_workspace(root_path):
            print(f"[SandboxManager] BLOCKED: Path outside workspace: {root_path}")
            return []

        try:
            sandbox = cls.get_sandbox(session_id)

            # Single find command for entire tree
            find_cmd = (
                f"find -L {root_path} -maxdepth {MAX_DEPTH} "
                f"\\( -type f -o -type d \\) "
                f"-printf '%y %s %p\\n' 2>/dev/null | head -{MAX_FILES}"
            )
            proc = run_in_sandbox(sandbox, "sh", "-c", find_cmd)
            stdout = proc.stdout.read() if hasattr(proc.stdout, 'read') else str(proc.stdout)

            if not stdout.strip():
                return []

            # Parse find output
            all_files = []
            for line in stdout.strip().split('\n'):
                match = re.match(r'^([df])\s+(\d+)\s+(.+)$', line)
                if match:
                    type_char, size_str, path = match.groups()
                    if path != root_path and cls._is_within_workspace(path):
                        all_files.append({
                            'type': 'directory' if type_char == 'd' else 'file',
                            'size': int(size_str),
                            'path': path,
                        })

            return cls._build_file_tree(all_files, root_path)

        except Exception as e:
            print(f"[SandboxManager] Failed to get file system: {e}")
            return []

    @classmethod
    def _build_file_tree(cls, files: list[dict], root_path: str) -> list[dict]:
        """Build nested tree structure from flat file list."""
        # Sort by path length to process parents before children
        files.sort(key=lambda f: len(f['path']))

        node_map = {}

        for file in files:
            name = file['path'].split('/')[-1]
            node = {
                'name': name,
                'path': file['path'],
                'type': file['type'],
                'size': file['size'],
            }
            if file['type'] == 'directory':
                node['children'] = []

            node_map[file['path']] = node

            # Find parent and add as child
            parent_path = '/'.join(file['path'].split('/')[:-1])
            parent = node_map.get(parent_path)
            if parent and 'children' in parent:
                parent['children'].append(node)

        # Return only top-level items
        return [
            node_map[f['path']]
            for f in files
            if '/'.join(f['path'].split('/')[:-1]) == root_path
        ]

    # =========================================================================
    # Health Checks (matching TypeScript)
    # =========================================================================

    @classmethod
    def test_connection(cls) -> bool:
        """Test Modal connection is available."""
        try:
            return MODAL_AVAILABLE and cls._get_app() is not None
        except Exception:
            return False

    @classmethod
    def health_check(cls) -> dict:
        """Return health status."""
        connected = cls.test_connection()
        return {
            "status": "healthy" if connected else "unhealthy",
            "modal_available": MODAL_AVAILABLE,
            "redis_available": REDIS_AVAILABLE,
            "asyncpg_available": ASYNCPG_AVAILABLE,
        }

    @classmethod
    def get_sandbox_status(cls, session_id: str) -> dict:
        """Get detailed sandbox status."""
        if session_id not in cls._sandboxes:
            return {"exists": False}

        return {
            "exists": True,
            "sandbox_id": cls._sandbox_ids.get(session_id),
            "created_at": cls._sandbox_created_at.get(session_id),
            "language": cls._sandbox_language.get(session_id),
            "has_keepalive": session_id in cls._keepalive_tasks,
        }

    @classmethod
    def list_active_sandboxes(cls) -> list[dict]:
        """List all active sandboxes."""
        return [
            cls.get_sandbox_status(session_id)
            for session_id in cls._sandboxes.keys()
        ]


# =============================================================================
# Module-Level Exports
# =============================================================================

# Global sandbox manager instance
sandbox_manager = SandboxManager()

# Convenience functions
def get_sandbox(session_id: str, language: Optional[str] = None) -> Any:
    """Get or create sandbox for session (sync)."""
    return SandboxManager.get_sandbox(session_id, language)


async def get_sandbox_async(session_id: str, language: Optional[str] = None) -> Any:
    """Get or create sandbox for session (async)."""
    return await SandboxManager.get_sandbox_async(session_id, language)


def get_or_recreate_sandbox(session_id: str, language: Optional[str] = None) -> Any:
    """
    Get sandbox with health check. Recreate with Redis lock if dead.

    This is the PREFERRED function for tools, as it handles dead containers.
    """
    return SandboxManager.get_or_recreate_sandbox(session_id, language)


def terminate_sandbox(session_id: str) -> bool:
    """Terminate sandbox for session."""
    return SandboxManager.terminate_sandbox(session_id)


def get_file_system(session_id: str, root_path: str = "/workspace") -> list[dict]:
    """Get file system tree."""
    return SandboxManager.get_file_system(session_id, root_path)


def health_check() -> dict:
    """Get health status."""
    return SandboxManager.health_check()


def test_connection() -> bool:
    """Test Modal connection."""
    return SandboxManager.test_connection()
