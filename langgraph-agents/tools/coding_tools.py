"""
Coding tools for the LangGraph Coding Agent.

Uses Modal Sandbox SDK directly for true process isolation per session.
Each candidate gets their own isolated container where they can:
- Install any packages (npm, pip, cargo, go get, etc.)
- Use any language (Python, Node, Go, Rust, etc.)
- Use any framework (React, Django, Rails, Spring, etc.)

SandboxManager has been extracted to services/modal_manager.py for better modularity.
"""

import re
import base64
import logging
import asyncio
from typing import Any, List
from pathlib import Path
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig

# Import SandboxManager and helpers from services
from services import (
    SandboxManager,
    run_in_sandbox,
    run_with_timeout,
    MODAL_AVAILABLE,
)

logger = logging.getLogger(__name__)

# Timeout for tool operations (matches TypeScript implementation)
TOOL_TIMEOUT_SECONDS = 30

# Global sandbox manager instance
sandbox_mgr = SandboxManager


# =============================================================================
# Security Helpers (DB-backed, no fallbacks)
# =============================================================================

# =============================================================================
# Config Service Integration
# =============================================================================

_config_service = None
_cached_blocked_patterns: List[str] = None
_cached_workspace_restrictions: List[str] = None


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
        logger.warning(f"Failed to run async config call: {e}")
        return None


def get_blocked_patterns_sync() -> List[str]:
    """Get blocked command patterns from DB. Raises error if not available."""
    global _cached_blocked_patterns
    if _cached_blocked_patterns is not None:
        return _cached_blocked_patterns

    config_service = _get_config_service()
    if not config_service:
        raise RuntimeError("Config service not available. Please ensure database is properly configured.")

    patterns = _run_async(config_service.get_blocked_patterns())
    if patterns:
        _cached_blocked_patterns = patterns
        logger.debug(f"Using DB blocked patterns: {len(patterns)} patterns")
        return patterns

    raise RuntimeError("Blocked patterns not found in database. Please run database seeds.")


def get_workspace_restrictions_sync() -> List[str]:
    """Get workspace path restrictions from DB. Raises error if not available."""
    global _cached_workspace_restrictions
    if _cached_workspace_restrictions is not None:
        return _cached_workspace_restrictions

    config_service = _get_config_service()
    if not config_service:
        raise RuntimeError("Config service not available. Please ensure database is properly configured.")

    restrictions = _run_async(config_service.get_security_config("workspace_restrictions"))
    if restrictions and isinstance(restrictions, dict):
        # workspace_restrictions is a dict with blockedPaths array
        blocked_paths = restrictions.get("blockedPaths", [])
        if blocked_paths:
            _cached_workspace_restrictions = blocked_paths
            logger.debug(f"Using DB workspace restrictions: {len(blocked_paths)} paths")
            return blocked_paths

    raise RuntimeError("Workspace restrictions not found in database. Please run database seeds.")


def is_command_allowed(command: str) -> tuple[bool, str]:
    """Check if a bash command is allowed using DB-backed patterns."""
    command_lower = command.lower()
    blocked_patterns = get_blocked_patterns_sync()

    for pattern in blocked_patterns:
        # Try regex match first (DB stores regex patterns)
        try:
            if re.search(pattern, command_lower, re.IGNORECASE):
                return False, f"Command blocked by security policy"
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


