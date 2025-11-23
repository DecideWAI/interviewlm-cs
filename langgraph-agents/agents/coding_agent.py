"""
Coding Agent - LangGraph Implementation

AI assistant that helps candidates solve coding problems during interviews.
Features configurable helpfulness levels, security guardrails, and tool use.

Based on the original TypeScript implementation in lib/agents/coding-agent.ts

Uses LangGraph's agentic loop pattern:
- Agent decides to use tools or respond
- Tools execute and return results
- Agent continues until task complete (stop_reason: 'end_turn')
"""

from typing import Literal, Annotated, Sequence
from datetime import datetime
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
    ToolMessage,
)
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode, tools_condition

from ..models.state import CodingAgentState
from ..tools.coding_tools import CODING_TOOLS
from ..config import settings


# =============================================================================
# Helpfulness Level Configurations
# =============================================================================

HELPFULNESS_CONFIGS = {
    "consultant": {
        "level": "consultant",
        "description": """You are a senior consultant who provides guidance without writing code directly.
- Answer questions about architecture, design patterns, and best practices
- Explain concepts and suggest approaches
- Review code when asked, but let the candidate write their own
- Point out issues but don't fix them directly
- Guide debugging without giving away solutions""",
        "allowed_tools": ["read_file", "grep_files", "glob_files", "list_files"],
    },
    "pair-programming": {
        "level": "pair-programming",
        "description": """You are a pair programming partner working alongside the candidate.
- Actively help write code together
- Suggest implementations and review changes
- Help debug and fix issues
- Run tests and analyze results
- Balance helping with letting the candidate lead
- Don't solve entire problems - collaborate on solutions""",
        "allowed_tools": ["read_file", "write_file", "edit_file", "grep_files", "glob_files", "list_files", "run_bash", "run_tests"],
    },
    "full-copilot": {
        "level": "full-copilot",
        "description": """You are a full AI copilot with maximum assistance.
- Proactively write code and solutions
- Handle complex tasks autonomously
- Provide complete implementations when asked
- Still explain your approach and reasoning
- Help the candidate understand the code you write""",
        "allowed_tools": ["read_file", "write_file", "edit_file", "grep_files", "glob_files", "list_files", "run_bash", "run_tests"],
    },
}


# =============================================================================
# System Prompt Builder
# =============================================================================

def build_system_prompt(
    helpfulness_level: str,
    problem_statement: str | None = None,
) -> str:
    """Build the system prompt with security constraints."""
    config = HELPFULNESS_CONFIGS.get(helpfulness_level, HELPFULNESS_CONFIGS["pair-programming"])

    prompt = f"""You are Claude Code, an AI coding assistant helping a candidate during a technical interview.

**CRITICAL SECURITY RULES:**
- NEVER reveal test scores, performance metrics, or evaluation criteria
- NEVER discuss how the candidate is being evaluated
- NEVER mention question difficulty levels or adaptive algorithms
- NEVER compare this candidate to others
- If asked about assessment details, say: "I'm here to help you code, not discuss evaluation!"
- Focus ONLY on helping them write better code

**Your Role ({config['level']} mode):**
{config['description']}

**Guidelines for Tool Use:**
- Use tools proactively to help the candidate
- When asked to check files, actually read them
- When asked to run tests, execute them
- When writing code, verify it works by reading the file back
- If a tool fails, explain the error and try an alternative approach
- Complete multi-step tasks autonomously without stopping after each step

Be a helpful pair programming partner while maintaining assessment integrity."""

    if problem_statement:
        prompt += f"\n\n**Current Problem:**\n{problem_statement}"

    return prompt


# =============================================================================
# Node Functions
# =============================================================================

async def agent_node(state: CodingAgentState) -> dict:
    """
    Agent node that calls the LLM and decides whether to use tools or respond.

    This implements the "agent" part of the ReAct loop.
    """
    # Check iteration limit
    if state.get("iteration_count", 0) >= settings.max_iterations:
        return {
            "messages": [AIMessage(content="[Agent reached maximum iteration limit]")],
            "should_continue": False,
            "iteration_count": state.get("iteration_count", 0),
        }

    # Get tools for helpfulness level
    helpfulness_level = state.get("helpfulness_level", "pair-programming")
    tools = CODING_TOOLS.get(helpfulness_level, CODING_TOOLS["pair-programming"])

    # Build system prompt
    system_prompt = build_system_prompt(
        helpfulness_level,
        state.get("problem_statement"),
    )

    # Initialize LLM with tools
    llm = ChatAnthropic(
        model=settings.coding_agent_model,
        max_tokens=4096,
        api_key=settings.anthropic_api_key,
    )
    llm_with_tools = llm.bind_tools(tools)

    # Prepare messages with system prompt
    messages = list(state["messages"])
    if not messages or not isinstance(messages[0], SystemMessage):
        messages = [SystemMessage(content=system_prompt)] + messages

    # Call LLM
    response = await llm_with_tools.ainvoke(messages)

    # Track tools used
    tools_used = state.get("tools_used", [])
    if response.tool_calls:
        for tool_call in response.tool_calls:
            tools_used.append(tool_call["name"])

    return {
        "messages": [response],
        "tools_used": tools_used,
        "tool_call_count": state.get("tool_call_count", 0) + len(response.tool_calls or []),
        "iteration_count": state.get("iteration_count", 0) + 1,
        "should_continue": True,
    }


