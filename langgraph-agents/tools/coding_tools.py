"""
Coding tools for the LangGraph Coding Agent.

Uses Modal Sandbox SDK directly for true process isolation per session.
Each candidate gets their own isolated container where they can:
- Install any packages (npm, pip, cargo, go get, etc.)
- Use any language (Python, Node, Go, Rust, etc.)
- Use any framework (React, Django, Rails, Spring, etc.)

SandboxManager has been extracted to services/modal_manager.py for better modularity.
"""

import asyncio
import base64
import logging
import os
import re
import threading
from pathlib import Path
from typing import Any, List

import httpx
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

# Import SandboxManager and helpers from services
from services import (
    MODAL_AVAILABLE,
    SandboxManager,
    get_or_recreate_sandbox,
    run_in_sandbox,
    run_with_retry,
    run_with_timeout,
)

# Import question tools for ask_question capability
from tools.question_tools import ask_question

logger = logging.getLogger(__name__)

# Timeout for tool operations (matches TypeScript implementation)
TOOL_TIMEOUT_SECONDS = 30

# Global sandbox manager instance
sandbox_mgr = SandboxManager


# =============================================================================
# Security Helpers (DB-backed)
# =============================================================================

# =============================================================================
# Config Service Integration
# =============================================================================

_config_service = None
_cached_blocked_patterns: List[str] = None
_cached_workspace_restrictions: List[str] = None
_initialized: bool = False


async def initialize_security_config():
    """
    Initialize security config from DB. Call this at server startup.

    This loads config in the async context so it's cached for sync tool calls.
    """
    global _cached_blocked_patterns, _cached_workspace_restrictions, _initialized

    if _initialized:
        return

    try:
        from services.config_service import get_config_service
        config_service = get_config_service()

        # Load blocked patterns
        patterns = await config_service.get_blocked_patterns()
        if patterns:
            _cached_blocked_patterns = patterns
            print(f"[CodingTools] Cached {len(patterns)} blocked patterns from DB")

        # Load workspace restrictions
        restrictions = await config_service.get_security_config("workspace_restrictions")
        if restrictions and isinstance(restrictions, dict):
            blocked_paths = restrictions.get("blockedPaths", [])
            if blocked_paths:
                _cached_workspace_restrictions = blocked_paths
                print(f"[CodingTools] Cached {len(blocked_paths)} workspace restrictions from DB")

        _initialized = True
        print("[CodingTools] Security config initialized successfully")

    except Exception as e:
        print(f"[CodingTools] Failed to initialize security config: {e}")
        raise RuntimeError(f"Failed to initialize security config: {e}")


def _get_config_service():
    """Get config service instance (lazy initialization)."""
    global _config_service
    if _config_service is None:
        try:
            from services.config_service import get_config_service
            _config_service = get_config_service()
        except ImportError as e:
            logger.warning(f"Config service not available: {e}")
            return None
    return _config_service


def _run_async(coro):
    """Run async coroutine in sync context.

    IMPORTANT: Async DB connections (asyncpg) have internal asyncio.Lock objects
    that are bound to the event loop where they were created. Running them in
    a different event loop (e.g., via ThreadPoolExecutor) causes errors.

    To avoid this, we only attempt async calls when NOT in a ThreadPoolExecutor
    and when there's no running event loop. Otherwise, we return None to trigger
    fallback behavior.
    """
    # Check if we're in a ThreadPoolExecutor thread
    # These threads should NOT try to run async DB operations
    current_thread = threading.current_thread().name
    if "ThreadPoolExecutor" in current_thread or "Pool" in current_thread:
        logger.debug(f"Skipping async call in {current_thread} - would cause event loop issues")
        coro.close()  # Properly close the unawaited coroutine to avoid warning
        return None

    try:
        # Check if there's a running event loop
        try:
            loop = asyncio.get_running_loop()
            # If we're in an event loop, we can't safely run async DB operations
            # because the config service may have connections bound to a different loop
            logger.debug("Skipping async call - already in an event loop context")
            coro.close()  # Properly close the unawaited coroutine to avoid warning
            return None
        except RuntimeError:
            # No running loop, we can use asyncio.run directly
            # This is safe as long as the config service creates a fresh connection
            return asyncio.run(coro)
    except Exception as e:
        logger.warning(f"Failed to run async config call: {e}")
        try:
            coro.close()  # Clean up in case of exception
        except Exception:
            pass
        return None


