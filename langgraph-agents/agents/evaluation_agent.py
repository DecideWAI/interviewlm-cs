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

from tools.evaluation_tools import (
    analyze_code_quality,
    analyze_problem_solving,
    analyze_ai_collaboration,
    analyze_communication,
    EVALUATION_TOOLS,
)
from config import settings


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
    """State for the evaluation agent."""
    messages: Annotated[list[BaseMessage], add_messages]
    session_id: str
    candidate_id: str
    # Input data
    code_snapshots: list[dict]
    test_results: list[dict]
    claude_interactions: list[dict]
    terminal_commands: list[dict]
    # Dimension scores
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

**Your Role:**
Analyze completed interview sessions and provide evidence-based scoring across 4 dimensions.

**Evaluation Dimensions:**

1. **Code Quality (40%)** - Evaluate the final code output:
   - Test pass rate and correctness
   - Code organization and readability
   - Error handling and edge cases
   - Following language best practices
   - Security considerations

2. **Problem Solving (25%)** - Evaluate the approach:
   - How the candidate broke down the problem
   - Iteration patterns (productive debugging vs. random changes)
   - Use of terminal/tools for exploration
   - Recovery from mistakes
   - Time management

3. **AI Collaboration (20%)** - Evaluate AI usage:
   - Quality of prompts (specific, contextual, well-structured)
   - Effective use of AI suggestions
   - Understanding vs. copy-paste behavior
   - Balance of AI assistance vs. own thinking
   - Building on AI suggestions creatively

4. **Communication (15%)** - Evaluate clarity:
   - Code documentation and comments
   - Prompt clarity and specificity
   - Explaining reasoning in prompts
   - Asking clarifying questions

**Output Format:**
For each dimension, provide:
- Score (0-100)
- Confidence (0.0-1.0)
- Specific evidence from the session
- Breakdown of sub-scores if applicable

Be thorough, fair, and evidence-based. Avoid bias from irrelevant factors.

**Algorithm Understanding:**
When evaluating problem-solving, consider:
- Two Pointers: Sorted arrays, palindromes, partitioning
- Sliding Window: Subarrays, substrings, streaming data
- Binary Search: Sorted data, optimization problems
- Dynamic Programming: Overlapping subproblems
- BFS/DFS: Graph traversal, tree operations
- Divide and Conquer: Merge sort, binary operations

**Code Quality Indicators:**
- Clean, readable code with meaningful names
- Appropriate error handling
- Following language conventions
- Efficient algorithms (O(n), O(n log n) preferred)
- Edge case handling

**AI Collaboration Indicators:**
Good:
- Specific, contextual prompts
- Building on suggestions
- Asking for explanations
- Iterating on solutions

