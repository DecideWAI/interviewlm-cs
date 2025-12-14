"""
Fast Progression Agent - Speed-Optimized Question Evaluation

Quick pass/fail evaluation for live interview question progression.
Target: ~20-40 seconds for decision.

Speed Optimizations:
1. Haiku model (~3x faster than Sonnet)
2. Limited tools: read_file, list_files, grep_files (NO run_tests)
3. Trust test results from input (avoid 10-30s test execution)
4. Minimal prompt for decisive evaluation
5. Max 2-3 tool calls

Uses 5 criteria for Real World (100 total):
- Problem Completion (30 pts)
- Code Quality (25 pts)
- Testing (20 pts) - based on provided test results
- Error Handling (15 pts)
- Efficiency (10 pts)

Or for System Design:
- Design Clarity (30 pts)
- Tradeoff Analysis (25 pts)
- API Design (20 pts)
- Implementation (15 pts)
- Communication (10 pts)
"""

from typing import Annotated, Literal
from datetime import datetime

from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_anthropic import ChatAnthropic, convert_to_anthropic_tool
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from typing_extensions import TypedDict

from tools.coding_tools import read_file, list_files, grep_files
from tools.fast_evaluation_tools import (
    submit_fast_evaluation,
    submit_system_design_evaluation,
    FAST_EVALUATION_SUBMISSION_TOOLS,
)
from config import settings, generate_question_eval_thread_uuid
from middleware import system_prompt_middleware


# =============================================================================
# State Schema
# =============================================================================


class FastCriterionScore(TypedDict):
    """Score for a single criterion."""
    score: int
    maxScore: int
    met: bool
    feedback: str


class FastRealWorldCriteria(TypedDict):
    """Real World assessment criteria."""
    problemCompletion: FastCriterionScore
    codeQuality: FastCriterionScore
    testing: FastCriterionScore
    errorHandling: FastCriterionScore
    efficiency: FastCriterionScore


class FastSystemDesignCriteria(TypedDict):
    """System Design assessment criteria."""
    designClarity: FastCriterionScore
    tradeoffAnalysis: FastCriterionScore
    apiDesign: FastCriterionScore
    implementation: FastCriterionScore
    communication: FastCriterionScore


class FastEvaluationMetadata(TypedDict):
    """Metadata about the evaluation."""
    model: str
    evaluationTimeMs: int
    toolCallCount: int
    inputTokens: int
    outputTokens: int


class FastEvaluationResult(TypedDict, total=False):
    """Complete fast evaluation result - matches TypeScript type."""
    passed: bool
    overallScore: int
    assessmentType: str
    criteria: FastRealWorldCriteria | FastSystemDesignCriteria
    feedback: str
    blockingReason: str | None
    strengths: list[str]
    improvements: list[str]
    metadata: FastEvaluationMetadata


class FastProgressionState(TypedDict, total=False):
    """State for the fast progression agent."""
    messages: Annotated[list[BaseMessage], add_messages]
    session_id: str
    candidate_id: str
    question_id: str
    question_title: str
    question_description: str
    question_requirements: list[str] | None
    question_difficulty: str
    assessment_type: str  # 'REAL_WORLD' | 'SYSTEM_DESIGN'
    language: str
    file_name: str | None
    # Test results from UI (trusted, not re-run)
    tests_passed: int
    tests_failed: int
    tests_total: int
    test_output: str | None
    passing_threshold: int
    # Result (set by submit_fast_evaluation tool)
    evaluation_result: FastEvaluationResult | None
    evaluation_complete: bool


class FastProgressionContext(TypedDict, total=False):
    """Runtime configuration."""
    session_id: str
    candidate_id: str
    question_id: str


# =============================================================================
# Tools (Speed-Optimized Subset)
# =============================================================================

# Workspace tools for code discovery
WORKSPACE_TOOLS = [
    read_file,     # Read solution file
    list_files,    # Explore workspace structure
    grep_files,    # Search for patterns (optional)
]