def get_blocked_patterns_sync() -> List[str]:
    """Get blocked command patterns from DB with fallback defaults."""
    global _cached_blocked_patterns
    if _cached_blocked_patterns is not None:
        return _cached_blocked_patterns

    # Fallback patterns if DB is unavailable
    FALLBACK_BLOCKED_PATTERNS = [
        r"rm\s+-rf\s+/",        # Dangerous recursive delete
        r"mkfs",                 # Filesystem format
        r"dd\s+if=",            # Direct disk writes
        r":(){ :|:& };:",       # Fork bomb
        r"chmod\s+-R\s+777",    # Dangerous permissions
        r"curl.*\|\s*sh",       # Pipe to shell
        r"wget.*\|\s*sh",       # Pipe to shell
        r"nc\s+-e",             # Netcat reverse shell
        r"python.*-c.*socket",  # Python reverse shell
    ]

    try:
        config_service = _get_config_service()
        if config_service:
            patterns = _run_async(config_service.get_blocked_patterns())
            if patterns:
                _cached_blocked_patterns = patterns
                logger.debug(f"Using DB blocked patterns: {len(patterns)} patterns")
                return patterns
    except Exception as e:
        logger.warning(f"Failed to load blocked patterns from DB: {e}")

    # Use fallback patterns
    logger.info("Using fallback blocked patterns (DB unavailable)")
    _cached_blocked_patterns = FALLBACK_BLOCKED_PATTERNS
    return FALLBACK_BLOCKED_PATTERNS


def get_workspace_restrictions_sync() -> List[str]:
    """Get workspace path restrictions from DB with fallback defaults."""
    global _cached_workspace_restrictions
    if _cached_workspace_restrictions is not None:
        return _cached_workspace_restrictions

    # Fallback restrictions if DB is unavailable
    FALLBACK_WORKSPACE_RESTRICTIONS = [
        "/etc/",
        "/root/",
        "/var/",
        "/usr/",
        "/bin/",
        "/sbin/",
        "../",  # Directory traversal
    ]

    try:
        config_service = _get_config_service()
        if config_service:
            restrictions = _run_async(config_service.get_security_config("workspace_restrictions"))
            if restrictions and isinstance(restrictions, dict):
                blocked_paths = restrictions.get("blockedPaths", [])
                if blocked_paths:
                    _cached_workspace_restrictions = blocked_paths
                    logger.debug(f"Using DB workspace restrictions: {len(blocked_paths)} paths")
                    return blocked_paths
    except Exception as e:
        logger.warning(f"Failed to load workspace restrictions from DB: {e}")

    # Use fallback restrictions
    logger.info("Using fallback workspace restrictions (DB unavailable)")
    _cached_workspace_restrictions = FALLBACK_WORKSPACE_RESTRICTIONS
    return FALLBACK_WORKSPACE_RESTRICTIONS


def is_command_allowed(command: str) -> tuple[bool, str]:
    """Check if a bash command is allowed using DB-backed patterns."""
    command_lower = command.lower()
    blocked_patterns = get_blocked_patterns_sync()

    for pattern in blocked_patterns:
        # Try regex match first (DB stores regex patterns)
        try:
            if re.search(pattern, command_lower, re.IGNORECASE):
                return False, "Command blocked by security policy"
        except re.error:
            # If not valid regex, try simple string match
            if pattern.lower() in command_lower:
                return False, f"Command contains blocked pattern: {pattern}"
    return True, ""


def is_path_allowed(path: str) -> tuple[bool, str]:
    """Check if a file path is allowed using DB-backed restrictions."""
    normalized = path.replace("\\", "/")
    blocked_paths = get_workspace_restrictions_sync()

    for blocked in blocked_paths:
        if blocked in normalized:
            return False, f"Path contains blocked pattern: {blocked}"
    return True, ""


# =============================================================================
# Event Emission Helpers
# =============================================================================

# Event emission configuration
NEXTJS_INTERNAL_URL = os.environ.get("NEXTJS_INTERNAL_URL", "http://localhost:3000")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "dev-internal-key")


