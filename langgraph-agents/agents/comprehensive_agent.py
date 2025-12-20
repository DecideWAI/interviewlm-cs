"""
Comprehensive Evaluation Agent - Full Session Evaluation

Complete session evaluation for hiring managers with actionable reports.
Called after interview ends to generate full evaluation with:
- 4-dimension scoring with evidence
- Hiring recommendation with reasoning
- Actionable report (Skills Gap Matrix, Development Roadmap)
- Bias detection and fairness reporting

Uses Sonnet model for quality over speed (~3-5 minutes).

4 Evaluation Dimensions:
1. Code Quality (40%) - Test results, code organization, best practices
2. Problem Solving (25%) - Approach, iteration patterns, debugging
3. AI Collaboration (20%) - Prompt quality, understanding vs copy-paste
4. Communication (15%) - Code documentation, prompt clarity
"""

from typing import Annotated, Literal
from datetime import datetime

from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_anthropic import convert_to_anthropic_tool
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from typing_extensions import TypedDict

from services.model_factory import create_chat_model, create_model_from_context, is_anthropic_model

# Workspace exploration tools
from tools.coding_tools import list_files, read_file, grep_files, glob_files

# Evaluation tools
from tools.evaluation_tools import (
    # DB query
    get_session_metadata,
    get_claude_interactions,
    get_test_results,
    get_code_snapshots,
    # Analysis
    analyze_code_quality,
    analyze_problem_solving,
    analyze_ai_collaboration,
    analyze_communication,
    # Comprehensive-specific
    generate_actionable_report,
    generate_hiring_recommendation,
    detect_evaluation_bias,
    submit_comprehensive_evaluation,
    # Progress
    send_evaluation_progress,
    # Tool lists
    ALL_COMPREHENSIVE_EVALUATION_TOOLS,
)

from config import settings, generate_evaluation_thread_uuid
from middleware import SummarizationMiddleware, system_prompt_middleware


# =============================================================================
# State Schema
# =============================================================================


class DimensionScore(TypedDict, total=False):
    """Score for a single evaluation dimension."""
    score: int  # 0-100
    confidence: float  # 0-1
    evidence: list[dict]
    breakdown: dict | None


class HiringRecommendation(TypedDict, total=False):
    """Hiring recommendation with reasoning."""
    decision: str  # strong_yes, yes, maybe, no, strong_no
    confidence: float  # 0-1
    reasoning: dict


class ActionableReport(TypedDict, total=False):
    """Actionable report for hiring managers."""
    skills_matrix: dict
    development_roadmap: list[dict]
    interview_insights: dict
    onboarding_notes: dict


class ComprehensiveEvaluationResult(TypedDict, total=False):
    """Complete comprehensive evaluation result."""
    session_id: str
    candidate_id: str
    code_quality: DimensionScore
    problem_solving: DimensionScore
    ai_collaboration: DimensionScore
    communication: DimensionScore
    overall_score: int
    overall_confidence: float
    expertise_level: str
    expertise_growth_trend: str
    bias_flags: list[str]
    bias_detection: dict
    fairness_report: dict
    hiring_recommendation: HiringRecommendation
    actionable_report: ActionableReport
    evaluated_at: str
    model: str


class ComprehensiveEvaluationState(TypedDict, total=False):
    """State for the comprehensive evaluation agent."""
    messages: Annotated[list[BaseMessage], add_messages]
    session_id: str
    candidate_id: str
    role: str
    seniority: str
    # 4-dimension scores (populated by analysis tools)
    code_quality_score: DimensionScore | None
    problem_solving_score: DimensionScore | None
    ai_collaboration_score: DimensionScore | None
    communication_score: DimensionScore | None
    # Final result
    evaluation_result: ComprehensiveEvaluationResult | None
    actionable_report: ActionableReport | None
    hiring_recommendation: HiringRecommendation | None
    bias_flags: list[str]
    evaluation_complete: bool


class ComprehensiveEvaluationContext(TypedDict, total=False):
    """Runtime configuration."""
    session_id: str
    candidate_id: str


# =============================================================================
# Tools
# =============================================================================

# Workspace tools for code discovery
WORKSPACE_TOOLS = [
    list_files,
    read_file,
    grep_files,
    glob_files,
]

# All tools for comprehensive evaluation
COMPREHENSIVE_AGENT_TOOLS = WORKSPACE_TOOLS + ALL_COMPREHENSIVE_EVALUATION_TOOLS


# =============================================================================
# System Prompt
# =============================================================================

