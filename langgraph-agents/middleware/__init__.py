"""Middleware for LangGraph agents."""

from .anthropic_caching import anthropic_caching_middleware
from .summarization import (
    summarization_middleware,  # DEPRECATED: Use SummarizationMiddleware class
    SummarizationMiddleware,   # NEW: Class-based middleware that persists to state
    create_summarization_middleware,
    get_summarization_stats,
)
from .system_prompt import system_prompt_middleware

__all__ = [
    "anthropic_caching_middleware",
    "summarization_middleware",  # DEPRECATED
    "SummarizationMiddleware",   # NEW: Recommended
    "create_summarization_middleware",
    "get_summarization_stats",
    "system_prompt_middleware",
]
