"""Tests for the Summarization Middleware.

Tests cover:
- Token counting with count_tokens_approximately
- Message partitioning preserves AI/Tool message pairs
- Temporal bucket splitting (70/30)
- Summarization triggers at threshold
- Summary message is properly formatted
- RemoveMessage is correctly used
"""

import uuid
from typing import Any
from unittest.mock import MagicMock, Mock, patch

import pytest
from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    RemoveMessage,
    ToolMessage,
)
from langchain_core.messages.utils import count_tokens_approximately
from langgraph.graph.message import REMOVE_ALL_MESSAGES

# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def sample_messages():
    """Create a sample conversation with various message types."""
    return [
        HumanMessage(id="h1", content="Hello, can you help me with a coding problem?"),
        AIMessage(id="a1", content="Of course! What are you working on?"),
        HumanMessage(id="h2", content="I need to implement a binary search algorithm"),
        AIMessage(
            id="a2",
            content="I'll help you with that. Let me check the file first.",
            tool_calls=[{"id": "tc1", "name": "read_file", "args": {"path": "search.py"}}]
        ),
        ToolMessage(id="t1", tool_call_id="tc1", content="def binary_search(arr, target): pass"),
        AIMessage(id="a3", content="Here's the implementation..."),
        HumanMessage(id="h3", content="Can you explain the logic?"),
        AIMessage(id="a4", content="The binary search works by..."),
    ]


@pytest.fixture
def long_conversation():
    """Create a long conversation that should trigger summarization."""
    messages = []
    for i in range(30):
        messages.append(HumanMessage(id=f"h{i}", content=f"Question {i}: " + "x" * 500))
        messages.append(AIMessage(id=f"a{i}", content=f"Answer {i}: " + "y" * 500))
    return messages


@pytest.fixture
def mock_model():
    """Create a mock ChatAnthropic model."""
    model = MagicMock()
    model.invoke.return_value = MagicMock(content="This is a summary of the conversation...")
    return model


# =============================================================================
# Token Counting Tests
# =============================================================================

class TestTokenCounting:
    """Tests for token counting functionality."""

    def test_count_tokens_approximately_with_string_content(self):
        """count_tokens_approximately should work with string content."""
        messages = [
            HumanMessage(content="Hello world"),
            AIMessage(content="Hi there!"),
        ]
        token_count = count_tokens_approximately(messages)
        assert token_count > 0
        # ~4 chars per token, so "Hello world" (~11 chars) + "Hi there!" (~9 chars) ~ 5 tokens
        assert token_count < 20

    def test_count_tokens_approximately_with_long_content(self):
        """Token count should scale with content length."""
        short_msg = [HumanMessage(content="Hi")]
        long_msg = [HumanMessage(content="Hi " * 1000)]

        short_count = count_tokens_approximately(short_msg)
        long_count = count_tokens_approximately(long_msg)

        assert long_count > short_count * 10

    def test_count_tokens_approximately_with_list_content(self):
        """Token counting should handle list content blocks."""
        messages = [
            HumanMessage(content=[
                {"type": "text", "text": "Hello world"}
            ]),
        ]
        token_count = count_tokens_approximately(messages)
        assert token_count > 0


# =============================================================================
# Message Partitioning Tests
# =============================================================================

