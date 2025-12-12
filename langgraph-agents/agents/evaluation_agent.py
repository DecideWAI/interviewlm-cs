"""
Evaluation Agent - LangGraph v1 Implementation

Evaluates completed interviews with evidence-based scoring across 4 dimensions:
1. Code Quality (40%)
2. Problem Solving (25%)
3. AI Collaboration (20%)
4. Communication (15%)

Uses langchain.agents.create_agent with native middleware support for
Anthropic prompt caching.
"""

from typing import Annotated, Optional, Callable, AsyncGenerator, Any
from dataclasses import dataclass
from datetime import datetime

from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_anthropic import ChatAnthropic, convert_to_anthropic_tool
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from typing_extensions import TypedDict

# Workspace exploration tools (from coding agent)
# These connect to the Modal sandbox via volume_id stored in database
from tools.coding_tools import (
    list_files,
    read_file,
    grep_files,
    glob_files,
)
# Evaluation tools (DB query + analysis + storage)
from tools.evaluation_tools import (
    # DB query tools
    get_session_metadata,
    get_claude_interactions,
    get_test_results,
    get_code_snapshots,
    # Analysis tools
    analyze_code_quality,
    analyze_problem_solving,
    analyze_ai_collaboration,
    analyze_communication,
    # Storage tools
    store_evaluation_result,
    send_evaluation_progress,
    EVALUATION_TOOLS,
    DB_QUERY_TOOLS,
    ANALYSIS_TOOLS,
    STORAGE_TOOLS,
)
from config import settings


# =============================================================================
# Combined Tools for Agentic Evaluation
# =============================================================================

# Workspace exploration tools
WORKSPACE_TOOLS = [
    list_files,
    read_file,
    grep_files,
    glob_files,
]

# All tools for the agentic evaluation agent (workspace + DB + analysis + storage)
# Workspace tools reconnect to sandbox via volume_id, DB has get_code_snapshots as fallback
AGENTIC_EVALUATION_TOOLS = WORKSPACE_TOOLS + DB_QUERY_TOOLS + ANALYSIS_TOOLS + STORAGE_TOOLS


# =============================================================================
# State Schema (LangGraph v1 style)
# =============================================================================

class DimensionScore(TypedDict, total=False):
    """Score for a single evaluation dimension."""
    score: int  # 0-100
    confidence: float  # 0-1
    evidence: list[dict]
    breakdown: dict | None


class EvaluationResult(TypedDict, total=False):
    """Complete evaluation result."""
    session_id: str
    candidate_id: str
    code_quality: DimensionScore
    problem_solving: DimensionScore
    ai_collaboration: DimensionScore
    communication: DimensionScore
    overall_score: int
    overall_confidence: float
    evaluated_at: str
    model: str
    bias_flags: list[str]


class EvaluationAgentState(TypedDict, total=False):
    """State for the evaluation agent.

    The agent discovers data via tools rather than receiving pre-packaged data:
    - Code files: list_files, read_file, grep_files, glob_files (workspace)
    - Session data: get_session_metadata, get_claude_interactions, get_test_results (database)
    """
    messages: Annotated[list[BaseMessage], add_messages]
    session_id: str
    candidate_id: str
    # Dimension scores (populated by analysis tools)
    code_quality_score: DimensionScore | None
    problem_solving_score: DimensionScore | None
    ai_collaboration_score: DimensionScore | None
    communication_score: DimensionScore | None
    # Final result
    evaluation_result: EvaluationResult | None
    evaluation_complete: bool


class EvaluationAgentContext(TypedDict, total=False):
    """Runtime configuration passed via config["configurable"]."""
    session_id: str
    candidate_id: str


# =============================================================================
# Streaming Callbacks
# =============================================================================

@dataclass
class EvaluationStreamingCallbacks:
    """Callbacks for streaming events during evaluation."""
    on_dimension_start: Optional[Callable[[str], None]] = None
    on_dimension_complete: Optional[Callable[[str, dict], None]] = None
    on_aggregation_start: Optional[Callable[[], None]] = None
    on_complete: Optional[Callable[[dict], None]] = None
    on_error: Optional[Callable[[Exception], None]] = None


# =============================================================================
# Scoring Weights
# =============================================================================

DEFAULT_SCORING_WEIGHTS = {
    "code_quality": 0.40,
    "problem_solving": 0.25,
    "ai_collaboration": 0.20,
    "communication": 0.15,
}


# =============================================================================
# System Prompt
# =============================================================================

