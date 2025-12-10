"""
Pydantic models for Question Generation Agent.

These are data models for API request/response and internal data structures.
Note: LangGraph state uses TypedDict (see state.py), not Pydantic models.
"""

from typing import Literal
from pydantic import BaseModel, Field


# =============================================================================
# IRT (Item Response Theory) Models
# =============================================================================

class PerformanceRecord(BaseModel):
    """Performance record for IRT calculations."""
    question_id: str
    score: float = Field(ge=0, le=1, description="Normalized score 0-1")
    difficulty: float = Field(description="Question difficulty (b parameter)")
    discrimination: float = Field(default=1.0, description="Discrimination (a parameter)")
    time_spent: float = Field(description="Minutes spent")
    expected_time: float = Field(description="Expected minutes")


class CandidateAbilityEstimate(BaseModel):
    """Estimated candidate ability from IRT."""
    theta: float = Field(ge=-3, le=3, description="Ability estimate")
    standard_error: float = Field(description="Uncertainty in estimate")
    confidence_interval: tuple[float, float] = Field(description="95% CI")
    reliability: float = Field(ge=0, le=1, description="Estimate reliability")
    questions_used: int = Field(description="Questions used in estimate")


class DifficultyTargeting(BaseModel):
    """Optimal difficulty for next question."""
    target_difficulty: float = Field(description="Target b parameter")
    target_range: tuple[float, float] = Field(description="Acceptable range")
    reasoning: str = Field(description="Human-readable explanation")
    information_gain: float = Field(description="Expected Fisher information")


class DifficultyVisibility(BaseModel):
    """Difficulty info visible to candidate."""
    level: str = Field(description="e.g., 'Intermediate'")
    description: str = Field(description="Friendly description")
    progress_indicator: str = Field(description="Visual indicator e.g., '███░░'")
    encouragement: str = Field(description="Motivational message")


class ShouldContinueResult(BaseModel):
    """Result of should_continue_assessment check."""
    continue_assessment: bool = Field(alias="continue")
    reason: str


# =============================================================================
# Complexity Profile Models
# =============================================================================

class ComplexityConstraints(BaseModel):
    """Constraints for question generation."""
    must_include: list[str] = Field(default_factory=list, alias="mustInclude")
    should_consider: list[str] = Field(default_factory=list, alias="shouldConsider")
    bonus: list[str] = Field(default_factory=list)

    class Config:
        populate_by_name = True


class ComplexityProfileData(BaseModel):
    """Complexity profile for question generation."""
    role: str
    seniority: str
    assessment_type: str
    entity_count_min: int = Field(alias="entityCountMin")
    entity_count_max: int = Field(alias="entityCountMax")
    integration_points: int = Field(alias="integrationPoints")
    business_logic: Literal["simple", "moderate", "complex", "strategic"] = Field(alias="businessLogic")
    ambiguity_level: Literal["clear", "some_decisions", "open_ended", "strategic"] = Field(alias="ambiguityLevel")
    time_minutes: int = Field(alias="timeMinutes")
    required_skills: list[str] = Field(alias="requiredSkills")
    optional_skill_pool: list[str] = Field(alias="optionalSkillPool")
    avoid_skills: list[str] = Field(alias="avoidSkills")
    pick_optional_count: int = Field(alias="pickOptionalCount")
    domain_pool: list[str] = Field(alias="domainPool")
    constraints: ComplexityConstraints

    class Config:
        populate_by_name = True


# =============================================================================
# Generated Question Models
# =============================================================================

class GeneratedQuestionContent(BaseModel):
    """Content of a generated question."""
    title: str
    description: str
    requirements: list[str]
    estimated_time: int = Field(alias="estimatedTime", description="Minutes")
    starter_code: str = Field(alias="starterCode")
    difficulty: str | None = None  # For incremental questions

    class Config:
        populate_by_name = True


class DifficultyAssessment(BaseModel):
    """Difficulty assessment metadata for incremental questions."""
    raw_difficulty: float = Field(alias="rawDifficulty")
    calibrated_difficulty: float | None = Field(default=None, alias="calibratedDifficulty")
    complexity_score: float | None = Field(default=None, alias="complexityScore")
    reasoning: str | None = None

    class Config:
        populate_by_name = True


