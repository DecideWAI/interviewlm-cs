"""
Supervisor Agent - LangGraph Implementation

Coordinates between specialized agents (Coding, Interview, Evaluation)
using a hierarchical multi-agent pattern.

Based on LangGraph's supervisor pattern:
https://github.com/langchain-ai/langgraph-supervisor-py
"""

from typing import Literal
from datetime import datetime
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
)
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent

from ..models.state import SupervisorState
from ..config import settings

# Import actual agents
from .coding_agent import create_coding_agent, CodingAgentGraph
from .interview_agent import create_interview_agent, InterviewAgentGraph
from .evaluation_agent import create_evaluation_agent, EvaluationAgentGraph


# =============================================================================
# Handoff Tools for Agent Routing
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


# All supervisor tools
SUPERVISOR_TOOLS = [
    handoff_to_coding_agent,
    handoff_to_interview_agent,
    handoff_to_evaluation_agent,
    complete_workflow,
]


# =============================================================================
# Supervisor System Prompt
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

Use `complete_workflow` when all tasks are done."""


# =============================================================================
# Agent Instance Cache
# =============================================================================

# Cache for agent instances (per session)
_coding_agents: dict[str, CodingAgentGraph] = {}
_interview_agent: InterviewAgentGraph | None = None
_evaluation_agent: EvaluationAgentGraph | None = None


def get_coding_agent(
    session_id: str,
    candidate_id: str,
    helpfulness_level: str = "pair-programming",
    problem_statement: str | None = None,
) -> CodingAgentGraph:
    """Get or create a coding agent for a session."""
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


def get_interview_agent() -> InterviewAgentGraph:
    """Get or create the interview agent (singleton)."""
    global _interview_agent

    if _interview_agent is None:
        _interview_agent = create_interview_agent()

    return _interview_agent


def get_evaluation_agent() -> EvaluationAgentGraph:
    """Get or create the evaluation agent (singleton)."""
    global _evaluation_agent

    if _evaluation_agent is None:
        _evaluation_agent = create_evaluation_agent()

    return _evaluation_agent


# =============================================================================
# Node Functions
# =============================================================================

async def supervisor_node(state: SupervisorState) -> dict:
    """
    Supervisor node that routes to appropriate agents.

    Uses tool calls to hand off to specialized agents.
    """
    # Initialize LLM with tools
    llm = ChatAnthropic(
        model=settings.coding_agent_model,
        max_tokens=2048,
        api_key=settings.anthropic_api_key,
    )
    llm_with_tools = llm.bind_tools(SUPERVISOR_TOOLS)

    # Prepare messages
    messages = list(state["messages"])
    if not messages or not isinstance(messages[0], SystemMessage):
        messages = [SystemMessage(content=SUPERVISOR_SYSTEM_PROMPT)] + messages

    # Call LLM
    response = await llm_with_tools.ainvoke(messages)

    # Determine next agent based on tool calls
    next_agent = None
    task_info = {}

    if response.tool_calls:
        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            args = tool_call.get("args", {})

            if tool_name == "handoff_to_coding_agent":
                next_agent = "coding"
                task_info = {
                    "task_description": args.get("task_description", ""),
                    "helpfulness_level": args.get("helpfulness_level", "pair-programming"),
                    "session_id": args.get("session_id", state.get("session_id", "")),
                }
            elif tool_name == "handoff_to_interview_agent":
                next_agent = "interview"
                task_info = {
                    "event_type": args.get("event_type", ""),
                    "event_data": args.get("event_data", {}),
                    "session_id": args.get("session_id", state.get("session_id", "")),
                }
            elif tool_name == "handoff_to_evaluation_agent":
                next_agent = "evaluation"
                task_info = {
                    "session_id": args.get("session_id", state.get("session_id", "")),
                    "candidate_id": args.get("candidate_id", state.get("candidate_id", "")),
                }
            elif tool_name == "complete_workflow":
                next_agent = "end"
                task_info = {"summary": args.get("summary", "")}

    return {
        "messages": [response],
        "next_agent": next_agent,
        "task_info": task_info,
    }


async def coding_worker_node(state: SupervisorState) -> dict:
    """
    Execute coding agent tasks.

    Invokes the actual CodingAgentGraph to handle coding requests.
    """
    task_info = state.get("task_info", {})
    session_id = task_info.get("session_id", state.get("session_id", ""))
    candidate_id = state.get("candidate_id", "")
    helpfulness_level = task_info.get("helpfulness_level", "pair-programming")
    task_description = task_info.get("task_description", "")

    try:
        # Get or create coding agent
        coding_agent = get_coding_agent(
            session_id=session_id,
            candidate_id=candidate_id,
            helpfulness_level=helpfulness_level,
        )

        # Send the task to the coding agent
        result = await coding_agent.send_message(task_description)

        response_text = result.get("text", "Task completed")
        tools_used = result.get("tools_used", [])

        return {
            "coding_result": {
                "status": "completed",
                "response": response_text,
                "tools_used": tools_used,
                "metadata": result.get("metadata", {}),
            },
            "messages": [AIMessage(content=f"Coding Agent: {response_text}")],
        }

    except Exception as e:
        error_msg = f"Coding Agent error: {str(e)}"
        return {
            "coding_result": {"status": "error", "error": str(e)},
            "messages": [AIMessage(content=error_msg)],
        }


async def interview_worker_node(state: SupervisorState) -> dict:
    """
    Execute interview agent tasks.

    Invokes the actual InterviewAgentGraph to process events.
    """
    task_info = state.get("task_info", {})
    session_id = task_info.get("session_id", state.get("session_id", ""))
    candidate_id = state.get("candidate_id", "")
    event_type = task_info.get("event_type", "")
    event_data = task_info.get("event_data", {})

    try:
        # Get interview agent
        interview_agent = get_interview_agent()

        # Process the event
        metrics = await interview_agent.process_event(
            session_id=session_id,
            candidate_id=candidate_id,
            event_type=event_type,
            event_data=event_data,
        )

        return {
            "interview_result": {
                "status": "event_recorded",
                "event_type": event_type,
                "irt_theta": metrics.get("irt_theta", 0.0),
                "recommended_difficulty": metrics.get("recommended_next_difficulty", 5),
                "struggling_indicators": metrics.get("struggling_indicators", []),
            },
            "messages": [AIMessage(
                content=f"Interview Agent: Recorded {event_type} event. "
                        f"IRT theta: {metrics.get('irt_theta', 0.0):.2f}"
            )],
        }

    except Exception as e:
        error_msg = f"Interview Agent error: {str(e)}"
        return {
            "interview_result": {"status": "error", "error": str(e)},
            "messages": [AIMessage(content=error_msg)],
        }


async def evaluation_worker_node(state: SupervisorState) -> dict:
    """
    Execute evaluation agent tasks.

    Invokes the actual EvaluationAgentGraph to evaluate sessions.
    """
    task_info = state.get("task_info", {})
    session_id = task_info.get("session_id", state.get("session_id", ""))
    candidate_id = task_info.get("candidate_id", state.get("candidate_id", ""))

    # Get session data from state (in production, would load from database)
    code_snapshots = state.get("code_snapshots", [])
    test_results = state.get("test_results", [])
    claude_interactions = state.get("claude_interactions", [])
    terminal_commands = state.get("terminal_commands", [])

    try:
        # Get evaluation agent
        evaluation_agent = get_evaluation_agent()

        # Evaluate the session
        result = await evaluation_agent.evaluate_session(
            session_id=session_id,
            candidate_id=candidate_id,
            code_snapshots=code_snapshots,
            test_results=test_results,
            claude_interactions=claude_interactions,
            terminal_commands=terminal_commands,
        )

        return {
            "evaluation_result": {
                "status": "completed",
                "overall_score": result.get("overall_score", 0),
                "overall_confidence": result.get("overall_confidence", 0.0),
                "dimensions": {
                    "code_quality": result.get("code_quality", {}).get("score", 0),
                    "problem_solving": result.get("problem_solving", {}).get("score", 0),
                    "ai_collaboration": result.get("ai_collaboration", {}).get("score", 0),
                    "communication": result.get("communication", {}).get("score", 0),
                },
                "bias_flags": result.get("bias_flags", []),
            },
            "messages": [AIMessage(
                content=f"Evaluation Agent: Session evaluated. "
                        f"Overall score: {result.get('overall_score', 0)}/100"
            )],
        }

    except Exception as e:
        error_msg = f"Evaluation Agent error: {str(e)}"
        return {
            "evaluation_result": {"status": "error", "error": str(e)},
            "messages": [AIMessage(content=error_msg)],
        }


def route_to_agent(state: SupervisorState) -> Literal["coding", "interview", "evaluation", "supervisor", "end"]:
    """Route to the appropriate agent based on supervisor decision."""
    next_agent = state.get("next_agent")

    if next_agent == "coding":
        return "coding"
    elif next_agent == "interview":
        return "interview"
    elif next_agent == "evaluation":
        return "evaluation"
    elif next_agent == "end":
        return "end"
    else:
        # Continue with supervisor if no clear routing
        return "supervisor"


# =============================================================================
# Graph Construction
# =============================================================================

def create_supervisor_graph() -> StateGraph:
    """
    Create the Supervisor graph for multi-agent coordination.

    Flow:
    START -> supervisor -> [coding|interview|evaluation|end]
                      ↑___________|___________|___________|

    The supervisor routes to worker agents, and workers return to supervisor
    for potential follow-up routing.
    """
    workflow = StateGraph(SupervisorState)

    # Add nodes
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("coding", coding_worker_node)
    workflow.add_node("interview", interview_worker_node)
    workflow.add_node("evaluation", evaluation_worker_node)

    # Add edges
    workflow.add_edge(START, "supervisor")

    # Conditional routing from supervisor
    workflow.add_conditional_edges(
        "supervisor",
        route_to_agent,
        {
            "coding": "coding",
            "interview": "interview",
            "evaluation": "evaluation",
            "supervisor": "supervisor",
            "end": END,
        },
    )

    # Workers return to supervisor for follow-up
    workflow.add_edge("coding", "supervisor")
    workflow.add_edge("interview", "supervisor")
    workflow.add_edge("evaluation", "supervisor")

    return workflow


class SupervisorGraph:
    """
    Supervisor wrapper class.

    Provides a convenient interface for coordinating multi-agent workflows.
    """

    def __init__(self, checkpointer=None):
        """Initialize the Supervisor."""
        workflow = create_supervisor_graph()

        # Use memory checkpointer for state persistence
        self.checkpointer = checkpointer or MemorySaver()
        self.graph = workflow.compile(checkpointer=self.checkpointer)

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
        initial_state: SupervisorState = {
            "messages": [HumanMessage(content=task)],
            "next_agent": None,
            "session_id": session_id,
            "candidate_id": candidate_id,
            "task_type": None,
            "task_info": {},
            "coding_result": None,
            "interview_result": None,
            "evaluation_result": None,
            "workflow_complete": False,
            # Session data for evaluation
            "code_snapshots": code_snapshots or [],
            "test_results": test_results or [],
            "claude_interactions": claude_interactions or [],
            "terminal_commands": terminal_commands or [],
        }

        config = {"configurable": {"thread_id": f"supervisor-{session_id}"}}

        result = await self.graph.ainvoke(initial_state, config)

        return {
            "coding_result": result.get("coding_result"),
            "interview_result": result.get("interview_result"),
            "evaluation_result": result.get("evaluation_result"),
            "messages": result.get("messages", []),
        }


def create_supervisor(checkpointer=None) -> SupervisorGraph:
    """Factory function to create a Supervisor."""
    return SupervisorGraph(checkpointer=checkpointer)


def clear_agent_cache():
    """Clear the agent cache (useful for testing)."""
    global _coding_agents, _interview_agent, _evaluation_agent
    _coding_agents = {}
    _interview_agent = None
    _evaluation_agent = None