def emit_event_fire_and_forget(
    session_id: str,
    event_type: str,
    origin: str,
    data: dict,
    question_index: int = None,
    file_path: str = None,
    checkpoint: bool = False,
):
    """
    Emit an event to the Next.js event store (fire-and-forget).

    This runs in a background thread to avoid blocking tool execution.
    Failures are logged but don't affect the tool result.

    Args:
        session_id: The session ID for the event
        event_type: Event type (e.g., "code.write", "terminal.command")
        origin: Event origin ("USER", "AI", "SYSTEM")
        data: Event data payload
        question_index: Optional question index
        file_path: Optional file path for file-related events
        checkpoint: Whether this is a checkpoint event
    """
    if not session_id:
        logger.debug("No session_id provided, skipping event emission")
        return

    def _emit():
        try:
            payload = {
                "sessionId": session_id,
                "type": event_type,
                "origin": origin,
                "data": data,
            }
            if question_index is not None:
                payload["questionIndex"] = question_index
            if file_path:
                payload["filePath"] = file_path
            if checkpoint:
                payload["checkpoint"] = True

            # Use sync httpx client for simplicity in fire-and-forget thread
            response = httpx.post(
                f"{NEXTJS_INTERNAL_URL}/api/internal/events/record",
                json=payload,
                headers={"Authorization": f"Bearer {INTERNAL_API_KEY}"},
                timeout=5.0,  # Short timeout for fire-and-forget
            )

            if response.status_code != 200:
                logger.warning(
                    f"Event emission failed: {response.status_code} - {response.text}"
                )
            else:
                logger.debug(f"Event emitted: {event_type} for session {session_id}")

        except Exception as e:
            logger.warning(f"Failed to emit event {event_type}: {e}")

    # Run in background thread to not block tool execution
    thread = threading.Thread(target=_emit, daemon=True)
    thread.start()


def get_session_id(config: dict) -> str:
    """Get the session ID from config for event emission."""
    configurable = config.get("configurable", {})
    return configurable.get("session_id")


def sanitize_output(text: str, max_size: int = 1000) -> str:
    """
    Truncate output if too large.

    Args:
        text: The output text to sanitize
        max_size: Maximum characters to return (default: 1000 chars ≈ 200 tokens).
            - Use default for most commands
            - Use 5000-10000 for log viewing, build output
            - Use 50000 for full file dumps
    """
    if len(text) > max_size:
        return text[:max_size] + f"\n\n... (truncated, {len(text) - max_size} bytes remaining)"
    return text


def get_sandbox_id(config: dict) -> str:
    """
    Get the sandbox ID from config.
    Prefers candidate_id (used by TypeScript/Next.js) over session_id.
    This ensures the evaluation agent accesses the same sandbox as the interview.
    """
    configurable = config.get("configurable", {})
    # candidate_id is the primary key used by TypeScript for Modal sandboxes
    # session_id (SessionRecording.id) is used for DB queries
    return configurable.get("candidate_id") or configurable.get("session_id", "default")


# =============================================================================
# File Operation Tools
# =============================================================================

