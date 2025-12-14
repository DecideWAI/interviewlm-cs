"""Conversation Summarization Middleware - summarizes old messages to manage context length.

This middleware automatically summarizes older conversation messages when the
conversation grows beyond a threshold, keeping recent messages intact while
replacing older ones with a summary.

IMPORTANT: This middleware uses AgentMiddleware.before_model to return state updates
that PERSIST to the checkpointer. This ensures the summarization is not lost between turns.

The key mechanism is returning RemoveMessage(id=REMOVE_ALL_MESSAGES) followed by
the summary message and preserved recent messages. This replaces the full message
history with a compressed version.
"""

import uuid
import logging
from typing import Any, cast

from langchain.agents.middleware import wrap_model_call
from langchain.agents.middleware.types import (
    AgentMiddleware,
    AgentState,
    ModelRequest,
    ModelResponse,
)
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    AIMessage,
    ToolMessage,
    RemoveMessage,
)
from langgraph.graph.message import REMOVE_ALL_MESSAGES
from langgraph.runtime import Runtime

from config import settings

logger = logging.getLogger(__name__)


# =============================================================================
# Configuration
# =============================================================================

# Threshold for triggering summarization (total estimated tokens)
TOKEN_THRESHOLD = 30_000

# Number of recent messages to preserve after summarization
MESSAGES_TO_KEEP = 8

# Approximate max tokens for the summary
SUMMARY_MAX_TOKENS = 3_000


# =============================================================================
# Summarization Prompt
# =============================================================================

SUMMARIZATION_PROMPT = """Summarize the following conversation between a candidate and an AI coding assistant during a technical interview.

Focus on:
1. Key coding decisions and approaches discussed
2. Problems encountered and how they were solved
3. Code changes made and their purpose
4. Any important context for continuing the conversation

Keep the summary concise but preserve essential technical details. Format as a clear narrative.

CONVERSATION TO SUMMARIZE:
{conversation}

SUMMARY:"""


# =============================================================================
# Helper Functions
# =============================================================================

def _estimate_message_tokens(message: BaseMessage) -> int:
    """Estimate token count for a message (rough approximation)."""
    content = message.content
    if isinstance(content, str):
        # Rough estimate: ~4 chars per token
        return len(content) // 4
    elif isinstance(content, list):
        total = 0
        for block in content:
            if isinstance(block, str):
                total += len(block) // 4
            elif isinstance(block, dict) and "text" in block:
                total += len(block["text"]) // 4
        return total
    return 0


def _format_messages_for_summary(messages: list[BaseMessage]) -> str:
    """Format messages into a string for summarization."""
    lines = []
    for msg in messages:
        role = "Candidate" if isinstance(msg, HumanMessage) else "AI Assistant"
        content = msg.content
        if isinstance(content, list):
            # Extract text from content blocks
            text_parts = []
            for block in content:
                if isinstance(block, str):
                    text_parts.append(block)
                elif isinstance(block, dict) and "text" in block:
                    text_parts.append(block["text"])
            content = "\n".join(text_parts)

        # Truncate very long messages
        if len(content) > 1000:
            content = content[:1000] + "... [truncated]"

        lines.append(f"{role}: {content}")

    return "\n\n".join(lines)


def _ensure_message_ids(messages: list[BaseMessage]) -> None:
    """Ensure all messages have unique IDs for the add_messages reducer."""
    for msg in messages:
        if msg.id is None:
            msg.id = str(uuid.uuid4())


def _get_tool_use_ids_from_message(message: BaseMessage) -> set[str]:
    """Extract tool_use IDs from an AIMessage."""
    tool_ids = set()

    if not isinstance(message, AIMessage):
        return tool_ids

    # Check tool_calls attribute (LangChain format)
    if hasattr(message, 'tool_calls') and message.tool_calls:
        for tc in message.tool_calls:
            if isinstance(tc, dict) and 'id' in tc:
                tool_ids.add(tc['id'])
            elif hasattr(tc, 'id'):
                tool_ids.add(tc.id)

    # Check content blocks (Anthropic format)
    content = message.content
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict):
                if block.get('type') == 'tool_use' and 'id' in block:
                    tool_ids.add(block['id'])

    return tool_ids


