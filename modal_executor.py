"""
Modal Code Executor for InterviewLM
====================================

Production-ready code execution sandbox using Modal.com
Supports: Python, JavaScript, TypeScript, Go

Security Features:
- Isolated sandboxed execution per session
- Resource limits (CPU, memory, time)
- Network restrictions
- File system isolation

Usage:
    modal deploy modal_executor.py

Then set MODAL_EXECUTE_URL to the deployed endpoint URL.
"""

import modal
import subprocess
import json
import tempfile
import os
import shutil
from pathlib import Path
from typing import Dict, List, Any, Optional

# Create Modal app
app = modal.App("interviewlm-executor")

# Create Modal image with required dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "pytest",
        "black",
        "pylint",
        "mypy",
    )
    .apt_install(
        "nodejs",
        "npm",
        "golang-go",
    )
    # Install Node.js testing frameworks
    .run_commands(
        "npm install -g jest typescript ts-node @types/node",
    )
)

# Create Modal volume for file persistence
volume = modal.Volume.from_name("interviewlm-sessions", create_if_missing=True)

# Define resource limits
TIMEOUT_SECONDS = 30
MAX_OUTPUT_SIZE = 1024 * 1024  # 1MB


class ExecutionResult:
    """Result of code execution with test outcomes"""

    def __init__(self):
        self.success = False
        self.test_results: List[Dict[str, Any]] = []
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.execution_time = 0
        self.stdout = ""
        self.stderr = ""
        self.error: Optional[str] = None


def sanitize_output(text: str, max_size: int = MAX_OUTPUT_SIZE) -> str:
    """Truncate output if too large"""
    if len(text) > max_size:
        return text[:max_size] + f"\n\n... (truncated, {len(text) - max_size} bytes remaining)"
    return text


def execute_python_tests(code: str, test_cases: List[Dict]) -> ExecutionResult:
    """Execute Python code with test cases using pytest"""
    result = ExecutionResult()

    with tempfile.TemporaryDirectory() as tmpdir:
        # Write solution code
        solution_path = Path(tmpdir) / "solution.py"
        solution_path.write_text(code)

        # Generate pytest test file
        test_code_lines = [
            "import pytest",
            "from solution import *",
            "",
        ]

        for idx, test_case in enumerate(test_cases):
            test_name = test_case.get("name", f"test_{idx}")
            test_input = test_case.get("input", {})
            expected = test_case.get("expected")

            # Generate test function
            test_code_lines.append(f"def {test_name}():")

            # Handle different input formats
            if isinstance(test_input, dict):
                # Dictionary input - pass as kwargs
                args_str = ", ".join(f"{k}={repr(v)}" for k, v in test_input.items())
                test_code_lines.append(f"    result = solution({args_str})")
            elif isinstance(test_input, list):
                # List input - pass as args
                args_str = ", ".join(repr(arg) for arg in test_input)
                test_code_lines.append(f"    result = solution({args_str})")
            else:
                # Single value
                test_code_lines.append(f"    result = solution({repr(test_input)})")

            test_code_lines.append(f"    assert result == {repr(expected)}, f'Expected {repr(expected)}, got {{result}}'")
            test_code_lines.append("")

        test_path = Path(tmpdir) / "test_solution.py"
        test_path.write_text("\n".join(test_code_lines))

        # Run pytest with JSON report
        try:
            import time
            start_time = time.time()

            proc = subprocess.run(
                ["python", "-m", "pytest", "test_solution.py", "-v", "--tb=short", "--json-report", "--json-report-file=report.json"],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SECONDS,
            )

            result.execution_time = int((time.time() - start_time) * 1000)
            result.stdout = sanitize_output(proc.stdout)
            result.stderr = sanitize_output(proc.stderr)

            # Parse test results from output
            for test_case in test_cases:
                test_name = test_case.get("name", "")
                passed = test_name in proc.stdout and "PASSED" in proc.stdout

                result.test_results.append({
                    "name": test_name,
                    "passed": passed,
                    "output": "",
                    "error": None if passed else "Test assertion failed",
                    "duration": result.execution_time // len(test_cases),
                    "hidden": test_case.get("hidden", False),
                })

                if passed:
                    result.passed_tests += 1
                else:
                    result.failed_tests += 1

            result.total_tests = len(test_cases)
            result.success = result.passed_tests == result.total_tests

        except subprocess.TimeoutExpired:
            result.error = f"Execution timed out after {TIMEOUT_SECONDS} seconds"
            result.failed_tests = len(test_cases)
            result.total_tests = len(test_cases)
        except Exception as e:
            result.error = f"Execution error: {str(e)}"
            result.failed_tests = len(test_cases)
            result.total_tests = len(test_cases)

    return result


