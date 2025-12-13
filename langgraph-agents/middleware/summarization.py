"""Conversation Summarization Middleware - summarizes old messages to manage context length.

This middleware automatically summarizes older conversation messages when the
conversation grows beyond a threshold, keeping recent messages intact while
replacing older ones with a summary.

Benefits:
- Prevents context overflow for very long conversations
- Reduces token costs by compressing history
- Maintains essential context from earlier conversation
- Works alongside caching (summarized history is cached)

IMPORTANT: This middleware carefully handles tool_use/tool_result pairs to avoid
creating orphaned ToolMessages that would cause Anthropic API errors.
"""

import logging
from typing import Any

from langchain.agents.middleware import wrap_model_call
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage

from config import settings

logger = logging.getLogger(__name__)


# =============================================================================
# Configuration
# =============================================================================

# Threshold for triggering summarization (total estimated tokens)
TOKEN_THRESHOLD = 30_000

# Target tokens to keep in recent messages (not summarized)
# We keep enough recent context for continuity (~15k tokens)
KEEP_RECENT_TOKENS = 5_000

# Minimum messages to keep regardless of token count
MIN_KEEP_RECENT_MESSAGES = 6

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


def _get_tool_result_ids_from_messages(messages: list[BaseMessage]) -> set[str]:
    """Get all tool_call_ids referenced by ToolMessages in the list."""
    result_ids = set()
    for msg in messages:
        if isinstance(msg, ToolMessage):
            tool_call_id = getattr(msg, 'tool_call_id', None)
            if tool_call_id:
                result_ids.add(tool_call_id)
    return result_ids


def _find_safe_split_point(messages: list[BaseMessage], initial_split: int) -> int:
    """Find a safe split point that doesn't orphan tool results.

    When summarizing, we need to ensure that if a ToolMessage is in the "recent"
    portion, its corresponding AIMessage with tool_use is also kept.

    Args:
        messages: Full message list
        initial_split: Initial index to split at (messages before this get summarized)

    Returns:
        Adjusted split index that won't create orphaned tool results
    """
    if initial_split <= 1:
        return initial_split

    recent_messages = messages[initial_split:]
    to_summarize = messages[:initial_split]

    # Get all tool_result IDs in recent messages
    recent_tool_result_ids = _get_tool_result_ids_from_messages(recent_messages)

    if not recent_tool_result_ids:
        # No tool results in recent messages - safe to split here
        return initial_split

    # Get all tool_use IDs from messages that would be summarized
    summarized_tool_use_ids = set()
    for msg in to_summarize:
        summarized_tool_use_ids.update(_get_tool_use_ids_from_message(msg))

    # Check if any recent tool_results depend on summarized tool_uses
    orphaned_ids = recent_tool_result_ids & summarized_tool_use_ids

    if not orphaned_ids:
        # No orphans - safe to split here
        return initial_split

    # We have potential orphans - need to move the split point earlier
    # Find the earliest AIMessage that has a tool_use needed by recent messages
    logger.info(f"[Summarization] Found {len(orphaned_ids)} tool pairs that span the split point, adjusting...")

    for i in range(initial_split - 1, 0, -1):
        msg = messages[i]
        msg_tool_ids = _get_tool_use_ids_from_message(msg)

        if msg_tool_ids & orphaned_ids:
            # This message has tool_uses needed by recent messages
            # Move split to before this message
            new_split = i

            # Recalculate orphans with new split
            new_recent = messages[new_split:]
            new_recent_result_ids = _get_tool_result_ids_from_messages(new_recent)

            new_summarized_tool_use_ids = set()
            for m in messages[:new_split]:
                new_summarized_tool_use_ids.update(_get_tool_use_ids_from_message(m))

            new_orphans = new_recent_result_ids & new_summarized_tool_use_ids

            if not new_orphans:
                logger.info(f"[Summarization] Adjusted split point from {initial_split} to {new_split}")
                return new_split

    # If we couldn't find a safe point, keep more messages (be conservative)
    logger.warning(f"[Summarization] Could not find safe split point, keeping all messages")
    return 1  # Only summarize the first message


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


# =============================================================================
# Middleware
# =============================================================================