class GenerationStrategy(BaseModel):
    """Strategy used to generate/select a question."""
    type: Literal["generate", "reuse", "iterate"]
    reason: str
    source_question_id: str | None = Field(default=None, alias="sourceQuestionId")

    class Config:
        populate_by_name = True


# =============================================================================
# API Request Models
# =============================================================================

class GenerateQuestionRequest(BaseModel):
    """Request for dynamic question generation."""
    role: str = Field(description="e.g., 'backend', 'frontend', 'fullstack'")
    seniority: str = Field(description="e.g., 'junior', 'mid', 'senior', 'staff', 'principal'")
    assessment_type: str = Field(default="REAL_WORLD", alias="assessmentType")
    tech_stack: list[str] = Field(default_factory=list, alias="techStack")
    organization_id: str | None = Field(default=None, alias="organizationId")

    class Config:
        populate_by_name = True


class PreviousQuestionData(BaseModel):
    """Data about a previous question in the assessment."""
    id: str
    title: str
    difficulty: str
    score: float | None = None
    started_at: str | None = Field(default=None, alias="startedAt")
    completed_at: str | None = Field(default=None, alias="completedAt")
    estimated_time: int = Field(alias="estimatedTime")

    class Config:
        populate_by_name = True


class PerformanceMetrics(BaseModel):
    """Performance metrics for a completed question."""
    question_id: str = Field(alias="questionId")
    score: float = Field(ge=0, le=1)
    time_spent: float = Field(alias="timeSpent", description="Minutes")
    tests_passed: int | None = Field(default=None, alias="testsPassed")
    tests_total: int | None = Field(default=None, alias="testsTotal")

    class Config:
        populate_by_name = True


class GenerateNextQuestionRequest(BaseModel):
    """Request for incremental/adaptive question generation."""
    session_id: str = Field(alias="sessionId")
    candidate_id: str = Field(alias="candidateId")
    seed_id: str = Field(alias="seedId")
    seniority: str
    previous_questions: list[PreviousQuestionData] = Field(alias="previousQuestions")
    previous_performance: list[PerformanceMetrics] = Field(alias="previousPerformance")
    time_remaining: int = Field(alias="timeRemaining", description="Seconds")
    current_code_snapshot: str | None = Field(default=None, alias="currentCodeSnapshot")
    assessment_type: str | None = Field(default=None, alias="assessmentType")

    class Config:
        populate_by_name = True


# =============================================================================
# API Response Models
# =============================================================================

class IRTDataResponse(BaseModel):
    """IRT analysis data in response."""
    ability_estimate: CandidateAbilityEstimate = Field(alias="abilityEstimate")
    difficulty_targeting: DifficultyTargeting = Field(alias="difficultyTargeting")
    difficulty_visibility: DifficultyVisibility = Field(alias="difficultyVisibility")
    should_continue: ShouldContinueResult = Field(alias="shouldContinue")

    class Config:
        populate_by_name = True


class GeneratedQuestionResponse(BaseModel):
    """Response for question generation."""
    title: str
    description: str
    requirements: list[str]
    estimated_time: int = Field(alias="estimatedTime")
    starter_code: str = Field(alias="starterCode")
    difficulty: str | None = None
    difficulty_assessment: DifficultyAssessment | None = Field(default=None, alias="difficultyAssessment")

    class Config:
        populate_by_name = True


class GenerateNextQuestionResponse(BaseModel):
    """Response for incremental question generation."""
    question: GeneratedQuestionResponse
    irt_data: IRTDataResponse | None = Field(default=None, alias="irtData")
    strategy: GenerationStrategy

    class Config:
        populate_by_name = True


# =============================================================================
# Question Pool Statistics
# =============================================================================

class QuestionPoolStats(BaseModel):
    """Statistics for question pool (smart reuse)."""
    seed_id: str = Field(alias="seedId")
    total_generated: int = Field(alias="totalGenerated")
    unique_questions: int = Field(alias="uniqueQuestions")
    avg_reuse_count: float = Field(alias="avgReuseCount")
    threshold: int
    last_generated_at: str | None = Field(default=None, alias="lastGeneratedAt")
    total_candidates_served: int = Field(alias="totalCandidatesServed")
    avg_uniqueness_score: float = Field(alias="avgUniquenessScore")

    class Config:
        populate_by_name = True
