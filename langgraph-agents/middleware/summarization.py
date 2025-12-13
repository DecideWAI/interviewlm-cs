"""Conversation Summarization Middleware - summarizes old messages to manage context length.

This middleware automatically summarizes older conversation messages when the
conversation grows beyond a threshold, keeping recent messages intact while
replacing older ones with a summary.

Benefits:
- Prevents context overflow for very long conversations
- Reduces token costs by compressing history
- Maintains essential context from earlier conversation
- Works alongside caching (summarized history is cached)
"""

import logging
from typing import Any

from langchain.agents.middleware import wrap_model_call
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage

from config import settings

logger = logging.getLogger(__name__)


# =============================================================================
# Configuration
# =============================================================================

# Threshold for triggering summarization (number of messages)
MESSAGE_THRESHOLD = 30

# Number of recent messages to keep intact (not summarized)
KEEP_RECENT_MESSAGES = 10

# Approximate max tokens for the summary
SUMMARY_MAX_TOKENS = 2000


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


async def _generate_summary(messages: list[BaseMessage]) -> str:
    """Generate a summary of the given messages using a fast model."""
    conversation_text = _format_messages_for_summary(messages)
    prompt = SUMMARIZATION_PROMPT.format(conversation=conversation_text)

    # Use Haiku for fast, cheap summarization
    model = ChatAnthropic(
        model_name="claude-3-5-haiku-20241022",
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


# =============================================================================
# Middleware
# =============================================================================

@wrap_model_call
async def summarization_middleware(
    request: ModelRequest, handler
) -> ModelResponse:
    """Summarize old messages when conversation exceeds threshold.

    This middleware should run BEFORE the caching middleware to ensure
    the summarized history is properly cached.

    Strategy:
    1. If messages < threshold: pass through unchanged
    2. If messages >= threshold:
       - Keep first message (usually contains context)
       - Summarize messages from index 1 to (total - KEEP_RECENT)
       - Keep recent KEEP_RECENT_MESSAGES messages
       - Result: [first_msg, summary_msg, ...recent_msgs]
    """
    if not request.messages or len(request.messages) < MESSAGE_THRESHOLD:
        return await handler(request)

    logger.info(
        f"[Summarization] Conversation has {len(request.messages)} messages, "
        f"threshold is {MESSAGE_THRESHOLD}. Summarizing..."
    )

    messages = request.messages
    total_messages = len(messages)

    # Determine which messages to summarize
    # Keep: first message + last KEEP_RECENT_MESSAGES
    # Summarize: everything in between
    keep_first = 1
    keep_last = KEEP_RECENT_MESSAGES

    if total_messages <= keep_first + keep_last:
        # Not enough messages to summarize meaningfully
        return await handler(request)

    # Split messages
    first_messages = messages[:keep_first]
    messages_to_summarize = messages[keep_first:total_messages - keep_last]
    recent_messages = messages[total_messages - keep_last:]

    # Estimate tokens being summarized
    tokens_being_summarized = sum(
        _estimate_message_tokens(m) for m in messages_to_summarize
    )

    logger.info(
        f"[Summarization] Summarizing {len(messages_to_summarize)} messages "
        f"(~{tokens_being_summarized} tokens), keeping {len(recent_messages)} recent"
    )

    # Generate summary
    try:
        summary_text = await _generate_summary(messages_to_summarize)

        # Create summary message as a HumanMessage (not SystemMessage)
        # Using HumanMessage avoids "multiple non-consecutive system messages" error
        # from Anthropic API when the first message is already a SystemMessage
        summary_message = HumanMessage(content=[
            {
                "type": "text",
                "text": f"[CONVERSATION SUMMARY - The following summarizes {len(messages_to_summarize)} earlier messages in this conversation]\n\n{summary_text}\n\n[END SUMMARY - Continue the conversation from here]",
            }
        ])

        # Reconstruct messages: [first] + [summary] + [recent]
        new_messages = list(first_messages) + [summary_message] + list(recent_messages)

        logger.info(
            f"[Summarization] Reduced from {total_messages} to {len(new_messages)} messages "
            f"(summary: ~{len(summary_text)//4} tokens)"
        )

        request.messages = new_messages

    except Exception as e:
        logger.error(f"[Summarization] Failed to summarize: {e}. Continuing without summarization.")
        # Continue without summarization on error

    return await handler(request)


# =============================================================================
# Utility Functions
# =============================================================================

def get_summarization_stats(messages: list[BaseMessage]) -> dict:
    """Get statistics about potential summarization."""
    total = len(messages)
    total_tokens = sum(_estimate_message_tokens(m) for m in messages)

    needs_summarization = total >= MESSAGE_THRESHOLD

    if needs_summarization:
        to_summarize = max(0, total - 1 - KEEP_RECENT_MESSAGES)
        tokens_to_summarize = sum(
            _estimate_message_tokens(m)
            for m in messages[1:total - KEEP_RECENT_MESSAGES]
        ) if to_summarize > 0 else 0
    else:
        to_summarize = 0
        tokens_to_summarize = 0

    return {
        "total_messages": total,
        "total_tokens_estimate": total_tokens,
        "needs_summarization": needs_summarization,
        "messages_to_summarize": to_summarize,
        "tokens_to_summarize": tokens_to_summarize,
        "messages_to_keep": KEEP_RECENT_MESSAGES,
        "threshold": MESSAGE_THRESHOLD,
    }