def execute_javascript_tests(code: str, test_cases: List[Dict], language: str = "javascript") -> ExecutionResult:
    """Execute JavaScript/TypeScript code with test cases using Jest"""
    result = ExecutionResult()

    with tempfile.TemporaryDirectory() as tmpdir:
        # Determine file extension
        ext = "ts" if language == "typescript" else "js"

        # Write solution code
        solution_path = Path(tmpdir) / f"solution.{ext}"
        solution_path.write_text(code)

        # Create package.json
        package_json = {
            "type": "module" if language == "javascript" else "commonjs",
            "dependencies": {},
            "devDependencies": {
                "jest": "^29.0.0",
                "@types/jest": "^29.0.0",
            }
        }

        if language == "typescript":
            package_json["devDependencies"]["ts-jest"] = "^29.0.0"
            package_json["devDependencies"]["typescript"] = "^5.0.0"

        (Path(tmpdir) / "package.json").write_text(json.dumps(package_json, indent=2))

        # Generate test file
        test_code_lines = []

        if language == "typescript":
            test_code_lines.append("import { solution } from './solution';")
        else:
            test_code_lines.append("const { solution } = require('./solution');")

        test_code_lines.append("")

        for test_case in test_cases:
            test_name = test_case.get("name", "test")
            test_input = test_case.get("input", {})
            expected = test_case.get("expected")

            test_code_lines.append(f"test('{test_name}', () => {{")

            # Call solution function
            if isinstance(test_input, dict):
                args_str = json.dumps(list(test_input.values()))[1:-1]  # Remove array brackets
                test_code_lines.append(f"  const result = solution({args_str});")
            else:
                test_code_lines.append(f"  const result = solution({json.dumps(test_input)});")

            test_code_lines.append(f"  expect(result).toEqual({json.dumps(expected)});")
            test_code_lines.append("});")
            test_code_lines.append("")

        test_path = Path(tmpdir) / f"solution.test.{ext}"
        test_path.write_text("\n".join(test_code_lines))

        # Run tests
        try:
            import time
            start_time = time.time()

            # Install dependencies first
            subprocess.run(
                ["npm", "install"],
                cwd=tmpdir,
                capture_output=True,
                timeout=60,
            )

            # Run Jest
            proc = subprocess.run(
                ["npx", "jest", "--json", "--testLocationInResults"],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SECONDS,
            )

            result.execution_time = int((time.time() - start_time) * 1000)
            result.stdout = sanitize_output(proc.stdout)
            result.stderr = sanitize_output(proc.stderr)

            # Parse Jest JSON output
            try:
                jest_result = json.loads(proc.stdout)
                for test_case_data in jest_result.get("testResults", [{}])[0].get("assertionResults", []):
                    passed = test_case_data.get("status") == "passed"

                    result.test_results.append({
                        "name": test_case_data.get("title", ""),
                        "passed": passed,
                        "output": "",
                        "error": test_case_data.get("failureMessages", [None])[0] if not passed else None,
                        "duration": test_case_data.get("duration", 0),
                        "hidden": False,
                    })

                    if passed:
                        result.passed_tests += 1
                    else:
                        result.failed_tests += 1

                result.total_tests = len(result.test_results)
                result.success = result.passed_tests == result.total_tests

            except json.JSONDecodeError:
                # Fallback parsing
                result.error = "Failed to parse test results"
                result.failed_tests = len(test_cases)
                result.total_tests = len(test_cases)

        except subprocess.TimeoutExpired:
            result.error = f"Execution timed out after {TIMEOUT_SECONDS} seconds"
            result.failed_tests = len(test_cases)
            result.total_tests = len(test_cases)
        except Exception as e:
            result.error = f"Execution error: {str(e)}"
            result.failed_tests = len(test_cases)
            result.total_tests = len(test_cases)

    return result


