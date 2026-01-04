#!/usr/bin/env python3
"""Quick test to verify coding agent captures cache metrics."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from agents import create_coding_agent
from config import settings

# Use Haiku 3.5 - requires 2048+ tokens for caching (Sonnet only needs 1024+)
settings.coding_agent_model = "claude-haiku-4-5-20251001"

async def test_coding_cache():
    print("=" * 60)
    print("Coding Agent Cache Test")
    print("=" * 60)
    print(f"Model: {settings.coding_agent_model}")
    print(f"Caching Enabled: {settings.enable_prompt_caching}")

    # Create coding agent
    agent = create_coding_agent(
        session_id="test_cache_001",
        candidate_id="test_candidate",
        helpfulness_level="pair-programming",
        problem_statement="Reverse a linked list in Python.",
    )

    # First message - should create cache
    print("\n" + "-" * 40)
    print("Message 1 (should CREATE cache)")
    print("-" * 40)

    result1 = await agent.send_message("Can you explain how to reverse a linked list?")

    print(f"\nResponse text length: {len(result1.get('text', ''))} chars")
    print(f"Tools used: {result1.get('tools_used', [])}")
    print("\nMetadata:")
    metadata1 = result1.get("metadata", {})
    for key, value in metadata1.items():
        print(f"  {key}: {value}")

    cache_creation_1 = metadata1.get("cache_creation_input_tokens", 0)
    cache_read_1 = metadata1.get("cache_read_input_tokens", 0)

    if cache_creation_1 > 0:
        print(f"\n✓ Cache CREATED: {cache_creation_1} tokens")
    elif cache_read_1 > 0:
        print(f"\n! Cache already existed: {cache_read_1} tokens read")
    else:
        print("\n✗ No cache activity detected!")

    # Wait a moment
    await asyncio.sleep(1)

    # Second message - should read from cache
    print("\n" + "-" * 40)
    print("Message 2 (should READ from cache)")
    print("-" * 40)

    result2 = await agent.send_message("What about edge cases for empty lists?")

    print(f"\nResponse text length: {len(result2.get('text', ''))} chars")
    print("\nMetadata:")
    metadata2 = result2.get("metadata", {})
    for key, value in metadata2.items():
        print(f"  {key}: {value}")

    cache_creation_2 = metadata2.get("cache_creation_input_tokens", 0)
    cache_read_2 = metadata2.get("cache_read_input_tokens", 0)

    if cache_read_2 > 0:
        print(f"\n✓ Cache HIT: {cache_read_2} tokens read from cache")
    elif cache_creation_2 > 0:
        print(f"\n! Cache miss - created new cache: {cache_creation_2} tokens")
    else:
        print("\n✗ No cache activity detected!")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    if cache_creation_1 > 0 and cache_read_2 > 0:
        print("\n✓ CACHING IS WORKING CORRECTLY!")
        print(f"  - Message 1: Created cache ({cache_creation_1} tokens)")
        print(f"  - Message 2: Cache hit ({cache_read_2} tokens)")
    else:
        print("\n✗ CACHING MAY NOT BE WORKING")
        print(f"  - Message 1: creation={cache_creation_1}, read={cache_read_1}")
        print(f"  - Message 2: creation={cache_creation_2}, read={cache_read_2}")

    print("\n" + "=" * 60)

if __name__ == "__main__":
    asyncio.run(test_coding_cache())
