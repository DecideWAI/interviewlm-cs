"""
Coding tools for the LangGraph Coding Agent.

Uses Modal Sandbox SDK directly for true process isolation per session.
Each candidate gets their own isolated container where they can:
- Install any packages (npm, pip, cargo, go get, etc.)
- Use any language (Python, Node, Go, Rust, etc.)
- Use any framework (React, Django, Rails, Spring, etc.)
"""

import re
import os
import base64
import asyncio
from typing import Any, Optional
from pathlib import Path
from langchain_core.tools import tool

# Modal SDK - import at module level for efficiency
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

from ..config import settings


# =============================================================================
# Sandbox Session Manager
# =============================================================================

class SandboxManager:
    """
    Manages Modal Sandbox sessions per candidate.

    Each session gets an isolated container with:
    - 2 CPU cores
    - 2GB RAM
    - 1 hour timeout
    - Persistent filesystem within session
    - Pre-installed: Python 3.11, Node 20, Go 1.21, Rust

    Sandbox IDs are persisted to database to survive process restarts.
    Priority: 1) In-memory cache, 2) Reconnect from DB, 3) Create new
    """

    _sandboxes: dict[str, "modal.Sandbox"] = {}
    _sandbox_ids: dict[str, str] = {}  # session_id -> sandbox_id mapping
    _app: Optional["modal.App"] = None
    _image: Optional["modal.Image"] = None

    @classmethod
    def _get_app(cls) -> "modal.App":
        """Get or create the Modal app."""
        if cls._app is None:
            cls._app = modal.App.lookup("interviewlm-executor", create_if_missing=True)
        return cls._app

    @classmethod
    def _get_image(cls) -> "modal.Image":
        """Get the sandbox image with all languages/tools."""
        if cls._image is None:
            cls._image = (
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
        return cls._image

    @classmethod
    async def _get_sandbox_id_from_db(cls, session_id: str) -> Optional[str]:
        """Get sandbox ID from database (volumeId field on candidates table)."""
        if not ASYNCPG_AVAILABLE:
            return None
        try:
            conn = await asyncpg.connect(settings.database_url)
            try:
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
    async def _save_sandbox_id_to_db(cls, session_id: str, sandbox_id: str) -> None:
        """Persist sandbox ID to database for reconnection after restart."""
        if not ASYNCPG_AVAILABLE:
            return
        try:
            conn = await asyncpg.connect(settings.database_url)
            try:
                await conn.execute(
                    'UPDATE candidates SET volume_id = $1, updated_at = NOW() WHERE id = $2',
                    sandbox_id, session_id
                )
                print(f"[SandboxManager] Persisted sandbox {sandbox_id} to DB for session {session_id}")
            finally:
                await conn.close()
        except Exception as e:
            print(f"[SandboxManager] Failed to persist sandbox ID to DB: {e}")

    @classmethod
    async def _clear_sandbox_id_from_db(cls, session_id: str) -> None:
        """Clear sandbox ID from database when sandbox is terminated."""
        if not ASYNCPG_AVAILABLE:
            return
        try:
            conn = await asyncpg.connect(settings.database_url)
            try:
                await conn.execute(
                    'UPDATE candidates SET volume_id = NULL, updated_at = NOW() WHERE id = $1',
                    session_id
                )
            finally:
                await conn.close()
        except Exception:
            pass  # Non-critical

    @classmethod
    def _reconnect_to_sandbox(cls, sandbox_id: str) -> Optional["modal.Sandbox"]:
        """Try to reconnect to an existing sandbox by ID."""
        try:
            # Modal Python SDK method to get sandbox by ID
            sandbox = modal.Sandbox.from_id(sandbox_id)

            # Verify sandbox is still alive
            proc = run_in_sandbox(sandbox, "echo", "alive")
            if proc.returncode == 0:
                print(f"[SandboxManager] Reconnected to existing sandbox {sandbox_id}")
                return sandbox
            return None
        except Exception as e:
            print(f"[SandboxManager] Failed to reconnect to sandbox {sandbox_id}: {e}")
            return None

    @classmethod
    def _create_new_sandbox(cls, session_id: str) -> "modal.Sandbox":
        """Create a new sandbox for a session."""
        sandbox = modal.Sandbox.create(
            app=cls._get_app(),
            image=cls._get_image(),
            timeout=3600,  # 1 hour
            workdir="/workspace",
            cpu=2.0,
            memory=2048,  # 2GB
        )
        # Initialize workspace
        run_in_sandbox(sandbox, "mkdir", "-p", "/workspace")

        # Get sandbox ID and persist
        sandbox_id = sandbox.object_id
        cls._sandbox_ids[session_id] = sandbox_id

        # Persist to database (async, but we'll wait for it)
        try:
            asyncio.get_event_loop().run_until_complete(
                cls._save_sandbox_id_to_db(session_id, sandbox_id)
            )
        except RuntimeError:
            # No event loop running, create one
            asyncio.run(cls._save_sandbox_id_to_db(session_id, sandbox_id))

        print(f"[SandboxManager] Created new sandbox {sandbox_id} for session {session_id}")
        return sandbox

    @classmethod
    def get_sandbox(cls, session_id: str) -> "modal.Sandbox":
        """
        Get or create a sandbox for a session.

        Priority:
        1. Return from in-memory cache (fastest)
        2. Reconnect to existing sandbox from database (survives restart)
        3. Create new sandbox (fallback)

        Args:
            session_id: Unique session identifier

        Returns:
            Modal Sandbox instance
        """
        if not MODAL_AVAILABLE:
            raise RuntimeError("Modal SDK not available. Install with: pip install modal")

        # 1. Check in-memory cache first
        if session_id in cls._sandboxes:
            print(f"[SandboxManager] Using cached sandbox for session {session_id}")
            return cls._sandboxes[session_id]

        # 2. Try to reconnect from database
        try:
            # Get sandbox ID from DB
            try:
                sandbox_id = asyncio.get_event_loop().run_until_complete(
                    cls._get_sandbox_id_from_db(session_id)
                )
            except RuntimeError:
                sandbox_id = asyncio.run(cls._get_sandbox_id_from_db(session_id))

            if sandbox_id:
                sandbox = cls._reconnect_to_sandbox(sandbox_id)
                if sandbox:
                    cls._sandboxes[session_id] = sandbox
                    cls._sandbox_ids[session_id] = sandbox_id
                    return sandbox
                else:
                    # Sandbox no longer exists, clear stale ID
                    print(f"[SandboxManager] Clearing stale sandbox ID {sandbox_id}")
        except Exception as e:
            print(f"[SandboxManager] Error checking DB for sandbox: {e}")

        # 3. Create new sandbox
        sandbox = cls._create_new_sandbox(session_id)
        cls._sandboxes[session_id] = sandbox
        return sandbox

    @classmethod
    def terminate_sandbox(cls, session_id: str) -> bool:
        """Terminate a sandbox session and clear from database."""
        if session_id in cls._sandboxes:
            try:
                cls._sandboxes[session_id].terminate()
                del cls._sandboxes[session_id]
                if session_id in cls._sandbox_ids:
                    del cls._sandbox_ids[session_id]

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


def run_in_sandbox(sandbox, *args, **kwargs):
    """
    Run a command in a Modal Sandbox.
    This is a wrapper around Modal's sandbox execution method.

    Args:
        sandbox: Modal Sandbox instance
        *args: Command arguments (e.g., "bash", "-c", "ls")
        **kwargs: Additional options (e.g., timeout=60)

    Returns:
        Process result with stdout, stderr, returncode
    """
    # Use getattr to call the method dynamically, avoiding static analysis issues
    execute_method = getattr(sandbox, "exec")
    return execute_method(*args, **kwargs)


# Global sandbox manager
sandbox_mgr = SandboxManager()


# =============================================================================
# Security Helpers
# =============================================================================

BLOCKED_COMMANDS = [
    "rm -rf /",
    "rm -rf /*",
    "mkfs",
    "dd if=",
    ":(){:|:&};:",  # Fork bomb
    "chmod 777 /",
    "shutdown",
    "reboot",
    "halt",
    "init 0",
    "init 6",
]

BLOCKED_PATHS = [
    "/etc/passwd",
    "/etc/shadow",
    "/etc/sudoers",
    "/root/.ssh",
    "~/.ssh",
    ".env",
    "credentials",
    "secrets",
]


def is_command_allowed(command: str) -> tuple[bool, str]:
    """Check if a bash command is allowed."""
    command_lower = command.lower()
    for blocked in BLOCKED_COMMANDS:
        if blocked.lower() in command_lower:
            return False, f"Command contains blocked pattern: {blocked}"
    return True, ""


def is_path_allowed(path: str) -> tuple[bool, str]:
    """Check if a file path is allowed."""
    normalized = path.replace("\\", "/")
    for blocked in BLOCKED_PATHS:
        if blocked in normalized:
            return False, f"Path contains blocked pattern: {blocked}"
    return True, ""


def sanitize_output(text: str, max_size: int = 50000) -> str:
    """Truncate output if too large."""
    if len(text) > max_size:
        return text[:max_size] + f"\n\n... (truncated, {len(text) - max_size} bytes remaining)"
    return text


# =============================================================================
# File Operation Tools
# =============================================================================

@tool
def read_file(
    file_path: str,
    session_id: str,
    offset: int = 0,
    limit: int = 10000,
) -> dict[str, Any]:
    """
    Read the contents of a file from the workspace.

    For large files, use offset and limit to read specific portions.

    Args:
        file_path: Path to the file (relative to /workspace or absolute)
        session_id: Session ID for sandbox access
        offset: Character offset to start reading from (default: 0)
        limit: Maximum number of characters to read (default: 10000)

    Returns:
        Dict with success status, content, and metadata
    """
    allowed, reason = is_path_allowed(file_path)
    if not allowed:
        return {"success": False, "error": reason}

    try:
        sb = sandbox_mgr.get_sandbox(session_id)

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
    session_id: str,
) -> dict[str, Any]:
    """
    Create or overwrite a file with new content.

    Args:
        file_path: Path to the file (relative to /workspace or absolute)
        content: Content to write to the file
        session_id: Session ID for sandbox access

    Returns:
        Dict with success status and metadata
    """
    allowed, reason = is_path_allowed(file_path)
    if not allowed:
        return {"success": False, "error": reason}

    try:
        sb = sandbox_mgr.get_sandbox(session_id)

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
    session_id: str,
) -> dict[str, Any]:
    """
    Edit an existing file by replacing a specific section.

    The old_string must be unique in the file. If it appears multiple times,
    add more surrounding context to make it unique.

    Args:
        file_path: Path to the file (relative to /workspace or absolute)
        old_string: The exact string to replace (must be unique in the file)
        new_string: The new string to insert
        session_id: Session ID for sandbox access

    Returns:
        Dict with success status and replacement count
    """
    allowed, reason = is_path_allowed(file_path)
    if not allowed:
        return {"success": False, "error": reason}

    try:
        sb = sandbox_mgr.get_sandbox(session_id)

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


