"""
Evaluation tools for the LangGraph Evaluation Agent.

These tools analyze code, problem-solving approaches, AI collaboration,
and communication skills with evidence-based scoring.
"""

import re
from typing import Any
from langchain_core.tools import tool


# =============================================================================
# Code Quality Analysis
# =============================================================================

@tool
async def analyze_code_quality(
    code_snapshots: list[dict],
    test_results: list[dict],
) -> dict[str, Any]:
    """
    Analyze code quality using test results and static analysis.

    Methods:
    1. Test results (objective) - pass/fail rates
    2. Static analysis - complexity, patterns, security issues
    3. LLM code review (called separately)

    Args:
        code_snapshots: List of code snapshots with files and timestamps
        test_results: List of test run results

    Returns:
        Dict with score (0-100), confidence, evidence, and breakdown
    """
    evidence = []
    test_score = 0
    static_score = 50  # Default neutral

    # Method 1: Analyze test results
    if test_results:
        last_test = test_results[-1]
        total = last_test.get("total", 0)
        passed = last_test.get("passed", 0)

        if total > 0:
            test_score = (passed / total) * 100
            evidence.append({
                "type": "test_result",
                "description": f"{passed}/{total} tests passed",
                "timestamp": last_test.get("timestamp"),
                "value": test_score,
            })

            if last_test.get("coverage") is not None:
                evidence.append({
                    "type": "metric",
                    "description": f"Test coverage: {last_test['coverage']}%",
                    "value": last_test["coverage"],
                })

    # Method 2: Static analysis on final code
    if code_snapshots:
        final_snapshot = code_snapshots[-1]
        files = final_snapshot.get("files", {})

        total_lines = 0
        comment_lines = 0
        complexity_issues = 0
        security_issues = 0

        for file_path, content in files.items():
            if not isinstance(content, str):
                continue

            lines = content.split("\n")
            total_lines += len(lines)

            # Count comments
            for line in lines:
                stripped = line.strip()
                if stripped.startswith("//") or stripped.startswith("#") or stripped.startswith("/*"):
                    comment_lines += 1

            # Check for complexity issues
            if content.count("if ") > 10:
                complexity_issues += 1
            if content.count("for ") > 5 and content.count("for ") * 2 > len(lines) / 10:
                complexity_issues += 1

            # Check for security issues
            security_patterns = [
                r"eval\s*\(",
                r"exec\s*\(",
                r"__import__",
                r"subprocess\.call.*shell=True",
                r"innerHTML\s*=",
                r"document\.write",
            ]
            for pattern in security_patterns:
                if re.search(pattern, content):
                    security_issues += 1

        # Calculate static score
        comment_ratio = comment_lines / max(total_lines, 1)
        static_score = 70  # Base score

        # Adjust for comments (good: 5-20%)
        if 0.05 <= comment_ratio <= 0.20:
            static_score += 10
        elif comment_ratio < 0.02:
            static_score -= 10

        # Penalize complexity and security issues
        static_score -= complexity_issues * 5
        static_score -= security_issues * 15

        static_score = max(0, min(100, static_score))

        evidence.append({
            "type": "metric",
            "description": f"Static analysis: {static_score}/100",
            "value": static_score,
        })

        if security_issues > 0:
            evidence.append({
                "type": "metric",
                "description": f"{security_issues} security issue(s) detected",
                "value": security_issues,
            })

    # Combine scores
    scores = [s for s in [test_score, static_score] if s > 0]
    if not scores:
        return {
            "score": 0,
            "confidence": 0.3,
            "evidence": evidence,
            "breakdown": {"tests": 0, "static_analysis": 0},
        }

    # Multi-method validation
    max_diff = max(scores) - min(scores) if len(scores) > 1 else 0
    confidence = 0.9 if max_diff < 20 else 0.6

    score = sum(scores) / len(scores)

    return {
        "score": round(score),
        "confidence": confidence,
        "evidence": evidence,
        "breakdown": {
            "tests": test_score,
            "static_analysis": static_score,
        },
    }


# =============================================================================
# Problem Solving Analysis
# =============================================================================

