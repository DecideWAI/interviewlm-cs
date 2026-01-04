#!/usr/bin/env python3
"""
Test script to verify Anthropic prompt caching and conversation summarization.

This script tests:
1. Cache creation and hits for growing conversations
2. Summarization of long conversations (>30 messages)
3. Combined caching + summarization behavior

Run with: python test_cache_and_summarization.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from agents import create_coding_agent
from config import settings
from middleware.summarization import MESSAGE_THRESHOLD, get_summarization_stats


async def test_caching_with_growing_conversation():
    """Test that caching works correctly as conversation grows."""
    print("=" * 70)
    print("TEST 1: Caching with Growing Conversation")
    print("=" * 70)
    print(f"\nModel: {settings.coding_agent_model}")
    print(f"Caching Enabled: {settings.enable_prompt_caching}")

    # Create coding agent
    agent = create_coding_agent(
        session_id="test_cache_grow_001",
        candidate_id="test_candidate",
        helpfulness_level="pair-programming",
        problem_statement="Implement a function to reverse a linked list.",
    )

    results = []

    # Simulate a growing conversation with multiple turns
    messages = [
        "What's the best approach to reverse a linked list?",
        "Can you show me iterative approach?",
        "What about edge cases like empty list?",
        "How would I test this implementation?",
        "What's the time complexity?",
    ]

    for i, msg in enumerate(messages):
        print(f"\n{'-' * 50}")
        print(f"Message {i + 1}: {msg[:50]}...")
        print(f"{'-' * 50}")

        result = await agent.send_message(msg)

        metadata = result.get("metadata", {})
        cache_creation = metadata.get("cache_creation_input_tokens", 0)
        cache_read = metadata.get("cache_read_input_tokens", 0)
        input_tokens = metadata.get("input_tokens", 0)

        cache_rate = (cache_read / input_tokens * 100) if input_tokens > 0 else 0

        results.append({
            "message": i + 1,
            "cache_creation": cache_creation,
            "cache_read": cache_read,
            "input_tokens": input_tokens,
            "cache_rate": cache_rate,
        })

        print(f"  Cache Creation: {cache_creation:,} tokens")
        print(f"  Cache Read:     {cache_read:,} tokens")
        print(f"  Input Tokens:   {input_tokens:,} tokens")
        print(f"  Cache Rate:     {cache_rate:.1f}%")

        if cache_read > 0:
            print("  ✓ Cache HIT")
        elif cache_creation > 0:
            print("  ✓ Cache CREATED")
        else:
            print("  ✗ No cache activity")

        await asyncio.sleep(0.5)  # Small delay between requests

    # Summary
    print(f"\n{'=' * 70}")
    print("CACHING TEST SUMMARY")
    print(f"{'=' * 70}")

    total_cache_read = sum(r["cache_read"] for r in results)
    total_input = sum(r["input_tokens"] for r in results)
    overall_cache_rate = (total_cache_read / total_input * 100) if total_input > 0 else 0

    print(f"\nTotal Messages: {len(results)}")
    print(f"Total Cache Read: {total_cache_read:,} tokens")
    print(f"Total Input: {total_input:,} tokens")
    print(f"Overall Cache Rate: {overall_cache_rate:.1f}%")

    # Check if caching improved over time
    if len(results) >= 2:
        first_cache = results[0]["cache_read"]
        last_cache = results[-1]["cache_read"]

        if last_cache > first_cache:
            print("\n✓ SUCCESS: Cache hits increased as conversation grew!")
        elif results[-1]["cache_rate"] > 50:
            print("\n✓ SUCCESS: High cache rate on later messages!")
        else:
            print("\n⚠ WARNING: Cache rate lower than expected")

    return results


async def test_summarization():
    """Test that summarization kicks in for long conversations."""
    print(f"\n\n{'=' * 70}")
    print("TEST 2: Summarization for Long Conversations")
    print(f"{'=' * 70}")
    print(f"\nSummarization Threshold: {MESSAGE_THRESHOLD} messages")

    # Create a new agent
    agent = create_coding_agent(
        session_id="test_summarization_001",
        candidate_id="test_candidate",
        helpfulness_level="pair-programming",
        problem_statement="Build a REST API with authentication.",
    )

    # Generate many messages to trigger summarization
    # We need > MESSAGE_THRESHOLD messages (default 30)
    test_messages = []
    topics = [
        "database schema design",
        "user authentication",
        "JWT tokens",
        "password hashing",
        "API endpoints",
        "error handling",
        "input validation",
        "rate limiting",
        "logging",
        "testing strategies",
    ]

    # Generate enough messages to exceed threshold
    for i in range(16):  # 16 rounds = 32 messages (user + AI each)
        topic = topics[i % len(topics)]
        test_messages.append(f"Tell me about {topic} for this API (message {i+1})")

    print(f"\nWill send {len(test_messages)} messages to trigger summarization...")
    print(f"(Summarization triggers at {MESSAGE_THRESHOLD} messages)")

    total_cache_read = 0
    last_metadata = {}

    for i, msg in enumerate(test_messages):
        # Progress indicator
        if i % 5 == 0:
            print(f"\n  Sending messages {i+1}-{min(i+5, len(test_messages))}...")

        result = await agent.send_message(msg)
        last_metadata = result.get("metadata", {})

        cache_read = last_metadata.get("cache_read_input_tokens", 0)
        total_cache_read += cache_read

        # Check for summarization in later messages
        if i >= MESSAGE_THRESHOLD // 2:
            # After halfway point, we should start seeing summarization effects
            input_tokens = last_metadata.get("input_tokens", 0)
            if i == len(test_messages) - 1:
                print("\n  Final message:")
                print(f"    Input tokens: {input_tokens:,}")
                print(f"    Cache read: {cache_read:,}")

        await asyncio.sleep(0.3)

    # Summary
    print(f"\n{'=' * 70}")
    print("SUMMARIZATION TEST SUMMARY")
    print(f"{'=' * 70}")

    print(f"\nTotal messages sent: {len(test_messages)}")
    print(f"Total cache read tokens: {total_cache_read:,}")

    # Check if summarization reduced context size
    # After summarization, input tokens should be reasonable (not growing linearly)
    final_input = last_metadata.get("input_tokens", 0)
    expected_without_summary = len(test_messages) * 1000  # rough estimate

    print(f"\nFinal input tokens: {final_input:,}")
    print(f"Expected without summarization: ~{expected_without_summary:,}")

    if final_input < expected_without_summary * 0.5:
        print("\n✓ SUCCESS: Summarization significantly reduced context size!")
    elif final_input < expected_without_summary * 0.8:
        print("\n✓ PARTIAL SUCCESS: Some reduction in context size")
    else:
        print("\n⚠ WARNING: Context size larger than expected - summarization may not be working")

    return {
        "messages_sent": len(test_messages),
        "total_cache_read": total_cache_read,
        "final_input_tokens": final_input,
    }


async def test_caching_metrics_direct():
    """Quick test to verify cache metrics are being captured."""
    print(f"\n\n{'=' * 70}")
    print("TEST 3: Direct Cache Metrics Verification")
    print(f"{'=' * 70}")

    agent = create_coding_agent(
        session_id="test_direct_metrics",
        candidate_id="test_candidate",
        helpfulness_level="pair-programming",
    )

    # First message - should create cache
    print("\nMessage 1 (should CREATE cache)...")
    result1 = await agent.send_message("Hello, can you help me with coding?")
    meta1 = result1.get("metadata", {})

    print(f"  cache_creation_input_tokens: {meta1.get('cache_creation_input_tokens', 0)}")
    print(f"  cache_read_input_tokens: {meta1.get('cache_read_input_tokens', 0)}")
    print(f"  input_tokens: {meta1.get('input_tokens', 0)}")
    print(f"  output_tokens: {meta1.get('output_tokens', 0)}")

    await asyncio.sleep(1)

    # Second message - should read from cache
    print("\nMessage 2 (should READ from cache)...")
    result2 = await agent.send_message("What's the best way to implement a binary search?")
    meta2 = result2.get("metadata", {})

    print(f"  cache_creation_input_tokens: {meta2.get('cache_creation_input_tokens', 0)}")
    print(f"  cache_read_input_tokens: {meta2.get('cache_read_input_tokens', 0)}")
    print(f"  input_tokens: {meta2.get('input_tokens', 0)}")
    print(f"  output_tokens: {meta2.get('output_tokens', 0)}")

    await asyncio.sleep(1)

    # Third message - should continue reading from cache
    print("\nMessage 3 (should continue cache hits)...")
    result3 = await agent.send_message("Can you show me the iterative version?")
    meta3 = result3.get("metadata", {})

    print(f"  cache_creation_input_tokens: {meta3.get('cache_creation_input_tokens', 0)}")
    print(f"  cache_read_input_tokens: {meta3.get('cache_read_input_tokens', 0)}")
    print(f"  input_tokens: {meta3.get('input_tokens', 0)}")
    print(f"  output_tokens: {meta3.get('output_tokens', 0)}")

    # Verify
    cache_created = meta1.get('cache_creation_input_tokens', 0) > 0
    cache_hit_2 = meta2.get('cache_read_input_tokens', 0) > 0
    cache_hit_3 = meta3.get('cache_read_input_tokens', 0) > 0

    print(f"\n{'=' * 70}")
    print("VERIFICATION RESULTS")
    print(f"{'=' * 70}")

    if cache_created:
        print("✓ Message 1: Cache CREATED")
    else:
        print("✗ Message 1: No cache creation detected")

    if cache_hit_2:
        print("✓ Message 2: Cache HIT")
    else:
        print("✗ Message 2: No cache hit")

    if cache_hit_3:
        print("✓ Message 3: Cache HIT")
    else:
        print("✗ Message 3: No cache hit")

    # Growing cache check
    if cache_hit_3 > cache_hit_2:
        print("\n✓ Cache is growing with conversation (more tokens cached)")
    elif cache_hit_3 > 0:
        print("\n✓ Cache is working (consistent hits)")

    success = cache_created and (cache_hit_2 or cache_hit_3)
    return success


async def main():
    """Run all tests."""
    print("\n" + "=" * 70)
    print("ANTHROPIC CACHING & SUMMARIZATION TEST SUITE")
    print("=" * 70)
    print("\nConfiguration:")
    print(f"  - Model: {settings.coding_agent_model}")
    print(f"  - Prompt Caching: {'ENABLED' if settings.enable_prompt_caching else 'DISABLED'}")
    print(f"  - Summarization Threshold: {MESSAGE_THRESHOLD} messages")

    if not settings.enable_prompt_caching:
        print("\n⚠ WARNING: Prompt caching is DISABLED. Enable it for best results.")
        print("  Set ENABLE_PROMPT_CACHING=true in your environment.")

    try:
        # Test 3: Quick verification (run first as sanity check)
        success = await test_caching_metrics_direct()

        if success:
            # Test 1: Growing conversation caching
            await test_caching_with_growing_conversation()

            # Test 2: Summarization (takes longer)
            # Uncomment to run full summarization test
            # await test_summarization()
            print("\n\n📝 Note: Summarization test skipped (uncomment in code to run)")

        print(f"\n\n{'=' * 70}")
        print("ALL TESTS COMPLETED")
        print(f"{'=' * 70}")

    except Exception as e:
        print(f"\n\n❌ TEST FAILED WITH ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