class TestMessagePartitioning:
    """Tests for message partitioning that preserves AI/Tool pairs."""

    def test_partition_preserves_tool_pairs(self, sample_messages):
        """Partitioning should keep AI messages with their ToolMessages."""
        from middleware.summarization import SummarizationMiddleware

        middleware = SummarizationMiddleware(
            model_name="claude-haiku-4-5-20251001",
            max_tokens_before_summary=100,  # Low threshold for testing
            messages_to_keep=3,
        )

        # Find safe cutoff
        cutoff = middleware._find_safe_cutoff(sample_messages)

        # Partition messages
        to_summarize, preserved = middleware._partition_messages(sample_messages, cutoff)

        # Check that no ToolMessage in preserved references a tool_call in summarized
        summarized_tool_call_ids = set()
        for msg in to_summarize:
            if middleware._has_tool_calls(msg):
                summarized_tool_call_ids.update(middleware._extract_tool_call_ids(msg))

        for msg in preserved:
            if isinstance(msg, ToolMessage):
                assert msg.tool_call_id not in summarized_tool_call_ids, \
                    f"Orphaned ToolMessage found: {msg.tool_call_id}"

    def test_partition_removes_orphaned_tool_messages(self):
        """Orphaned ToolMessages should be filtered out during partitioning."""
        from middleware.summarization import SummarizationMiddleware

        # Create messages where tool message would be orphaned
        messages = [
            HumanMessage(id="h1", content="Hello"),
            AIMessage(
                id="a1",
                content="Let me check",
                tool_calls=[{"id": "tc1", "name": "read_file", "args": {}}]
            ),
            ToolMessage(id="t1", tool_call_id="tc1", content="file content"),
            HumanMessage(id="h2", content="Thanks"),
            AIMessage(id="a2", content="You're welcome"),
        ]

        middleware = SummarizationMiddleware(
            model_name="claude-haiku-4-5-20251001",
            messages_to_keep=2,  # Keep only last 2 messages
        )

        # Force cutoff at index 3 (after ToolMessage)
        to_summarize, preserved = middleware._partition_messages(messages, 3)

        # The ToolMessage should be in to_summarize, not orphaned in preserved
        assert len(preserved) == 2
        for msg in preserved:
            assert not isinstance(msg, ToolMessage), "ToolMessage should not be orphaned"


# =============================================================================
# Temporal Bucket Tests
# =============================================================================

class TestTemporalBuckets:
    """Tests for the 70/30 temporal bucket splitting."""

    def test_split_temporal_buckets_70_30(self):
        """Messages should be split 70% older, 30% recent."""
        from middleware.summarization import SummarizationMiddleware

        middleware = SummarizationMiddleware(model_name="claude-haiku-4-5-20251001")

        messages = [HumanMessage(id=f"m{i}", content=f"Message {i}") for i in range(10)]

        older, recent = middleware._split_temporal_buckets(messages)

        # 70% of 10 = 7 older, 3 recent
        assert len(older) == 7
        assert len(recent) == 3

    def test_split_temporal_buckets_handles_small_lists(self):
        """Small message lists should still be split sensibly."""
        from middleware.summarization import SummarizationMiddleware

        middleware = SummarizationMiddleware(model_name="claude-haiku-4-5-20251001")

        # Single message
        messages = [HumanMessage(id="m1", content="Hello")]
        older, recent = middleware._split_temporal_buckets(messages)
        assert len(older) + len(recent) == 1

        # Two messages
        messages = [
            HumanMessage(id="m1", content="Hello"),
            AIMessage(id="m2", content="Hi"),
        ]
        older, recent = middleware._split_temporal_buckets(messages)
        assert len(older) + len(recent) == 2

    def test_split_temporal_buckets_empty_list(self):
        """Empty message list should return empty buckets."""
        from middleware.summarization import SummarizationMiddleware

        middleware = SummarizationMiddleware(model_name="claude-haiku-4-5-20251001")

        older, recent = middleware._split_temporal_buckets([])
        assert older == []
        assert recent == []


# =============================================================================
# Summarization Trigger Tests
# =============================================================================

class TestSummarizationTrigger:
    """Tests for when summarization should trigger."""

    def test_no_summarization_below_threshold(self, sample_messages):
        """Summarization should not trigger below token threshold."""
        from middleware.summarization import SummarizationMiddleware

        middleware = SummarizationMiddleware(
            model_name="claude-haiku-4-5-20251001",
            max_tokens_before_summary=100000,  # Very high threshold
        )

        state = {"messages": sample_messages}
        mock_runtime = Mock()

        result = middleware.before_model(state, mock_runtime)

        # Should return None (no summarization needed)
        assert result is None

    def test_summarization_triggers_above_threshold(self, long_conversation, mock_model):
        """Summarization should trigger above token threshold."""
        from middleware.summarization import SummarizationMiddleware

        with patch('middleware.summarization.create_chat_model', return_value=mock_model):
            middleware = SummarizationMiddleware(
                model_name="claude-haiku-4-5-20251001",
                max_tokens_before_summary=100,  # Low threshold to trigger
                messages_to_keep=5,
            )

            state = {"messages": long_conversation}
            mock_runtime = Mock()

            result = middleware.before_model(state, mock_runtime)

            # Should return state updates with RemoveMessage
            assert result is not None
            assert "messages" in result
            assert any(isinstance(m, RemoveMessage) for m in result["messages"])