@tool
async def analyze_problem_solving(
    code_snapshots: list[dict],
    test_results: list[dict],
    terminal_commands: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Analyze problem-solving approach through iteration patterns and debugging.

    Methods:
    1. Iteration patterns - code change frequency and patterns
    2. Debugging approach - test-driven improvement
    3. Terminal analysis - systematic debugging commands

    Args:
        code_snapshots: List of code snapshots with timestamps
        test_results: List of test run results
        terminal_commands: Optional list of terminal commands

    Returns:
        Dict with score (0-100), confidence, evidence, and breakdown
    """
    evidence = []

    # Method 1: Analyze iteration patterns
    iteration_count = len(code_snapshots)
    evidence.append({
        "type": "metric",
        "description": f"{iteration_count} code iterations",
        "value": iteration_count,
    })

    # Optimal iteration count follows bell curve (peak at 7)
    optimal_count = 7
    sigma = 3
    deviation = abs(iteration_count - optimal_count)
    import math
    normalized_score = math.exp(-((deviation / sigma) ** 2) / 2)
    iteration_score = 30 + normalized_score * 70

    # Method 2: Analyze debugging approach from test results
    debugging_score = 50  # Default neutral

    if test_results:
        evidence.append({
            "type": "metric",
            "description": f"{len(test_results)} test runs",
            "value": len(test_results),
        })

        # Look for improvement over time
        improvements = []
        for i in range(1, len(test_results)):
            prev = test_results[i - 1].get("passed", 0)
            curr = test_results[i].get("passed", 0)
            improvements.append(curr - prev)

        if improvements:
            positive_improvements = sum(1 for i in improvements if i > 0)
            improvement_rate = positive_improvements / len(improvements)
            debugging_score = 50 + improvement_rate * 50

    # Method 3: Analyze terminal commands
    terminal_score = 50  # Default

    if terminal_commands:
        debugging_patterns = 0
        for cmd in terminal_commands:
            command = cmd.get("command", "").lower()
            # Look for debugging patterns
            if any(p in command for p in ["print", "console.log", "debug", "breakpoint"]):
                debugging_patterns += 1
            if any(p in command for p in ["git diff", "git log", "git status"]):
                debugging_patterns += 1
            if any(p in command for p in ["npm test", "pytest", "jest", "cargo test"]):
                debugging_patterns += 1

        if debugging_patterns > 0:
            terminal_score = min(100, 50 + debugging_patterns * 10)
            evidence.append({
                "type": "metric",
                "description": f"{debugging_patterns} debugging-related commands",
                "value": debugging_patterns,
            })

    # Combine scores (30% iteration, 30% debugging, 40% terminal)
    score = round(iteration_score * 0.3 + debugging_score * 0.3 + terminal_score * 0.4)
    confidence = 0.85 if iteration_count >= 3 and len(test_results) >= 2 else 0.6

    return {
        "score": score,
        "confidence": confidence,
        "evidence": evidence,
        "breakdown": {
            "iteration_patterns": round(iteration_score),
            "debugging_approach": round(debugging_score),
            "terminal_analysis": round(terminal_score),
        },
    }


# =============================================================================
# AI Collaboration Analysis
# =============================================================================

@tool
async def analyze_ai_collaboration(
    claude_interactions: list[dict],
    metrics: dict | None = None,
) -> dict[str, Any]:
    """
    Analyze AI collaboration quality (unique to InterviewLM).

    Methods:
    1. Prompt quality - specificity, clarity, technical depth
    2. AI usage effectiveness - appropriate dependency level

    Args:
        claude_interactions: List of AI chat interactions
        metrics: Optional session metrics including AI dependency score

    Returns:
        Dict with score (0-100), confidence, evidence, and breakdown
    """
    evidence = []

    if not claude_interactions:
        return {
            "score": 0,
            "confidence": 1.0,
            "evidence": [{"type": "metric", "description": "No AI interactions", "value": 0}],
            "breakdown": {},
        }

    # Analyze prompt quality
    specificity_scores = []
    clarity_scores = []
    technical_depth_scores = []

    for interaction in claude_interactions:
        user_message = interaction.get("candidate_message", interaction.get("userMessage", ""))
        if not user_message:
            continue

        words = user_message.split()
        word_count = len(words)

        # Specificity: longer, detailed prompts score higher
        if word_count >= 20:
            specificity_scores.append(80)
        elif word_count >= 10:
            specificity_scores.append(60)
        elif word_count >= 5:
            specificity_scores.append(40)
        else:
            specificity_scores.append(20)

        # Clarity: look for clear structure (questions, bullet points)
        has_question = "?" in user_message
        has_structure = any(p in user_message for p in ["1.", "2.", "-", "*", "first", "then", "finally"])
        clarity = 50
        if has_question:
            clarity += 20
        if has_structure:
            clarity += 20
        clarity_scores.append(min(100, clarity))

        # Technical depth: look for code references, technical terms
        technical_terms = ["function", "class", "error", "debug", "test", "api", "async", "await", "promise"]
        has_code = "```" in user_message or "`" in user_message
        term_count = sum(1 for term in technical_terms if term.lower() in user_message.lower())

        depth = 40
        if has_code:
            depth += 30
        depth += min(30, term_count * 10)
        technical_depth_scores.append(min(100, depth))

    # Calculate averages
    specificity = sum(specificity_scores) / len(specificity_scores) if specificity_scores else 50
    clarity = sum(clarity_scores) / len(clarity_scores) if clarity_scores else 50
    technical_depth = sum(technical_depth_scores) / len(technical_depth_scores) if technical_depth_scores else 50

    prompt_quality_score = (specificity + clarity + technical_depth) / 3

    evidence.extend([
        {"type": "metric", "description": f"Prompt specificity: {round(specificity)}/100", "value": specificity},
        {"type": "metric", "description": f"Prompt clarity: {round(clarity)}/100", "value": clarity},
        {"type": "metric", "description": f"Technical depth: {round(technical_depth)}/100", "value": technical_depth},
    ])

    # AI usage effectiveness
    ai_dependency = 50  # Default moderate
    if metrics and "ai_dependency_score" in metrics:
        ai_dependency = metrics["ai_dependency_score"]
    elif metrics and "aiDependencyScore" in metrics:
        ai_dependency = metrics["aiDependencyScore"]

    # Optimal: moderate AI usage (not too dependent, not ignoring it)
    usage_effectiveness_score = 100 - abs(50 - ai_dependency)

    evidence.append({
        "type": "metric",
        "description": f"AI dependency score: {round(ai_dependency)}/100",
        "value": ai_dependency,
    })

    # Combine scores (70% prompt quality, 30% usage effectiveness)
    score = round(prompt_quality_score * 0.7 + usage_effectiveness_score * 0.3)
    confidence = 0.9 if len(claude_interactions) >= 5 else 0.6

    return {
        "score": score,
        "confidence": confidence,
        "evidence": evidence,
        "breakdown": {
            "specificity": round(specificity),
            "clarity": round(clarity),
            "technical_depth": round(technical_depth),
            "usage_effectiveness": round(usage_effectiveness_score),
        },
    }


# =============================================================================
# Communication Analysis
# =============================================================================

@tool
async def analyze_communication(
    claude_interactions: list[dict],
    code_snapshots: list[dict],
) -> dict[str, Any]:
    """
    Analyze communication skills through prompts and code documentation.

    Methods:
    1. Prompt clarity - from AI interactions
    2. Code documentation - comments and structure

    Args:
        claude_interactions: List of AI chat interactions
        code_snapshots: List of code snapshots

    Returns:
        Dict with score (0-100), confidence, evidence, and breakdown
    """
    evidence = []

    # Prompt clarity (reuse from AI collaboration analysis)
    clarity_scores = []

    for interaction in claude_interactions:
        user_message = interaction.get("candidate_message", interaction.get("userMessage", ""))
        if not user_message:
            continue

        # Clear communication indicators
        has_greeting = any(g in user_message.lower() for g in ["please", "thank", "could you"])
        has_context = len(user_message) > 50
        has_question = "?" in user_message

        clarity = 50
        if has_greeting:
            clarity += 15
        if has_context:
            clarity += 20
        if has_question:
            clarity += 15
        clarity_scores.append(min(100, clarity))

    avg_clarity = sum(clarity_scores) / len(clarity_scores) if clarity_scores else 50
    evidence.append({
        "type": "metric",
        "description": f"Prompt clarity: {round(avg_clarity)}/100",
        "value": avg_clarity,
    })

    # Code documentation analysis
    documentation_score = 50  # Default

    if code_snapshots:
        final_snapshot = code_snapshots[-1]
        files = final_snapshot.get("files", {})

        total_lines = 0
        doc_lines = 0

        for content in files.values():
            if not isinstance(content, str):
                continue

            lines = content.split("\n")
            total_lines += len(lines)

            for line in lines:
                stripped = line.strip()
                # Count documentation lines
                if stripped.startswith("//") or stripped.startswith("#"):
                    doc_lines += 1
                if stripped.startswith("/*") or stripped.startswith("'''") or stripped.startswith('"""'):
                    doc_lines += 1
                if stripped.startswith("*") and not stripped.startswith("*/"):
                    doc_lines += 1

        if total_lines > 0:
            doc_ratio = doc_lines / total_lines
            # Optimal documentation: 5-15%
            if 0.05 <= doc_ratio <= 0.15:
                documentation_score = 85
            elif 0.02 <= doc_ratio < 0.05:
                documentation_score = 70
            elif doc_ratio > 0.15:
                documentation_score = 75  # Too much can be verbose
            else:
                documentation_score = 50

            evidence.append({
                "type": "metric",
                "description": f"Documentation ratio: {round(doc_ratio * 100)}%",
                "value": doc_ratio,
            })

    evidence.append({
        "type": "metric",
        "description": f"Documentation score: {documentation_score}/100",
        "value": documentation_score,
    })

    # Combine scores
    score = round((avg_clarity + documentation_score) / 2)
    confidence = 0.75 if len(claude_interactions) >= 3 else 0.5

    return {
        "score": score,
        "confidence": confidence,
        "evidence": evidence,
        "breakdown": {
            "prompt_clarity": round(avg_clarity),
            "documentation": documentation_score,
        },
    }


# =============================================================================
# Tool List
# =============================================================================

EVALUATION_TOOLS = [
    analyze_code_quality,
    analyze_problem_solving,
    analyze_ai_collaboration,
    analyze_communication,
]