# All tools for the fast agent
FAST_PROGRESSION_TOOLS = WORKSPACE_TOOLS + FAST_EVALUATION_SUBMISSION_TOOLS


# =============================================================================
# System Prompt (Minimal for Speed)
# =============================================================================

FAST_PROGRESSION_PROMPT = """You are a FAST code evaluator. Goal: Quick, decisive pass/fail evaluation.

## SPEED RULES (CRITICAL)
- Make AT MOST 2-3 tool calls total
- Start with list_files to find solution file
- Then read_file to read the main solution
- Trust the provided test results - DO NOT run tests
- Be decisive - this is a gate check, not comprehensive review

## Test Results (TRUSTED - DO NOT RE-RUN)
You will receive test results in the prompt. Trust them completely.

## Assessment Type
Check the assessment_type in your state:
- REAL_WORLD: Use submit_fast_evaluation
- SYSTEM_DESIGN: Use submit_system_design_evaluation

## Real World Criteria (100 pts total)
1. Problem Completion (30 pts) - Core functionality, requirements met
2. Code Quality (25 pts) - Readability, organization, naming
3. Testing (20 pts) - Based on provided test results
4. Error Handling (15 pts) - Edge cases, validation
5. Efficiency (10 pts) - Time/space complexity

## System Design Criteria (100 pts total)
1. Design Clarity (30 pts) - Architecture, component breakdown
2. Tradeoff Analysis (25 pts) - Discussed alternatives, pros/cons
3. API Design (20 pts) - RESTful, consistent, documented
4. Implementation (15 pts) - Code quality of prototype
5. Communication (10 pts) - Clear explanations

## Workflow
1. list_files to find solution file
2. read_file to read the main solution
3. Call submit_fast_evaluation OR submit_system_design_evaluation with your scores

DO NOT explore extensively. Quick assessment only.
DO NOT run tests. Trust the provided test results.

CRITICAL: You MUST call submit_fast_evaluation or submit_system_design_evaluation."""


# =============================================================================
# Middleware
# =============================================================================


def _create_haiku_model() -> ChatAnthropic:
    """Create Haiku model for speed-optimized evaluation."""
    default_headers = {}
    beta_versions = []

    if settings.enable_prompt_caching:
        beta_versions = ["prompt-caching-2024-07-31"]
        default_headers["anthropic-beta"] = ",".join(beta_versions)

    return ChatAnthropic(
        model_name=settings.fast_progression_agent_model,
        max_tokens=2048,  # Reduced for speed
        temperature=0.2,  # Lower for consistency
        betas=beta_versions,
        default_headers=default_headers,
        api_key=settings.anthropic_api_key,
    )


@wrap_model_call
async def model_selection_middleware(request: ModelRequest, handler) -> ModelResponse:
    """Middleware that selects Haiku and converts tools."""
    model = _create_haiku_model()

    if request.tools:
        converted_tools = []
        for tool in request.tools:
            try:
                anthropic_tool = convert_to_anthropic_tool(tool)
                converted_tools.append(anthropic_tool)
            except Exception:
                converted_tools.append(tool)
        model = model.bind_tools(converted_tools)

    request.model = model
    return await handler(request)