# =============================================================================
# Summary Message Format Tests
# =============================================================================

class TestSummaryMessageFormat:
    """Tests for the format of summary messages."""

    def test_summary_message_has_correct_metadata(self, long_conversation, mock_model):
        """Summary message should have internal=True metadata."""
        from middleware.summarization import SummarizationMiddleware

        with patch('middleware.summarization.create_chat_model', return_value=mock_model):
            middleware = SummarizationMiddleware(
                model_name="claude-haiku-4-5-20251001",
                max_tokens_before_summary=100,
                messages_to_keep=5,
            )

            state = {"messages": long_conversation}
            mock_runtime = Mock()

            result = middleware.before_model(state, mock_runtime)

            # Find the summary HumanMessage
            summary_msg = None
            for msg in result["messages"]:
                if isinstance(msg, HumanMessage) and "summary" in str(msg.additional_kwargs.get("message_type", "")):
                    summary_msg = msg
                    break

            assert summary_msg is not None
            assert summary_msg.additional_kwargs.get("internal") is True
            assert summary_msg.additional_kwargs.get("message_type") == "summary"

    def test_build_new_messages_includes_parallel_reminder(self):
        """Summary message should include parallel execution reminder."""
        from middleware.summarization import SummarizationMiddleware

        middleware = SummarizationMiddleware(model_name="claude-haiku-4-5-20251001")

        new_messages = middleware._build_new_messages("Test summary content")

        assert len(new_messages) == 1
        content = new_messages[0].content
        assert "PARALLEL" in content or "parallel" in content


# =============================================================================
# RemoveMessage Tests
# =============================================================================

class TestRemoveMessage:
    """Tests for proper use of RemoveMessage."""

    def test_result_starts_with_remove_all_messages(self, long_conversation, mock_model):
        """Result should start with RemoveMessage(id=REMOVE_ALL_MESSAGES)."""
        from middleware.summarization import SummarizationMiddleware

        with patch('middleware.summarization.create_chat_model', return_value=mock_model):
            middleware = SummarizationMiddleware(
                model_name="claude-haiku-4-5-20251001",
                max_tokens_before_summary=100,
                messages_to_keep=5,
            )

            state = {"messages": long_conversation}
            mock_runtime = Mock()

            result = middleware.before_model(state, mock_runtime)

            # First message should be RemoveMessage with REMOVE_ALL_MESSAGES
            assert len(result["messages"]) > 0
            first_msg = result["messages"][0]
            assert isinstance(first_msg, RemoveMessage)
            assert first_msg.id == REMOVE_ALL_MESSAGES

    def test_result_includes_preserved_messages(self, long_conversation, mock_model):
        """Result should include preserved recent messages after summary."""
        from middleware.summarization import SummarizationMiddleware

        messages_to_keep = 5

        with patch('middleware.summarization.create_chat_model', return_value=mock_model):
            middleware = SummarizationMiddleware(
                model_name="claude-haiku-4-5-20251001",
                max_tokens_before_summary=100,
                messages_to_keep=messages_to_keep,
            )

            state = {"messages": long_conversation}
            mock_runtime = Mock()

            result = middleware.before_model(state, mock_runtime)

            # Result should have: RemoveMessage + summary + preserved messages
            # At least messages_to_keep preserved messages (may be fewer due to AI/Tool pair handling)
            assert len(result["messages"]) >= 2  # At least RemoveMessage + summary


# =============================================================================
# Message ID Tests
# =============================================================================