@tool
def list_files(
    session_id: str,
    path: str = "/workspace",
    recursive: bool = False,
) -> dict[str, Any]:
    """
    List files and directories in a path.

    Args:
        session_id: Session ID for sandbox access
        path: Directory path to list (default: /workspace)
        recursive: Whether to list recursively (default: False)

    Returns:
        Dict with list of files (name, path, type, size)
    """
    try:
        sb = sandbox_mgr.get_sandbox(session_id)

        if recursive:
            cmd = f"find {path} -maxdepth 5 2>/dev/null | head -200"
        else:
            cmd = f"ls -la {path} 2>/dev/null"

        proc = run_in_sandbox(sb, "bash", "-c", cmd)
        stdout = proc.stdout.read()

        files = []
        for line in stdout.strip().split("\n"):
            line = line.strip()
            if not line or line.startswith("total"):
                continue

            if recursive:
                # find output - just paths
                name = Path(line).name
                if name:
                    files.append({
                        "name": name,
                        "path": line,
                        "type": "file",  # Can't determine type from find
                    })
            else:
                # ls -la output
                parts = line.split()
                if len(parts) >= 9:
                    perms = parts[0]
                    size = int(parts[4]) if parts[4].isdigit() else 0
                    name = " ".join(parts[8:])
                    if name not in [".", ".."]:
                        files.append({
                            "name": name,
                            "path": f"{path}/{name}",
                            "type": "directory" if perms.startswith("d") else "file",
                            "size": size,
                        })

        return {
            "success": True,
            "path": path,
            "files": files,
            "count": len(files),
        }
    except Exception as e:
        return {"success": False, "error": str(e), "files": []}


