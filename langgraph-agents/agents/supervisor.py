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
    if response.tool_calls:
        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            if tool_name == "handoff_to_coding_agent":
                next_agent = "coding"
            elif tool_name == "handoff_to_interview_agent":
                next_agent = "interview"
            elif tool_name == "handoff_to_evaluation_agent":
                next_agent = "evaluation"
            elif tool_name == "complete_workflow":
                next_agent = "end"

    return {
        "messages": [response],
        "next_agent": next_agent,
    }


async def coding_worker_node(state: SupervisorState) -> dict:
    """
    Execute coding agent tasks.

    In a full implementation, this would instantiate and run the CodingAgentGraph.
    """
    # Extract task from last tool call
    messages = state.get("messages", [])
    task_info = "Coding task completed"

    # Simulate coding agent execution
    # In production: coding_agent = create_coding_agent(...); result = await coding_agent.send_message(...)

    return {
        "coding_result": {"status": "completed", "task": task_info},
        "messages": [AIMessage(content=f"Coding Agent: {task_info}")],
    }


async def interview_worker_node(state: SupervisorState) -> dict:
    """
    Execute interview agent tasks.

    In a full implementation, this would instantiate and run the InterviewAgentGraph.
    """
    # Simulate interview agent execution
    # In production: interview_agent = create_interview_agent(); metrics = await interview_agent.process_event(...)

    return {
        "interview_result": {"status": "event_recorded"},
        "messages": [AIMessage(content="Interview Agent: Event recorded for metrics tracking")],
    }


async def evaluation_worker_node(state: SupervisorState) -> dict:
    """
    Execute evaluation agent tasks.

    In a full implementation, this would instantiate and run the EvaluationAgentGraph.
    """
    # Simulate evaluation agent execution
    # In production: eval_agent = create_evaluation_agent(); result = await eval_agent.evaluate_session(...)

    return {
        "evaluation_result": {
            "status": "completed",
            "overall_score": 75,
            "dimensions": {
                "code_quality": 80,
                "problem_solving": 70,
                "ai_collaboration": 75,
                "communication": 72,
            },
        },
        "messages": [AIMessage(content="Evaluation Agent: Session evaluated successfully")],
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
    ) -> dict:
        """
        Run a multi-agent workflow.

        Args:
            task: Description of the task to perform
            session_id: Session identifier
            candidate_id: Optional candidate identifier

        Returns:
            Dict with results from all agents involved
        """
        initial_state: SupervisorState = {
            "messages": [HumanMessage(content=task)],
            "next_agent": None,
            "session_id": session_id,
            "candidate_id": candidate_id,
            "task_type": None,
            "coding_result": None,
            "interview_result": None,
            "evaluation_result": None,
            "workflow_complete": False,
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
