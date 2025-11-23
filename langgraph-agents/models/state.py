"""
State definitions for LangGraph agents.

IMPORTANT: As of LangGraph v1.0, custom state schemas must be TypedDict types.
Pydantic models and dataclasses are no longer supported for state.
"""

from typing import Annotated, Sequence, TypedDict, Literal
from datetime import datetime
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


# =============================================================================
# Shared Types
# =============================================================================

class Evidence(TypedDict):
    """Evidence supporting a score."""
    type: Literal["code_snippet", "test_result", "ai_interaction", "metric"]
    description: str
    timestamp: str | None
    code_snippet: str | None
    file_path: str | None
    line_number: int | None
    value: str | int | float | None


class DimensionScore(TypedDict):
    """Score for a single evaluation dimension."""
    score: int  # 0-100
    confidence: float  # 0-1
    evidence: list[Evidence]
    breakdown: dict[str, float] | None


class InterviewMetrics(TypedDict):
    """Interview metrics tracked for each session (hidden from candidates)."""
    session_id: str

    # IRT (Item Response Theory) parameters
    irt_theta: float  # Ability estimate (-3 to +3, 0 = average)
    irt_standard_error: float  # Confidence in theta estimate

    # Progress tracking
    questions_answered: int
    questions_correct: int
    questions_incorrect: int

    # AI usage metrics
    ai_interactions_count: int
    average_prompt_quality: float
    ai_dependency_score: float  # 0-100, higher = more dependent

    # Struggle indicators
    struggling_indicators: list[str]
    average_response_time: float  # seconds
    test_failure_rate: float  # 0-1

    # Adaptive difficulty
    current_difficulty: int  # 1-10
    recommended_next_difficulty: int

    # Timestamps
    last_updated: str


class EvaluationResult(TypedDict):
    """Complete evaluation result for a session."""
    session_id: str
    candidate_id: str

    # 4-dimension scores
    code_quality: DimensionScore
    problem_solving: DimensionScore
    ai_collaboration: DimensionScore
    communication: DimensionScore

    # Overall score
    overall_score: int
    overall_confidence: float

    # Metadata
    evaluated_at: str
    model: str
    bias_flags: list[str]


# =============================================================================
# Agent State Definitions (TypedDict - required for LangGraph v1)
# =============================================================================

class CodingAgentState(TypedDict):
    """
    State for the Coding Agent.

    The Coding Agent helps candidates solve problems during interviews
    with configurable helpfulness levels.
    """
    # Message history with reducer for automatic merging
    messages: Annotated[Sequence[BaseMessage], add_messages]

    # Session context
    session_id: str
    candidate_id: str
    workspace_root: str

    # Problem context
    problem_statement: str | None
    current_file: str | None
    current_code: dict[str, str] | None  # file_path -> content

    # Configuration
    helpfulness_level: Literal["consultant", "pair-programming", "full-copilot"]

    # Tool tracking
    tools_used: list[str]
    files_modified: list[str]
    tool_call_count: int

    # Iteration control
    iteration_count: int
    should_continue: bool


class InterviewAgentState(TypedDict):
    """
    State for the Interview Agent.

    The Interview Agent observes candidate progress (hidden from candidates)
    and adapts difficulty using IRT-based algorithms.
    """
    # Message history
    messages: Annotated[Sequence[BaseMessage], add_messages]

    # Session context
    session_id: str
    candidate_id: str

    # Interview metrics (hidden from candidate)
    metrics: InterviewMetrics

    # Current event being processed
    current_event_type: str | None
    current_event_data: dict | None

    # Processing state
    processing_complete: bool


class EvaluationAgentState(TypedDict):
    """
    State for the Evaluation Agent.

    The Evaluation Agent evaluates completed interviews with
    evidence-based scoring across 4 dimensions.
    """
    # Message history
    messages: Annotated[Sequence[BaseMessage], add_messages]

    # Session context
    session_id: str
    candidate_id: str

    # Session recording data
    code_snapshots: list[dict] | None
    test_results: list[dict] | None
    claude_interactions: list[dict] | None
    terminal_commands: list[dict] | None

    # Evaluation in progress
    code_quality_score: DimensionScore | None
    problem_solving_score: DimensionScore | None
    ai_collaboration_score: DimensionScore | None
    communication_score: DimensionScore | None

    # Final result
    evaluation_result: EvaluationResult | None

    # Processing state
    evaluation_complete: bool


class SupervisorState(TypedDict):
    """
    State for the Supervisor Agent.

    The Supervisor coordinates between specialized agents
    (Coding, Interview, Evaluation) based on task requirements.
    """
    # Message history
    messages: Annotated[Sequence[BaseMessage], add_messages]

    # Routing
    next_agent: Literal["coding", "interview", "evaluation", "end"] | None

    # Context passed between agents
    session_id: str
    candidate_id: str | None
    task_type: str | None

    # Results from sub-agents
    coding_result: dict | None
    interview_result: dict | None
    evaluation_result: dict | None

    # Processing state
    workflow_complete: bool