EVALUATION_SYSTEM_PROMPT = """You are an expert technical interviewer evaluating coding interview sessions.

**Your Workflow:**
You must DISCOVER the session data using your tools, ANALYZE, SCORE, and STORE the results.

1. **SEND PROGRESS**: Use `send_evaluation_progress` to notify the frontend you are starting (10%)
2. **GET CONTEXT**: Use `get_session_metadata` to understand the session (problem, language, duration)
3. **SEND PROGRESS**: Update progress to 20%
4. **EXPLORE CODE**: Use `list_files` to see the workspace structure
5. **READ CODE**: Use `read_file` to examine solution files (look for main code files)
6. **SEND PROGRESS**: Update progress to 40%
7. **GET HISTORY**: Use `get_claude_interactions` and `get_test_results` to see what happened
8. **SEND PROGRESS**: Update progress to 60%
9. **ANALYZE**: Score each dimension with evidence (progress 80%)
10. **STORE RESULTS**: Use `store_evaluation_result` to save scores to database and notify frontend

**Available Tools:**

*Progress & Storage:*
- `send_evaluation_progress(session_id, candidate_id, status, progress_percent, current_step)` - Send real-time progress updates
- `store_evaluation_result(...)` - Save final evaluation to database (MUST call at the end)

*Workspace Exploration:*
- `list_files(path)` - List directory contents
- `read_file(file_path)` - Read file content
- `grep_files(pattern, path)` - Search for patterns
- `glob_files(pattern)` - Find files by pattern

*Database Query:*
- `get_session_metadata(session_id)` - Get session info, problem title, language
- `get_claude_interactions(session_id)` - Get full AI chat history
- `get_test_results(session_id)` - Get test run history

*Analysis (use after gathering data):*
- `analyze_code_quality(code_snapshots, test_results)` - Score code
- `analyze_problem_solving(code_snapshots, test_results, terminal_commands)` - Score approach
- `analyze_ai_collaboration(claude_interactions, metrics)` - Score AI usage
- `analyze_communication(claude_interactions, code_snapshots)` - Score clarity

**Evaluation Dimensions:**

1. **Code Quality (40%)** - Final code output:
   - Test pass rate and correctness
   - Code organization and readability
   - Error handling and edge cases
   - Following language best practices

2. **Problem Solving (25%)** - The approach:
   - How the candidate broke down the problem
   - Iteration patterns (productive debugging vs. random changes)
   - Recovery from mistakes

3. **AI Collaboration (20%)** - AI usage quality:
   - Quality of prompts (specific, contextual, well-structured)
   - Understanding vs. copy-paste behavior
   - Balance of AI assistance vs. own thinking

4. **Communication (15%)** - Clarity:
   - Code documentation and comments
   - Prompt clarity and specificity

**IMPORTANT: You MUST call `store_evaluation_result` at the end with all scores.**
Calculate overall_score using weights: code_quality*0.40 + problem_solving*0.25 + ai_collaboration*0.20 + communication*0.15

Be thorough, fair, and evidence-based. Start by sending a progress update, then explore the session data."""


# =============================================================================
# Middleware: Model Selection with Caching
# =============================================================================

def _create_anthropic_model(model_name: str) -> ChatAnthropic:
    """Create Anthropic model with prompt caching configuration."""
    default_headers = {}
    beta_versions = []

    if settings.enable_prompt_caching:
        beta_versions = ["prompt-caching-2024-07-31"]
        default_headers["anthropic-beta"] = ",".join(beta_versions)

    return ChatAnthropic(
        model_name=model_name,
        max_tokens=32000,
        temperature=0.3,
        betas=beta_versions,
        default_headers=default_headers,
        api_key=settings.anthropic_api_key,
    )