COMPREHENSIVE_EVALUATION_PROMPT = """You are an expert technical interviewer conducting a COMPREHENSIVE evaluation.

**Your Goal:** Provide a thorough, fair, evidence-based evaluation that helps hiring managers make informed decisions.

**Your Workflow:**

1. **SEND PROGRESS (10%)**: Use `send_evaluation_progress` to notify frontend you're starting

2. **GET CONTEXT (20%)**: Use `get_session_metadata` to understand the session
   - What problem was the candidate solving?
   - What language did they use?
   - How long was the session?

3. **EXPLORE CODE (40%)**:
   - Use `get_code_snapshots` (PREFERRED - works even if sandbox expired)
   - Or use `list_files` + `read_file` to explore workspace

4. **GET HISTORY (60%)**:
   - Use `get_claude_interactions` to see AI chat history
   - Use `get_test_results` to see test progression

5. **ANALYZE ALL DIMENSIONS (80%)**:
   - Use `analyze_code_quality` with code_snapshots and test_results
   - Use `analyze_problem_solving` with code_snapshots and test_results
   - Use `analyze_ai_collaboration` with claude_interactions
   - Use `analyze_communication` with claude_interactions and code_snapshots

6. **DETECT BIAS**: Use `detect_evaluation_bias` to check for fairness issues

7. **GENERATE REPORT**: Use `generate_actionable_report` for Skills Gap Matrix

8. **HIRING DECISION**: Use `generate_hiring_recommendation` for final recommendation

9. **SUBMIT (100%)**: Use `submit_comprehensive_evaluation` to save everything

**4-Dimension Scoring:**

1. **Code Quality (40%)** - The final code output:
   - Test pass rate and correctness
   - Code organization and readability
   - Error handling and edge cases
   - Following language best practices

2. **Problem Solving (25%)** - The approach:
   - How the candidate broke down the problem
   - Iteration patterns (productive vs. random changes)
   - Recovery from mistakes

3. **AI Collaboration (20%)** - AI usage quality:
   - Quality of prompts (specific, contextual, well-structured)
   - Understanding vs. copy-paste behavior
   - Balance of AI assistance vs. own thinking

4. **Communication (15%)** - Clarity:
   - Code documentation and comments
   - Prompt clarity and specificity

**Overall Score Calculation:**
overall_score = code_quality*0.40 + problem_solving*0.25 + ai_collaboration*0.20 + communication*0.15

**Hiring Decision Thresholds (vary by seniority):**
- Strong Yes: Exceptional performance exceeding role expectations
- Yes: Meets role requirements with confidence
- Maybe: Potential but has gaps to address
- No: Significant gaps for the role
- Strong No: Not a fit for the role

**CRITICAL RULES:**
1. MUST call `submit_comprehensive_evaluation` at the end
2. Be evidence-based - cite specific examples from the session
3. Be fair - check for bias before finalizing
4. Use `get_code_snapshots` instead of workspace tools when possible
5. Send progress updates to keep the frontend informed

Be thorough, fair, and constructive. This evaluation helps both hiring managers and candidates."""


# =============================================================================
# Middleware: Model Selection with Multi-Provider Support
# =============================================================================

# Store context for middleware access
_current_context: dict = {}


def set_model_context(context: dict) -> None:
    """Set the current context for model selection middleware."""
    global _current_context
    _current_context = context or {}


@wrap_model_call
async def model_selection_middleware(request: ModelRequest, handler) -> ModelResponse:
    """Middleware that selects the appropriate model and converts tools.

    Uses quality-optimized model tier for comprehensive evaluation.
    """
    global _current_context

    model = create_model_from_context(
        context=_current_context,
        default_provider=settings.comprehensive_evaluation_provider,
        default_model=settings.comprehensive_evaluation_model,
        temperature=0.3,
        max_tokens=32000,
    )

    if request.tools:
        if is_anthropic_model(model):
            converted_tools = []
            for tool in request.tools:
                try:
                    anthropic_tool = convert_to_anthropic_tool(tool)
                    converted_tools.append(anthropic_tool)
                except Exception:
                    converted_tools.append(tool)
            model = model.bind_tools(converted_tools)
        else:
            model = model.bind_tools(request.tools)

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


def create_comprehensive_evaluation_agent_graph(use_checkpointing: bool = True):
    """
    Create the Comprehensive Evaluation Agent graph.

    Quality optimizations:
    - Sonnet model for depth
    - Full tool access
    - Thorough system prompt

    Args:
        use_checkpointing: If True, use MemorySaver for checkpointing

    Returns:
        Compiled agent graph
    """
    # Create default model (will be replaced by middleware based on context)
    model = create_chat_model(
        provider=settings.comprehensive_evaluation_provider,
        model=settings.comprehensive_evaluation_model,
        temperature=0.3,
        max_tokens=32000,
    )

    middleware = [
        SummarizationMiddleware(model_name="claude-haiku-4-5-20251001"),  # Summarize long conversations (persists to state)
        system_prompt_middleware,      # Remove SystemMessages from persistence
        model_selection_middleware,
        anthropic_caching_middleware,
    ]

    agent_kwargs = {
        "model": model,
        "tools": COMPREHENSIVE_AGENT_TOOLS,
        "system_prompt": COMPREHENSIVE_EVALUATION_PROMPT,
        "middleware": middleware,
        "state_schema": ComprehensiveEvaluationState,
        "context_schema": ComprehensiveEvaluationContext,
    }

    if use_checkpointing:
        agent_kwargs["checkpointer"] = MemorySaver()

    return create_agent(**agent_kwargs)


# =============================================================================
# Wrapper Class
# =============================================================================


