"""
Interview Agent - LangGraph v1 Implementation

Observes candidate progress and adapts interview difficulty using IRT algorithms.
This agent is HIDDEN from candidates - it only observes and updates metrics.

NOTE: This agent does NOT use LLM calls - it's a pure state machine for IRT
calculations. Therefore it uses StateGraph directly rather than create_agent.
"""

import logging
import math
import os
import threading
from datetime import datetime
from typing import Annotated, Any, Literal, cast

import httpx
from langchain_core.messages import BaseMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from config import generate_interview_thread_uuid

logger = logging.getLogger(__name__)

# =============================================================================
# Event Emission Helpers
# =============================================================================

NEXTJS_INTERNAL_URL = os.environ.get("NEXTJS_INTERNAL_URL", "http://localhost:3000")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "dev-internal-key")


def emit_metrics_event(session_id: str, metrics: dict[str, Any] | InterviewMetrics):
    """
    Emit session.metrics_updated event to persist IRT metrics (fire-and-forget).

    This allows the event store to track ability estimates, AI dependency scores,
    and struggling indicators for session replay and evaluation.
    """
    if not session_id:
        return

    def _emit():
        try:
            payload = {
                "sessionId": session_id,
                "type": "session.metrics_updated",
                "origin": "SYSTEM",
                "data": {
                    "irtTheta": metrics.get("irt_theta", 0),
                    "irtStandardError": metrics.get("irt_standard_error", 1.5),
                    "questionsAnswered": metrics.get("questions_answered", 0),
                    "questionsCorrect": metrics.get("questions_correct", 0),
                    "questionsIncorrect": metrics.get("questions_incorrect", 0),
                    "aiInteractionsCount": metrics.get("ai_interactions_count", 0),
                    "aiDependencyScore": metrics.get("ai_dependency_score", 0),
                    "strugglingIndicators": metrics.get("struggling_indicators", []),
                    "averageResponseTime": metrics.get("average_response_time", 0),
                    "testFailureRate": metrics.get("test_failure_rate", 0),
                    "currentDifficulty": metrics.get("current_difficulty", 5),
                    "recommendedNextDifficulty": metrics.get("recommended_next_difficulty", 5),
                },
            }

            response = httpx.post(
                f"{NEXTJS_INTERNAL_URL}/api/internal/events/record",
                json=payload,
                headers={"Authorization": f"Bearer {INTERNAL_API_KEY}"},
                timeout=5.0,
            )

            if response.status_code != 200:
                logger.warning(
                    f"Metrics event emission failed: {response.status_code} - {response.text}"
                )
            else:
                logger.debug(f"Metrics event emitted for session {session_id}")

        except Exception as e:
            logger.warning(f"Failed to emit metrics event: {e}")

    # Run in background thread to not block processing
    thread = threading.Thread(target=_emit, daemon=True)
    thread.start()


# =============================================================================
# State Schema (LangGraph v1 style)
# =============================================================================

class InterviewMetrics(TypedDict, total=False):
    """Metrics tracked during an interview session."""
    session_id: str
    irt_theta: float  # IRT ability estimate (-3 to +3)
    irt_standard_error: float
    questions_answered: int
    questions_correct: int
    questions_incorrect: int
    ai_interactions_count: int
    average_prompt_quality: float
    ai_dependency_score: float  # 0-100
    struggling_indicators: list[str]
    average_response_time: float
    test_failure_rate: float
    current_difficulty: int  # 1-10
    recommended_next_difficulty: int
    last_updated: str


class InterviewAgentState(TypedDict, total=False):
    """State for the interview agent."""
    messages: Annotated[list[BaseMessage], add_messages]
    session_id: str
    candidate_id: str
    metrics: InterviewMetrics
    current_event_type: str
    current_event_data: dict
    processing_complete: bool


# =============================================================================
# Helper Functions
# =============================================================================

def create_default_metrics(session_id: str, difficulty: int = 5) -> InterviewMetrics:
    """Create default metrics for a new session."""
    return InterviewMetrics(
        session_id=session_id,
        irt_theta=0.0,  # Start at average ability
        irt_standard_error=1.5,
        questions_answered=0,
        questions_correct=0,
        questions_incorrect=0,
        ai_interactions_count=0,
        average_prompt_quality=3.0,
        ai_dependency_score=0.0,
        struggling_indicators=[],
        average_response_time=0.0,
        test_failure_rate=0.0,
        current_difficulty=difficulty,
        recommended_next_difficulty=difficulty,
        last_updated=datetime.utcnow().isoformat(),
    )


