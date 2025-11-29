"""
Evaluation Agent - LangGraph Implementation

Evaluates completed interviews with evidence-based scoring across 4 dimensions:
1. Code Quality (40%)
2. Problem Solving (25%)
3. AI Collaboration (20%)
4. Communication (15%)

Based on the original TypeScript implementation in workers/evaluation-agent.ts
"""

from typing import Literal
from datetime import datetime
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode

from ..models.state import (
    EvaluationAgentState,
    EvaluationResult,
    DimensionScore,
    Evidence,
)
from ..tools.evaluation_tools import (
    analyze_code_quality,
    analyze_problem_solving,
    analyze_ai_collaboration,
    analyze_communication,
    EVALUATION_TOOLS,
)
from ..config import settings


# =============================================================================
# Scoring Weights (matching original implementation)
# =============================================================================

DEFAULT_SCORING_WEIGHTS = {
    "code_quality": 0.40,
    "problem_solving": 0.25,
    "ai_collaboration": 0.20,
    "communication": 0.15,
}


# =============================================================================
# Node Functions
# =============================================================================

async def evaluate_code_quality(state: EvaluationAgentState) -> dict:
    """
    Evaluate code quality dimension.

    Uses test results + static analysis + LLM review.
    """
    code_snapshots = state.get("code_snapshots", [])
    test_results = state.get("test_results", [])

    result = await analyze_code_quality.ainvoke({
        "code_snapshots": code_snapshots,
        "test_results": test_results,
    })

    return {
        "code_quality_score": DimensionScore(
            score=result["score"],
            confidence=result["confidence"],
            evidence=[Evidence(**e) if isinstance(e, dict) else e for e in result["evidence"]],
            breakdown=result.get("breakdown"),
        ),
    }


async def evaluate_problem_solving(state: EvaluationAgentState) -> dict:
    """
    Evaluate problem solving dimension.

    Analyzes iteration patterns, debugging approach, and terminal usage.
    """
    code_snapshots = state.get("code_snapshots", [])
    test_results = state.get("test_results", [])
    terminal_commands = state.get("terminal_commands", [])

    result = await analyze_problem_solving.ainvoke({
        "code_snapshots": code_snapshots,
        "test_results": test_results,
        "terminal_commands": terminal_commands,
    })

    return {
        "problem_solving_score": DimensionScore(
            score=result["score"],
            confidence=result["confidence"],
            evidence=[Evidence(**e) if isinstance(e, dict) else e for e in result["evidence"]],
            breakdown=result.get("breakdown"),
        ),
    }


async def evaluate_ai_collaboration(state: EvaluationAgentState) -> dict:
    """
    Evaluate AI collaboration dimension (unique to InterviewLM).

    Analyzes prompt quality and effective AI usage.
    """
    claude_interactions = state.get("claude_interactions", [])

    # Get metrics from session if available
    metrics = None  # Would be loaded from database in production

    result = await analyze_ai_collaboration.ainvoke({
        "claude_interactions": claude_interactions,
        "metrics": metrics,
    })

    return {
        "ai_collaboration_score": DimensionScore(
            score=result["score"],
            confidence=result["confidence"],
            evidence=[Evidence(**e) if isinstance(e, dict) else e for e in result["evidence"]],
            breakdown=result.get("breakdown"),
        ),
    }


async def evaluate_communication(state: EvaluationAgentState) -> dict:
    """
    Evaluate communication dimension.

    Analyzes prompt clarity and code documentation.
    """
    claude_interactions = state.get("claude_interactions", [])
    code_snapshots = state.get("code_snapshots", [])

    result = await analyze_communication.ainvoke({
        "claude_interactions": claude_interactions,
        "code_snapshots": code_snapshots,
    })

    return {
        "communication_score": DimensionScore(
            score=result["score"],
            confidence=result["confidence"],
            evidence=[Evidence(**e) if isinstance(e, dict) else e for e in result["evidence"]],
            breakdown=result.get("breakdown"),
        ),
    }


async def aggregate_scores(state: EvaluationAgentState) -> dict:
    """
    Aggregate dimension scores into final evaluation result.
    """
    code_quality = state["code_quality_score"]
    problem_solving = state["problem_solving_score"]
    ai_collaboration = state["ai_collaboration_score"]
    communication = state["communication_score"]

    # Calculate weighted overall score
    overall_score = (
        code_quality["score"] * DEFAULT_SCORING_WEIGHTS["code_quality"] +
        problem_solving["score"] * DEFAULT_SCORING_WEIGHTS["problem_solving"] +
        ai_collaboration["score"] * DEFAULT_SCORING_WEIGHTS["ai_collaboration"] +
        communication["score"] * DEFAULT_SCORING_WEIGHTS["communication"]
    )

    # Overall confidence is minimum of all dimensions
    overall_confidence = min(
        code_quality["confidence"],
        problem_solving["confidence"],
        ai_collaboration["confidence"],
        communication["confidence"],
    )

    # Detect biases
    bias_flags = detect_biases(state, {
        "code_quality": code_quality,
        "problem_solving": problem_solving,
        "ai_collaboration": ai_collaboration,
        "communication": communication,
    })

    evaluation_result = EvaluationResult(
        session_id=state["session_id"],
        candidate_id=state["candidate_id"],
        code_quality=code_quality,
        problem_solving=problem_solving,
        ai_collaboration=ai_collaboration,
        communication=communication,
        overall_score=round(overall_score),
        overall_confidence=overall_confidence,
        evaluated_at=datetime.utcnow().isoformat(),
        model=settings.evaluation_agent_model,
        bias_flags=bias_flags,
    )

    return {
        "evaluation_result": evaluation_result,
        "evaluation_complete": True,
    }


