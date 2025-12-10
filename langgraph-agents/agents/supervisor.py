"""
Supervisor Agent - LangGraph v1 Implementation

Coordinates between specialized agents (Coding, Interview, Evaluation)
using handoff tools for routing.

Uses langchain.agents.create_agent with native middleware support for
Anthropic prompt caching.
"""

from typing import Annotated, Literal
from datetime import datetime

from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_anthropic import ChatAnthropic, convert_to_anthropic_tool
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from typing_extensions import TypedDict

from config import settings


# =============================================================================
# State Schema (LangGraph v1 style)
# =============================================================================

class SupervisorState(TypedDict, total=False):
    """State for the supervisor agent."""
    messages: Annotated[list[BaseMessage], add_messages]
    session_id: str
    candidate_id: str
    next_agent: str | None
    task_type: str | None
    task_info: dict
    # Results from worker agents
    coding_result: dict | None
    interview_result: dict | None
    evaluation_result: dict | None
    workflow_complete: bool
    # Session data for evaluation
    code_snapshots: list[dict]
    test_results: list[dict]
    claude_interactions: list[dict]
    terminal_commands: list[dict]


class SupervisorContext(TypedDict, total=False):
    """Runtime configuration."""
    session_id: str
    candidate_id: str


# =============================================================================
# Handoff Tools
# =============================================================================

@tool
def handoff_to_coding_agent(
    task_description: str,
    session_id: str,
    helpfulness_level: str = "pair-programming",
) -> str:
    """
    Hand off to the Coding Agent for code assistance tasks.

    Use this when the candidate needs help with:
    - Writing or editing code
    - Debugging issues
    - Running tests
    - File operations
    - Understanding code structure

    Args:
        task_description: Description of what the candidate needs help with
        session_id: Session identifier for the interview
        helpfulness_level: Level of assistance (consultant, pair-programming, full-copilot)

    Returns:
        Confirmation that task was handed off
    """
    return f"Handing off to Coding Agent: {task_description}"


@tool
def handoff_to_interview_agent(
    event_type: str,
    event_data: dict,
    session_id: str,
) -> str:
    """
    Hand off to the Interview Agent for tracking metrics.

    Use this to report interview events that should be tracked:
    - AI interactions
    - Code changes
    - Test runs
    - Question completions

    Note: Interview Agent runs in background and is hidden from candidates.

    Args:
        event_type: Type of event (ai-interaction, code-changed, test-run, question-answered)
        event_data: Event-specific data
        session_id: Session identifier

    Returns:
        Confirmation that event was recorded
    """
    return f"Recorded {event_type} event for session {session_id}"


@tool
def handoff_to_evaluation_agent(
    session_id: str,
    candidate_id: str,
) -> str:
    """
    Hand off to the Evaluation Agent to evaluate a completed session.

    Use this when an interview session is complete and needs evaluation.
    The Evaluation Agent will analyze code quality, problem solving,
    AI collaboration, and communication skills.

    Args:
        session_id: Session identifier to evaluate
        candidate_id: Candidate identifier

    Returns:
        Confirmation that evaluation was started
    """
    return f"Starting evaluation for session {session_id}, candidate {candidate_id}"


@tool
def complete_workflow(summary: str) -> str:
    """
    Mark the workflow as complete.

    Use this when all tasks have been completed and no further
    agent assistance is needed.

    Args:
        summary: Summary of what was accomplished

    Returns:
        Completion confirmation
    """
    return f"Workflow complete: {summary}"


SUPERVISOR_TOOLS = [
    handoff_to_coding_agent,
    handoff_to_interview_agent,
    handoff_to_evaluation_agent,
    complete_workflow,
]


# =============================================================================
# System Prompt
# =============================================================================

