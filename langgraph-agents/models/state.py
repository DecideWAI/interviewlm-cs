"""
State definitions for LangGraph agents.

IMPORTANT: As of LangGraph v1.0, custom state schemas must be TypedDict types.
Pydantic models and dataclasses are no longer supported for state.
"""

from datetime import datetime
from typing import Annotated, Literal, Sequence

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

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

    # Cache metrics (tracked because response_metadata is lost in LangGraph state)
    total_cache_creation_tokens: int
    total_cache_read_tokens: int
    total_input_tokens: int
    total_output_tokens: int


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
    task_info: dict | None  # Additional task details for routing

    # Results from sub-agents
    coding_result: dict | None
    interview_result: dict | None
    evaluation_result: dict | None

    # Session data for evaluation
    code_snapshots: list[dict] | None
    test_results: list[dict] | None
    claude_interactions: list[dict] | None
    terminal_commands: list[dict] | None

    # Processing state
    workflow_complete: bool


# =============================================================================
# Question Evaluation Types (5-criteria single question evaluation)
# =============================================================================

class QuestionCriterionScore(TypedDict):
    """Score for a single question evaluation criterion."""
    score: int  # 0-20
    feedback: str


class QuestionEvaluationCriteria(TypedDict):
    """All 5 criteria scores for question evaluation."""
    problem_completion: QuestionCriterionScore  # Does solution meet requirements?
    code_quality: QuestionCriterionScore  # Clean, readable, well-organized?
    best_practices: QuestionCriterionScore  # Follows language conventions?
    error_handling: QuestionCriterionScore  # Handles edge cases?
    efficiency: QuestionCriterionScore  # Reasonably performant?


class QuestionEvaluationResult(TypedDict):
    """Complete evaluation result for a single question."""
    session_id: str
    candidate_id: str
    question_id: str

    # 5-criteria scores (20 points each = 100 total)
    overall_score: int  # 0-100
    passed: bool  # Score >= threshold
    criteria: QuestionEvaluationCriteria

    # Feedback
    feedback: str
    strengths: list[str]
    improvements: list[str]

    # Metadata
    evaluated_at: str
    model: str


class QuestionEvaluationAgentState(TypedDict):
    """
    State for the Question Evaluation Agent.

    Evaluates a single question submission during an interview
    to determine if the candidate can proceed to the next question.
    Uses 5 criteria (20 points each = 100 total):
    1. Problem Completion
    2. Code Quality
    3. Best Practices
    4. Error Handling
    5. Efficiency
    """
    # Message history
    messages: Annotated[Sequence[BaseMessage], add_messages]

    # Session context
    session_id: str
    candidate_id: str
    question_id: str

    # Question context
    question_title: str
    question_description: str
    question_requirements: list[str] | None
    question_difficulty: str

    # Code to evaluate
    code: str
    language: str
    file_name: str | None

    # Optional: Test results from sandbox
    test_output: str | None
    tests_passed: int | None
    tests_failed: int | None

    # Passing threshold
    passing_threshold: int  # Default 70

    # Evaluation in progress
    problem_completion_score: QuestionCriterionScore | None
    code_quality_score: QuestionCriterionScore | None
    best_practices_score: QuestionCriterionScore | None
    error_handling_score: QuestionCriterionScore | None
    efficiency_score: QuestionCriterionScore | None

    # Final result
    evaluation_result: QuestionEvaluationResult | None

    # Processing state
    evaluation_complete: bool


# =============================================================================
# Question Generation Types
# =============================================================================

class ComplexityProfileDict(TypedDict, total=False):
    """Complexity profile for question generation."""
    role: str
    seniority: str
    assessment_type: str
    entity_count_min: int
    entity_count_max: int
    integration_points: int
    business_logic: str  # simple, moderate, complex, strategic
    ambiguity_level: str  # clear, some_decisions, open_ended, strategic
    time_minutes: int
    required_skills: list[str]
    optional_skill_pool: list[str]
    avoid_skills: list[str]
    pick_optional_count: int
    domain_pool: list[str]
    constraints: dict  # { mustInclude, shouldConsider, bonus }


class IRTAbilityEstimate(TypedDict):
    """Estimated candidate ability from IRT."""
    theta: float  # -3 to +3
    standard_error: float
    confidence_interval_lower: float
    confidence_interval_upper: float
    reliability: float  # 0-1
    questions_used: int


class IRTDifficultyTargeting(TypedDict):
    """Optimal difficulty for next question."""
    target_difficulty: float
    target_range_min: float
    target_range_max: float
    reasoning: str
    information_gain: float


class GenerationStrategyDict(TypedDict):
    """Strategy used to generate/select a question."""
    type: Literal["generate", "reuse", "iterate"]
    reason: str
    source_question_id: str | None


class GeneratedQuestionDict(TypedDict, total=False):
    """Generated question content."""
    title: str
    description: str
    requirements: list[str]
    estimated_time: int  # minutes
    starter_code: str
    difficulty: str | None
    difficulty_assessment: dict | None


class QuestionGenerationAgentState(TypedDict, total=False):
    """
    State for the Question Generation Agent.

    The Question Generation Agent creates unique coding questions
    using complexity profiles, IRT-based difficulty targeting, and
    smart reuse strategies.
    """
    # Message history (for LangGraph compatibility)
    messages: Annotated[Sequence[BaseMessage], add_messages]

    # Request parameters
    session_id: str
    candidate_id: str
    role: str
    seniority: str
    assessment_type: str  # REAL_WORLD or SYSTEM_DESIGN
    tech_stack: list[str]
    organization_id: str | None

    # Incremental generation context
    seed_id: str | None
    previous_questions: list[dict] | None
    previous_performance: list[dict] | None
    time_remaining: int | None  # seconds
    current_code_snapshot: str | None

    # Loaded data
    complexity_profile: ComplexityProfileDict | None
    selected_domain: str | None
    selected_skills: list[str] | None

    # IRT data
    irt_ability_estimate: IRTAbilityEstimate | None
    irt_difficulty_targeting: IRTDifficultyTargeting | None

    # Generation output
    generated_question: GeneratedQuestionDict | None
    generation_strategy: GenerationStrategyDict | None

    # Processing state
    generation_complete: bool
    error: str | None