Poor:
- Vague "help me" prompts
- Copy-pasting without understanding
- Over-reliance on AI
- Not reading suggestions carefully"""


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
        max_tokens=4096,
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

    # Cache first message
    if request.messages and len(request.messages) > 0:
        message = request.messages[0]
        if hasattr(message, 'content'):
            if isinstance(message.content, str):
                message.content = [
                    {"type": "text", "text": message.content, "cache_control": cache_control}
                ]

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
    """Create the Evaluation Agent using LangGraph v1's create_agent."""
    model = _create_anthropic_model(settings.evaluation_agent_model)

    middleware = [
        model_selection_middleware,
        anthropic_caching_middleware,
    ]

    agent_kwargs = {
        "model": model,
        "tools": EVALUATION_TOOLS,
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

    Provides a convenient interface for evaluating interview sessions.
    """

    def __init__(self, checkpointer=None):
        """Initialize the Evaluation Agent."""
        self.graph = create_evaluation_agent_graph(use_checkpointing=checkpointer is not None)

    async def evaluate_session(
        self,
        session_id: str,
        candidate_id: str,
        code_snapshots: list[dict],
        test_results: list[dict],
        claude_interactions: list[dict],
        terminal_commands: list[dict] | None = None,
    ) -> EvaluationResult:
        """
        Evaluate a completed interview session.

        Args:
            session_id: Session identifier
            candidate_id: Candidate identifier
            code_snapshots: List of code snapshots with files and timestamps
            test_results: List of test run results
            claude_interactions: List of AI chat interactions
            terminal_commands: Optional list of terminal commands

        Returns:
            EvaluationResult with scores for all dimensions
        """
        # Build evaluation prompt with session data
        evaluation_prompt = self._build_evaluation_prompt(
            code_snapshots=code_snapshots,
            test_results=test_results,
            claude_interactions=claude_interactions,
            terminal_commands=terminal_commands or [],
        )

        config = {
            "configurable": {
                "thread_id": f"eval-{session_id}",
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

        # Parse evaluation from response
        return self._parse_evaluation_result(
            result,
            session_id=session_id,
            candidate_id=candidate_id,
            code_snapshots=code_snapshots,
        )

    def _build_evaluation_prompt(
        self,
        code_snapshots: list[dict],
        test_results: list[dict],
        claude_interactions: list[dict],
        terminal_commands: list[dict],
    ) -> str:
        """Build the evaluation prompt from session data."""
        prompt_parts = ["Please evaluate this interview session:\n"]

        # Final code snapshot
        if code_snapshots:
            final_snapshot = code_snapshots[-1]
            files = final_snapshot.get("files", {})
            prompt_parts.append("## Final Code:\n")
            for filename, content in files.items():
                prompt_parts.append(f"### {filename}\n```\n{content}\n```\n")

        # Test results
        if test_results:
            prompt_parts.append("\n## Test Results:\n")
            for result in test_results[-5:]:  # Last 5 test runs
                passed = result.get("passed", 0)
                failed = result.get("failed", 0)
                prompt_parts.append(f"- Passed: {passed}, Failed: {failed}\n")

        # AI interactions (summarized)
        if claude_interactions:
            prompt_parts.append(f"\n## AI Interactions ({len(claude_interactions)} total):\n")
            for interaction in claude_interactions[:10]:  # First 10 interactions
                role = interaction.get("role", "unknown")
                content = interaction.get("content", "")[:200]
                prompt_parts.append(f"[{role}]: {content}...\n")

        # Terminal commands
        if terminal_commands:
            prompt_parts.append(f"\n## Terminal Commands ({len(terminal_commands)} total):\n")
            for cmd in terminal_commands[-10:]:
                command = cmd.get("command", "")
                prompt_parts.append(f"$ {command}\n")

        prompt_parts.append("""
Please evaluate across all 4 dimensions and return a JSON response:
{
    "code_quality": {"score": 0-100, "confidence": 0.0-1.0, "evidence": ["..."], "breakdown": {...}},
    "problem_solving": {"score": 0-100, "confidence": 0.0-1.0, "evidence": ["..."], "breakdown": {...}},
    "ai_collaboration": {"score": 0-100, "confidence": 0.0-1.0, "evidence": ["..."], "breakdown": {...}},
    "communication": {"score": 0-100, "confidence": 0.0-1.0, "evidence": ["..."], "breakdown": {...}}
}
""")

        return "".join(prompt_parts)

    def _parse_evaluation_result(
        self,
        result: dict,
        session_id: str,
        candidate_id: str,
        code_snapshots: list[dict],
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

        # Detect biases
        bias_flags = detect_biases(
            code_snapshots,
            {
                "code_quality": code_quality,
                "problem_solving": problem_solving,
                "ai_collaboration": ai_collaboration,
                "communication": communication,
            },
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
            bias_flags=bias_flags,
        )

    async def evaluate_session_streaming(
        self,
        session_id: str,
        candidate_id: str,
        code_snapshots: list[dict],
        test_results: list[dict],
        claude_interactions: list[dict],
        terminal_commands: list[dict] | None = None,
        callbacks: Optional[EvaluationStreamingCallbacks] = None,
    ) -> AsyncGenerator[dict, None]:
        """
        Evaluate a session with streaming progress updates.

        Yields events as evaluation progresses.
        """
        evaluation_prompt = self._build_evaluation_prompt(
            code_snapshots=code_snapshots,
            test_results=test_results,
            claude_interactions=claude_interactions,
            terminal_commands=terminal_commands or [],
        )

        config = {"configurable": {"thread_id": f"eval-{session_id}"}}
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
                result, session_id, candidate_id, code_snapshots
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