def update_irt_theta(
    current_theta: float,
    question_difficulty: int,
    is_correct: bool,
    questions_answered: int,
) -> tuple[float, float]:
    """
    Update IRT theta estimate based on question result.

    Uses simplified IRT formula:
    - If correct and difficulty > theta: increase theta
    - If incorrect and difficulty < theta: decrease theta

    Returns:
        Tuple of (new_theta, new_standard_error)
    """
    # Normalize difficulty to IRT scale (-3 to +3)
    difficulty_normalized = (question_difficulty - 5.5) / 1.5

    # Calculate theta delta
    if is_correct:
        theta_delta = max(0, (difficulty_normalized - current_theta) * 0.3)
    else:
        theta_delta = min(0, (difficulty_normalized - current_theta) * 0.3)

    # Clamp theta to valid range
    new_theta = max(-3, min(3, current_theta + theta_delta))

    # Update standard error (decreases with more questions)
    new_standard_error = 1.5 / math.sqrt(max(questions_answered, 1))

    return new_theta, new_standard_error


def calculate_recommended_difficulty(theta: float) -> int:
    """Calculate recommended next difficulty based on theta."""
    # Target: slightly above current ability
    difficulty = round(5.5 + (theta + 0.5) * 1.5)
    return max(1, min(10, difficulty))


# =============================================================================
# Event Handlers
# =============================================================================

async def handle_ai_interaction(metrics: InterviewMetrics, data: dict) -> InterviewMetrics:
    """Handle AI interaction event - updates AI usage metrics."""
    candidate_message = data.get("candidate_message", data.get("candidateMessage", ""))
    tools_used = data.get("tools_used", data.get("toolsUsed", []))

    # Update AI interaction count
    metrics["ai_interactions_count"] += 1

    # Calculate AI dependency score
    tool_usage_score = len(tools_used) * 5
    questions_answered = max(metrics["questions_answered"], 1)
    interaction_frequency = metrics["ai_interactions_count"] / questions_answered
    metrics["ai_dependency_score"] = min(100, (interaction_frequency * 20) + tool_usage_score)

    # Detect struggling indicators
    message_lower = candidate_message.lower()
    if any(word in message_lower for word in ["stuck", "don't understand", "help", "confused"]):
        if "asking_for_help" not in metrics["struggling_indicators"]:
            metrics["struggling_indicators"].append("asking_for_help")

    # Very short messages might indicate frustration
    if len(candidate_message.split()) < 5:
        if "short_prompts" not in metrics["struggling_indicators"]:
            metrics["struggling_indicators"].append("short_prompts")

    return metrics


async def handle_code_changed(metrics: InterviewMetrics, data: dict) -> InterviewMetrics:
    """Handle code changed event."""
    # Track code changes for proactive assistance
    # This is primarily for session recording, metrics don't change much here
    return metrics


async def handle_test_run(metrics: InterviewMetrics, data: dict) -> InterviewMetrics:
    """Handle test run event - updates test failure rate."""
    passed = data.get("passed", 0)
    failed = data.get("failed", 0)
    total = data.get("total", passed + failed)

    if total > 0:
        # Update test failure rate (exponential moving average)
        current_failure_rate = failed / total
        metrics["test_failure_rate"] = metrics["test_failure_rate"] * 0.7 + current_failure_rate * 0.3

        # Detect struggling if multiple test failures
        if failed > passed and failed > 2:
            if "high_test_failure_rate" not in metrics["struggling_indicators"]:
                metrics["struggling_indicators"].append("high_test_failure_rate")

    return metrics


async def handle_question_answered(metrics: InterviewMetrics, data: dict) -> InterviewMetrics:
    """Handle question answered event - updates IRT and difficulty."""
    is_correct = data.get("is_correct", data.get("isCorrect", False))
    time_spent = data.get("time_spent", data.get("timeSpent", 0))
    question_difficulty = data.get("difficulty", metrics["current_difficulty"])

    # Update question counts
    metrics["questions_answered"] += 1
    if is_correct:
        metrics["questions_correct"] += 1
    else:
        metrics["questions_incorrect"] += 1

    # Update average response time (exponential moving average)
    metrics["average_response_time"] = metrics["average_response_time"] * 0.7 + time_spent * 0.3

    # Update IRT theta estimate
    new_theta, new_se = update_irt_theta(
        metrics["irt_theta"],
        question_difficulty,
        is_correct,
        metrics["questions_answered"],
    )
    metrics["irt_theta"] = new_theta
    metrics["irt_standard_error"] = new_se

    # Update recommended difficulty
    metrics["recommended_next_difficulty"] = calculate_recommended_difficulty(new_theta)

    # Detect struggling indicators
    if time_spent > 1800:  # More than 30 minutes
        if "slow_response_time" not in metrics["struggling_indicators"]:
            metrics["struggling_indicators"].append("slow_response_time")

    return metrics


# =============================================================================
# Node Functions
# =============================================================================