def _find_safe_cutoff(messages: list[BaseMessage], messages_to_keep: int) -> int:
    """Find safe cutoff point that preserves AI/Tool message pairs.

    Returns the index where messages can be safely cut without separating
    related AI and Tool messages. Returns 0 if no safe cutoff is found.
    """
    if len(messages) <= messages_to_keep:
        return 0

    target_cutoff = len(messages) - messages_to_keep

    # Search backwards from target to find safe point
    for i in range(target_cutoff, -1, -1):
        if _is_safe_cutoff_point(messages, i):
            return i

    return 0


def _is_safe_cutoff_point(messages: list[BaseMessage], cutoff_index: int) -> bool:
    """Check if cutting at index would separate AI/Tool message pairs."""
    if cutoff_index >= len(messages):
        return True

    search_range = 5
    search_start = max(0, cutoff_index - search_range)
    search_end = min(len(messages), cutoff_index + search_range)

    for i in range(search_start, search_end):
        msg = messages[i]
        if not isinstance(msg, AIMessage):
            continue
        if not hasattr(msg, 'tool_calls') or not msg.tool_calls:
            continue

        tool_call_ids = _get_tool_use_ids_from_message(msg)
        if _cutoff_separates_tool_pair(messages, i, cutoff_index, tool_call_ids):
            return False

    return True


def _cutoff_separates_tool_pair(
    messages: list[BaseMessage],
    ai_message_index: int,
    cutoff_index: int,
    tool_call_ids: set[str],
) -> bool:
    """Check if cutoff separates an AI message from its corresponding tool messages."""
    for j in range(ai_message_index + 1, len(messages)):
        message = messages[j]
        if isinstance(message, ToolMessage):
            tool_call_id = getattr(message, 'tool_call_id', None)
            if tool_call_id and tool_call_id in tool_call_ids:
                ai_before_cutoff = ai_message_index < cutoff_index
                tool_before_cutoff = j < cutoff_index
                if ai_before_cutoff != tool_before_cutoff:
                    return True
    return False


def _partition_messages(
    messages: list[BaseMessage],
    cutoff_index: int,
) -> tuple[list[BaseMessage], list[BaseMessage]]:
    """Partition messages into those to summarize and those to preserve.

    Also removes any orphaned ToolMessages from preserved_messages that reference
    tool calls that were in messages_to_summarize.
    """
    messages_to_summarize = messages[:cutoff_index]
    preserved_messages = messages[cutoff_index:]

    # Collect all tool_call_ids from messages that will be summarized
    summarized_tool_call_ids = set()
    for msg in messages_to_summarize:
        summarized_tool_call_ids.update(_get_tool_use_ids_from_message(msg))

    # Filter out orphaned ToolMessages from preserved_messages
    filtered_preserved = []
    for msg in preserved_messages:
        if isinstance(msg, ToolMessage):
            tool_call_id = getattr(msg, 'tool_call_id', None)
            if tool_call_id and tool_call_id in summarized_tool_call_ids:
                # Skip this orphaned ToolMessage
                continue
        filtered_preserved.append(msg)

    return messages_to_summarize, filtered_preserved


async def _generate_summary(messages: list[BaseMessage]) -> str:
    """Generate a summary of the given messages using a fast model."""
    conversation_text = _format_messages_for_summary(messages)
    prompt = SUMMARIZATION_PROMPT.format(conversation=conversation_text)

    # Use Haiku for fast, cheap summarization
    model = ChatAnthropic(
        model_name="claude-haiku-4-5-20251001",
        max_tokens=SUMMARY_MAX_TOKENS,
        temperature=0.3,
        api_key=settings.anthropic_api_key,
    )

    response = await model.ainvoke([HumanMessage(content=prompt)])

    summary = response.content
    if isinstance(summary, list):
        summary = " ".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in summary
        )

    return summary