def _find_token_based_split_point(messages: list[BaseMessage], keep_first: int = 1) -> int:
    """Find split point to keep approximately KEEP_RECENT_TOKENS worth of messages.

    Returns the index where "recent" messages start (everything from this index
    onwards will be kept, everything before will be summarized).
    """
    if len(messages) <= keep_first + MIN_KEEP_RECENT_MESSAGES:
        return keep_first  # Can't split meaningfully

    # Walk backwards from end, accumulating tokens until we hit the target
    recent_tokens = 0
    split_index = len(messages)

    for i in range(len(messages) - 1, keep_first - 1, -1):
        msg_tokens = _estimate_message_tokens(messages[i])
        if recent_tokens + msg_tokens > KEEP_RECENT_TOKENS and split_index < len(messages) - MIN_KEEP_RECENT_MESSAGES:
            # We've accumulated enough tokens
            break
        recent_tokens += msg_tokens
        split_index = i

    # Ensure we keep at least MIN_KEEP_RECENT_MESSAGES
    max_split = len(messages) - MIN_KEEP_RECENT_MESSAGES
    if split_index > max_split:
        split_index = max_split

    return max(split_index, keep_first + 1)


@wrap_model_call
async def summarization_middleware(
    request: ModelRequest, handler
) -> ModelResponse:
    """Summarize old messages when conversation exceeds token threshold.

    This middleware should run BEFORE the caching middleware to ensure
    the summarized history is properly cached.

    Strategy:
    1. Estimate total tokens in conversation
    2. If tokens < TOKEN_THRESHOLD (50k): pass through unchanged
    3. If tokens >= TOKEN_THRESHOLD:
       - Keep first message (usually contains context)
       - Find split point to keep ~KEEP_RECENT_TOKENS worth of recent messages
       - Summarize everything in between
       - Result: [first_msg, summary_msg, ...recent_msgs]
    """
    if not request.messages:
        return await handler(request)

    messages = list(request.messages)
    total_messages = len(messages)

    # Calculate total tokens
    total_tokens = sum(_estimate_message_tokens(m) for m in messages)

    if total_tokens < TOKEN_THRESHOLD:
        return await handler(request)

    logger.info(
        f"[Summarization] Conversation has ~{total_tokens:,} tokens ({total_messages} messages), "
        f"threshold is {TOKEN_THRESHOLD:,}. Summarizing..."
    )

    # Determine which messages to summarize
    keep_first = 1

    if total_messages <= keep_first + MIN_KEEP_RECENT_MESSAGES:
        # Not enough messages to summarize meaningfully
        return await handler(request)

    # Find token-based split point
    initial_split_point = _find_token_based_split_point(messages, keep_first)

    # Adjust split point to avoid orphaning tool results
    # This ensures tool_use/tool_result pairs stay together
    safe_split_point = _find_safe_split_point(messages, initial_split_point)

    if safe_split_point <= keep_first:
        # Can't summarize anything safely
        logger.info("[Summarization] Cannot safely split messages without orphaning tools, skipping")
        return await handler(request)

    # Split messages using safe point
    first_messages = messages[:keep_first]
    messages_to_summarize = messages[keep_first:safe_split_point]
    recent_messages = messages[safe_split_point:]

    if len(messages_to_summarize) < 3:
        # Not enough messages to make summarization worthwhile
        logger.info(f"[Summarization] Only {len(messages_to_summarize)} messages to summarize, skipping")
        return await handler(request)

    # Estimate tokens being summarized
    tokens_being_summarized = sum(
        _estimate_message_tokens(m) for m in messages_to_summarize
    )
    recent_tokens = sum(_estimate_message_tokens(m) for m in recent_messages)

    logger.info(
        f"[Summarization] Summarizing {len(messages_to_summarize)} messages "
        f"(~{tokens_being_summarized:,} tokens), keeping {len(recent_messages)} recent (~{recent_tokens:,} tokens)"
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

    needs_summarization = total_tokens >= TOKEN_THRESHOLD

    if needs_summarization and total > 1 + MIN_KEEP_RECENT_MESSAGES:
        # Find where we would split
        split_point = _find_token_based_split_point(messages, keep_first=1)
        to_summarize = split_point - 1  # Messages between first and split
        tokens_to_summarize = sum(
            _estimate_message_tokens(m)
            for m in messages[1:split_point]
        ) if to_summarize > 0 else 0
        messages_to_keep = total - split_point
        tokens_to_keep = sum(
            _estimate_message_tokens(m)
            for m in messages[split_point:]
        )
    else:
        to_summarize = 0
        tokens_to_summarize = 0
        messages_to_keep = total
        tokens_to_keep = total_tokens

    return {
        "total_messages": total,
        "total_tokens_estimate": total_tokens,
        "needs_summarization": needs_summarization,
        "messages_to_summarize": to_summarize,
        "tokens_to_summarize": tokens_to_summarize,
        "messages_to_keep": messages_to_keep,
        "tokens_to_keep": tokens_to_keep,
        "token_threshold": TOKEN_THRESHOLD,
        "keep_recent_tokens_target": KEEP_RECENT_TOKENS,
    }
