#!/usr/bin/env python3
"""Test LLM response metadata directly."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from config import settings


def create_llm_with_caching():
    """Create LLM with caching headers."""
    kwargs = {
        "model": settings.coding_agent_model,
        "max_tokens": 1024,
        "api_key": settings.anthropic_api_key,
    }
    if settings.enable_prompt_caching:
        kwargs["extra_headers"] = {
            "anthropic-beta": "prompt-caching-2024-07-31"
        }
    return ChatAnthropic(**kwargs)


def create_cached_system_message(content: str) -> SystemMessage:
    """Create system message with cache_control in content block."""
    if settings.enable_prompt_caching:
        return SystemMessage(content=[
            {
                "type": "text",
                "text": content,
                "cache_control": {"type": "ephemeral"}
            }
        ])
    return SystemMessage(content=content)


# Must be at least 1024 tokens for caching to work
# Claude Sonnet minimum: 1024 tokens (~4KB of text)
SYSTEM_PROMPT = """You are a senior software engineer helping candidates during technical interviews.

You have extensive knowledge of:
- Data structures and algorithms
- System design and architecture
- Programming languages: Python, JavaScript, TypeScript, Go, Rust, Java
- Best practices for clean, maintainable code
- Testing and debugging strategies

Your role is to:
1. Help candidates understand problems
2. Guide them through solutions without giving away answers directly
3. Review their code and provide constructive feedback
4. Explain concepts when needed

Remember to be encouraging but honest in your feedback.
""" * 15  # Repeat to ensure it's long enough for caching (min ~1024 tokens)


async def test_response():
    print("=" * 60)
    print("LLM Response Metadata Test")
    print("=" * 60)
    print(f"Model: {settings.coding_agent_model}")
    print(f"Caching: {settings.enable_prompt_caching}")

    llm = create_llm_with_caching()
    system_msg = create_cached_system_message(SYSTEM_PROMPT)

    # First call
    print("\n" + "-" * 40)
    print("Call 1 (should CREATE cache)")
    print("-" * 40)

    messages1 = [system_msg, HumanMessage(content="What is Python?")]
    response1 = await llm.ainvoke(messages1)

    print(f"\nResponse type: {type(response1)}")
    print(f"Response content length: {len(response1.content)} chars")
    print(f"\nHas response_metadata: {hasattr(response1, 'response_metadata')}")

    if hasattr(response1, 'response_metadata'):
        print(f"response_metadata keys: {list(response1.response_metadata.keys())}")
        usage = response1.response_metadata.get('usage', {})
        print("\nUsage from response_metadata:")
        for key, value in usage.items():
            print(f"  {key}: {value}")

    if hasattr(response1, 'usage_metadata'):
        print(f"\nusage_metadata: {response1.usage_metadata}")

    await asyncio.sleep(1)

    # Second call
    print("\n" + "-" * 40)
    print("Call 2 (should READ from cache)")
    print("-" * 40)

    messages2 = [system_msg, HumanMessage(content="What is JavaScript?")]
    response2 = await llm.ainvoke(messages2)

    print(f"\nResponse type: {type(response2)}")
    print(f"Response content length: {len(response2.content)} chars")

    if hasattr(response2, 'response_metadata'):
        usage = response2.response_metadata.get('usage', {})
        print("\nUsage from response_metadata:")
        for key, value in usage.items():
            print(f"  {key}: {value}")

        cache_creation = usage.get('cache_creation_input_tokens', 0)
        cache_read = usage.get('cache_read_input_tokens', 0)

        print("\n" + "=" * 60)
        if cache_read > 0:
            print(f"✓ Cache HIT: {cache_read} tokens read from cache")
        elif cache_creation > 0:
            print(f"! Cache miss: {cache_creation} tokens created")
        else:
            print("✗ No cache activity in response_metadata.usage")

    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_response())
