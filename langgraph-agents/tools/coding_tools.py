"""
Coding tools for the LangGraph Coding Agent.

These tools provide file operations, code execution, and debugging assistance
for candidates during interviews.
"""

import re
import asyncio
from typing import Any
from langchain_core.tools import tool


# =============================================================================
# Security Helpers
# =============================================================================

BLOCKED_COMMANDS = [
    "rm -rf /",
    "rm -rf /*",
    "mkfs",
    "dd if=",
    ":(){:|:&};:",  # Fork bomb
    "wget",
    "curl",
    "nc ",
    "netcat",
    "ssh",
    "scp",
    "telnet",
    "ftp",
    "chmod 777",
    "sudo",
    "su ",
    "passwd",
    "useradd",
    "userdel",
    "shutdown",
    "reboot",
    "halt",
    "init ",
    "systemctl",
    "service ",
]

BLOCKED_PATHS = [
    "/etc/passwd",
    "/etc/shadow",
    "/etc/sudoers",
    "/root",
    "/home",
    "~",
    ".ssh",
    ".env",
    ".git/config",
    "credentials",
    "secrets",
]


def is_command_allowed(command: str) -> tuple[bool, str]:
    """Check if a bash command is allowed."""
    command_lower = command.lower()
    for blocked in BLOCKED_COMMANDS:
        if blocked in command_lower:
            return False, f"Command contains blocked pattern: {blocked}"
    return True, ""


def is_path_allowed(path: str, workspace_root: str = "/workspace") -> tuple[bool, str]:
    """Check if a file path is allowed."""
    # Normalize path
    normalized = path.replace("\\", "/")

    # Check for blocked paths
    for blocked in BLOCKED_PATHS:
        if blocked in normalized:
            return False, f"Path contains blocked pattern: {blocked}"

    # Ensure path is within workspace
    if not normalized.startswith(workspace_root) and not normalized.startswith("/workspace"):
        # Allow relative paths that will be resolved to workspace
        if normalized.startswith("/") and not normalized.startswith("/workspace"):
            return False, f"Path must be within workspace: {workspace_root}"

    return True, ""


# =============================================================================
# File Operation Tools
# =============================================================================

