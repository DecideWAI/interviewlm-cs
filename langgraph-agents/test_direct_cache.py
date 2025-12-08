#!/usr/bin/env python3
"""Direct test of Anthropic caching with LangChain."""

import asyncio
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from config import settings

# Long system prompt to meet minimum token threshold (1024+ for Sonnet)
SYSTEM_PROMPT = """You are a senior software engineer.

**Your expertise includes:**
- Data structures and algorithms
- System design and architecture
- Programming languages: Python, JavaScript, TypeScript, Go, Rust, Java
- Best practices for clean, maintainable code
- Testing and debugging strategies

**Code Quality Standards:**
- Write clean, readable code with meaningful names
- Include error handling for edge cases
- Follow language-specific conventions
- Add comments for complex logic
- Consider performance implications
- Validate inputs appropriately

**Algorithm Patterns:**
- Two pointers: start/end, fast/slow patterns
- Sliding window: fixed and variable size windows
- Binary search: sorted arrays, search space reduction
- Dynamic programming: memoization, tabulation
- Graph algorithms: BFS, DFS, topological sort
- Divide and conquer: recursive problem decomposition

Be helpful and thorough in your explanations.
""" * 10  # Repeat to ensure 1024+ tokens


async def test_direct_cache():
    print("=" * 60)
    print("Direct Anthropic Cache Test")
    print("=" * 60)

    # Create LLM with caching support
    beta_versions = ["prompt-caching-2024-07-31"]
    llm = ChatAnthropic(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        api_key=settings.anthropic_api_key,
        betas=beta_versions,
        default_headers={"anthropic-beta": ",".join(beta_versions)},
    )

    # Create system message with cache_control
    system_msg = SystemMessage(content=[
        {
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"}
        }
    ])

    # First request - should create cache
    print("\n--- Request 1 (should CREATE cache) ---")
    messages1 = [system_msg, HumanMessage(content="What is Python?")]
    response1 = await llm.ainvoke(messages1)

    usage1 = getattr(response1, 'usage_metadata', {})
    details1 = usage1.get('input_token_details', {})
    print(f"Input tokens: {usage1.get('input_tokens', 0)}")
    print(f"Cache creation: {details1.get('cache_creation', 0)}")
    print(f"Cache read: {details1.get('cache_read', 0)}")

    if details1.get('cache_creation', 0) > 0:
        print("✓ Cache CREATED")
    else:
        print("✗ No cache created")

    # Small delay
    await asyncio.sleep(1)

    # Second request - should read from cache
    print("\n--- Request 2 (should READ from cache) ---")
    messages2 = [system_msg, HumanMessage(content="What is JavaScript?")]
    response2 = await llm.ainvoke(messages2)

    usage2 = getattr(response2, 'usage_metadata', {})
    details2 = usage2.get('input_token_details', {})
    print(f"Input tokens: {usage2.get('input_tokens', 0)}")
    print(f"Cache creation: {details2.get('cache_creation', 0)}")
    print(f"Cache read: {details2.get('cache_read', 0)}")

    if details2.get('cache_read', 0) > 0:
        print("✓ Cache HIT")
    else:
        print("✗ No cache hit")

    # Summary
    print("\n" + "=" * 60)
    if details1.get('cache_creation', 0) > 0 and details2.get('cache_read', 0) > 0:
        print("✓ CACHING IS WORKING!")
    else:
        print("✗ Caching may not be working")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_direct_cache())