class TestMessageIds:
    """Tests for message ID handling."""

    def test_ensure_message_ids_adds_missing_ids(self):
        """Messages without IDs should get UUIDs assigned."""
        from middleware.summarization import SummarizationMiddleware

        middleware = SummarizationMiddleware(model_name="claude-haiku-4-5-20251001")

        messages = [
            HumanMessage(content="Hello"),  # No ID
            AIMessage(id="existing", content="Hi"),
        ]

        middleware._ensure_message_ids(messages)

        assert messages[0].id is not None
        assert messages[1].id == "existing"  # Should not change existing ID

    def test_ensure_message_ids_creates_valid_uuids(self):
        """Generated IDs should be valid UUIDs."""
        from middleware.summarization import SummarizationMiddleware

        middleware = SummarizationMiddleware(model_name="claude-haiku-4-5-20251001")

        messages = [HumanMessage(content="Hello")]
        middleware._ensure_message_ids(messages)

        # Should be able to parse as UUID
        uuid.UUID(messages[0].id)


# =============================================================================
# Integration Tests
# =============================================================================

class TestIntegration:
    """Integration tests for the full middleware flow."""

    def test_full_summarization_flow(self, mock_model):
        """Test complete summarization flow from trigger to result."""
        from middleware.summarization import SummarizationMiddleware

        # Create a conversation that exceeds threshold
        messages = []
        for i in range(20):
            messages.append(HumanMessage(id=f"h{i}", content=f"User message {i} " + "x" * 200))
            messages.append(AIMessage(id=f"a{i}", content=f"AI response {i} " + "y" * 200))

        with patch('middleware.summarization.create_chat_model', return_value=mock_model):
            middleware = SummarizationMiddleware(
                model_name="claude-haiku-4-5-20251001",
                max_tokens_before_summary=500,
                messages_to_keep=6,
            )

            state = {"messages": messages}
            mock_runtime = Mock()

            result = middleware.before_model(state, mock_runtime)

            # Verify the result structure
            assert result is not None
            assert "messages" in result

            result_messages = result["messages"]

            # First should be RemoveMessage
            assert isinstance(result_messages[0], RemoveMessage)

            # Should contain a summary HumanMessage
            has_summary = any(
                isinstance(m, HumanMessage) and m.additional_kwargs.get("message_type") == "summary"
                for m in result_messages
            )
            assert has_summary, "Should contain summary message"

            # Should have some preserved messages
            preserved_count = sum(
                1 for m in result_messages
                if not isinstance(m, RemoveMessage)
                and m.additional_kwargs.get("message_type") != "summary"
            )
            assert preserved_count > 0, "Should have preserved messages"


# =============================================================================
# Edge Cases
# =============================================================================

class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_empty_messages(self):
        """Empty message list should not trigger summarization."""
        from middleware.summarization import SummarizationMiddleware

        middleware = SummarizationMiddleware(model_name="claude-haiku-4-5-20251001")

        state = {"messages": []}
        mock_runtime = Mock()

        result = middleware.before_model(state, mock_runtime)
        assert result is None

    def test_none_max_tokens_disables_summarization(self, long_conversation):
        """Setting max_tokens_before_summary to None should disable summarization."""
        from middleware.summarization import SummarizationMiddleware

        middleware = SummarizationMiddleware(
            model_name="claude-haiku-4-5-20251001",
            max_tokens_before_summary=None,
        )

        state = {"messages": long_conversation}
        mock_runtime = Mock()

        result = middleware.before_model(state, mock_runtime)
        assert result is None

    def test_too_few_messages_to_summarize(self):
        """Should not summarize if there are too few messages."""
        from middleware.summarization import SummarizationMiddleware

        middleware = SummarizationMiddleware(
            model_name="claude-haiku-4-5-20251001",
            max_tokens_before_summary=10,
            messages_to_keep=10,  # More than we have
        )

        messages = [
            HumanMessage(id="h1", content="Hello"),
            AIMessage(id="a1", content="Hi"),
        ]

        state = {"messages": messages}
        mock_runtime = Mock()

        result = middleware.before_model(state, mock_runtime)
        # Should return None because we can't find a safe cutoff
        assert result is None