@tool
def grep_files(
    pattern: str,
    session_id: str,
    path: str = "/workspace",
) -> dict[str, Any]:
    """
    Search for a pattern in files using regex.

    Args:
        pattern: Regular expression pattern to search for
        session_id: Session ID for sandbox access
        path: Directory to search in (default: /workspace)

    Returns:
        Dict with matches (file, line number, content)
    """
    try:
        # Validate regex
        try:
            re.compile(pattern)
        except re.error as e:
            return {"success": False, "error": f"Invalid regex: {e}", "matches": []}

        sb = sandbox_mgr.get_sandbox(session_id)

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
    session_id: str,
) -> dict[str, Any]:
    """
    Find files matching a glob pattern.

    Args:
        pattern: Glob pattern (e.g., "*.ts", "**/*.py", "src/**/*.js")
        session_id: Session ID for sandbox access

    Returns:
        Dict with list of matching file paths
    """
    try:
        sb = sandbox_mgr.get_sandbox(session_id)

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
    session_id: str,
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
        session_id: Session ID for sandbox access
        working_dir: Working directory (default: /workspace)
        timeout: Timeout in seconds (default: 120)

    Returns:
        Dict with stdout, stderr, exit code, and success status
    """
    allowed, reason = is_command_allowed(command)
    if not allowed:
        return {"success": False, "error": reason, "stdout": "", "stderr": "", "exit_code": 1}

    try:
        sb = sandbox_mgr.get_sandbox(session_id)

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
    session_id: str,
    test_command: str = "",
) -> dict[str, Any]:
    """
    Run the test suite for the current project.

    Automatically detects project type (npm/pytest/go/cargo) and runs tests.
    You can also specify a custom test command.

    Args:
        session_id: Session ID for sandbox access
        test_command: Optional custom test command (auto-detects if empty)

    Returns:
        Dict with test results (passed, failed, total, output)
    """
    try:
        sb = sandbox_mgr.get_sandbox(session_id)

        # Auto-detect test command if not provided
        if not test_command:
            # Check for package.json (Node.js)
            proc = run_in_sandbox(sb, "bash", "-c", "cat /workspace/package.json 2>/dev/null")
            if proc.returncode == 0:
                pkg = proc.stdout.read()
                if '"test"' in pkg:
                    test_command = "npm test 2>&1"
                elif "jest" in pkg.lower():
                    test_command = "npx jest 2>&1"

            # Check for pytest
            if not test_command:
                proc = run_in_sandbox(sb, "bash", "-c", "ls /workspace/*.py /workspace/tests/*.py 2>/dev/null")
                if proc.returncode == 0:
                    test_command = "python -m pytest --tb=short -v 2>&1"

            # Check for Go
            if not test_command:
                proc = run_in_sandbox(sb, "bash", "-c", "ls /workspace/go.mod 2>/dev/null")
                if proc.returncode == 0:
                    test_command = "go test -v ./... 2>&1"

            # Check for Cargo (Rust)
            if not test_command:
                proc = run_in_sandbox(sb, "bash", "-c", "ls /workspace/Cargo.toml 2>/dev/null")
                if proc.returncode == 0:
                    test_command = "cargo test 2>&1"

            # Default fallback
            if not test_command:
                test_command = "python -m pytest --tb=short -v 2>&1 || npm test 2>&1"

        # Run tests
        proc = run_in_sandbox(sb, "bash", "-c", f"cd /workspace && {test_command}", timeout=120)

        stdout = proc.stdout.read()
        stderr = proc.stderr.read()
        exit_code = proc.returncode

        # Parse test results
        passed = 0
        failed = 0
        test_results = []

        # Try to parse pytest-style output
        for line in stdout.split("\n"):
            line = line.strip()
            if " PASSED" in line:
                test_name = line.split(" PASSED")[0].strip()
                test_results.append({"name": test_name, "passed": True})
                passed += 1
            elif " FAILED" in line:
                test_name = line.split(" FAILED")[0].strip()
                test_results.append({"name": test_name, "passed": False})
                failed += 1

        # Look for summary lines
        if not test_results:
            import re
            # pytest summary
            match = re.search(r"(\d+) passed", stdout)
            if match:
                passed = int(match.group(1))
            match = re.search(r"(\d+) failed", stdout)
            if match:
                failed = int(match.group(1))

        return {
            "success": exit_code == 0 and failed == 0,
            "passed": passed,
            "failed": failed,
            "total": passed + failed,
            "test_results": test_results,
            "stdout": sanitize_output(stdout),
            "stderr": sanitize_output(stderr),
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "passed": 0,
            "failed": 0,
            "total": 0,
            "test_results": [],
        }


@tool
def install_packages(
    packages: str,
    session_id: str,
    package_manager: str = "auto",
) -> dict[str, Any]:
    """
    Install packages in the sandbox.

    Args:
        packages: Space-separated list of packages to install
        session_id: Session ID for sandbox access
        package_manager: Package manager to use (npm, pip, cargo, go, or auto)

    Returns:
        Dict with installation result
    """
    try:
        sb = sandbox_mgr.get_sandbox(session_id)

        # Auto-detect package manager
        if package_manager == "auto":
            proc = run_in_sandbox(sb, "bash", "-c", "ls /workspace/package.json 2>/dev/null")
            if proc.returncode == 0:
                package_manager = "npm"
            else:
                proc = run_in_sandbox(sb, "bash", "-c", "ls /workspace/requirements.txt 2>/dev/null")
                if proc.returncode == 0:
                    package_manager = "pip"
                else:
                    proc = run_in_sandbox(sb, "bash", "-c", "ls /workspace/Cargo.toml 2>/dev/null")
                    if proc.returncode == 0:
                        package_manager = "cargo"
                    else:
                        proc = run_in_sandbox(sb, "bash", "-c", "ls /workspace/go.mod 2>/dev/null")
                        if proc.returncode == 0:
                            package_manager = "go"
                        else:
                            package_manager = "npm"  # Default to npm

        # Build install command
        if package_manager == "npm":
            cmd = f"npm install {packages}"
        elif package_manager == "pip":
            cmd = f"pip install {packages}"
        elif package_manager == "cargo":
            cmd = f"cargo add {packages}"
        elif package_manager == "go":
            cmd = f"go get {packages}"
        else:
            return {"success": False, "error": f"Unknown package manager: {package_manager}"}

        proc = run_in_sandbox(sb, "bash", "-c", f"cd /workspace && {cmd}", timeout=120)

        return {
            "success": proc.returncode == 0,
            "package_manager": package_manager,
            "packages": packages,
            "stdout": sanitize_output(proc.stdout.read()),
            "stderr": sanitize_output(proc.stderr.read()),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def get_environment_info(session_id: str) -> dict[str, Any]:
    """
    Get information about the sandbox environment.

    Args:
        session_id: Session ID for sandbox access

    Returns:
        Dict with installed language/tool versions
    """
    try:
        sb = sandbox_mgr.get_sandbox(session_id)

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