def _generate_summary_sync(messages: list[BaseMessage]) -> str:
    """Generate a summary of the given messages using a fast model (sync version)."""
    conversation_text = _format_messages_for_summary(messages)
    prompt = SUMMARIZATION_PROMPT.format(conversation=conversation_text)

    # Use Haiku for fast, cheap summarization
    model = ChatAnthropic(
        model_name="claude-haiku-4-5-20251001",
        max_tokens=SUMMARY_MAX_TOKENS,
        temperature=0.3,
        api_key=settings.anthropic_api_key,
    )

    response = model.invoke([HumanMessage(content=prompt)])

    summary = response.content
    if isinstance(summary, list):
        summary = " ".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in summary
        )

    return summary


# =============================================================================
# AgentMiddleware Implementation (Persisting Summarization)
# =============================================================================

class SummarizationMiddleware(AgentMiddleware):
    """Middleware that summarizes conversation history when token limits are approached.

    This middleware monitors message token counts and automatically summarizes older
    messages when a threshold is reached. CRITICALLY, it returns state updates that
    PERSIST to the checkpointer using RemoveMessage.

    This ensures:
    1. Old messages are REMOVED from state (not just hidden from the model)
    2. Summary message is ADDED to state
    3. Recent messages are PRESERVED
    4. Next turn sees the summarized history, not the full history
    """

    def __init__(
        self,
        max_tokens_before_summary: int = TOKEN_THRESHOLD,
        messages_to_keep: int = MESSAGES_TO_KEEP,
    ) -> None:
        """Initialize the summarization middleware.

        Args:
            max_tokens_before_summary: Token threshold to trigger summarization.
            messages_to_keep: Number of recent messages to preserve after summarization.
        """
        super().__init__()
        self.max_tokens_before_summary = max_tokens_before_summary
        self.messages_to_keep = messages_to_keep

    def before_model(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        """Process messages before model invocation, potentially triggering summarization.

        Returns state updates that PERSIST the summarization to the checkpointer.
        """
        messages = state.get("messages", [])
        if not messages:
            return None

        _ensure_message_ids(messages)

        # Calculate total tokens
        total_tokens = sum(_estimate_message_tokens(m) for m in messages)

        if total_tokens < self.max_tokens_before_summary:
            return None

        logger.info(
            f"[Summarization] Conversation has ~{total_tokens:,} tokens ({len(messages)} messages), "
            f"threshold is {self.max_tokens_before_summary:,}. Summarizing..."
        )

        # Find safe cutoff point
        cutoff_index = _find_safe_cutoff(messages, self.messages_to_keep)

        if cutoff_index <= 0:
            logger.info("[Summarization] Cannot find safe cutoff point, skipping")
            return None

        # Partition messages
        messages_to_summarize, preserved_messages = _partition_messages(messages, cutoff_index)

        if len(messages_to_summarize) < 3:
            logger.info(f"[Summarization] Only {len(messages_to_summarize)} messages to summarize, skipping")
            return None

        # Generate summary (sync since before_model is sync)
        try:
            summary_text = _generate_summary_sync(messages_to_summarize)

            logger.info(
                f"[Summarization] Summarized {len(messages_to_summarize)} messages, "
                f"keeping {len(preserved_messages)} recent messages"
            )

            # Create summary message with unique ID
            summary_message = HumanMessage(
                id=str(uuid.uuid4()),
                content=f"[CONVERSATION SUMMARY - Summarizes {len(messages_to_summarize)} earlier messages]\n\n{summary_text}\n\n[END SUMMARY - Continue from here]",
                additional_kwargs={"internal": True, "message_type": "summary"},
            )

            # Return state update that PERSISTS the summarization
            # RemoveMessage(id=REMOVE_ALL_MESSAGES) removes ALL messages from state
            # Then we add back: summary + preserved messages
            return {
                "messages": [
                    RemoveMessage(id=REMOVE_ALL_MESSAGES),
                    summary_message,
                    *preserved_messages,
                ]
            }

        except Exception as e:
            logger.error(f"[Summarization] Failed to summarize: {e}. Continuing without summarization.")
            return None


# =============================================================================
# Factory Function
# =============================================================================

def create_summarization_middleware(
    max_tokens: int = TOKEN_THRESHOLD,
    messages_to_keep: int = MESSAGES_TO_KEEP,
) -> SummarizationMiddleware:
    """Create a summarization middleware instance.

    Args:
        max_tokens: Token threshold to trigger summarization.
        messages_to_keep: Number of recent messages to preserve.

    Returns:
        SummarizationMiddleware instance
    """
    return SummarizationMiddleware(
        max_tokens_before_summary=max_tokens,
        messages_to_keep=messages_to_keep,
    )


# =============================================================================
# Legacy @wrap_model_call Middleware (View-Only, Non-Persisting)
# =============================================================================
# DEPRECATED: This version only modifies the request, not the state.
# Use SummarizationMiddleware class instead for persisting summarization.

@wrap_model_call
async def summarization_middleware(
    request: ModelRequest, handler
) -> ModelResponse:
    """DEPRECATED: Use SummarizationMiddleware class instead.

    This middleware only modifies request.messages (view) but does NOT persist
    the summarization to state. Each turn will see the full history again.

    Kept for backwards compatibility but should be replaced.
    """
    if not request.messages:
        return await handler(request)

    messages = list(request.messages)
    total_tokens = sum(_estimate_message_tokens(m) for m in messages)

    if total_tokens < TOKEN_THRESHOLD:
        return await handler(request)

    logger.warning(
        "[Summarization] DEPRECATED: Using non-persisting summarization middleware. "
        "Switch to SummarizationMiddleware class for proper state persistence."
    )

    cutoff_index = _find_safe_cutoff(messages, MESSAGES_TO_KEEP)

    if cutoff_index <= 0:
        return await handler(request)

    messages_to_summarize, preserved_messages = _partition_messages(messages, cutoff_index)

    if len(messages_to_summarize) < 3:
        return await handler(request)

    try:
        summary_text = await _generate_summary(messages_to_summarize)

        summary_message = HumanMessage(content=[
            {
                "type": "text",
                "text": f"[CONVERSATION SUMMARY]\n\n{summary_text}\n\n[END SUMMARY]",
            }
        ])

        # Only modifies request, NOT state - this is the bug!
        first_messages = messages[:1] if messages else []
        request.messages = list(first_messages) + [summary_message] + list(preserved_messages)

    except Exception as e:
        logger.error(f"[Summarization] Failed: {e}")

    return await handler(request)


# =============================================================================
# Utility Functions
# =============================================================================

def get_summarization_stats(messages: list[BaseMessage]) -> dict:
    """Get statistics about potential summarization."""
    total = len(messages)
    total_tokens = sum(_estimate_message_tokens(m) for m in messages)

    needs_summarization = total_tokens >= TOKEN_THRESHOLD

    if needs_summarization and total > 1 + MESSAGES_TO_KEEP:
        cutoff_index = _find_safe_cutoff(messages, MESSAGES_TO_KEEP)
        to_summarize = cutoff_index
        tokens_to_summarize = sum(
            _estimate_message_tokens(m)
            for m in messages[:cutoff_index]
        ) if cutoff_index > 0 else 0
        messages_to_keep_count = total - cutoff_index
        tokens_to_keep = sum(
            _estimate_message_tokens(m)
            for m in messages[cutoff_index:]
        )
    else:
        to_summarize = 0
        tokens_to_summarize = 0
        messages_to_keep_count = total
        tokens_to_keep = total_tokens

    return {
        "total_messages": total,
        "total_tokens_estimate": total_tokens,
        "needs_summarization": needs_summarization,
        "messages_to_summarize": to_summarize,
        "tokens_to_summarize": tokens_to_summarize,
        "messages_to_keep": messages_to_keep_count,
        "tokens_to_keep": tokens_to_keep,
        "token_threshold": TOKEN_THRESHOLD,
    }
