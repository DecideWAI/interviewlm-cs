"""Question Tools - Tools for the coding agent to ask clarifying questions.

These tools enable the agent to present structured questions to candidates,
with responses persisted in the database for evaluation purposes.
"""

import logging
import os
import threading
import uuid
from typing import Annotated, Any, cast

import httpx
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

logger = logging.getLogger(__name__)


# =============================================================================
# Configuration
# =============================================================================

NEXTJS_INTERNAL_URL = os.environ.get("NEXTJS_INTERNAL_URL", "http://localhost:3000")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "dev-internal-key")


# =============================================================================
# Helper Functions
# =============================================================================

def get_session_id(config: dict | RunnableConfig | None) -> str:
    """Extract session ID from RunnableConfig.configurable."""
    if config is None:
        return "unknown"
    configurable = config.get("configurable", {})
    return cast(str, configurable.get("session_id", "unknown"))


def get_candidate_id(config: dict) -> str:
    """Extract candidate ID from RunnableConfig.configurable."""
    if config is None:
        return "unknown"
    configurable = config.get("configurable", {})
    return cast(str, configurable.get("candidate_id", "unknown"))


def emit_event_fire_and_forget(
    session_id: str,
    event_type: str,
    origin: str,
    data: dict,
    question_index: int | None = None,
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
    config: Annotated[RunnableConfig | None, "Injected by LangGraph"] = None,
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
# Ask Questions Tool (Multiple Questions)
# =============================================================================

@tool
def ask_questions(
    questions: list[dict],
    batch_context: str | None = None,
    config: Annotated[RunnableConfig | None, "Injected by LangGraph"] = None,
) -> dict[str, Any]:
    """
    Present MULTIPLE clarifying questions to the candidate at once.

    Use this when you have 2 or more related questions to ask. The candidate
    will see all questions together and answer them before you receive responses.
    This is more efficient than asking questions one at a time.

    **IMPORTANT:** After calling this tool, WAIT for ALL responses before proceeding.
    The candidate must answer every question before the conversation continues.

    Args:
        questions: List of question objects. Each object should have:
            - question_text (str): The question to ask
            - options (list[str]): List of 2-5 predefined answer choices
            - multi_select (bool, optional): Allow selecting multiple options. Default: False
            - allow_custom_answer (bool, optional): Allow custom response. Default: True
            - context (str, optional): Internal note about why this question is asked
        batch_context: (Optional) Overall context for why these questions are being
                      asked together. Stored for evaluation but NOT shown to candidate.

    Returns:
        dict with:
        - success: Whether questions were presented successfully
        - batchId: Unique identifier for this question batch
        - questionIds: List of individual question IDs
        - message: Instruction to wait for all responses
        - awaiting_response: Always True (signals to wait)

    Example:
        ask_questions(
            questions=[
                {
                    "question_text": "Which database should I use?",
                    "options": ["SQLite (simple)", "PostgreSQL (robust)", "MongoDB (flexible)"],
                    "context": "Determining data layer requirements"
                },
                {
                    "question_text": "Which features do you need?",
                    "options": ["User auth", "File uploads", "Real-time updates", "API rate limiting"],
                    "multi_select": True,  # Allows selecting multiple options
                    "context": "Scoping feature requirements"
                },
                {
                    "question_text": "What's your deployment target?",
                    "options": ["Local development only", "Cloud (AWS/GCP)", "Docker container"],
                    "context": "Understanding deployment constraints"
                }
            ],
            batch_context="Gathering initial architecture requirements"
        )
    """
    session_id = get_session_id(config)
    batch_id = f"batch_{uuid.uuid4().hex[:8]}"

    # Validate number of questions
    if not questions or len(questions) < 2:
        return {
            "success": False,
            "error": "Please provide at least 2 questions. For a single question, use ask_question instead.",
        }
    if len(questions) > 10:
        return {
            "success": False,
            "error": "Please provide no more than 10 questions to avoid overwhelming the candidate.",
        }

    # Validate each question
    processed_questions = []
    question_ids = []

    for i, q in enumerate(questions):
        # Validate required fields
        if not isinstance(q, dict):
            return {
                "success": False,
                "error": f"Question {i + 1} must be a dictionary with question_text and options.",
            }

        question_text = q.get("question_text")
        options = q.get("options", [])

        if not question_text:
            return {
                "success": False,
                "error": f"Question {i + 1} is missing 'question_text'.",
            }

        if not options or len(options) < 2:
            return {
                "success": False,
                "error": f"Question {i + 1} must have at least 2 options.",
            }

        if len(options) > 5:
            return {
                "success": False,
                "error": f"Question {i + 1} has too many options (max 5).",
            }

        question_id = f"q_{uuid.uuid4().hex[:8]}"
        question_ids.append(question_id)

        processed_questions.append({
            "questionId": question_id,
            "questionText": question_text,
            "options": options,
            "multiSelect": q.get("multi_select", False),
            "allowCustomAnswer": q.get("allow_custom_answer", True),
            "context": q.get("context"),
        })

    # Emit event to persist all questions
    emit_event_fire_and_forget(
        session_id=session_id,
        event_type="agent.questions_asked",
        origin="AI",
        data={
            "batchId": batch_id,
            "questions": processed_questions,
            "batchContext": batch_context,
        },
        checkpoint=True,  # Questions are important events for replay
    )

    logger.info(
        f"[ask_questions] Presented {len(questions)} questions (batch {batch_id}) "
        f"to session {session_id}"
    )

    return {
        "success": True,
        "batchId": batch_id,
        "questionIds": question_ids,
        "questionCount": len(questions),
        "message": (
            f"Presented {len(questions)} questions to candidate. "
            "WAIT for ALL responses before proceeding. "
            "Do NOT assume their choices."
        ),
        "awaiting_response": True,
    }


# =============================================================================
# Tool List for Export
# =============================================================================

QUESTION_TOOLS = [ask_question, ask_questions]

__all__ = [
    "ask_question",
    "ask_questions",
    "QUESTION_TOOLS",
]