@wrap_model_call
async def anthropic_caching_middleware(request: ModelRequest, handler) -> ModelResponse:
    """Add cache_control to system prompt and messages.

    IMPORTANT: Anthropic limits to 4 cache_control blocks maximum.
    We use 2 strategically:
    - Breakpoint 1: System prompt (caches prompt + tools as prefix)
    - Breakpoint 2: Last message (caches entire conversation)
    """
    if not settings.enable_prompt_caching:
        return await handler(request)

    cache_control = {"type": "ephemeral"}

    # First, REMOVE any existing cache_control from all messages to avoid accumulation
    if request.messages:
        for msg in request.messages:
            if hasattr(msg, 'content') and isinstance(msg.content, list):
                for block in msg.content:
                    if isinstance(block, dict) and "cache_control" in block:
                        del block["cache_control"]

    # 1. Add cache_control to system prompt's LAST block
    if request.system_prompt:
        if isinstance(request.system_prompt, str):
            request.system_prompt = [
                {
                    "type": "text",
                    "text": request.system_prompt,
                    "cache_control": cache_control,
                }
            ]
        elif isinstance(request.system_prompt, list) and len(request.system_prompt) > 0:
            # Remove existing cache_control from all blocks first
            for block in request.system_prompt:
                if isinstance(block, dict) and "cache_control" in block:
                    del block["cache_control"]
            # Add to last block only
            last_block = request.system_prompt[-1]
            if isinstance(last_block, dict):
                last_block["cache_control"] = cache_control
            elif isinstance(last_block, str):
                request.system_prompt[-1] = {
                    "type": "text",
                    "text": last_block,
                    "cache_control": cache_control,
                }

    # 2. Add cache_control to the LAST message ONLY to cache entire conversation
    # Skip tools caching to stay under 4 block limit
    if request.messages and len(request.messages) > 0:
        message = request.messages[-1]
        if hasattr(message, 'content'):
            if isinstance(message.content, str):
                message.content = [
                    {
                        "type": "text",
                        "text": message.content,
                        "cache_control": cache_control,
                    }
                ]
            elif isinstance(message.content, list) and len(message.content) > 0:
                last_block = message.content[-1]
                if isinstance(last_block, dict):
                    last_block["cache_control"] = cache_control
                elif isinstance(last_block, str):
                    message.content[-1] = {
                        "type": "text",
                        "text": last_block,
                        "cache_control": cache_control,
                    }

    return await handler(request)


# =============================================================================
# Agent Factory
# =============================================================================


def create_fast_progression_agent_graph(use_checkpointing: bool = True):
    """
    Create the Fast Progression Agent graph.

    Speed optimizations:
    - Haiku model
    - Limited tools (no run_tests)
    - Concise prompt

    Args:
        use_checkpointing: If True, use MemorySaver for checkpointing

    Returns:
        Compiled agent graph
    """
    model = _create_haiku_model()

    middleware = [
        system_prompt_middleware,
        model_selection_middleware,
        anthropic_caching_middleware,
    ]

    agent_kwargs = {
        "model": model,
        "tools": FAST_PROGRESSION_TOOLS,
        "system_prompt": FAST_PROGRESSION_PROMPT,
        "middleware": middleware,
        "state_schema": FastProgressionState,
        "context_schema": FastProgressionContext,
    }

    if use_checkpointing:
        agent_kwargs["checkpointer"] = MemorySaver()

    return create_agent(**agent_kwargs)


# =============================================================================
# Wrapper Class
# =============================================================================


