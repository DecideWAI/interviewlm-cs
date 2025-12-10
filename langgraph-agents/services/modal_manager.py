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
from datetime import datetime
from typing import Any, Optional
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

from config import settings

# =============================================================================
# Configuration Constants (matching TypeScript)
# =============================================================================

# Sandbox configuration
SANDBOX_TIMEOUT_S = 3600  # 1 hour
SANDBOX_CPU = 2.0
SANDBOX_MEMORY_MB = 2048

# Reconnection configuration (matching TypeScript)
RECONNECT_TIMEOUT_S = 5  # 5 seconds per attempt
RECONNECT_MAX_RETRIES = 2  # Total 3 attempts (1 initial + 2 retries)
RECONNECT_RETRY_DELAY_S = 1  # Base delay, doubles each retry

# File system limits (matching TypeScript)
MAX_DEPTH = 10
MAX_FILES = 500
WORKSPACE_ROOT = "/workspace"

# Keep-alive configuration
KEEPALIVE_INTERVAL_S = 30
KEEPALIVE_TIMEOUT_S = 5

# Output limits
MAX_OUTPUT_SIZE = 50000  # 50KB

# Tool timeout
TOOL_TIMEOUT_SECONDS = 30

# Universal image ID (set via environment)
UNIVERSAL_IMAGE_ID = os.environ.get("MODAL_UNIVERSAL_IMAGE_ID")

# Language-specific image map (matching TypeScript)
IMAGE_MAP = {
    'python': 'python:3.11-slim-bookworm',
    'py': 'python:3.11-slim-bookworm',
    'javascript': 'node:20-bookworm-slim',
    'typescript': 'node:20-bookworm-slim',
    'js': 'node:20-bookworm-slim',
    'ts': 'node:20-bookworm-slim',
    'go': 'golang:1.21-bookworm',
    'golang': 'golang:1.21-bookworm',
    'java': 'eclipse-temurin:21-jdk-jammy',
    'rust': 'rust:1.75-slim-bookworm',
}

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


# =============================================================================
# Sandbox Helper Function
# =============================================================================

def run_in_sandbox(sandbox, *args, **kwargs):
    """
    Run a command in a Modal Sandbox.

    Args:
        sandbox: Modal Sandbox instance
        *args: Command arguments (e.g., "bash", "-c", "ls")
        **kwargs: Additional options (e.g., timeout=60)

    Returns:
        Process result with stdout, stderr, returncode
    """
    execute_method = getattr(sandbox, "exec")
    proc = execute_method(*args, **kwargs)
    proc.wait()
    return proc


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
    def _acquire_lock(cls, session_id: str, timeout: int = 120) -> Optional[Any]:
        """Acquire distributed lock for sandbox creation."""
        redis_client = cls._get_redis()
        if not redis_client:
            return None
        try:
            lock = redis_client.lock(
                f"sandbox:{session_id}",
                timeout=timeout,
                blocking_timeout=60,
            )
            if lock.acquire(blocking=True):
                print(f"[SandboxManager] Acquired lock for sandbox:{session_id}")
                return lock
            return None
        except Exception as e:
            print(f"[SandboxManager] Failed to acquire lock: {e}")
            return None

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

        registry_image = IMAGE_MAP.get(lang, 'node:20-bookworm-slim')
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

        # Create sandbox with keep-alive command (matching reference implementation)
        # The "tail -f /dev/null" keeps the sandbox alive without consuming resources
        sandbox = modal.Sandbox.create(
            "tail", "-f", "/dev/null",  # Keep-alive command
            app=cls._get_app(),
            image=image,
            timeout=SANDBOX_TIMEOUT_S,
            workdir="/workspace",
            cpu=SANDBOX_CPU,
            memory=SANDBOX_MEMORY_MB,
        )

        # Initialize workspace
        run_in_sandbox(sandbox, "mkdir", "-p", "/workspace")

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
    def get_sandbox(cls, session_id: str, language: Optional[str] = None) -> Any:
        """
        Get or create a sandbox for a session.

        Priority:
        1. Return from in-memory cache (fastest)
        2. Check if creation is pending (same process)
        3. Acquire distributed lock
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
            for _ in range(60):
                if session_id in cls._sandboxes:
                    return cls._sandboxes[session_id]
                time.sleep(1)
            raise RuntimeError(f"Timeout waiting for sandbox creation for {session_id}")

        # Mark as pending
        cls._pending[session_id] = True

        # 3. Acquire distributed lock
        lock = cls._acquire_lock(session_id)

        try:
            # 4. Re-check cache after lock
            if session_id in cls._sandboxes:
                print(f"[SandboxManager] Found cached sandbox after lock for {session_id}")
                return cls._sandboxes[session_id]

            # 5. Try to reconnect from database with retry
            try:
                try:
                    sandbox_id = asyncio.get_event_loop().run_until_complete(
                        cls._get_sandbox_id_from_db(session_id)
                    )
                except RuntimeError:
                    sandbox_id = asyncio.run(cls._get_sandbox_id_from_db(session_id))

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
        """Start keep-alive task for sandbox."""
        cls._stop_keepalive(session_id)

        print(f"[SandboxManager] Starting keep-alive for session {session_id} (interval: {KEEPALIVE_INTERVAL_S}s)")

        async def keepalive_loop():
            while session_id in cls._sandboxes:
                try:
                    proc = run_with_timeout(
                        lambda: run_in_sandbox(sandbox, "true"),
                        timeout=KEEPALIVE_TIMEOUT_S
                    )
                    if proc.returncode != 0:
                        break
                    print(f"[SandboxManager] Keep-alive ping sent for session {session_id}")
                except Exception as e:
                    error_msg = str(e)
                    if 'terminated' in error_msg or 'finished' in error_msg:
                        print(f"[SandboxManager] Sandbox {session_id} appears dead, stopping keep-alive")
                        cls._sandboxes.pop(session_id, None)
                        break
                    print(f"[SandboxManager] Keep-alive failed for {session_id}: {error_msg}")
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
    """Get or create sandbox for session."""
    return SandboxManager.get_sandbox(session_id, language)


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