class ComprehensiveEvaluationAgentGraph:
    """
    Comprehensive Evaluation Agent wrapper class.

    Provides thorough session evaluation for hiring managers.
    Target: 3-5 minutes for complete evaluation.
    """

    def __init__(self, checkpointer=None):
        """Initialize the Comprehensive Evaluation Agent."""
        self.graph = create_comprehensive_evaluation_agent_graph(
            use_checkpointing=checkpointer is not None,
        )
        self.start_time = None

    def _build_evaluation_prompt(
        self,
        session_id: str,
        candidate_id: str,
        role: str,
        seniority: str,
    ) -> str:
        """Build evaluation prompt for comprehensive evaluation."""
        return f"""Conduct a COMPREHENSIVE evaluation of this interview session.

**Session Details:**
- Session ID: {session_id}
- Candidate ID: {candidate_id}
- Role: {role}
- Seniority Level: {seniority}

**Your Task:**
1. Use `send_evaluation_progress` to notify frontend (10%)
2. Use `get_session_metadata` to get session context (20%)
3. Use `get_code_snapshots` to retrieve the code (40%)
4. Use `get_claude_interactions` and `get_test_results` for history (60%)
5. Analyze all 4 dimensions with evidence (80%)
6. Use `detect_evaluation_bias` for fairness check
7. Use `generate_actionable_report` for Skills Gap Matrix
8. Use `generate_hiring_recommendation` for hiring decision
9. Use `submit_comprehensive_evaluation` to save results (100%)

**Role Context for {role} at {seniority} Level:**
Evaluate whether the candidate's skills match expectations for a {seniority} {role}.

**IMPORTANT:**
- Be thorough but fair
- Cite specific evidence from the session
- Check for bias before finalizing
- MUST call `submit_comprehensive_evaluation` at the end

Begin your evaluation now."""

    async def evaluate(
        self,
        session_id: str,
        candidate_id: str,
        role: str,
        seniority: str,
    ) -> ComprehensiveEvaluationResult:
        """
        Evaluate a completed interview session comprehensively.

        Args:
            session_id: Session identifier
            candidate_id: Candidate identifier
            role: Target role (e.g., "Backend Engineer")
            seniority: Seniority level (e.g., "Senior", "Mid", "Junior")

        Returns:
            ComprehensiveEvaluationResult with full evaluation
        """
        self.start_time = datetime.utcnow()

        evaluation_prompt = self._build_evaluation_prompt(
            session_id=session_id,
            candidate_id=candidate_id,
            role=role,
            seniority=seniority,
        )

        thread_uuid = generate_evaluation_thread_uuid(session_id)
        config = {
            "configurable": {
                "thread_id": thread_uuid,
                "session_id": session_id,
            }
        }

        context = {
            "session_id": session_id,
            "candidate_id": candidate_id,
        }

        # Initial state
        initial_state = {
            "messages": [HumanMessage(content=evaluation_prompt)],
            "session_id": session_id,
            "candidate_id": candidate_id,
            "role": role,
            "seniority": seniority,
            "code_quality_score": None,
            "problem_solving_score": None,
            "ai_collaboration_score": None,
            "communication_score": None,
            "evaluation_result": None,
            "actionable_report": None,
            "hiring_recommendation": None,
            "bias_flags": [],
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
            # Add timing metadata
            evaluation_result["evaluationTimeMs"] = evaluation_time_ms
            return evaluation_result

        # Fallback result if agent didn't call submission tool
        return ComprehensiveEvaluationResult(
            session_id=session_id,
            candidate_id=candidate_id,
            code_quality=DimensionScore(score=0, confidence=0, evidence=[]),
            problem_solving=DimensionScore(score=0, confidence=0, evidence=[]),
            ai_collaboration=DimensionScore(score=0, confidence=0, evidence=[]),
            communication=DimensionScore(score=0, confidence=0, evidence=[]),
            overall_score=0,
            overall_confidence=0,
            expertise_level="unknown",
            expertise_growth_trend="unknown",
            bias_flags=["evaluation_incomplete"],
            bias_detection={"flags": ["evaluation_incomplete"], "report": {}},
            fairness_report={"error": "Evaluation did not complete"},
            hiring_recommendation=HiringRecommendation(
                decision="no",
                confidence=0,
                reasoning={"error": "Evaluation did not complete"},
            ),
            actionable_report=ActionableReport(
                skills_matrix={},
                development_roadmap=[],
                interview_insights={},
                onboarding_notes={},
            ),
            evaluated_at=datetime.utcnow().isoformat(),
            model=settings.comprehensive_evaluation_model,
        )


def create_comprehensive_evaluation_agent(checkpointer=None) -> ComprehensiveEvaluationAgentGraph:
    """Factory function to create a Comprehensive Evaluation Agent."""
    return ComprehensiveEvaluationAgentGraph(checkpointer=checkpointer)


# =============================================================================
# Graph Export for LangGraph Cloud
# =============================================================================
# LangGraph Cloud automatically handles checkpointing

comprehensive_graph = create_comprehensive_evaluation_agent_graph(
    use_checkpointing=False,  # Platform provides checkpointing
)