class FastProgressionAgentGraph:
    """
    Fast Progression Agent wrapper class.

    Provides speed-optimized evaluation for question progression.
    Target: 20-40 seconds for decision.
    """

    def __init__(self, checkpointer=None):
        """Initialize the Fast Progression Agent."""
        self.graph = create_fast_progression_agent_graph(
            use_checkpointing=checkpointer is not None,
        )
        self.start_time = None

    def _build_evaluation_prompt(
        self,
        question_title: str,
        question_description: str,
        question_difficulty: str,
        question_requirements: list[str] | None,
        assessment_type: str,
        language: str,
        file_name: str | None,
        tests_passed: int,
        tests_failed: int,
        tests_total: int,
        test_output: str | None,
        passing_threshold: int,
    ) -> str:
        """Build concise evaluation prompt for speed."""
        requirements_text = ""
        if question_requirements:
            requirements_text = "\n- " + "\n- ".join(question_requirements[:5])
        else:
            requirements_text = "Complete the given task"

        # Calculate test pass rate
        test_pass_rate = (tests_passed / tests_total * 100) if tests_total > 0 else 0

        # Determine submission tool
        submission_tool = "submit_system_design_evaluation" if assessment_type == "SYSTEM_DESIGN" else "submit_fast_evaluation"

        return f"""QUICK EVALUATION - {question_difficulty.upper()} - {assessment_type}

**Question:** {question_title}
**Language:** {language}
{f'**Primary File:** {file_name}' if file_name else ''}
**Passing Threshold:** {passing_threshold}%

**Requirements:**{requirements_text}

**TEST RESULTS (TRUSTED - DO NOT RE-RUN):**
- Passed: {tests_passed}/{tests_total} ({test_pass_rate:.0f}%)
- Failed: {tests_failed}
{f'```{chr(10)}{test_output[:500]}{chr(10)}```' if test_output else ''}

**YOUR TASK:**
1. list_files to find solution file
2. read_file to read the code
3. Call {submission_tool} with scores

Assessment type: {assessment_type}
Use: {submission_tool}

Be quick and decisive. Score based on code quality and test results."""

    async def evaluate(
        self,
        session_id: str,
        candidate_id: str,
        question_id: str,
        question_title: str,
        question_description: str,
        question_difficulty: str,
        assessment_type: Literal["REAL_WORLD", "SYSTEM_DESIGN"],
        language: str,
        tests_passed: int,
        tests_failed: int,
        tests_total: int,
        question_requirements: list[str] | None = None,
        file_name: str | None = None,
        test_output: str | None = None,
        passing_threshold: int = 70,
    ) -> FastEvaluationResult:
        """
        Evaluate a question submission quickly.

        Args:
            session_id: Session identifier
            candidate_id: Candidate identifier
            question_id: Question identifier
            question_title: Title of the question
            question_description: Description (brief)
            question_difficulty: Difficulty level
            assessment_type: REAL_WORLD or SYSTEM_DESIGN
            language: Programming language
            tests_passed: Number of tests passed (from UI)
            tests_failed: Number of tests failed (from UI)
            tests_total: Total number of tests (from UI)
            question_requirements: Optional requirements list
            file_name: Optional hint for primary file
            test_output: Optional test output
            passing_threshold: Score needed to pass (default 70)

        Returns:
            FastEvaluationResult with scores and feedback
        """
        self.start_time = datetime.utcnow()

        evaluation_prompt = self._build_evaluation_prompt(
            question_title=question_title,
            question_description=question_description,
            question_difficulty=question_difficulty,
            question_requirements=question_requirements,
            assessment_type=assessment_type,
            language=language,
            file_name=file_name,
            tests_passed=tests_passed,
            tests_failed=tests_failed,
            tests_total=tests_total,
            test_output=test_output,
            passing_threshold=passing_threshold,
        )

        thread_uuid = generate_question_eval_thread_uuid(session_id, question_id)
        config = {
            "configurable": {
                "thread_id": thread_uuid,
                "session_id": session_id,
            }
        }

        context = {
            "session_id": session_id,
            "candidate_id": candidate_id,
            "question_id": question_id,
        }

        # Initial state with test results
        initial_state = {
            "messages": [HumanMessage(content=evaluation_prompt)],
            "session_id": session_id,
            "candidate_id": candidate_id,
            "question_id": question_id,
            "question_title": question_title,
            "question_description": question_description,
            "question_requirements": question_requirements,
            "question_difficulty": question_difficulty,
            "assessment_type": assessment_type,
            "language": language,
            "file_name": file_name,
            "tests_passed": tests_passed,
            "tests_failed": tests_failed,
            "tests_total": tests_total,
            "test_output": test_output,
            "passing_threshold": passing_threshold,
            "evaluation_result": None,
            "evaluation_complete": False,
        }

        result = await self.graph.ainvoke(
            initial_state,
            config=config,
            context=context,
        )

        # Calculate evaluation time
        end_time = datetime.utcnow()
        evaluation_time_ms = int((end_time - self.start_time).total_seconds() * 1000)

        # Get evaluation result from state
        evaluation_result = result.get("evaluation_result")

        if evaluation_result:
            # Update metadata with timing
            if "metadata" not in evaluation_result:
                evaluation_result["metadata"] = {}
            evaluation_result["metadata"]["evaluationTimeMs"] = evaluation_time_ms

            # Count tool calls from messages
            messages = result.get("messages", [])
            tool_calls = sum(
                1 for msg in messages
                if isinstance(msg, AIMessage) and msg.tool_calls
            )
            evaluation_result["metadata"]["toolCallCount"] = tool_calls

            # Override assessmentType from state
            evaluation_result["assessmentType"] = assessment_type

            return evaluation_result

        # Fallback result if agent didn't call submission tool
        test_pass_rate = (tests_passed / tests_total * 100) if tests_total > 0 else 0
        passed = test_pass_rate >= passing_threshold

        return FastEvaluationResult(
            passed=passed,
            overallScore=int(test_pass_rate),
            assessmentType=assessment_type,
            criteria=self._create_fallback_criteria(assessment_type, test_pass_rate),
            feedback=f"Agent did not submit evaluation. Fallback score based on test results: {tests_passed}/{tests_total}",
            blockingReason=None if passed else "Agent failed to complete evaluation",
            strengths=[],
            improvements=["Evaluation incomplete - please retry"],
            metadata=FastEvaluationMetadata(
                model=settings.fast_progression_agent_model,
                evaluationTimeMs=evaluation_time_ms,
                toolCallCount=0,
                inputTokens=0,
                outputTokens=0,
            ),
        )

    def _create_fallback_criteria(
        self,
        assessment_type: str,
        score: float,
    ) -> FastRealWorldCriteria | FastSystemDesignCriteria:
        """Create fallback criteria when agent doesn't submit."""
        base_score = int(score * 0.6)  # Rough approximation

        if assessment_type == "SYSTEM_DESIGN":
            return FastSystemDesignCriteria(
                designClarity=FastCriterionScore(score=base_score, maxScore=30, met=False, feedback="Evaluation incomplete"),
                tradeoffAnalysis=FastCriterionScore(score=int(base_score * 0.8), maxScore=25, met=False, feedback="Evaluation incomplete"),
                apiDesign=FastCriterionScore(score=int(base_score * 0.7), maxScore=20, met=False, feedback="Evaluation incomplete"),
                implementation=FastCriterionScore(score=int(base_score * 0.5), maxScore=15, met=False, feedback="Evaluation incomplete"),
                communication=FastCriterionScore(score=int(base_score * 0.3), maxScore=10, met=False, feedback="Evaluation incomplete"),
            )
        else:
            return FastRealWorldCriteria(
                problemCompletion=FastCriterionScore(score=base_score, maxScore=30, met=False, feedback="Evaluation incomplete"),
                codeQuality=FastCriterionScore(score=int(base_score * 0.8), maxScore=25, met=False, feedback="Evaluation incomplete"),
                testing=FastCriterionScore(score=int(base_score * 0.7), maxScore=20, met=False, feedback="Evaluation incomplete"),
                errorHandling=FastCriterionScore(score=int(base_score * 0.5), maxScore=15, met=False, feedback="Evaluation incomplete"),
                efficiency=FastCriterionScore(score=int(base_score * 0.3), maxScore=10, met=False, feedback="Evaluation incomplete"),
            )


def create_fast_progression_agent(checkpointer=None) -> FastProgressionAgentGraph:
    """Factory function to create a Fast Progression Agent."""
    return FastProgressionAgentGraph(checkpointer=checkpointer)


# =============================================================================
# Graph Export for LangGraph Cloud
# =============================================================================
# LangGraph Cloud automatically handles checkpointing

fast_progression_graph = create_fast_progression_agent_graph(
    use_checkpointing=False,  # Platform provides checkpointing
)
