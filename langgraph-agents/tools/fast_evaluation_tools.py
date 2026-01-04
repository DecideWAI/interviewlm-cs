"""
Fast Evaluation Tools for the FastProgressionAgent.

These tools are optimized for speed and minimal iterations.
The agent should complete evaluation in 2-3 tool calls max.

Tools:
- read_file: Read solution file
- list_files: Explore workspace structure
- grep_files: Search for patterns (optional)
- submit_fast_evaluation: Submit evaluation result (REQUIRED)

NOTE: run_tests is EXCLUDED - trust test results from input.
"""

from datetime import datetime
from typing import Annotated

from langchain_core.messages import ToolMessage
from langchain_core.tools import tool
from langchain_core.tools.base import InjectedToolCallId
from langgraph.types import Command

from config import settings

# =============================================================================
# Fast Evaluation Submission Tool (Command Pattern)
# =============================================================================


@tool
def submit_fast_evaluation(
    overall_score: int,
    passed: bool,
    # Real World criteria (default)
    problem_completion_score: int,
    problem_completion_max: int,
    problem_completion_feedback: str,
    code_quality_score: int,
    code_quality_max: int,
    code_quality_feedback: str,
    testing_score: int,
    testing_max: int,
    testing_feedback: str,
    error_handling_score: int,
    error_handling_max: int,
    error_handling_feedback: str,
    efficiency_score: int,
    efficiency_max: int,
    efficiency_feedback: str,
    # Feedback
    feedback: str,
    blocking_reason: str | None,
    strengths: list[str],
    improvements: list[str],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """Submit fast evaluation result. You MUST call this tool to complete the evaluation.

    IMPORTANT: This is the final step. Call this after reading the code and making your assessment.

    Scoring Guide:
    - Problem Completion (30 pts): Core functionality, requirements met
    - Code Quality (25 pts): Readability, organization, naming
    - Testing (20 pts): Trust the provided test results
    - Error Handling (15 pts): Edge cases, validation
    - Efficiency (10 pts): Time/space complexity

    Args:
        overall_score: Total score 0-100
        passed: Whether candidate passed (score >= passing_threshold)
        problem_completion_score: Score for problem completion (0-30)
        problem_completion_max: Max score (30)
        problem_completion_feedback: Brief 1-sentence feedback
        code_quality_score: Score for code quality (0-25)
        code_quality_max: Max score (25)
        code_quality_feedback: Brief 1-sentence feedback
        testing_score: Score for testing (0-20)
        testing_max: Max score (20)
        testing_feedback: Brief 1-sentence feedback
        error_handling_score: Score for error handling (0-15)
        error_handling_max: Max score (15)
        error_handling_feedback: Brief 1-sentence feedback
        efficiency_score: Score for efficiency (0-10)
        efficiency_max: Max score (10)
        efficiency_feedback: Brief 1-sentence feedback
        feedback: 2-3 sentence overall feedback
        blocking_reason: If failed, why they can't proceed (None if passed)
        strengths: List of 2-3 key strengths
        improvements: List of 2-3 improvement areas

    Returns:
        Command that updates agent state with evaluation_result and marks complete
    """
    # Clamp scores to valid ranges
    def clamp(val: int, min_val: int, max_val: int) -> int:
        return max(min_val, min(max_val, val))

    problem_completion_score = clamp(problem_completion_score, 0, problem_completion_max)
    code_quality_score = clamp(code_quality_score, 0, code_quality_max)
    testing_score = clamp(testing_score, 0, testing_max)
    error_handling_score = clamp(error_handling_score, 0, error_handling_max)
    efficiency_score = clamp(efficiency_score, 0, efficiency_max)

    # Recalculate overall score from criteria
    calculated_score = (
        problem_completion_score +
        code_quality_score +
        testing_score +
        error_handling_score +
        efficiency_score
    )

    # Use calculated score if provided score doesn't match
    if overall_score != calculated_score:
        overall_score = calculated_score

    overall_score = clamp(overall_score, 0, 100)

    # Build evaluation result (matches FastEvaluationResult TypeScript type)
    evaluation_result = {
        "passed": passed,
        "overallScore": overall_score,
        "assessmentType": "REAL_WORLD",  # Will be overridden by state if SYSTEM_DESIGN
        "criteria": {
            "problemCompletion": {
                "score": problem_completion_score,
                "maxScore": problem_completion_max,
                "met": problem_completion_score >= (problem_completion_max * 0.6),
                "feedback": problem_completion_feedback,
            },
            "codeQuality": {
                "score": code_quality_score,
                "maxScore": code_quality_max,
                "met": code_quality_score >= (code_quality_max * 0.6),
                "feedback": code_quality_feedback,
            },
            "testing": {
                "score": testing_score,
                "maxScore": testing_max,
                "met": testing_score >= (testing_max * 0.6),
                "feedback": testing_feedback,
            },
            "errorHandling": {
                "score": error_handling_score,
                "maxScore": error_handling_max,
                "met": error_handling_score >= (error_handling_max * 0.6),
                "feedback": error_handling_feedback,
            },
            "efficiency": {
                "score": efficiency_score,
                "maxScore": efficiency_max,
                "met": efficiency_score >= (efficiency_max * 0.6),
                "feedback": efficiency_feedback,
            },
        },
        "feedback": feedback,
        "blockingReason": blocking_reason,
        "strengths": strengths[:3] if strengths else [],
        "improvements": improvements[:3] if improvements else [],
        "metadata": {
            "model": settings.fast_progression_agent_model,
            "evaluationTimeMs": 0,  # Will be set by agent
            "toolCallCount": 0,  # Will be set by agent
            "inputTokens": 0,
            "outputTokens": 0,
        },
    }

    return Command(
        update={
            "evaluation_result": evaluation_result,
            "evaluation_complete": True,
            "messages": [
                ToolMessage(
                    content=f"Evaluation submitted. Score: {overall_score}/100 ({'PASSED' if passed else 'FAILED'})",
                    tool_call_id=tool_call_id,
                )
            ],
        }
    )


@tool
def submit_system_design_evaluation(
    overall_score: int,
    passed: bool,
    # System Design criteria
    design_clarity_score: int,
    design_clarity_max: int,
    design_clarity_feedback: str,
    tradeoff_analysis_score: int,
    tradeoff_analysis_max: int,
    tradeoff_analysis_feedback: str,
    api_design_score: int,
    api_design_max: int,
    api_design_feedback: str,
    implementation_score: int,
    implementation_max: int,
    implementation_feedback: str,
    communication_score: int,
    communication_max: int,
    communication_feedback: str,
    # Feedback
    feedback: str,
    blocking_reason: str | None,
    strengths: list[str],
    improvements: list[str],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """Submit fast evaluation for System Design assessment.

    Use this tool instead of submit_fast_evaluation when assessment_type is SYSTEM_DESIGN.

    Scoring Guide:
    - Design Clarity (30 pts): Architecture diagrams, component breakdown
    - Tradeoff Analysis (25 pts): Discussed pros/cons, alternatives
    - API Design (20 pts): RESTful, consistent, well-documented
    - Implementation (15 pts): Code quality of prototype
    - Communication (10 pts): Clear explanations, documentation

    Args:
        overall_score: Total score 0-100
        passed: Whether candidate passed
        design_clarity_score: Score for design clarity (0-30)
        design_clarity_max: Max score (30)
        design_clarity_feedback: Brief 1-sentence feedback
        tradeoff_analysis_score: Score for tradeoff analysis (0-25)
        tradeoff_analysis_max: Max score (25)
        tradeoff_analysis_feedback: Brief 1-sentence feedback
        api_design_score: Score for API design (0-20)
        api_design_max: Max score (20)
        api_design_feedback: Brief 1-sentence feedback
        implementation_score: Score for implementation (0-15)
        implementation_max: Max score (15)
        implementation_feedback: Brief 1-sentence feedback
        communication_score: Score for communication (0-10)
        communication_max: Max score (10)
        communication_feedback: Brief 1-sentence feedback
        feedback: 2-3 sentence overall feedback
        blocking_reason: If failed, why they can't proceed
        strengths: List of 2-3 key strengths
        improvements: List of 2-3 improvement areas

    Returns:
        Command that updates agent state with evaluation_result
    """
    # Clamp scores
    def clamp(val: int, min_val: int, max_val: int) -> int:
        return max(min_val, min(max_val, val))

    design_clarity_score = clamp(design_clarity_score, 0, design_clarity_max)
    tradeoff_analysis_score = clamp(tradeoff_analysis_score, 0, tradeoff_analysis_max)
    api_design_score = clamp(api_design_score, 0, api_design_max)
    implementation_score = clamp(implementation_score, 0, implementation_max)
    communication_score = clamp(communication_score, 0, communication_max)

    calculated_score = (
        design_clarity_score +
        tradeoff_analysis_score +
        api_design_score +
        implementation_score +
        communication_score
    )

    if overall_score != calculated_score:
        overall_score = calculated_score

    overall_score = clamp(overall_score, 0, 100)

    evaluation_result = {
        "passed": passed,
        "overallScore": overall_score,
        "assessmentType": "SYSTEM_DESIGN",
        "criteria": {
            "designClarity": {
                "score": design_clarity_score,
                "maxScore": design_clarity_max,
                "met": design_clarity_score >= (design_clarity_max * 0.6),
                "feedback": design_clarity_feedback,
            },
            "tradeoffAnalysis": {
                "score": tradeoff_analysis_score,
                "maxScore": tradeoff_analysis_max,
                "met": tradeoff_analysis_score >= (tradeoff_analysis_max * 0.6),
                "feedback": tradeoff_analysis_feedback,
            },
            "apiDesign": {
                "score": api_design_score,
                "maxScore": api_design_max,
                "met": api_design_score >= (api_design_max * 0.6),
                "feedback": api_design_feedback,
            },
            "implementation": {
                "score": implementation_score,
                "maxScore": implementation_max,
                "met": implementation_score >= (implementation_max * 0.6),
                "feedback": implementation_feedback,
            },
            "communication": {
                "score": communication_score,
                "maxScore": communication_max,
                "met": communication_score >= (communication_max * 0.6),
                "feedback": communication_feedback,
            },
        },
        "feedback": feedback,
        "blockingReason": blocking_reason,
        "strengths": strengths[:3] if strengths else [],
        "improvements": improvements[:3] if improvements else [],
        "metadata": {
            "model": settings.fast_progression_agent_model,
            "evaluationTimeMs": 0,
            "toolCallCount": 0,
            "inputTokens": 0,
            "outputTokens": 0,
        },
    }

    return Command(
        update={
            "evaluation_result": evaluation_result,
            "evaluation_complete": True,
            "messages": [
                ToolMessage(
                    content=f"System Design evaluation submitted. Score: {overall_score}/100 ({'PASSED' if passed else 'FAILED'})",
                    tool_call_id=tool_call_id,
                )
            ],
        }
    )


# =============================================================================
# Tool Lists
# =============================================================================

# Submission tools for fast evaluation
FAST_EVALUATION_SUBMISSION_TOOLS = [
    submit_fast_evaluation,
    submit_system_design_evaluation,
]
