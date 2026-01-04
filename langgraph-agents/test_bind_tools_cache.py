#!/usr/bin/env python3
"""Test if bind_tools() breaks caching."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool

from config import settings

# Use Sonnet for testing (Haiku may have different caching behavior)
MODEL = "claude-sonnet-4-20250514"


@tool
def dummy_tool(query: str) -> str:
    """A dummy tool for testing."""
    return f"Result for: {query}"


def create_llm():
    """Create LLM with caching headers."""
    return ChatAnthropic(
        model=MODEL,
        max_tokens=1024,
        api_key=settings.anthropic_api_key,
        extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
    )


def create_cached_system_message(content: str) -> SystemMessage:
    """Create system message with cache_control."""
    return SystemMessage(content=[
        {
            "type": "text",
            "text": content,
            "cache_control": {"type": "ephemeral"}
        }
    ])


# Long system prompt (needs 2048+ tokens for Haiku)
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
""" * 20  # Repeat to ensure > 2048 tokens


async def test_without_tools():
    print("=" * 60)
    print("Test 1: WITHOUT bind_tools()")
    print("=" * 60)

    llm = create_llm()
    system_msg = create_cached_system_message(SYSTEM_PROMPT)

    messages = [system_msg, HumanMessage(content="What is Python?")]
    response = await llm.ainvoke(messages)

    usage = getattr(response, 'usage_metadata', {})
    details = usage.get('input_token_details', {})
    print(f"Input tokens: {usage.get('input_tokens', 0)}")
    print(f"Cache creation: {details.get('cache_creation', 0)}")
    print(f"Cache read: {details.get('cache_read', 0)}")

    if details.get('cache_creation', 0) > 0:
        print("✓ Cache CREATED")
    else:
        print("✗ No cache created")


async def test_with_tools():
    print("\n" + "=" * 60)
    print("Test 2: WITH bind_tools()")
    print("=" * 60)

    llm = create_llm()
    llm_with_tools = llm.bind_tools([dummy_tool])
    system_msg = create_cached_system_message(SYSTEM_PROMPT)

    messages = [system_msg, HumanMessage(content="What is Python?")]
    response = await llm_with_tools.ainvoke(messages)

    usage = getattr(response, 'usage_metadata', {})
    details = usage.get('input_token_details', {})
    print(f"Input tokens: {usage.get('input_tokens', 0)}")
    print(f"Cache creation: {details.get('cache_creation', 0)}")
    print(f"Cache read: {details.get('cache_read', 0)}")

    if details.get('cache_creation', 0) > 0:
        print("✓ Cache CREATED")
    else:
        print("✗ No cache created")


async def main():
    await test_without_tools()
    await test_with_tools()
    print("\n" + "=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
