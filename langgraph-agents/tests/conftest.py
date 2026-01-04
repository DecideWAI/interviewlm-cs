"""
Pytest configuration and fixtures for LangGraph agent tests.
"""

import os
import sys

import pytest

# Add the parent directory to the path so we can import agents
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(autouse=True)
def set_test_env():
    """Set environment variables for testing."""
    # Ensure we have a mock API key for tests that don't need real API
    if not os.environ.get("ANTHROPIC_API_KEY"):
        os.environ["ANTHROPIC_API_KEY"] = "test-api-key"

    yield


@pytest.fixture
def mock_session_data():
    """Provide mock session data for evaluation tests."""
    return {
        "code_snapshots": [
            {
                "timestamp": "2024-01-01T10:00:00Z",
                "files": {
                    "main.py": """
def solve_problem(data):
    '''Solve the given problem'''
    result = []
    for item in data:
        if item > 0:
            result.append(item * 2)
    return result

if __name__ == '__main__':
    print(solve_problem([1, -2, 3, -4, 5]))
"""
                },
            },
            {
                "timestamp": "2024-01-01T10:15:00Z",
                "files": {
                    "main.py": """
def solve_problem(data):
    '''Solve the given problem with optimization'''
    return [item * 2 for item in data if item > 0]

def test_solve_problem():
    assert solve_problem([1, -2, 3]) == [2, 6]
    assert solve_problem([]) == []
    assert solve_problem([-1, -2]) == []

if __name__ == '__main__':
    test_solve_problem()
    print("All tests passed!")
"""
                },
            },
        ],
        "test_results": [
            {"timestamp": "2024-01-01T10:10:00Z", "passed": False, "test_name": "test_basic"},
            {"timestamp": "2024-01-01T10:20:00Z", "passed": True, "test_name": "test_basic"},
            {"timestamp": "2024-01-01T10:20:00Z", "passed": True, "test_name": "test_edge_cases"},
        ],
        "claude_interactions": [
            {
                "timestamp": "2024-01-01T10:05:00Z",
                "role": "user",
                "content": "I need to filter and transform a list of numbers. Can you explain how list comprehensions work in Python?",
            },
            {
                "timestamp": "2024-01-01T10:05:30Z",
                "role": "assistant",
                "content": "List comprehensions in Python provide a concise way to create lists...",
            },
            {
                "timestamp": "2024-01-01T10:12:00Z",
                "role": "user",
                "content": "My test is failing. The output is [2, 6] but I expected [1, 3]. Oh wait, I see the issue - I'm multiplying by 2 instead of just filtering.",
            },
            {
                "timestamp": "2024-01-01T10:12:30Z",
                "role": "assistant",
                "content": "Good catch! Let me help you understand the difference...",
            },
        ],
        "terminal_commands": [
            {"timestamp": "2024-01-01T10:08:00Z", "command": "python main.py", "exit_code": 0},
            {"timestamp": "2024-01-01T10:10:00Z", "command": "pytest", "exit_code": 1},
            {"timestamp": "2024-01-01T10:20:00Z", "command": "pytest", "exit_code": 0},
        ],
    }


@pytest.fixture
def mock_metrics():
    """Provide mock interview metrics."""
    from agents.interview_agent import create_default_metrics

    return create_default_metrics("test-session", difficulty=5)