def detect_biases(state: EvaluationAgentState, scores: dict) -> list[str]:
    """Detect potential scoring biases."""
    flags = []

    # Code volume bias: High score but very little code
    code_snapshots = state.get("code_snapshots", [])
    if code_snapshots and scores["code_quality"]["score"] > 80:
        final_code = code_snapshots[-1]
        files = final_code.get("files", {})
        total_lines = sum(
            len(content.split("\n"))
            for content in files.values()
            if isinstance(content, str)
        )
        if total_lines < 20:
            flags.append("code_volume_bias: High score with minimal code")

    # AI usage penalty: Low score due to high AI usage
    # Would check metrics if available

    return flags


def should_continue(state: EvaluationAgentState) -> Literal["aggregate", "end"]:
    """Check if all dimensions have been evaluated."""
    if (
        state.get("code_quality_score") and
        state.get("problem_solving_score") and
        state.get("ai_collaboration_score") and
        state.get("communication_score")
    ):
        return "aggregate"
    return "end"


# =============================================================================
# Graph Construction
# =============================================================================

def create_evaluation_agent_graph() -> StateGraph:
    """
    Create the Evaluation Agent graph.

    Flow (parallel evaluation of dimensions):
    START -> [code_quality, problem_solving, ai_collaboration, communication] -> aggregate -> END

    Note: LangGraph automatically handles parallel execution when multiple edges
    leave from a single node. All four evaluation nodes run concurrently.
    """
    workflow = StateGraph(EvaluationAgentState)

    # Add nodes
    workflow.add_node("evaluate_code_quality", evaluate_code_quality)
    workflow.add_node("evaluate_problem_solving", evaluate_problem_solving)
    workflow.add_node("evaluate_ai_collaboration", evaluate_ai_collaboration)
    workflow.add_node("evaluate_communication", evaluate_communication)
    workflow.add_node("aggregate_scores", aggregate_scores)

    # Add parallel edges from START to all evaluation nodes
    # LangGraph will execute these in parallel
    workflow.add_edge(START, "evaluate_code_quality")
    workflow.add_edge(START, "evaluate_problem_solving")
    workflow.add_edge(START, "evaluate_ai_collaboration")
    workflow.add_edge(START, "evaluate_communication")

    # All evaluation nodes converge to aggregate
    workflow.add_edge("evaluate_code_quality", "aggregate_scores")
    workflow.add_edge("evaluate_problem_solving", "aggregate_scores")
    workflow.add_edge("evaluate_ai_collaboration", "aggregate_scores")
    workflow.add_edge("evaluate_communication", "aggregate_scores")

    # Aggregate to end
    workflow.add_edge("aggregate_scores", END)

    return workflow


class EvaluationAgentGraph:
    """
    Evaluation Agent wrapper class.

    Provides a convenient interface for evaluating interview sessions.
    """

    def __init__(self, checkpointer=None):
        """Initialize the Evaluation Agent."""
        workflow = create_evaluation_agent_graph()

        # Use memory checkpointer for state persistence
        self.checkpointer = checkpointer or MemorySaver()
        self.graph = workflow.compile(checkpointer=self.checkpointer)

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
        initial_state: EvaluationAgentState = {
            "messages": [],
            "session_id": session_id,
            "candidate_id": candidate_id,
            "code_snapshots": code_snapshots,
            "test_results": test_results,
            "claude_interactions": claude_interactions,
            "terminal_commands": terminal_commands or [],
            "code_quality_score": None,
            "problem_solving_score": None,
            "ai_collaboration_score": None,
            "communication_score": None,
            "evaluation_result": None,
            "evaluation_complete": False,
        }

        config = {"configurable": {"thread_id": f"eval-{session_id}"}}

        result = await self.graph.ainvoke(initial_state, config)
        return result["evaluation_result"]


def create_evaluation_agent(checkpointer=None) -> EvaluationAgentGraph:
    """Factory function to create an Evaluation Agent."""
    return EvaluationAgentGraph(checkpointer=checkpointer)
