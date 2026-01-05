#!/usr/bin/env python3
"""
Quick test script to verify Anthropic prompt caching is working correctly.

This script makes two identical requests and checks if the second one uses cached tokens.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from config import settings

LONG_SYSTEM_PROMPT = """You are a senior software engineer helping candidates during technical interviews.

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
""" * 10  # Repeat to ensure it's long enough for caching (min ~1024 tokens)


async def test_caching():
    print("=" * 60)
    print("Anthropic Prompt Caching Test")
    print("=" * 60)
    print(f"\nModel: {settings.coding_agent_model}")
    print(f"Caching Enabled: {settings.enable_prompt_caching}")
    print(f"System Prompt Length: {len(LONG_SYSTEM_PROMPT)} chars")

    # Create LLM with caching headers
    extra_headers = {}
    if settings.enable_prompt_caching:
        extra_headers["anthropic-beta"] = "prompt-caching-2024-07-31"
        print("Beta Header: anthropic-beta=prompt-caching-2024-07-31")

    llm = ChatAnthropic(
        model=settings.coding_agent_model,
        max_tokens=256,
        api_key=settings.anthropic_api_key,
        extra_headers=extra_headers if extra_headers else None,
    )

    # Create system message with cache_control in content block
    if settings.enable_prompt_caching:
        system_msg = SystemMessage(content=[
            {
                "type": "text",
                "text": LONG_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"}
            }
        ])
        print("System Message: Using content block with cache_control")
    else:
        system_msg = SystemMessage(content=LONG_SYSTEM_PROMPT)
        print("System Message: Plain content (no caching)")

    # First request (should create cache)
    print("\n" + "-" * 40)
    print("Request 1 (should CREATE cache)")
    print("-" * 40)

    messages1 = [
        system_msg,
        HumanMessage(content="What is a linked list?")
    ]

    response1 = await llm.ainvoke(messages1)

    # Extract usage metadata
    usage1 = getattr(response1, 'usage_metadata', {})
    response_meta1 = getattr(response1, 'response_metadata', {})

    print(f"\nResponse: {response1.content[:100]}...")
    print(f"\nUsage Metadata: {usage1}")
    print(f"Response Metadata keys: {list(response_meta1.keys())}")

    # Check for cache metrics in response
    cache_creation_1 = response_meta1.get('usage', {}).get('cache_creation_input_tokens', 0)
    cache_read_1 = response_meta1.get('usage', {}).get('cache_read_input_tokens', 0)
    input_tokens_1 = response_meta1.get('usage', {}).get('input_tokens', 0)

    print(f"\nCache Creation Tokens: {cache_creation_1}")
    print(f"Cache Read Tokens: {cache_read_1}")
    print(f"Input Tokens: {input_tokens_1}")

    if cache_creation_1 > 0:
        print("✓ Cache CREATED successfully!")
    elif cache_read_1 > 0:
        print("! Cache already existed (read from cache)")
    else:
        print("✗ No cache activity detected")

    # Wait a moment
    await asyncio.sleep(1)

    # Second request (should read from cache)
    print("\n" + "-" * 40)
    print("Request 2 (should READ from cache)")
    print("-" * 40)

    messages2 = [
        system_msg,
        HumanMessage(content="What is a binary tree?")
    ]

    response2 = await llm.ainvoke(messages2)

    # Extract usage metadata
    usage2 = getattr(response2, 'usage_metadata', {})
    response_meta2 = getattr(response2, 'response_metadata', {})

    print(f"\nResponse: {response2.content[:100]}...")
    print(f"\nUsage Metadata: {usage2}")

    cache_creation_2 = response_meta2.get('usage', {}).get('cache_creation_input_tokens', 0)
    cache_read_2 = response_meta2.get('usage', {}).get('cache_read_input_tokens', 0)
    input_tokens_2 = response_meta2.get('usage', {}).get('input_tokens', 0)

    print(f"\nCache Creation Tokens: {cache_creation_2}")
    print(f"Cache Read Tokens: {cache_read_2}")
    print(f"Input Tokens: {input_tokens_2}")

    if cache_read_2 > 0:
        print("✓ Cache HIT! Reading from cache.")
        savings = cache_read_2 * 0.9  # 90% savings on cached tokens
        print(f"✓ Estimated savings: {savings:.0f} tokens worth")
    elif cache_creation_2 > 0:
        print("! Cache miss - created new cache (unexpected)")
    else:
        print("✗ No cache activity detected")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    if cache_creation_1 > 0 and cache_read_2 > 0:
        print("\n✓ CACHING IS WORKING CORRECTLY!")
        print(f"  - Request 1: Created cache ({cache_creation_1} tokens)")
        print(f"  - Request 2: Cache hit ({cache_read_2} tokens)")
    elif cache_read_1 > 0 and cache_read_2 > 0:
        print("\n✓ CACHING IS WORKING (cache already existed)")
        print("  - Both requests used cached tokens")
    elif not settings.enable_prompt_caching:
        print("\n! Caching is DISABLED in settings")
        print("  - Set enable_prompt_caching=True to enable")
    else:
        print("\n✗ CACHING MAY NOT BE WORKING")
        print("  Possible causes:")
        print("  1. System prompt too short (needs ~1024+ tokens)")
        print("  2. Beta header not being sent correctly")
        print("  3. cache_control not in content block format")
        print("\n  Debug info:")
        print(f"  - Response metadata: {response_meta2}")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    asyncio.run(test_caching())