async def process_event(state: InterviewAgentState) -> dict:
    """
    Process an interview event and update metrics.

    This is the main processing node that handles all event types.
    """
    event_type = state.get("current_event_type")
    event_data = state.get("current_event_data", {})
    metrics = state.get("metrics")
    session_id = state.get("session_id")
    assert session_id is not None, "session_id is required in state"

    if not metrics:
        metrics = create_default_metrics(session_id)

    # Update last_updated timestamp
    metrics["last_updated"] = datetime.utcnow().isoformat()

    # Handle different event types
    if event_type == "ai-interaction":
        metrics = await handle_ai_interaction(metrics, event_data)
    elif event_type == "code-changed":
        metrics = await handle_code_changed(metrics, event_data)
    elif event_type == "test-run":
        metrics = await handle_test_run(metrics, event_data)
    elif event_type == "question-answered":
        metrics = await handle_question_answered(metrics, event_data)
    elif event_type == "session-started":
        difficulty = event_data.get("difficulty", 5)
        metrics = create_default_metrics(session_id, difficulty)
    elif event_type == "session-complete":
        pass  # Just log final state

    # Emit metrics update event to event store (fire-and-forget)
    # This persists IRT metrics, AI dependency scores, and struggling indicators
    emit_metrics_event(session_id, metrics)

    return {
        "metrics": metrics,
        "processing_complete": True,
    }


def should_continue(state: InterviewAgentState) -> Literal["end"]:
    """Check if processing should continue."""
    # Interview agent processes single events, always ends after processing
    return "end"


# =============================================================================
# Graph Construction
# =============================================================================

def create_interview_agent_graph() -> StateGraph:
    """
    Create the Interview Agent graph.

    Flow:
    START -> process_event -> END

    NOTE: This agent doesn't use LLM - it's a pure state machine for IRT
    calculations, so we use StateGraph directly.
    """
    workflow = StateGraph(InterviewAgentState)

    # Add nodes
    workflow.add_node("process_event", process_event)

    # Add edges
    workflow.add_edge(START, "process_event")
    workflow.add_conditional_edges(
        "process_event",
        should_continue,
        {"end": END},
    )

    return workflow


# =============================================================================
# Wrapper Class
# =============================================================================

class InterviewAgentGraph:
    """
    Interview Agent wrapper class.

    Provides a convenient interface for processing interview events
    and managing session metrics.
    """

    def __init__(self, checkpointer=None):
        """Initialize the Interview Agent."""
        workflow = create_interview_agent_graph()

        # Use memory checkpointer for state persistence
        self.checkpointer = checkpointer or MemorySaver()
        self.graph = workflow.compile(checkpointer=self.checkpointer)

    async def process_event(
        self,
        session_id: str,
        candidate_id: str,
        event_type: str,
        event_data: dict,
        existing_metrics: InterviewMetrics | None = None,
    ) -> InterviewMetrics:
        """
        Process an interview event and return updated metrics.

        Args:
            session_id: Session identifier
            candidate_id: Candidate identifier
            event_type: Type of event (ai-interaction, code-changed, test-run, etc.)
            event_data: Event-specific data
            existing_metrics: Optional existing metrics to update

        Returns:
            Updated InterviewMetrics
        """
        initial_state: InterviewAgentState = {
            "messages": [],
            "session_id": session_id,
            "candidate_id": candidate_id,
            "metrics": existing_metrics or create_default_metrics(session_id),
            "current_event_type": event_type,
            "current_event_data": event_data,
            "processing_complete": False,
        }

        # Use deterministic UUID for consistent thread grouping in LangSmith
        thread_uuid = generate_interview_thread_uuid(session_id)
        config = {"configurable": {"thread_id": thread_uuid}}

        result = await self.graph.ainvoke(initial_state, config)
        return cast(InterviewMetrics, result["metrics"])

    async def get_metrics(self, session_id: str) -> InterviewMetrics | None:
        """Get current metrics for a session."""
        # Use deterministic UUID for consistent thread grouping in LangSmith
        thread_uuid = generate_interview_thread_uuid(session_id)
        config = {"configurable": {"thread_id": thread_uuid}}
        state = await self.graph.aget_state(config)
        if state and state.values:
            return cast(InterviewMetrics | None, state.values.get("metrics"))
        return None


def create_interview_agent(checkpointer=None) -> InterviewAgentGraph:
    """Factory function to create an Interview Agent."""
    return InterviewAgentGraph(checkpointer=checkpointer)


# =============================================================================
# Graph Export for LangGraph Cloud
# =============================================================================
# LangGraph Cloud automatically handles checkpointing - do NOT specify checkpointer
# The platform injects its own PostgreSQL-backed checkpointer
#
# Note: This agent uses StateGraph directly (no LLM, pure state machine for IRT)

interview_graph = create_interview_agent_graph().compile()