@tool
def read_file(
    path: str,
    config: RunnableConfig,
    offset: int = 0,
    limit: int = 2000,
) -> dict[str, Any]:
    """
    Read the contents of a file from the workspace.

    For large files, use offset and limit to read specific portions.

    Args:
        path: Path to the file (relative to /workspace or absolute)
        config: RunnableConfig with session_id in configurable
        offset: Character offset to start reading from (default: 0)
        limit: Maximum characters to read (default: 2000 ≈ 400 tokens).
            Set higher (e.g., 10000) for larger files.

    Returns:
        Dict with success status, content, and metadata
    """
    sandbox_id = get_sandbox_id(config)
    allowed, reason = is_path_allowed(path)
    if not allowed:
        return {"success": False, "error": reason}

    try:
        sb = get_or_recreate_sandbox(sandbox_id)

        # Ensure absolute path
        if not path.startswith("/"):
            path = f"/workspace/{path}"

        # Wrap in timeout with retry to prevent hanging
        def _read_file():
            proc = run_in_sandbox(sb, "cat", path)
            return proc.stdout.read(), proc.returncode, proc.stderr.read()

        content, exit_code, stderr = run_with_retry(_read_file, timeout=TOOL_TIMEOUT_SECONDS)

        if exit_code != 0:
            return {"success": False, "error": f"Failed to read file: {stderr}"}

        # Apply offset and limit
        if offset > 0:
            content = content[offset:]
        if limit and len(content) > limit:
            content = content[:limit]
            has_more = True
        else:
            has_more = False

        return {
            "success": True,
            "content": content,
            "path": path,
            "offset": offset,
            "limit": limit,
            "has_more": has_more,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def write_file(
    path: str,
    content: str,
    config: RunnableConfig,
) -> dict[str, Any]:
    """
    Create or overwrite a file with new content.

    Args:
        path: Path to the file (relative to /workspace or absolute)
        content: Content to write to the file
        config: RunnableConfig with session_id in configurable

    Returns:
        Dict with success status and metadata
    """
    sandbox_id = get_sandbox_id(config)
    session_id = get_session_id(config)
    allowed, reason = is_path_allowed(path)
    if not allowed:
        return {"success": False, "error": reason}

    try:
        sb = get_or_recreate_sandbox(sandbox_id)

        # Ensure absolute path
        if not path.startswith("/"):
            path = f"/workspace/{path}"

        # Wrap in timeout with retry to prevent hanging
        def _write_file():
            # Create parent directory
            parent = str(Path(path).parent)
            run_in_sandbox(sb, "mkdir", "-p", parent)

            # Write file using base64 to handle special characters safely
            encoded = base64.b64encode(content.encode()).decode()
            run_in_sandbox(sb, "bash", "-c", f"echo '{encoded}' | base64 -d > '{path}'")

        run_with_retry(_write_file, timeout=TOOL_TIMEOUT_SECONDS)

        # Emit code.write event for session replay
        emit_event_fire_and_forget(
            session_id=session_id,
            event_type="code.write",
            origin="AI",
            data={
                "filepath": path,
                "content": content[:100000],  # Limit content size for event store
                "bytesWritten": len(content.encode()),
            },
            file_path=path,
            checkpoint=True,  # File writes are checkpoint events for replay
        )

        return {
            "success": True,
            "path": path,
            "bytes_written": len(content.encode()),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def edit_file(
    path: str,
    old_string: str,
    new_string: str,
    config: RunnableConfig,
) -> dict[str, Any]:
    """
    Edit an existing file by replacing a specific section.

    The old_string must be unique in the file. If it appears multiple times,
    add more surrounding context to make it unique.

    Args:
        path: Path to the file (relative to /workspace or absolute)
        old_string: The exact string to replace (must be unique in the file)
        new_string: The new string to insert
        config: RunnableConfig with session_id in configurable

    Returns:
        Dict with success status and replacement count
    """
    sandbox_id = get_sandbox_id(config)
    session_id = get_session_id(config)
    allowed, reason = is_path_allowed(path)
    if not allowed:
        return {"success": False, "error": reason}

    try:
        sb = get_or_recreate_sandbox(sandbox_id)

        # Ensure absolute path
        if not path.startswith("/"):
            path = f"/workspace/{path}"

        # Read current content
        proc = run_in_sandbox(sb, "cat", path)
        content = proc.stdout.read()

        if proc.returncode != 0:
            return {"success": False, "error": f"File not found: {path}"}

        # Check uniqueness
        occurrences = content.count(old_string)
        if occurrences == 0:
            return {"success": False, "error": "String not found in file"}
        if occurrences > 1:
            return {"success": False, "error": f"String appears {occurrences} times. Add more context."}

        # Replace and write back
        new_content = content.replace(old_string, new_string, 1)
        encoded = base64.b64encode(new_content.encode()).decode()
        run_in_sandbox(sb, "bash", "-c", f"echo '{encoded}' | base64 -d > '{path}'")

        # Emit code.edit event for session replay
        emit_event_fire_and_forget(
            session_id=session_id,
            event_type="code.edit",
            origin="AI",
            data={
                "filepath": path,
                "oldString": old_string[:5000],  # Limit size for event store
                "newString": new_string[:5000],
                "newContent": new_content[:100000],  # Include full content for replay
            },
            file_path=path,
            checkpoint=True,  # File edits are checkpoint events for replay
        )

        return {
            "success": True,
            "path": path,
            "replacements": 1,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def _list_files_internal(
    sandbox_id: str,
    path: str,
    limit: int = 100,
) -> dict[str, Any]:
    """
    Internal implementation of list_files (called with timeout wrapper).

    IMPORTANT: Modal mounts /workspace as a symlink to /__modal/volumes/...
    We must use trailing slash (ls -la /workspace/) to list contents,
    otherwise ls shows the symlink itself instead of directory contents.
    """
    sb = get_or_recreate_sandbox(sandbox_id)

    # Normalize path - remove double slashes, trailing slashes
    normalized_path = re.sub(r'/+', '/', path).rstrip('/') or '/workspace'

    # Security: Only allow listing within /workspace
    if not normalized_path.startswith('/workspace'):
        return {"success": False, "error": "Path must be within /workspace", "files": []}

    # Block directory traversal attempts
    if '/../' in normalized_path or normalized_path.endswith('/..'):
        return {"success": False, "error": "Directory traversal not allowed", "files": []}

    # CRITICAL FIX: Use trailing slash to force following symlinks
    # Modal mounts volumes as symlinks (e.g., /workspace -> /__modal/volumes/...)
    # Without trailing slash, ls might show the symlink itself instead of contents
    target_path = f"{normalized_path}/"
    cmd = f"ls -la {target_path} 2>/dev/null"

    proc = run_in_sandbox(sb, "bash", "-c", cmd)
    stdout = proc.stdout.read()

    files = []
    for line in stdout.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("total"):
            continue

        # ls -la output: permissions links owner group size month day time name
        # Example: -rw-r--r-- 1 root root 1234 Dec 5 12:00 filename.txt
        # Symlinks: lrwxrwxrwx 1 root root 38 Dec 5 12:00 name -> target
        parts = line.split()
        if len(parts) >= 9:
            perms = parts[0]

            # Skip symlinks - they could point outside workspace and cause hangs
            if perms.startswith("l"):
                continue

            size = int(parts[4]) if parts[4].isdigit() else 0
            name = " ".join(parts[8:])

            # Handle any remaining " -> " in filename (symlink artifacts)
            if " -> " in name:
                name = name.split(" -> ")[0]

            if name not in [".", ".."]:
                file_path = f"{normalized_path}/{name}"

                # Double-check constructed path is still within workspace
                if not file_path.startswith('/workspace'):
                    continue

                files.append({
                    "name": name,
                    "path": file_path,
                    "type": "directory" if perms.startswith("d") else "file",
                    "size": size,
                })

    # Apply limit
    total_count = len(files)
    has_more = total_count > limit
    files = files[:limit]

    return {
        "success": True,
        "path": normalized_path,
        "files": files,
        "count": len(files),
        "total_count": total_count,
        "has_more": has_more,
    }


@tool
def list_files(
    config: RunnableConfig,
    path: str = "/workspace",
    limit: int = 100,
) -> dict[str, Any]:
    """
    List files and directories in a path.

    Note: This is non-recursive by design. Modal mounts /workspace as a symlink,
    and recursive operations (find) can hang when following symlinks.
    Use glob_files for pattern matching across directories.

    Args:
        config: RunnableConfig with session_id in configurable
        path: Directory path to list (default: /workspace)
        limit: Maximum number of files to return (default: 100).
            Set higher for directories with many files.

    Returns:
        Dict with list of files (name, path, type, size) and has_more indicator
    """
    sandbox_id = get_sandbox_id(config)
    try:
        # Use timeout wrapper to prevent hanging (matches TypeScript implementation)
        return run_with_timeout(
            _list_files_internal,
            sandbox_id,
            path,
            limit,
            timeout=TOOL_TIMEOUT_SECONDS,
        )
    except TimeoutError as e:
        return {"success": False, "error": str(e), "files": []}
    except Exception as e:
        return {"success": False, "error": str(e), "files": []}


@tool
def grep_files(
    pattern: str,
    config: RunnableConfig,
    path: str = "/workspace",
    limit: int = 100,
) -> dict[str, Any]:
    """
    Search for a pattern in files using regex.

    Args:
        pattern: Regular expression pattern to search for
        config: RunnableConfig with session_id in configurable
        path: Directory to search in (default: /workspace)
        limit: Maximum number of matches to return (default: 100).
            Set higher for broader searches.

    Returns:
        Dict with matches (file, line number, content)
    """
    sandbox_id = get_sandbox_id(config)
    try:
        # Validate regex
        try:
            re.compile(pattern)
        except re.error as e:
            return {"success": False, "error": f"Invalid regex: {e}", "matches": []}

        sb = get_or_recreate_sandbox(sandbox_id)

        # Escape pattern for shell
        safe_pattern = pattern.replace('"', '\\"').replace("'", "\\'")
        cmd = f'grep -rn "{safe_pattern}" {path} 2>/dev/null | head -{limit}'

        # Wrap in timeout with retry to prevent hanging
        def _grep():
            proc = run_in_sandbox(sb, "bash", "-c", cmd)
            return proc.stdout.read()

        stdout = run_with_retry(_grep, timeout=TOOL_TIMEOUT_SECONDS)

        matches = []
        for line in stdout.strip().split("\n"):
            if not line:
                continue
            # Parse grep output: file:line:content
            parts = line.split(":", 2)
            if len(parts) >= 3:
                matches.append({
                    "file": parts[0],
                    "line": int(parts[1]) if parts[1].isdigit() else 0,
                    "content": parts[2],
                })
            elif len(parts) == 2:
                matches.append({
                    "file": parts[0],
                    "line": 0,
                    "content": parts[1],
                })

        return {
            "success": True,
            "matches": matches,
            "count": len(matches),
        }
    except Exception as e:
        return {"success": False, "error": str(e), "matches": []}


@tool
def glob_files(
    pattern: str,
    config: RunnableConfig,
    limit: int = 100,
) -> dict[str, Any]:
    """
    Find files matching a glob pattern.

    Args:
        pattern: Glob pattern (e.g., "*.ts", "**/*.py", "src/**/*.js")
        config: RunnableConfig with session_id in configurable
        limit: Maximum number of files to return (default: 100).
            Set higher for broader searches.

    Returns:
        Dict with list of matching file paths
    """
    sandbox_id = get_sandbox_id(config)
    try:
        sb = get_or_recreate_sandbox(sandbox_id)

        # Convert glob to find pattern
        # Simple conversion for common patterns
        find_name = pattern.replace("**", "").replace("**/", "")
        cmd = f'find /workspace -name "{find_name}" -type f 2>/dev/null | head -{limit}'

        proc = run_in_sandbox(sb, "bash", "-c", cmd)
        stdout = proc.stdout.read()

        files = [f.strip() for f in stdout.strip().split("\n") if f.strip()]

        return {
            "success": True,
            "files": files,
            "count": len(files),
        }
    except Exception as e:
        return {"success": False, "error": str(e), "files": []}


# =============================================================================
# Execution Tools
# =============================================================================

@tool
def run_bash(
    command: str,
    config: RunnableConfig,
    working_dir: str = "/workspace",
    timeout: int = 120,
    output_limit: int = 1000,
) -> dict[str, Any]:
    """
    Run a bash command in the sandbox.

    This can run ANY command including:
    - Package installation: npm install, pip install, cargo add, go get
    - Build commands: npm run build, cargo build, go build
    - Test commands: npm test, pytest, go test
    - Server commands: npm start, python app.py
    - Any other bash command

    Args:
        command: Bash command to run
        config: RunnableConfig with session_id in configurable
        working_dir: Working directory (default: /workspace)
        timeout: Timeout in seconds (default: 120)
        output_limit: Max characters for stdout/stderr (default: 1000 ≈ 200 tokens).
            Set higher (e.g., 10000) for commands with large outputs like builds.

    Returns:
        Dict with stdout, stderr, exit code, and success status
    """
    sandbox_id = get_sandbox_id(config)
    session_id = get_session_id(config)
    allowed, reason = is_command_allowed(command)
    if not allowed:
        return {"success": False, "error": reason, "stdout": "", "stderr": "", "exit_code": 1}

    try:
        sb = get_or_recreate_sandbox(sandbox_id)

        # Build command with working directory
        full_cmd = f"cd {working_dir} 2>/dev/null || mkdir -p {working_dir} && cd {working_dir} && {command}"

        # Wrap in timeout with retry to prevent hanging
        def _run_bash():
            proc = run_in_sandbox(sb, "bash", "-c", full_cmd, timeout=min(timeout, 120))
            return proc.stdout.read(), proc.stderr.read(), proc.returncode

        stdout, stderr, exit_code = run_with_retry(_run_bash, timeout=min(timeout, 120))

        # Emit terminal.command event for session replay
        emit_event_fire_and_forget(
            session_id=session_id,
            event_type="terminal.command",
            origin="AI",
            data={
                "command": command,
                "workingDir": working_dir,
                "stdout": sanitize_output(stdout, max_size=5000),  # Truncate for event store
                "stderr": sanitize_output(stderr, max_size=2000),
                "exitCode": exit_code,
                "success": exit_code == 0,
            },
        )

        return {
            "success": exit_code == 0,
            "stdout": sanitize_output(stdout, max_size=output_limit),
            "stderr": sanitize_output(stderr, max_size=output_limit),
            "exit_code": exit_code,
        }
    except TimeoutError:
        # Emit timeout event
        emit_event_fire_and_forget(
            session_id=session_id,
            event_type="terminal.command",
            origin="AI",
            data={
                "command": command,
                "workingDir": working_dir,
                "error": f"Command timed out after {timeout}s",
                "exitCode": -1,
                "success": False,
            },
        )
        return {
            "success": False,
            "error": f"Command timed out after {timeout}s",
            "stdout": "",
            "stderr": "",
            "exit_code": -1,
        }
    except Exception as e:
        error_msg = str(e)
        # Emit error event
        emit_event_fire_and_forget(
            session_id=session_id,
            event_type="terminal.command",
            origin="AI",
            data={
                "command": command,
                "workingDir": working_dir,
                "error": error_msg,
                "exitCode": 1,
                "success": False,
            },
        )
        return {
            "success": False,
            "error": error_msg,
            "stdout": "",
            "stderr": error_msg,
            "exit_code": 1,
        }


@tool
def run_tests(
    test_cmd: str,
    config: RunnableConfig,
    working_dir: str = "/workspace",
    timeout: int = 180,
    output_limit: int = 2000,
) -> dict[str, Any]:
    """
    Run tests and return structured results.

    Args:
        test_cmd: Test command (e.g., "npm test", "pytest", "go test")
        config: RunnableConfig with session_id in configurable
        working_dir: Working directory (default: /workspace)
        timeout: Timeout in seconds (default: 180)
        output_limit: Max characters for stdout/stderr (default: 2000 ≈ 400 tokens).
            Set higher (e.g., 10000) for verbose test output.

    Returns:
        Dict with status, output, and test count
    """
    sandbox_id = get_sandbox_id(config)
    session_id = get_session_id(config)
    allowed, reason = is_command_allowed(test_cmd)
    if not allowed:
        return {"success": False, "error": reason, "passed": False}

    try:
        sb = get_or_recreate_sandbox(sandbox_id)

        # Build command with working directory
        full_cmd = f"cd {working_dir} 2>/dev/null || mkdir -p {working_dir} && cd {working_dir} && {test_cmd}"

        proc = run_in_sandbox(sb, "bash", "-c", full_cmd, timeout=min(timeout, 180))

        stdout = proc.stdout.read()
        stderr = proc.stderr.read()
        exit_code = proc.returncode

        # Simple parsing for common test runners (pytest, jest, etc.)
        passed_count = 0
        failed_count = 0
        total_count = 0

        # Pytest-like output
        if "== short test summary info ==" in stdout:
            passed_match = re.search(r"(\d+) passed", stdout)
            failed_match = re.search(r"(\d+) failed", stdout)
            if passed_match:
                passed_count = int(passed_match.group(1))
            if failed_match:
                failed_count = int(failed_match.group(1))
            total_count = passed_count + failed_count
        # Jest-like output
        elif "Test Suites:" in stdout:
            passed_match = re.search(r"(\d+) passed", stdout)
            failed_match = re.search(r"(\d+) failed", stdout)
            total_match = re.search(r"(\d+) total", stdout)
            if passed_match:
                passed_count = int(passed_match.group(1))
            if failed_match:
                failed_count = int(failed_match.group(1))
            if total_match:
                total_count = int(total_match.group(1))
        else:
            # Fallback: if exit code is 0, assume success
            if exit_code == 0:
                passed_count = 1
                total_count = 1
            else:
                failed_count = 1
                total_count = 1

        # Emit test.run_complete event for session replay
        emit_event_fire_and_forget(
            session_id=session_id,
            event_type="test.run_complete",
            origin="AI",
            data={
                "command": test_cmd,
                "workingDir": working_dir,
                "passed": passed_count,
                "failed": failed_count,
                "total": total_count,
                "exitCode": exit_code,
                "success": exit_code == 0 and failed_count == 0,
                "stdout": sanitize_output(stdout, max_size=5000),
                "stderr": sanitize_output(stderr, max_size=2000),
            },
            checkpoint=True,  # Test runs are checkpoint events
        )

        return {
            "success": exit_code == 0 and failed_count == 0,
            "stdout": sanitize_output(stdout, max_size=output_limit),
            "stderr": sanitize_output(stderr, max_size=output_limit),
            "exit_code": exit_code,
            "passed": passed_count,
            "failed": failed_count,
            "total": total_count,
        }
    except Exception as e:
        error_msg = str(e)
        is_timeout = "timeout" in error_msg.lower()

        # Emit test failure event
        emit_event_fire_and_forget(
            session_id=session_id,
            event_type="test.run_complete",
            origin="AI",
            data={
                "command": test_cmd,
                "workingDir": working_dir,
                "passed": 0,
                "failed": 0,
                "total": 0,
                "exitCode": -1 if is_timeout else 1,
                "success": False,
                "error": f"Command timed out after {timeout}s" if is_timeout else error_msg,
            },
            checkpoint=True,
        )

        if is_timeout:
            return {
                "success": False,
                "error": f"Command timed out after {timeout}s",
                "stdout": "",
                "stderr": "",
                "exit_code": -1,
                "passed": 0,
                "failed": 0,
                "total": 0,
            }
        return {
            "success": False,
            "error": error_msg,
            "stdout": "",
            "stderr": error_msg,
            "exit_code": 1,
            "passed": 0,
            "failed": 0,
            "total": 0,
        }


@tool
def install_packages(
    packages: list[str],
    config: RunnableConfig,
    manager: str = "npm",
    working_dir: str = "/workspace",
    output_limit: int = 1000,
) -> dict[str, Any]:
    """
    Install packages using npm, pip, go, or cargo.

    Args:
        packages: List of package names to install
        config: RunnableConfig with session_id in configurable
        manager: Package manager ("npm", "pip", "go", "cargo")
        working_dir: Working directory (default: /workspace)
        output_limit: Max characters for stdout/stderr (default: 1000 ≈ 200 tokens).
            Set higher (e.g., 5000) for verbose install logs.

    Returns:
        Dict with success status and output
    """
    sandbox_id = get_sandbox_id(config)
    if not packages:
        return {"success": True, "message": "No packages to install"}

    # Basic validation of package names (alphanumeric, -, _, @, /, .)
    for pkg in packages:
        if not re.match(r'^[a-zA-Z0-9_\-@/.]+$', pkg):
            return {"success": False, "error": f"Invalid package name: {pkg}"}

    try:
        sb = get_or_recreate_sandbox(sandbox_id)

        # Build install command
        if manager == "npm":
            cmd = f"npm install {' '.join(packages)}"
        elif manager == "pip":
            cmd = f"pip install {' '.join(packages)}"
        elif manager == "cargo":
            cmd = f"cargo add {' '.join(packages)}"
        elif manager == "go":
            cmd = f"go get {' '.join(packages)}"
        else:
            return {"success": False, "error": f"Unknown package manager: {manager}"}

        proc = run_in_sandbox(sb, "bash", "-c", f"cd {working_dir} && {cmd}", timeout=300) # Increased timeout for installs

        return {
            "success": proc.returncode == 0,
            "package_manager": manager,
            "packages": packages,
            "stdout": sanitize_output(proc.stdout.read(), max_size=output_limit),
            "stderr": sanitize_output(proc.stderr.read(), max_size=output_limit),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def get_environment_info(
    config: RunnableConfig,
) -> dict[str, Any]:
    """
    Get information about the environment (Node/Python versions, etc).

    Args:
        config: RunnableConfig with session_id in configurable

    Returns:
        Dict with version info
    """
    sandbox_id = get_sandbox_id(config)
    try:
        sb = get_or_recreate_sandbox(sandbox_id)

        env_info = {}
        version_checks = [
            ("python", "python3 --version"),
            ("node", "node --version"),
            ("npm", "npm --version"),
            ("go", "go version"),
            ("rust", "rustc --version"),
            ("cargo", "cargo --version"),
            ("yarn", "yarn --version"),
            ("pnpm", "pnpm --version"),
            ("typescript", "tsc --version"),
        ]

        for name, cmd in version_checks:
            try:
                proc = run_in_sandbox(sb, "bash", "-c", cmd)
                if proc.returncode == 0:
                    env_info[name] = proc.stdout.read().strip()
            except Exception:
                pass

        return {
            "success": True,
            "environment": env_info,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# =============================================================================
# Tool Lists by Helpfulness Level
# =============================================================================

# All available coding tools
ALL_CODING_TOOLS = [
    ask_question,  # Question-first approach - available in all modes
    read_file,
    write_file,
    edit_file,
    list_files,
    grep_files,
    glob_files,
    run_bash,
    run_tests,
    install_packages,
    get_environment_info,
]

# Tools by helpfulness level
# Note: ask_question is included in ALL levels to support question-first approach
CONSULTANT_TOOLS = [ask_question, read_file, list_files, grep_files, glob_files, get_environment_info]
PAIR_PROGRAMMING_TOOLS = [
    ask_question, read_file, write_file, edit_file, list_files, grep_files, glob_files,
    run_bash, run_tests, install_packages, get_environment_info,
]
FULL_COPILOT_TOOLS = ALL_CODING_TOOLS

CODING_TOOLS = {
    "consultant": CONSULTANT_TOOLS,
    "pair-programming": PAIR_PROGRAMMING_TOOLS,
    "full-copilot": FULL_COPILOT_TOOLS,
}
