"""Message Cleanup Middleware - handles message validation and cleanup.

This middleware ensures that messages from thread persistence don't
cause Anthropic API errors by:
1. Removing SystemMessages (system_prompt is passed separately)
2. Removing orphaned ToolMessages (tool_results without corresponding tool_use)

When using create_agent with a system_prompt parameter, the system prompt
is sent separately to the API. Any SystemMessages in the messages list
(from checkpoints/persistence) must be removed to avoid duplicates.

Additionally, when summarization or other operations remove messages,
ToolMessages can become orphaned (no corresponding tool_use in previous message).
"""

from langchain.agents.middleware import wrap_model_call
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_core.messages import SystemMessage, ToolMessage, AIMessage


def _get_tool_use_ids_from_message(message) -> set[str]:
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


def _clean_orphaned_tool_results(messages: list) -> list:
    """Remove ToolMessages that don't have corresponding tool_use in previous message.

    Anthropic requires each tool_result to have a corresponding tool_use
    in the immediately preceding message.
    """
    if not messages:
        return messages

    cleaned = []
    removed_count = 0

    for i, msg in enumerate(messages):
        if isinstance(msg, ToolMessage):
            # Find the tool_use_id this result refers to
            tool_call_id = getattr(msg, 'tool_call_id', None)

            if not tool_call_id:
                # No tool_call_id - remove it
                removed_count += 1
                continue

            # Look for corresponding tool_use in ANY previous AIMessage
            # (Anthropic is flexible about this - just needs to exist somewhere before)
            found = False
            for prev_msg in cleaned:
                if tool_call_id in _get_tool_use_ids_from_message(prev_msg):
                    found = True
                    break

            if not found:
                # Orphaned tool_result - remove it
                removed_count += 1
                continue

        cleaned.append(msg)

    if removed_count > 0:
        print(f"[MessageCleanup] Removed {removed_count} orphaned ToolMessage(s)")

    return cleaned


@wrap_model_call
async def system_prompt_middleware(request: ModelRequest, handler) -> ModelResponse:
    """Clean up messages to prevent Anthropic API errors.

    This middleware handles two common issues with thread persistence:

    1. SystemMessages: When using create_agent with system_prompt parameter,
       the system prompt is sent separately. Any SystemMessages in the messages
       list must be removed to avoid "multiple non-consecutive system messages" error.

    2. Orphaned ToolMessages: When summarization or other operations remove messages,
       ToolMessages can become orphaned (no corresponding tool_use). These cause
       "unexpected tool_use_id found in tool_result blocks" error.

    This middleware should run AFTER summarization_middleware but BEFORE
    caching middleware.
    """
    messages = list(request.messages) if request.messages else []
    original_count = len(messages)

    # Step 1: Remove SystemMessages
    system_messages = [m for m in messages if isinstance(m, SystemMessage)]
    if system_messages:
        messages = [m for m in messages if not isinstance(m, SystemMessage)]
        print(f"[MessageCleanup] Removed {len(system_messages)} SystemMessage(s)")

    # Step 2: Remove orphaned ToolMessages
    messages = _clean_orphaned_tool_results(messages)

    if len(messages) != original_count:
        request.messages = messages

    return await handler(request)
