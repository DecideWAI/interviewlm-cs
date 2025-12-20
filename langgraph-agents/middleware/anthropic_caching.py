"""Anthropic Caching Middleware - adds cache_control to system prompt, tools, and messages.

Based on the reference implementation from TheBlueOne/apps/langgraph-python.

This middleware adds cache_control to achieve 90%+ cache rate:
- Breakpoint 1: Tools (~5K tokens) - 100% cached
- Breakpoint 2: System prompt (~15K tokens) - 100% cached
- Breakpoint 3: First N messages - cached (configurable via MESSAGE_CACHE_COUNT)

CRITICAL: This middleware must run LAST in the before_model chain,
after all other middleware that might modify system_prompt or tools.
"""

import logging
from typing import Any

from langchain.agents.middleware import wrap_model_call
from langchain.agents.middleware.types import ModelRequest, ModelResponse

from config import settings
from services.model_factory import is_anthropic_model

logger = logging.getLogger(__name__)


# Default cache control configuration
DEFAULT_CACHE_CONTROL = {"type": "ephemeral"}


def _is_anthropic_model(model: Any) -> bool:
    """Check if the model is an Anthropic model.

    Uses the centralized check from model_factory, with fallback to type inspection
    for bound models or edge cases.
    """
    # First try the centralized check
    if is_anthropic_model(model):
        return True

    # Fallback: check model type string (handles bound models)
    model_type = str(type(model))
    if "anthropic" in model_type.lower() or "claude" in model_type.lower():
        return True

    # Fallback: check model_name attribute
    model_name = getattr(model, "model_name", None) or getattr(model, "model", None)
    if model_name and "claude" in str(model_name).lower():
        return True

    return False


@wrap_model_call
async def anthropic_caching_middleware(
    request: ModelRequest, handler
) -> ModelResponse:
    """Add cache_control to system prompt, tools, and messages for Anthropic models.

    This middleware runs AFTER all content injection middleware to add cache_control to:
    1. The LAST block of system_prompt
    2. All tools
    3. The Nth message (for message-level caching)

    Args:
        request: The model request to modify
        handler: The next handler in the chain

    Returns:
        ModelResponse from the handler
    """
    # Only apply to Anthropic models when caching is enabled
    if not _is_anthropic_model(request.model) or not settings.enable_prompt_caching:
        logger.debug(
            f"[AnthropicCaching] Skipping (is_anthropic={_is_anthropic_model(request.model)}, "
            f"enabled={settings.enable_prompt_caching})"
        )
        return await handler(request)

    logger.info("[AnthropicCaching] Applying cache_control to system prompt, tools, and messages")

    cache_control = DEFAULT_CACHE_CONTROL

    # =========================================================================
    # 1. Add cache_control to system prompt's LAST block
    # =========================================================================
    if request.system_prompt:
        if isinstance(request.system_prompt, str):
            # Convert string to list with cache_control
            request.system_prompt = [
                {
                    "type": "text",
                    "text": request.system_prompt,
                    "cache_control": cache_control,
                }
            ]
            logger.info("[AnthropicCaching] ✓ System prompt: string → list with cache_control")

        elif isinstance(request.system_prompt, list) and len(request.system_prompt) > 0:
            # Add cache_control to the LAST block only
            last_block = request.system_prompt[-1]

            if isinstance(last_block, dict):
                last_block["cache_control"] = cache_control
                logger.info(
                    f"[AnthropicCaching] ✓ System prompt: added cache_control to last of "
                    f"{len(request.system_prompt)} blocks"
                )
            elif isinstance(last_block, str):
                # Convert string block to dict with cache_control
                request.system_prompt[-1] = {
                    "type": "text",
                    "text": last_block,
                    "cache_control": cache_control,
                }
                logger.info("[AnthropicCaching] ✓ System prompt: converted last block to dict")

    # =========================================================================
    # 2. Add cache_control to ALL tools (Anthropic caches tools together)
    # =========================================================================
    if request.tools and len(request.tools) > 0:
        tools_with_cache = []
        for tool in request.tools:
            if isinstance(tool, dict):
                # Tool is already in Anthropic format - add cache_control
                tool_copy = tool.copy()
                tool_copy["cache_control"] = cache_control
                tools_with_cache.append(tool_copy)
            else:
                # Keep as-is if not a dict (shouldn't happen)
                tools_with_cache.append(tool)

        request.tools = tools_with_cache
        logger.info(f"[AnthropicCaching] ✓ Tools: added cache_control to {len(tools_with_cache)} tools")

    # =========================================================================
    # 3. Add cache_control to LAST message to cache EVERYTHING
    # =========================================================================
    # Anthropic caches all content up to and including the message with cache_control
    # By marking the last message, we cache: system prompt + tools + ALL messages
    if request.messages and len(request.messages) > 0:
        message = request.messages[-1]

        # Add cache_control to this message's content
        if isinstance(message.content, str):
            # String content - wrap in array with cache_control
            message.content = [
                {
                    "type": "text",
                    "text": message.content,
                    "cache_control": cache_control,
                }
            ]
            logger.info(
                f"[AnthropicCaching] ✓ Messages: caching ALL {len(request.messages)} messages"
            )

        elif isinstance(message.content, list) and len(message.content) > 0:
            # List content - add cache_control to last block
            last_block = message.content[-1]
            if isinstance(last_block, dict):
                last_block["cache_control"] = cache_control
            elif isinstance(last_block, str):
                message.content[-1] = {
                    "type": "text",
                    "text": last_block,
                    "cache_control": cache_control,
                }
            logger.info(
                f"[AnthropicCaching] ✓ Messages: caching ALL {len(request.messages)} messages"
            )

    # Pass to handler
    return await handler(request)