@wrap_model_call
async def model_selection_middleware(request: ModelRequest, handler) -> ModelResponse:
    """Middleware that selects the appropriate model and converts tools."""
    model = _create_anthropic_model(settings.evaluation_agent_model)

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
    """Add cache_control to system prompt, tools, and messages."""
    if not settings.enable_prompt_caching:
        return await handler(request)

    cache_control = {"type": "ephemeral"}

    # Cache system prompt
    if request.system_prompt:
        if isinstance(request.system_prompt, str):
            request.system_prompt = [
                {"type": "text", "text": request.system_prompt, "cache_control": cache_control}
            ]
        elif isinstance(request.system_prompt, list) and len(request.system_prompt) > 0:
            last_block = request.system_prompt[-1]
            if isinstance(last_block, dict):
                last_block["cache_control"] = cache_control

    # Cache last tool
    if request.tools and len(request.tools) > 0:
        last_tool = request.tools[-1]
        if isinstance(last_tool, dict):
            last_tool["cache_control"] = cache_control

    # Cache ALL messages - place cache_control on LAST message
    if request.messages and len(request.messages) > 0:
        message = request.messages[-1]
        if hasattr(message, 'content'):
            if isinstance(message.content, str):
                message.content = [
                    {"type": "text", "text": message.content, "cache_control": cache_control}
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
# Bias Detection
# =============================================================================

def detect_biases(
    code_snapshots: list[dict],
    scores: dict[str, DimensionScore],
) -> list[str]:
    """Detect potential scoring biases."""
    flags = []

    # Code volume bias: High score but very little code
    if code_snapshots and scores.get("code_quality", {}).get("score", 0) > 80:
        final_code = code_snapshots[-1] if code_snapshots else {}
        files = final_code.get("files", {})
        total_lines = sum(
            len(content.split("\n"))
            for content in files.values()
            if isinstance(content, str)
        )
        if total_lines < 20:
            flags.append("code_volume_bias: High score with minimal code")

    return flags


# =============================================================================
# Agent Factory
# =============================================================================

def create_evaluation_agent_graph(use_checkpointing: bool = True):
    """Create the Evaluation Agent using LangGraph v1's create_agent.

    The agent uses agentic discovery with workspace exploration and database query tools.

    Args:
        use_checkpointing: Whether to use memory checkpointing
    """
    model = _create_anthropic_model(settings.evaluation_agent_model)

    middleware = [
        model_selection_middleware,
        anthropic_caching_middleware,
    ]

    agent_kwargs = {
        "model": model,
        "tools": AGENTIC_EVALUATION_TOOLS,  # Workspace + DB + analysis tools
        "system_prompt": EVALUATION_SYSTEM_PROMPT,
        "middleware": middleware,
        "state_schema": EvaluationAgentState,
        "context_schema": EvaluationAgentContext,
    }

    if use_checkpointing:
        agent_kwargs["checkpointer"] = MemorySaver()

    return create_agent(**agent_kwargs)


# =============================================================================
# Wrapper Class
# =============================================================================

class EvaluationAgentGraph:
    """
    Evaluation Agent wrapper class.

    Uses agentic discovery to evaluate interview sessions. The agent:
    1. Queries the database for session metadata, interactions, and test results
    2. Explores the workspace to read code files
    3. Analyzes and scores across all dimensions
    """

    def __init__(self, checkpointer=None):
        """Initialize the Evaluation Agent."""
        self.graph = create_evaluation_agent_graph(
            use_checkpointing=checkpointer is not None,
        )

    async def evaluate_session(
        self,
        session_id: str,
        candidate_id: str,
    ) -> EvaluationResult:
        """
        Evaluate a completed interview session using agentic discovery.

        The agent will autonomously:
        1. Call get_session_metadata to understand the session context
        2. Use list_files/read_file to explore the workspace code
        3. Call get_claude_interactions to get AI chat history
        4. Call get_test_results to get test run history
        5. Analyze and score across all 4 dimensions

        Args:
            session_id: Session recording ID (used for DB queries and workspace access)
            candidate_id: Candidate ID

        Returns:
            EvaluationResult with scores for all dimensions
        """
        evaluation_prompt = f"""Evaluate interview session {session_id}.

Start by using get_session_metadata to understand the context, then explore the workspace
and gather all relevant data before scoring.

Session ID: {session_id}
"""

        config = {
            "configurable": {
                "thread_id": f"eval-{session_id}",
                "session_id": session_id,  # Used by DB query tools
                "candidate_id": candidate_id,  # Used by workspace tools (Modal sandbox key)
            }
        }

        context = {
            "session_id": session_id,
            "candidate_id": candidate_id,
        }

        result = await self.graph.ainvoke(
            {"messages": [HumanMessage(content=evaluation_prompt)]},
            config=config,
            context=context,
        )

        return self._parse_evaluation_result(
            result,
            session_id=session_id,
            candidate_id=candidate_id,
        )

    def _parse_evaluation_result(
        self,
        result: dict,
        session_id: str,
        candidate_id: str,
    ) -> EvaluationResult:
        """Parse the evaluation result from agent response."""
        import json

        # Extract response text
        messages = result.get("messages", [])
        response_text = ""
        for msg in messages:
            if isinstance(msg, AIMessage):
                if isinstance(msg.content, str):
                    response_text = msg.content
                elif isinstance(msg.content, list):
                    for block in msg.content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            response_text = block.get("text", "")
                            break
                break

        # Parse JSON from response
        scores = {}
        try:
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            if start >= 0 and end > start:
                json_str = response_text[start:end]
                scores = json.loads(json_str)
        except json.JSONDecodeError:
            pass

        # Build dimension scores
        code_quality = DimensionScore(
            score=scores.get("code_quality", {}).get("score", 50),
            confidence=scores.get("code_quality", {}).get("confidence", 0.5),
            evidence=scores.get("code_quality", {}).get("evidence", []),
            breakdown=scores.get("code_quality", {}).get("breakdown"),
        )
        problem_solving = DimensionScore(
            score=scores.get("problem_solving", {}).get("score", 50),
            confidence=scores.get("problem_solving", {}).get("confidence", 0.5),
            evidence=scores.get("problem_solving", {}).get("evidence", []),
            breakdown=scores.get("problem_solving", {}).get("breakdown"),
        )
        ai_collaboration = DimensionScore(
            score=scores.get("ai_collaboration", {}).get("score", 50),
            confidence=scores.get("ai_collaboration", {}).get("confidence", 0.5),
            evidence=scores.get("ai_collaboration", {}).get("evidence", []),
            breakdown=scores.get("ai_collaboration", {}).get("breakdown"),
        )
        communication = DimensionScore(
            score=scores.get("communication", {}).get("score", 50),
            confidence=scores.get("communication", {}).get("confidence", 0.5),
            evidence=scores.get("communication", {}).get("evidence", []),
            breakdown=scores.get("communication", {}).get("breakdown"),
        )

        # Calculate overall score
        overall_score = round(
            code_quality["score"] * DEFAULT_SCORING_WEIGHTS["code_quality"] +
            problem_solving["score"] * DEFAULT_SCORING_WEIGHTS["problem_solving"] +
            ai_collaboration["score"] * DEFAULT_SCORING_WEIGHTS["ai_collaboration"] +
            communication["score"] * DEFAULT_SCORING_WEIGHTS["communication"]
        )

        overall_confidence = min(
            code_quality["confidence"],
            problem_solving["confidence"],
            ai_collaboration["confidence"],
            communication["confidence"],
        )

        return EvaluationResult(
            session_id=session_id,
            candidate_id=candidate_id,
            code_quality=code_quality,
            problem_solving=problem_solving,
            ai_collaboration=ai_collaboration,
            communication=communication,
            overall_score=overall_score,
            overall_confidence=overall_confidence,
            evaluated_at=datetime.utcnow().isoformat(),
            model=settings.evaluation_agent_model,
            bias_flags=[],  # Bias detection removed in agentic mode
        )

    async def evaluate_session_streaming(
        self,
        session_id: str,
        candidate_id: str,
        callbacks: Optional[EvaluationStreamingCallbacks] = None,
    ) -> AsyncGenerator[dict, None]:
        """
        Evaluate a session with streaming progress updates using agentic discovery.

        Yields events as evaluation progresses.
        """
        evaluation_prompt = f"""Evaluate interview session {session_id}.

Start by using get_session_metadata to understand the context, then explore the workspace
and gather all relevant data before scoring.

Session ID: {session_id}
"""

        config = {
            "configurable": {
                "thread_id": f"eval-{session_id}",
                "session_id": session_id,
            }
        }
        context = {"session_id": session_id, "candidate_id": candidate_id}

        try:
            if callbacks and callbacks.on_dimension_start:
                callbacks.on_dimension_start("evaluation")

            yield {"type": "evaluation_start"}

            async for event in self.graph.astream_events(
                {"messages": [HumanMessage(content=evaluation_prompt)]},
                config=config,
                context=context,
                version="v2",
            ):
                event_type = event.get("event")
                data = event.get("data", {})

                if event_type == "on_chat_model_stream":
                    chunk = data.get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        yield {"type": "text_delta", "delta": chunk.content}

            # Parse final result
            result = await self.graph.ainvoke(
                {"messages": [HumanMessage(content=evaluation_prompt)]},
                config=config,
                context=context,
            )

            evaluation_result = self._parse_evaluation_result(
                result, session_id, candidate_id
            )

            if callbacks and callbacks.on_complete:
                callbacks.on_complete(evaluation_result)

            yield {"type": "complete", "result": evaluation_result}

        except Exception as e:
            if callbacks and callbacks.on_error:
                callbacks.on_error(e)
            yield {"type": "error", "error": str(e)}


def create_evaluation_agent(checkpointer=None) -> EvaluationAgentGraph:
    """Factory function to create an Evaluation Agent."""
    return EvaluationAgentGraph(checkpointer=checkpointer)


# =============================================================================
# Graph Export for LangGraph Cloud
# =============================================================================
# LangGraph Cloud automatically handles checkpointing - do NOT specify checkpointer
# The platform injects its own PostgreSQL-backed checkpointer

evaluation_graph = create_evaluation_agent_graph(use_checkpointing=False)