@tool
async def read_file(
    file_path: str,
    offset: int = 0,
    limit: int = 5000,
    session_id: str = "",
) -> dict[str, Any]:
    """
    Read the contents of a file from the workspace.

    For large files, use offset and limit to read specific portions.

    Args:
        file_path: Absolute path to the file to read
        offset: Character offset to start reading from (default: 0)
        limit: Maximum number of characters to read (default: 5000)
        session_id: Session ID for Modal volume access

    Returns:
        Dict with success status, content, and metadata
    """
    # Validate path
    allowed, reason = is_path_allowed(file_path)
    if not allowed:
        return {"success": False, "error": reason}

    try:
        # In production, this would call Modal service
        # For now, simulate file read
        # TODO: Integrate with Modal service
        return {
            "success": True,
            "content": f"[Simulated file content for {file_path}]",
            "path": file_path,
            "total_size": 1000,
            "offset": offset,
            "limit": limit,
            "has_more": False,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
async def write_file(
    file_path: str,
    content: str,
    session_id: str = "",
) -> dict[str, Any]:
    """
    Create or overwrite a file with new content.

    Args:
        file_path: Absolute path to the file to write
        content: Content to write to the file
        session_id: Session ID for Modal volume access

    Returns:
        Dict with success status and metadata
    """
    # Validate path
    allowed, reason = is_path_allowed(file_path)
    if not allowed:
        return {"success": False, "error": reason}

    try:
        # In production, this would call Modal service
        # TODO: Integrate with Modal service
        return {
            "success": True,
            "path": file_path,
            "bytes_written": len(content),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
async def edit_file(
    file_path: str,
    old_string: str,
    new_string: str,
    session_id: str = "",
) -> dict[str, Any]:
    """
    Edit an existing file by replacing a specific section.

    The old_string must be unique in the file. If it appears multiple times,
    add more surrounding context to make it unique.

    Args:
        file_path: Absolute path to the file to edit
        old_string: The exact string to replace (must be unique in the file)
        new_string: The new string to insert
        session_id: Session ID for Modal volume access

    Returns:
        Dict with success status and replacement count
    """
    # Validate path
    allowed, reason = is_path_allowed(file_path)
    if not allowed:
        return {"success": False, "error": reason}

    try:
        # In production: read file, validate uniqueness, replace, write back
        # TODO: Integrate with Modal service
        return {
            "success": True,
            "path": file_path,
            "replacements": 1,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
async def grep_files(
    pattern: str,
    path: str = "/workspace",
    session_id: str = "",
) -> dict[str, Any]:
    """
    Search for a pattern in files using regex.

    Args:
        pattern: Regular expression pattern to search for
        path: Directory path to search in (default: workspace root)
        session_id: Session ID for Modal volume access

    Returns:
        Dict with matches (file, line number, text)
    """
    try:
        # Validate regex pattern
        try:
            re.compile(pattern)
        except re.error as e:
            return {"success": False, "error": f"Invalid regex pattern: {e}"}

        # In production, this would search files in Modal
        # TODO: Integrate with Modal service
        return {
            "success": True,
            "matches": [],
        }
    except Exception as e:
        return {"success": False, "error": str(e), "matches": []}


@tool
async def glob_files(
    pattern: str,
    session_id: str = "",
) -> dict[str, Any]:
    """
    Find files matching a glob pattern.

    Args:
        pattern: Glob pattern (e.g., "**/*.ts", "src/**/*.py")
        session_id: Session ID for Modal volume access

    Returns:
        Dict with list of matching file paths
    """
    try:
        # In production, this would glob files in Modal
        # TODO: Integrate with Modal service
        return {
            "success": True,
            "files": [],
        }
    except Exception as e:
        return {"success": False, "error": str(e), "files": []}


@tool
async def list_files(
    path: str = "/workspace",
    recursive: bool = False,
    session_id: str = "",
) -> dict[str, Any]:
    """
    List files and directories in a path.

    Args:
        path: Directory path to list (default: workspace root)
        recursive: Whether to list recursively (default: False)
        session_id: Session ID for Modal volume access

    Returns:
        Dict with list of files (name, path, type, size)
    """
    try:
        # In production, this would list files from Modal
        # TODO: Integrate with Modal service
        return {
            "success": True,
            "path": path,
            "files": [],
            "count": 0,
        }
    except Exception as e:
        return {"success": False, "error": str(e), "files": []}


# =============================================================================
# Execution Tools
# =============================================================================

@tool
async def run_bash(
    command: str,
    session_id: str = "",
    timeout: int = 60,
) -> dict[str, Any]:
    """
    Execute a bash command in the workspace.

    Args:
        command: Bash command to execute
        session_id: Session ID for Modal sandbox access
        timeout: Timeout in seconds (default: 60)

    Returns:
        Dict with stdout, stderr, exit code, and success status
    """
    # Validate command security
    allowed, reason = is_command_allowed(command)
    if not allowed:
        return {"success": False, "error": reason, "stdout": "", "stderr": "", "exit_code": 1}

    try:
        # In production, this would execute in Modal sandbox
        # TODO: Integrate with Modal service
        return {
            "success": True,
            "stdout": f"[Simulated output for: {command}]",
            "stderr": "",
            "exit_code": 0,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "stdout": "",
            "stderr": str(e),
            "exit_code": 1,
        }


@tool
async def run_tests(
    candidate_id: str,
    session_recording_id: str,
) -> dict[str, Any]:
    """
    Run the test suite for the current problem.

    Args:
        candidate_id: Candidate ID for looking up question and volume
        session_recording_id: Session recording ID for saving test results

    Returns:
        Dict with test results (passed, failed, total, individual results)
    """
    try:
        # In production, this would:
        # 1. Look up the candidate's current question
        # 2. Find the test command and test files
        # 3. Execute tests in Modal sandbox
        # 4. Parse results
        # 5. Save to database
        # TODO: Integrate with Modal service and database

        return {
            "success": True,
            "passed": 0,
            "failed": 0,
            "total": 0,
            "test_results": [],
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


# =============================================================================
# Tool Lists by Helpfulness Level
# =============================================================================

# All available coding tools
ALL_CODING_TOOLS = [
    read_file,
    write_file,
    edit_file,
    grep_files,
    glob_files,
    list_files,
    run_bash,
    run_tests,
]

# Tools by helpfulness level (matching original TypeScript implementation)
CONSULTANT_TOOLS = [read_file, grep_files, glob_files, list_files]
PAIR_PROGRAMMING_TOOLS = [read_file, write_file, edit_file, grep_files, glob_files, list_files, run_bash, run_tests]
FULL_COPILOT_TOOLS = ALL_CODING_TOOLS

CODING_TOOLS = {
    "consultant": CONSULTANT_TOOLS,
    "pair-programming": PAIR_PROGRAMMING_TOOLS,
    "full-copilot": FULL_COPILOT_TOOLS,
}