SUPERVISOR_SYSTEM_PROMPT = """You are a Supervisor Agent coordinating an AI-powered technical interview platform.

You manage three specialized agents:

1. **Coding Agent** - Helps candidates with coding tasks
   - Use `handoff_to_coding_agent` for code assistance requests
   - Specify helpfulness level: consultant, pair-programming, or full-copilot

2. **Interview Agent** - Tracks candidate metrics (hidden from candidates)
   - Use `handoff_to_interview_agent` to record events
   - Events: ai-interaction, code-changed, test-run, question-answered

3. **Evaluation Agent** - Evaluates completed sessions
   - Use `handoff_to_evaluation_agent` when a session is complete
   - Returns scores for code quality, problem solving, AI collaboration, communication

**Your responsibilities:**
- Route requests to the appropriate agent
- Ensure events are tracked for evaluation
- Coordinate multi-step workflows
- Never reveal evaluation details to candidates

**Workflow patterns:**
- Coding request: handoff_to_coding_agent -> record ai-interaction
- Test run: handoff_to_coding_agent (run tests) -> record test-run
- Session complete: record session-complete -> handoff_to_evaluation_agent

**Algorithm Understanding:**
When routing coding requests, consider the nature of the task:
- Data structures: arrays, linked lists, trees, graphs, hash maps
- Algorithms: sorting, searching, dynamic programming, recursion
- Design patterns: factory, singleton, observer, strategy

**Assessment Integrity:**
- Never reveal evaluation criteria to candidates
- Don't discuss scoring or performance
- Focus on helping candidates succeed
- Track all significant events for later evaluation

Use `complete_workflow` when all tasks are done."""


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
        betas=beta_versions,
        default_headers=default_headers,
        api_key=settings.anthropic_api_key,
    )


@wrap_model_call
async def model_selection_middleware(request: ModelRequest, handler) -> ModelResponse:
    """Middleware that selects the appropriate model and converts tools."""
    model = _create_anthropic_model(settings.coding_agent_model)

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
# Agent Instance Cache
# =============================================================================

# Cache for agent instances (per session)
_coding_agents: dict[str, "CodingAgentGraph"] = {}
_interview_agent: "InterviewAgentGraph | None" = None
_evaluation_agent: "EvaluationAgentGraph | None" = None


def get_coding_agent(
    session_id: str,
    candidate_id: str,
    helpfulness_level: str = "pair-programming",
    problem_statement: str | None = None,
):
    """Get or create a coding agent for a session."""
    from .coding_agent import create_coding_agent

    global _coding_agents

    cache_key = f"{session_id}:{helpfulness_level}"

    if cache_key not in _coding_agents:
        _coding_agents[cache_key] = create_coding_agent(
            session_id=session_id,
            candidate_id=candidate_id,
            helpfulness_level=helpfulness_level,
            problem_statement=problem_statement,
        )

    return _coding_agents[cache_key]


def get_interview_agent():
    """Get or create the interview agent (singleton)."""
    from .interview_agent import create_interview_agent

    global _interview_agent

    if _interview_agent is None:
        _interview_agent = create_interview_agent()

    return _interview_agent


def get_evaluation_agent():
    """Get or create the evaluation agent (singleton)."""
    from .evaluation_agent import create_evaluation_agent

    global _evaluation_agent

    if _evaluation_agent is None:
        _evaluation_agent = create_evaluation_agent()

    return _evaluation_agent


def clear_agent_cache():
    """Clear the agent cache (useful for testing)."""
    global _coding_agents, _interview_agent, _evaluation_agent
    _coding_agents = {}
    _interview_agent = None
    _evaluation_agent = None


# =============================================================================
# Agent Factory
# =============================================================================

def create_supervisor_graph(use_checkpointing: bool = True):
    """Create the Supervisor Agent using LangGraph v1's create_agent."""
    model = _create_anthropic_model(settings.coding_agent_model)

    middleware = [
        model_selection_middleware,
        anthropic_caching_middleware,
    ]

    agent_kwargs = {
        "model": model,
        "tools": SUPERVISOR_TOOLS,
        "system_prompt": SUPERVISOR_SYSTEM_PROMPT,
        "middleware": middleware,
        "state_schema": SupervisorState,
        "context_schema": SupervisorContext,
    }

    if use_checkpointing:
        agent_kwargs["checkpointer"] = MemorySaver()

    return create_agent(**agent_kwargs)


# =============================================================================
# Wrapper Class
# =============================================================================