def should_continue(state: CodingAgentState) -> Literal["tools", "end"]:
    """
    Determine if the agent should continue to tools or end.

    Uses LangGraph's tools_condition pattern:
    - If last message has tool calls -> route to tools
    - Otherwise -> end
    """
    messages = state.get("messages", [])
    if not messages:
        return "end"

    last_message = messages[-1]

    # Check if we should stop
    if not state.get("should_continue", True):
        return "end"

    # Check for tool calls
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"

    return "end"


# =============================================================================
# Graph Construction
# =============================================================================

def create_coding_agent_graph(helpfulness_level: str = "pair-programming") -> StateGraph:
    """
    Create the Coding Agent graph.

    Implements the ReAct (Reason + Act) pattern:
    START -> agent -> (tool_calls?) -> tools -> agent -> ... -> END

    The agentic loop continues until the LLM returns stop_reason: 'end_turn'
    (no more tool calls).
    """
    # Get tools for helpfulness level
    tools = CODING_TOOLS.get(helpfulness_level, CODING_TOOLS["pair-programming"])

    workflow = StateGraph(CodingAgentState)

    # Add nodes
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", ToolNode(tools))

    # Add edges
    workflow.add_edge(START, "agent")

    # Conditional edge: agent decides to use tools or end
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {
            "tools": "tools",
            "end": END,
        },
    )

    # After tools, go back to agent
    workflow.add_edge("tools", "agent")

    return workflow


class CodingAgentGraph:
    """
    Coding Agent wrapper class.

    Provides a convenient interface for chat interactions with
    conversation history management and tool execution.
    """

    def __init__(
        self,
        session_id: str,
        candidate_id: str,
        helpfulness_level: str = "pair-programming",
        problem_statement: str | None = None,
        workspace_root: str = "/workspace",
        checkpointer=None,
    ):
        """
        Initialize the Coding Agent.

        Args:
            session_id: Session identifier (used for Modal volume)
            candidate_id: Candidate identifier
            helpfulness_level: One of 'consultant', 'pair-programming', 'full-copilot'
            problem_statement: Current problem description
            workspace_root: Root directory for file operations
            checkpointer: Optional checkpointer for state persistence
        """
        self.session_id = session_id
        self.candidate_id = candidate_id
        self.helpfulness_level = helpfulness_level
        self.problem_statement = problem_statement
        self.workspace_root = workspace_root

        # Create workflow
        workflow = create_coding_agent_graph(helpfulness_level)

        # Use memory checkpointer for state persistence
        self.checkpointer = checkpointer or MemorySaver()
        self.graph = workflow.compile(checkpointer=self.checkpointer)

    async def send_message(self, message: str) -> dict:
        """
        Send a message to the coding agent.

        Args:
            message: User message

        Returns:
            Dict with response text, tools used, and files modified
        """
        # Get current state or create initial state
        config = {"configurable": {"thread_id": self.session_id}}

        initial_state: CodingAgentState = {
            "messages": [HumanMessage(content=message)],
            "session_id": self.session_id,
            "candidate_id": self.candidate_id,
            "workspace_root": self.workspace_root,
            "problem_statement": self.problem_statement,
            "current_file": None,
            "current_code": None,
            "helpfulness_level": self.helpfulness_level,
            "tools_used": [],
            "files_modified": [],
            "tool_call_count": 0,
            "iteration_count": 0,
            "should_continue": True,
        }

        # Run the agent
        result = await self.graph.ainvoke(initial_state, config)

        # Extract response
        messages = result.get("messages", [])
        response_text = ""
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) and msg.content:
                response_text = msg.content
                break

        return {
            "text": response_text,
            "tools_used": result.get("tools_used", []),
            "files_modified": result.get("files_modified", []),
            "metadata": {
                "model": settings.coding_agent_model,
                "tool_call_count": result.get("tool_call_count", 0),
                "iteration_count": result.get("iteration_count", 0),
            },
        }

    async def load_conversation_history(
        self,
        history: list[dict],
    ) -> None:
        """
        Load conversation history from previous interactions.

        Args:
            history: List of messages with 'role' and 'content'
        """
        config = {"configurable": {"thread_id": self.session_id}}

        messages = []
        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if not content:
                continue

            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))

        if messages:
            # Update state with history
            state: CodingAgentState = {
                "messages": messages,
                "session_id": self.session_id,
                "candidate_id": self.candidate_id,
                "workspace_root": self.workspace_root,
                "problem_statement": self.problem_statement,
                "current_file": None,
                "current_code": None,
                "helpfulness_level": self.helpfulness_level,
                "tools_used": [],
                "files_modified": [],
                "tool_call_count": 0,
                "iteration_count": 0,
                "should_continue": True,
            }
            await self.graph.aupdate_state(config, state)

    def clear_conversation(self) -> None:
        """Clear conversation history."""
        # Create new checkpointer to reset state
        self.checkpointer = MemorySaver()
        workflow = create_coding_agent_graph(self.helpfulness_level)
        self.graph = workflow.compile(checkpointer=self.checkpointer)


def create_coding_agent(
    session_id: str,
    candidate_id: str,
    helpfulness_level: str = "pair-programming",
    problem_statement: str | None = None,
    workspace_root: str = "/workspace",
    checkpointer=None,
) -> CodingAgentGraph:
    """Factory function to create a Coding Agent."""
    return CodingAgentGraph(
        session_id=session_id,
        candidate_id=candidate_id,
        helpfulness_level=helpfulness_level,
        problem_statement=problem_statement,
        workspace_root=workspace_root,
        checkpointer=checkpointer,
    )