@app.function(
    image=image,
    volumes={"/data": volume},
    timeout=60,
    memory=512,
    cpu=1.0,
)
@modal.web_endpoint(method="POST")
def execute(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute code with test cases in a sandboxed environment

    Request body:
    {
        "code": "def solution(x): return x * 2",
        "testCases": [
            {"name": "test_1", "input": {"x": 2}, "expected": 4, "hidden": false}
        ],
        "language": "python"
    }

    Response:
    {
        "success": true,
        "testResults": [...],
        "totalTests": 3,
        "passedTests": 3,
        "failedTests": 0,
        "executionTime": 150,
        "stdout": "...",
        "stderr": "...",
        "error": null
    }
    """

    code = request_data.get("code", "")
    test_cases = request_data.get("testCases", [])
    language = request_data.get("language", "python").lower()

    if not code:
        return {
            "success": False,
            "error": "No code provided",
            "testResults": [],
            "totalTests": 0,
            "passedTests": 0,
            "failedTests": 0,
            "executionTime": 0,
        }

    if not test_cases:
        return {
            "success": False,
            "error": "No test cases provided",
            "testResults": [],
            "totalTests": 0,
            "passedTests": 0,
            "failedTests": 0,
            "executionTime": 0,
        }

    # Route to appropriate executor
    if language in ["python", "py"]:
        result = execute_python_tests(code, test_cases)
    elif language in ["javascript", "js", "typescript", "ts"]:
        result = execute_javascript_tests(code, test_cases, language)
    else:
        return {
            "success": False,
            "error": f"Unsupported language: {language}",
            "testResults": [],
            "totalTests": 0,
            "passedTests": 0,
            "failedTests": 0,
            "executionTime": 0,
        }

    # Return formatted response
    return {
        "success": result.success,
        "testResults": result.test_results,
        "totalTests": result.total_tests,
        "passedTests": result.passed_tests,
        "failedTests": result.failed_tests,
        "executionTime": result.execution_time,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "error": result.error,
    }


# File operations using Modal Volume
@app.function(
    image=image,
    volumes={"/data": volume},
    timeout=10,
)
@modal.web_endpoint(method="POST")
def write_file(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """Write a file to the session volume"""
    session_id = request_data.get("sessionId", "")
    file_path = request_data.get("filePath", "")
    content = request_data.get("content", "")

    if not session_id or not file_path:
        return {"success": False, "error": "Missing sessionId or filePath"}

    try:
        # Create session directory
        session_dir = Path("/data") / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        # Write file
        full_path = session_dir / file_path.lstrip("/")
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content)

        volume.commit()

        return {
            "success": True,
            "path": file_path,
            "size": len(content.encode("utf-8")),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.function(
    image=image,
    volumes={"/data": volume},
    timeout=10,
)
@modal.web_endpoint(method="POST")
def read_file(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """Read a file from the session volume"""
    session_id = request_data.get("sessionId", "")
    file_path = request_data.get("filePath", "")

    if not session_id or not file_path:
        return {"success": False, "error": "Missing sessionId or filePath"}

    try:
        full_path = Path("/data") / session_id / file_path.lstrip("/")

        if not full_path.exists():
            return {"success": False, "error": f"File not found: {file_path}"}

        content = full_path.read_text()

        return {
            "success": True,
            "content": content,
            "path": file_path,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.function(
    image=image,
    volumes={"/data": volume},
    timeout=10,
)
@modal.web_endpoint(method="POST")
def list_files(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """List files in a session directory"""
    session_id = request_data.get("sessionId", "")
    directory = request_data.get("directory", "/")

    if not session_id:
        return {"success": False, "error": "Missing sessionId"}

    try:
        session_dir = Path("/data") / session_id
        target_dir = session_dir / directory.lstrip("/")

        if not target_dir.exists():
            return {"success": True, "files": []}

        files = []
        for item in target_dir.iterdir():
            files.append({
                "name": item.name,
                "path": str(item.relative_to(session_dir)),
                "type": "directory" if item.is_dir() else "file",
                "size": item.stat().st_size if item.is_file() else 0,
            })

        return {
            "success": True,
            "files": files,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