class SupervisorGraph:
    """
    Supervisor wrapper class.

    Provides a convenient interface for coordinating multi-agent workflows.
    """

    def __init__(self, checkpointer=None):
        """Initialize the Supervisor."""
        self.graph = create_supervisor_graph(use_checkpointing=checkpointer is not None)

    async def run_workflow(
        self,
        task: str,
        session_id: str,
        candidate_id: str | None = None,
        code_snapshots: list[dict] | None = None,
        test_results: list[dict] | None = None,
        claude_interactions: list[dict] | None = None,
        terminal_commands: list[dict] | None = None,
    ) -> dict:
        """
        Run a multi-agent workflow.

        Args:
            task: Description of the task to perform
            session_id: Session identifier
            candidate_id: Optional candidate identifier
            code_snapshots: Optional code snapshots for evaluation
            test_results: Optional test results for evaluation
            claude_interactions: Optional AI interactions for evaluation
            terminal_commands: Optional terminal commands for evaluation

        Returns:
            Dict with results from all agents involved
        """
        config = {
            "configurable": {
                "thread_id": f"supervisor-{session_id}",
            }
        }

        context = {
            "session_id": session_id,
            "candidate_id": candidate_id or "",
        }

        result = await self.graph.ainvoke(
            {"messages": [HumanMessage(content=task)]},
            config=config,
            context=context,
        )

        # Extract tool calls and execute worker agents
        messages = result.get("messages", [])
        coding_result = None
        interview_result = None
        evaluation_result = None

        for msg in messages:
            if isinstance(msg, AIMessage) and hasattr(msg, "tool_calls") and msg.tool_calls:
                for tool_call in msg.tool_calls:
                    tool_name = tool_call.get("name", "")
                    args = tool_call.get("args", {})

                    if tool_name == "handoff_to_coding_agent":
                        try:
                            coding_agent = get_coding_agent(
                                session_id=args.get("session_id", session_id),
                                candidate_id=candidate_id or "",
                                helpfulness_level=args.get("helpfulness_level", "pair-programming"),
                            )
                            coding_response = await coding_agent.send_message(
                                args.get("task_description", task)
                            )
                            coding_result = {
                                "status": "completed",
                                "response": coding_response.get("text", ""),
                                "tools_used": coding_response.get("tools_used", []),
                                "metadata": coding_response.get("metadata", {}),
                            }
                        except Exception as e:
                            coding_result = {"status": "error", "error": str(e)}

                    elif tool_name == "handoff_to_interview_agent":
                        try:
                            interview_agent = get_interview_agent()
                            metrics = await interview_agent.process_event(
                                session_id=args.get("session_id", session_id),
                                candidate_id=candidate_id or "",
                                event_type=args.get("event_type", ""),
                                event_data=args.get("event_data", {}),
                            )
                            interview_result = {
                                "status": "event_recorded",
                                "event_type": args.get("event_type", ""),
                                "irt_theta": metrics.get("irt_theta", 0.0),
                                "recommended_difficulty": metrics.get("recommended_next_difficulty", 5),
                            }
                        except Exception as e:
                            interview_result = {"status": "error", "error": str(e)}

                    elif tool_name == "handoff_to_evaluation_agent":
                        try:
                            evaluation_agent = get_evaluation_agent()
                            eval_result = await evaluation_agent.evaluate_session(
                                session_id=args.get("session_id", session_id),
                                candidate_id=args.get("candidate_id", candidate_id or ""),
                                code_snapshots=code_snapshots or [],
                                test_results=test_results or [],
                                claude_interactions=claude_interactions or [],
                                terminal_commands=terminal_commands or [],
                            )
                            evaluation_result = {
                                "status": "completed",
                                "overall_score": eval_result.get("overall_score", 0),
                                "overall_confidence": eval_result.get("overall_confidence", 0.0),
                            }
                        except Exception as e:
                            evaluation_result = {"status": "error", "error": str(e)}

        return {
            "coding_result": coding_result,
            "interview_result": interview_result,
            "evaluation_result": evaluation_result,
            "messages": messages,
        }


def create_supervisor(checkpointer=None) -> SupervisorGraph:
    """Factory function to create a Supervisor."""
    return SupervisorGraph(checkpointer=checkpointer)