def sanitize_output(text: str, max_size: int = 50000) -> str:
    """Truncate output if too large."""
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
    file_path: str,
    config: RunnableConfig,
    offset: int = 0,
    limit: int = 10000,
) -> dict[str, Any]:
    """
    Read the contents of a file from the workspace.

    For large files, use offset and limit to read specific portions.

    Args:
        file_path: Path to the file (relative to /workspace or absolute)
        config: RunnableConfig with session_id in configurable
        offset: Character offset to start reading from (default: 0)
        limit: Maximum number of characters to read (default: 10000)

    Returns:
        Dict with success status, content, and metadata
    """
    sandbox_id = get_sandbox_id(config)
    allowed, reason = is_path_allowed(file_path)
    if not allowed:
        return {"success": False, "error": reason}

    try:
        sb = sandbox_mgr.get_sandbox(sandbox_id)

        # Ensure absolute path
        if not file_path.startswith("/"):
            file_path = f"/workspace/{file_path}"

        proc = run_in_sandbox(sb, "cat", file_path)
        content = proc.stdout.read()
        exit_code = proc.returncode

        if exit_code != 0:
            stderr = proc.stderr.read()
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
            "path": file_path,
            "offset": offset,
            "limit": limit,
            "has_more": has_more,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def write_file(
    file_path: str,
    content: str,
    config: RunnableConfig,
) -> dict[str, Any]:
    """
    Create or overwrite a file with new content.

    Args:
        file_path: Path to the file (relative to /workspace or absolute)
        content: Content to write to the file
        config: RunnableConfig with session_id in configurable

    Returns:
        Dict with success status and metadata
    """
    sandbox_id = get_sandbox_id(config)
    allowed, reason = is_path_allowed(file_path)
    if not allowed:
        return {"success": False, "error": reason}

    try:
        sb = sandbox_mgr.get_sandbox(sandbox_id)

        # Ensure absolute path
        if not file_path.startswith("/"):
            file_path = f"/workspace/{file_path}"

        # Create parent directory
        parent = str(Path(file_path).parent)
        run_in_sandbox(sb, "mkdir", "-p", parent)

        # Write file using base64 to handle special characters safely
        encoded = base64.b64encode(content.encode()).decode()
        run_in_sandbox(sb, "bash", "-c", f"echo '{encoded}' | base64 -d > '{file_path}'")

        return {
            "success": True,
            "path": file_path,
            "bytes_written": len(content.encode()),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def edit_file(
    file_path: str,
    old_string: str,
    new_string: str,
    config: RunnableConfig,
) -> dict[str, Any]:
    """
    Edit an existing file by replacing a specific section.

    The old_string must be unique in the file. If it appears multiple times,
    add more surrounding context to make it unique.

    Args:
        file_path: Path to the file (relative to /workspace or absolute)
        old_string: The exact string to replace (must be unique in the file)
        new_string: The new string to insert
        config: RunnableConfig with session_id in configurable

    Returns:
        Dict with success status and replacement count
    """
    sandbox_id = get_sandbox_id(config)
    allowed, reason = is_path_allowed(file_path)
    if not allowed:
        return {"success": False, "error": reason}

    try:
        sb = sandbox_mgr.get_sandbox(sandbox_id)

        # Ensure absolute path
        if not file_path.startswith("/"):
            file_path = f"/workspace/{file_path}"

        # Read current content
        proc = run_in_sandbox(sb, "cat", file_path)
        content = proc.stdout.read()

        if proc.returncode != 0:
            return {"success": False, "error": f"File not found: {file_path}"}

        # Check uniqueness
        occurrences = content.count(old_string)
        if occurrences == 0:
            return {"success": False, "error": f"String not found in file"}
        if occurrences > 1:
            return {"success": False, "error": f"String appears {occurrences} times. Add more context."}

        # Replace and write back
        new_content = content.replace(old_string, new_string, 1)
        encoded = base64.b64encode(new_content.encode()).decode()
        run_in_sandbox(sb, "bash", "-c", f"echo '{encoded}' | base64 -d > '{file_path}'")

        return {
            "success": True,
            "path": file_path,
            "replacements": 1,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def _list_files_internal(
    sandbox_id: str,
    path: str,
) -> dict[str, Any]:
    """
    Internal implementation of list_files (called with timeout wrapper).

    IMPORTANT: Modal mounts /workspace as a symlink to /__modal/volumes/...
    We must use trailing slash (ls -la /workspace/) to list contents,
    otherwise ls shows the symlink itself instead of directory contents.
    """
    sb = sandbox_mgr.get_sandbox(sandbox_id)

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

    return {
        "success": True,
        "path": normalized_path,
        "files": files,
        "count": len(files),
    }


@tool
def list_files(
    config: RunnableConfig,
    path: str = "/workspace",
) -> dict[str, Any]:
    """
    List files and directories in a path.

    Note: This is non-recursive by design. Modal mounts /workspace as a symlink,
    and recursive operations (find) can hang when following symlinks.
    Use glob_files for pattern matching across directories.

    Args:
        config: RunnableConfig with session_id in configurable
        path: Directory path to list (default: /workspace)

    Returns:
        Dict with list of files (name, path, type, size)
    """
    sandbox_id = get_sandbox_id(config)
    try:
        # Use timeout wrapper to prevent hanging (matches TypeScript implementation)
        return run_with_timeout(
            _list_files_internal,
            sandbox_id,
            path,
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
) -> dict[str, Any]:
    """
    Search for a pattern in files using regex.

    Args:
        pattern: Regular expression pattern to search for
        config: RunnableConfig with session_id in configurable
        path: Directory to search in (default: /workspace)

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

        sb = sandbox_mgr.get_sandbox(sandbox_id)

        # Escape pattern for shell
        safe_pattern = pattern.replace('"', '\\"').replace("'", "\\'")
        cmd = f'grep -rn "{safe_pattern}" {path} 2>/dev/null | head -100'

        proc = run_in_sandbox(sb, "bash", "-c", cmd)
        stdout = proc.stdout.read()

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
) -> dict[str, Any]:
    """
    Find files matching a glob pattern.

    Args:
        pattern: Glob pattern (e.g., "*.ts", "**/*.py", "src/**/*.js")
        config: RunnableConfig with session_id in configurable

    Returns:
        Dict with list of matching file paths
    """
    sandbox_id = get_sandbox_id(config)
    try:
        sb = sandbox_mgr.get_sandbox(sandbox_id)

        # Convert glob to find pattern
        # Simple conversion for common patterns
        find_name = pattern.replace("**", "").replace("**/", "")
        cmd = f'find /workspace -name "{find_name}" -type f 2>/dev/null | head -100'

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

    Returns:
        Dict with stdout, stderr, exit code, and success status
    """
    sandbox_id = get_sandbox_id(config)
    allowed, reason = is_command_allowed(command)
    if not allowed:
        return {"success": False, "error": reason, "stdout": "", "stderr": "", "exit_code": 1}

    try:
        sb = sandbox_mgr.get_sandbox(sandbox_id)

        # Build command with working directory
        full_cmd = f"cd {working_dir} 2>/dev/null || mkdir -p {working_dir} && cd {working_dir} && {command}"

        proc = run_in_sandbox(sb, "bash", "-c", full_cmd, timeout=min(timeout, 120))

        stdout = proc.stdout.read()
        stderr = proc.stderr.read()
        exit_code = proc.returncode

        return {
            "success": exit_code == 0,
            "stdout": sanitize_output(stdout),
            "stderr": sanitize_output(stderr),
            "exit_code": exit_code,
        }
    except Exception as e:
        error_msg = str(e)
        if "timeout" in error_msg.lower():
            return {
                "success": False,
                "error": f"Command timed out after {timeout}s",
                "stdout": "",
                "stderr": "",
                "exit_code": -1,
            }
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
) -> dict[str, Any]:
    """
    Run tests and return structured results.

    Args:
        test_cmd: Test command (e.g., "npm test", "pytest", "go test")
        config: RunnableConfig with session_id in configurable
        working_dir: Working directory (default: /workspace)
        timeout: Timeout in seconds (default: 180)

    Returns:
        Dict with status, output, and test count
    """
    sandbox_id = get_sandbox_id(config)
    allowed, reason = is_command_allowed(test_cmd)
    if not allowed:
        return {"success": False, "error": reason, "passed": False}

    try:
        sb = sandbox_mgr.get_sandbox(sandbox_id)

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

        return {
            "success": exit_code == 0 and failed_count == 0,
            "stdout": sanitize_output(stdout),
            "stderr": sanitize_output(stderr),
            "exit_code": exit_code,
            "passed": passed_count,
            "failed": failed_count,
            "total": total_count,
        }
    except Exception as e:
        error_msg = str(e)
        if "timeout" in error_msg.lower():
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
) -> dict[str, Any]:
    """
    Install packages using npm, pip, go, or cargo.

    Args:
        packages: List of package names to install
        config: RunnableConfig with session_id in configurable
        manager: Package manager ("npm", "pip", "go", "cargo")
        working_dir: Working directory (default: /workspace)

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
        sb = sandbox_mgr.get_sandbox(sandbox_id)

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
            "stdout": sanitize_output(proc.stdout.read()),
            "stderr": sanitize_output(proc.stderr.read()),
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
        sb = sandbox_mgr.get_sandbox(sandbox_id)

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
CONSULTANT_TOOLS = [read_file, list_files, grep_files, glob_files, get_environment_info]
PAIR_PROGRAMMING_TOOLS = [
    read_file, write_file, edit_file, list_files, grep_files, glob_files,
    run_bash, run_tests, install_packages, get_environment_info,
]
FULL_COPILOT_TOOLS = ALL_CODING_TOOLS

CODING_TOOLS = {
    "consultant": CONSULTANT_TOOLS,
    "pair-programming": PAIR_PROGRAMMING_TOOLS,
    "full-copilot": FULL_COPILOT_TOOLS,
}
