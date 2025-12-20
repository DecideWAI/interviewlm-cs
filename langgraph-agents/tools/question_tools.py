"""Question Tools - Tools for the coding agent to ask clarifying questions.

These tools enable the agent to present structured questions to candidates,
with responses persisted in the database for evaluation purposes.
"""

import os
import uuid
import threading
import logging
from typing import Any, Annotated

import httpx
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig

logger = logging.getLogger(__name__)


# =============================================================================
# Configuration
# =============================================================================

NEXTJS_INTERNAL_URL = os.environ.get("NEXTJS_INTERNAL_URL", "http://localhost:3000")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "dev-internal-key")


# =============================================================================
# Helper Functions
# =============================================================================

def get_session_id(config: dict) -> str:
    """Extract session ID from RunnableConfig.configurable."""
    if config is None:
        return "unknown"
    configurable = config.get("configurable", {})
    return configurable.get("session_id", "unknown")


def get_candidate_id(config: dict) -> str:
    """Extract candidate ID from RunnableConfig.configurable."""
    if config is None:
        return "unknown"
    configurable = config.get("configurable", {})
    return configurable.get("candidate_id", "unknown")


def emit_event_fire_and_forget(
    session_id: str,
    event_type: str,
    origin: str,
    data: dict,
    question_index: int = None,
    checkpoint: bool = False,
):
    """
    Emit an event to the Next.js event store (fire-and-forget).

    This runs in a background thread to avoid blocking tool execution.
    Failures are logged but don't affect the tool result.
    """
    def _emit():
        try:
            payload = {
                "sessionId": session_id,
                "type": event_type,
                "origin": origin,
                "data": data,
                "checkpoint": checkpoint,
            }
            if question_index is not None:
                payload["questionIndex"] = question_index

            with httpx.Client(timeout=5.0) as client:
                response = client.post(
                    f"{NEXTJS_INTERNAL_URL}/api/internal/events/record",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {INTERNAL_API_KEY}",
                        "Content-Type": "application/json",
                    },
                )
                if response.status_code != 200:
                    logger.warning(
                        f"Failed to emit event {event_type}: {response.status_code} - {response.text}"
                    )
        except Exception as e:
            logger.warning(f"Failed to emit event {event_type}: {e}")

    thread = threading.Thread(target=_emit, daemon=True)
    thread.start()


# =============================================================================
# Ask Question Tool
# =============================================================================

@tool
def ask_question(
    question_text: str,
    options: list[str],
    allow_custom_answer: bool = True,
    context: str | None = None,
    config: Annotated[RunnableConfig, "Injected by LangGraph"] = None,
) -> dict[str, Any]:
    """
    Present a clarifying question to the candidate with multiple-choice options.

    Use this tool to understand the candidate's preferences, approach, or requirements
    BEFORE taking significant action. This creates natural dialogue and reveals
    the candidate's thinking process.

    **IMPORTANT:** After calling this tool, WAIT for the candidate's response before
    proceeding. Do NOT make assumptions about what they will choose.

    Args:
        question_text: The question to ask the candidate. Should be clear and specific.
        options: List of 2-5 predefined answer choices. Each option should be
                 distinct and represent a meaningful choice.
        allow_custom_answer: If True, the candidate can provide a custom response
                            in addition to the predefined options. Default: True.
        context: (Optional) Internal note about why you're asking this question.
                 This is stored for evaluation but NOT shown to the candidate.

    Returns:
        dict with:
        - success: Whether the question was presented successfully
        - questionId: Unique identifier for this question
        - message: Instruction to wait for response
        - awaiting_response: Always True (signals to wait)

    Example:
        ask_question(
            question_text="How would you like me to approach this sorting problem?",
            options=[
                "Use the built-in sort function",
                "Implement quicksort from scratch",
                "Let's discuss the tradeoffs first"
            ],
            context="Determining if candidate wants to demonstrate algorithm knowledge"
        )
    """
    session_id = get_session_id(config)
    question_id = f"q_{uuid.uuid4().hex[:8]}"

    # Validate options
    if not options or len(options) < 2:
        return {
            "success": False,
            "error": "Please provide at least 2 options for the question.",
        }
    if len(options) > 5:
        return {
            "success": False,
            "error": "Please provide no more than 5 options to avoid overwhelming the candidate.",
        }

    # Emit event to persist the question
    emit_event_fire_and_forget(
        session_id=session_id,
        event_type="agent.question_asked",
        origin="AI",
        data={
            "questionId": question_id,
            "questionText": question_text,
            "options": options,
            "allowCustomAnswer": allow_custom_answer,
            "context": context,  # Internal context for evaluation
        },
        checkpoint=True,  # Questions are important events for replay
    )

    logger.info(f"[ask_question] Presented question {question_id} to session {session_id}")

    return {
        "success": True,
        "questionId": question_id,
        "message": (
            "Question presented to candidate. "
            "WAIT for their response before proceeding. "
            "Do NOT assume their choice."
        ),
        "awaiting_response": True,
    }


# =============================================================================
# Tool List for Export
# =============================================================================

QUESTION_TOOLS = [ask_question]

__all__ = [
    "ask_question",
    "QUESTION_TOOLS",
]
