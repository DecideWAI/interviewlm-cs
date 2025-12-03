"""Tests for the Evaluation Agent."""

import pytest
from agents.evaluation_agent import (
    create_evaluation_agent,
    DEFAULT_SCORING_WEIGHTS,
    detect_biases,
)


class TestEvaluationAgent:
    """Test cases for Evaluation Agent."""

    def test_scoring_weights_sum_to_one(self):
        """Test that scoring weights sum to 1.0."""
        total = sum(DEFAULT_SCORING_WEIGHTS.values())
        assert abs(total - 1.0) < 0.001, f"Weights sum to {total}, expected 1.0"

    def test_scoring_weights_match_spec(self):
        """Test that scoring weights match the specification."""
        assert DEFAULT_SCORING_WEIGHTS["code_quality"] == 0.40
        assert DEFAULT_SCORING_WEIGHTS["problem_solving"] == 0.25
        assert DEFAULT_SCORING_WEIGHTS["ai_collaboration"] == 0.20
        assert DEFAULT_SCORING_WEIGHTS["communication"] == 0.15

    def test_detect_biases_code_volume_bias(self):
        """Test code volume bias detection."""
        # High score with minimal code should trigger bias
        state = {
            "code_snapshots": [
                {"files": {"main.py": "x = 1\ny = 2\n"}}  # Only 3 lines
            ],
        }
        scores = {
            "code_quality": {"score": 85, "confidence": 0.8, "evidence": []},
            "problem_solving": {"score": 80, "confidence": 0.8, "evidence": []},
            "ai_collaboration": {"score": 75, "confidence": 0.8, "evidence": []},
            "communication": {"score": 70, "confidence": 0.8, "evidence": []},
        }

        flags = detect_biases(state, scores)
        assert any("code_volume_bias" in flag for flag in flags)

    def test_detect_biases_no_bias_with_substantial_code(self):
        """Test no bias flagged with substantial code."""
        # Create substantial code
        code_content = "\n".join([f"line_{i} = {i}" for i in range(50)])

        state = {
            "code_snapshots": [
                {"files": {"main.py": code_content}}
            ],
        }
        scores = {
            "code_quality": {"score": 85, "confidence": 0.8, "evidence": []},
            "problem_solving": {"score": 80, "confidence": 0.8, "evidence": []},
            "ai_collaboration": {"score": 75, "confidence": 0.8, "evidence": []},
            "communication": {"score": 70, "confidence": 0.8, "evidence": []},
        }

        flags = detect_biases(state, scores)
        # Should not have code_volume_bias since there's substantial code
        assert not any("code_volume_bias" in flag for flag in flags)

    @pytest.mark.asyncio
    async def test_evaluate_session_basic(self):
        """Test basic evaluation session."""
        agent = create_evaluation_agent()

        # Minimal session data
        result = await agent.evaluate_session(
            session_id="test-session",
            candidate_id="test-candidate",
            code_snapshots=[
                {
                    "timestamp": "2024-01-01T10:00:00Z",
                    "files": {
                        "main.py": """
def fibonacci(n):
    '''Calculate fibonacci number'''
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

if __name__ == '__main__':
    print(fibonacci(10))
"""
                    },
                }
            ],
            test_results=[
                {"passed": True, "test_name": "test_fibonacci_base"},
                {"passed": True, "test_name": "test_fibonacci_sequence"},
            ],
            claude_interactions=[
                {
                    "role": "user",
                    "content": "Can you help me optimize this fibonacci function using memoization?",
                },
                {
                    "role": "assistant",
                    "content": "Sure! Here's an optimized version using memoization...",
                },
            ],
        )

        # Check structure
        assert result is not None
        assert "overall_score" in result
        assert "code_quality" in result
        assert "problem_solving" in result
        assert "ai_collaboration" in result
        assert "communication" in result

        # Check score ranges
        assert 0 <= result["overall_score"] <= 100
        assert 0 <= result["code_quality"]["score"] <= 100
        assert 0 <= result["overall_confidence"] <= 1


class TestEvaluationTools:
    """Test cases for evaluation analysis tools."""

    @pytest.mark.asyncio
    async def test_analyze_code_quality(self):
        """Test code quality analysis."""
        from tools.evaluation_tools import analyze_code_quality

        result = await analyze_code_quality.ainvoke({
            "code_snapshots": [
                {
                    "files": {
                        "main.py": """
def add(a, b):
    '''Add two numbers'''
    return a + b

class Calculator:
    '''Simple calculator class'''
    def multiply(self, a, b):
        return a * b
"""
                    }
                }
            ],
            "test_results": [
                {"passed": True, "test_name": "test_add"},
                {"passed": True, "test_name": "test_multiply"},
            ],
        })

        assert "score" in result
        assert "confidence" in result
        assert "evidence" in result
        assert 0 <= result["score"] <= 100

    @pytest.mark.asyncio
    async def test_analyze_ai_collaboration(self):
        """Test AI collaboration analysis."""
        from tools.evaluation_tools import analyze_ai_collaboration

        result = await analyze_ai_collaboration.ainvoke({
            "claude_interactions": [
                {
                    "role": "user",
                    "content": "I need to implement a binary search algorithm in Python. "
                               "The function should take a sorted list and a target value, "
                               "and return the index of the target or -1 if not found.",
                },
                {
                    "role": "assistant",
                    "content": "Here's a binary search implementation...",
                },
            ],
        })

        assert "score" in result
        assert "confidence" in result
        assert 0 <= result["score"] <= 100

    @pytest.mark.asyncio
    async def test_analyze_problem_solving(self):
        """Test problem solving analysis."""
        from tools.evaluation_tools import analyze_problem_solving

        result = await analyze_problem_solving.ainvoke({
            "code_snapshots": [
                {"files": {"v1.py": "def solve(): pass"}},
                {"files": {"v1.py": "def solve(): return 1"}},
                {"files": {"v1.py": "def solve(): return calculate()"}},
            ],
            "test_results": [
                {"passed": False},
                {"passed": False},
                {"passed": True},
            ],
            "terminal_commands": [
                {"command": "python v1.py"},
                {"command": "pytest"},
            ],
        })

        assert "score" in result
        assert "confidence" in result
        assert 0 <= result["score"] <= 100
