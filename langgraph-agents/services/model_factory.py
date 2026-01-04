"""
Model Factory for Multi-Provider LLM Support.

Provides a unified interface for creating LLM instances across different providers:
- Anthropic (Claude models)
- OpenAI (GPT models)
- Google (Gemini models)

Each provider has different parameter names and capabilities, which this factory abstracts.
"""

from typing import Any, Literal

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from config.settings import settings

# Type alias for supported providers
Provider = Literal["anthropic", "openai", "gemini"]

# Default model mappings for each provider (quality tier)
DEFAULT_MODELS: dict[str, dict[str, str]] = {
    "quality": {
        "anthropic": "claude-sonnet-4-20250514",
        "openai": "gpt-4o",
        "gemini": "gemini-2.0-flash",
    },
    "fast": {
        "anthropic": "claude-haiku-4-5-20251001",
        "openai": "gpt-4o-mini",
        "gemini": "gemini-1.5-flash",
    },
    "comprehensive": {
        "anthropic": "claude-sonnet-4-5-20250929",
        "openai": "gpt-4o",
        "gemini": "gemini-2.0-flash",
    },
}


def get_default_model(provider: Provider, tier: str = "quality") -> str:
    """Get the default model for a provider and performance tier.

    Args:
        provider: The LLM provider ("anthropic", "openai", "gemini")
        tier: Performance tier ("quality", "fast", "comprehensive")

    Returns:
        The default model name for the given provider and tier
    """
    return DEFAULT_MODELS.get(tier, DEFAULT_MODELS["quality"]).get(
        provider, DEFAULT_MODELS["quality"]["anthropic"]
    )


def create_chat_model(
    provider: Provider,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 32000,
    streaming: bool = False,
    tier: str = "quality",
    **kwargs: Any,
) -> BaseChatModel:
    """Factory function for creating LLM instances.

    Creates a chat model instance for the specified provider with unified parameters.
    Handles provider-specific differences in parameter names and initialization.

    Args:
        provider: The LLM provider ("anthropic", "openai", "gemini")
        model: Model name (uses default for provider if not specified)
        temperature: Sampling temperature (0.0-1.0)
        max_tokens: Maximum tokens in response
        streaming: Whether to stream responses
        tier: Performance tier for default model selection ("quality", "fast", "comprehensive")
        **kwargs: Additional provider-specific arguments

    Returns:
        A configured BaseChatModel instance

    Raises:
        ValueError: If provider is not supported or API key is missing

    Example:
        >>> model = create_chat_model("openai", model="gpt-4o", temperature=0.5)
        >>> model = create_chat_model("anthropic")  # Uses default model
        >>> model = create_chat_model("gemini", tier="fast")  # Uses gemini-1.5-flash
    """
    # Use default model if not specified
    if model is None:
        model = get_default_model(provider, tier)

    if provider == "anthropic":
        api_key = settings.anthropic_api_key
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is required for Anthropic provider")

        # Handle Anthropic-specific prompt caching configuration
        default_headers = kwargs.pop("default_headers", {})
        betas = kwargs.pop("betas", [])

        if settings.enable_prompt_caching:
            betas = ["prompt-caching-2024-07-31"]
            default_headers["anthropic-beta"] = ",".join(betas)

        return ChatAnthropic(
            model_name=model,
            max_tokens=max_tokens,
            temperature=temperature,
            streaming=streaming,
            api_key=api_key,
            betas=betas,
            default_headers=default_headers,
            **kwargs,
        )

    elif provider == "openai":
        api_key = settings.openai_api_key
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAI provider")

        return ChatOpenAI(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            streaming=streaming,
            api_key=api_key,
            **kwargs,
        )

    elif provider == "gemini":
        api_key = settings.google_api_key
        if not api_key:
            raise ValueError("GOOGLE_API_KEY is required for Gemini provider")

        return ChatGoogleGenerativeAI(
            model=model,
            max_output_tokens=max_tokens,
            temperature=temperature,
            streaming=streaming,
            google_api_key=api_key,
            **kwargs,
        )

    else:
        raise ValueError(f"Unsupported provider: {provider}. Use 'anthropic', 'openai', or 'gemini'")


def create_model_from_context(
    context: dict[str, Any],
    default_provider: str,
    default_model: str,
    temperature: float = 0.3,
    max_tokens: int = 32000,
    streaming: bool = False,
    **kwargs: Any,
) -> BaseChatModel:
    """Create a model based on request context with fallback to defaults.

    This is the primary function used by agents to create models with per-request
    provider/model override support.

    Args:
        context: Request context dict, may contain "provider" and "model" keys
        default_provider: Default provider if not in context
        default_model: Default model if not in context
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
        streaming: Whether to stream responses
        **kwargs: Additional provider-specific arguments

    Returns:
        A configured BaseChatModel instance

    Example:
        >>> # In middleware, with context from API request
        >>> context = {"provider": "openai", "model": "gpt-4o-mini"}
        >>> model = create_model_from_context(
        ...     context,
        ...     default_provider=settings.coding_agent_provider,
        ...     default_model=settings.coding_agent_model,
        ... )
    """
    provider = context.get("provider", default_provider)
    model = context.get("model", default_model)

    return create_chat_model(
        provider=provider,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        streaming=streaming,
        **kwargs,
    )


def is_anthropic_model(model: BaseChatModel) -> bool:
    """Check if a model is an Anthropic ChatAnthropic instance.

    Used by middleware to apply Anthropic-specific features like prompt caching.

    Args:
        model: The model to check

    Returns:
        True if the model is a ChatAnthropic instance
    """
    return isinstance(model, ChatAnthropic)


def is_openai_model(model: BaseChatModel) -> bool:
    """Check if a model is an OpenAI ChatOpenAI instance."""
    return isinstance(model, ChatOpenAI)


def is_gemini_model(model: BaseChatModel) -> bool:
    """Check if a model is a Google ChatGoogleGenerativeAI instance."""
    return isinstance(model, ChatGoogleGenerativeAI)
