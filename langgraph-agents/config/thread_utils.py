"""
Thread ID utilities for consistent thread identification across systems.

This module provides deterministic UUID generation for thread IDs that must
match across TypeScript (LangGraph SDK, LangSmith) and Python (LangGraph agents).

The same session should always produce the same thread UUID regardless of
whether it's generated in TypeScript or Python.

TypeScript implementations:
- lib/services/langgraph-client.ts (generateThreadUUID)
- lib/observability/langsmith.ts (generateThreadUUID)
- app/api/interview/[id]/chat/agent/stream/route.ts (generateThreadUUID)
"""

import uuid

# Namespace UUID for generating deterministic thread IDs
# This is the DNS namespace UUID - same as used in TypeScript
LANGGRAPH_NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")


def generate_thread_uuid(session_id: str, agent_type: str = "coding_agent") -> str:
    """Generate a deterministic UUID from session ID and agent type.

    This function MUST produce the same output as the TypeScript implementations
    to ensure consistent thread grouping in LangSmith across all services.

    Args:
        session_id: The session identifier (e.g., Prisma CUID like "cmj2nmh4600036nyeekj33iiz")
        agent_type: The type of agent (default: "coding_agent")

    Returns:
        A deterministic UUID v5 string

    Example:
        >>> generate_thread_uuid("cmj2nmh4600036nyeekj33iiz", "coding_agent")
        'ec7a7c01-d777-5473-9701-6cdaf3b9f1ba'
    """
    # Construct input string in the same format as TypeScript
    input_string = f"{agent_type}:{session_id}"

    # Generate UUID v5 using the namespace and input string
    thread_uuid = uuid.uuid5(LANGGRAPH_NAMESPACE, input_string)

    return str(thread_uuid)


# Convenience functions for specific agent types
def generate_coding_thread_uuid(session_id: str) -> str:
    """Generate thread UUID for the coding agent."""
    return generate_thread_uuid(session_id, "coding_agent")


def generate_evaluation_thread_uuid(session_id: str) -> str:
    """Generate thread UUID for the evaluation agent."""
    return generate_thread_uuid(session_id, "evaluation_agent")


def generate_interview_thread_uuid(session_id: str) -> str:
    """Generate thread UUID for the interview agent."""
    return generate_thread_uuid(session_id, "interview_agent")


def generate_question_eval_thread_uuid(session_id: str, question_id: str) -> str:
    """Generate thread UUID for the question evaluation agent.

    Note: This uses a composite ID format to keep question evaluations separate.
    """
    return generate_thread_uuid(session_id, f"question_evaluation_agent:{question_id}")


def generate_supervisor_thread_uuid(session_id: str) -> str:
    """Generate thread UUID for the supervisor agent."""
    return generate_thread_uuid(session_id, "supervisor")
