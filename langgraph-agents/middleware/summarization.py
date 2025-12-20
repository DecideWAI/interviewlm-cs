"""Conversation Summarization Middleware with Temporal Gradient.

Automatically summarizes older conversation messages when the conversation grows
beyond a threshold, using a temporal gradient approach:
- Older messages (70%): High-level, compressed summary
- Recent messages (30%): Detailed, comprehensive summary

This ensures critical recent context is preserved while older context is compressed.

Based on the official LangChain SummarizationMiddleware but enhanced with
temporal gradient approach and interview-specific optimizations.
"""

import uuid
from collections.abc import Callable, Iterable
from typing import Any, cast

from langchain.agents.middleware.types import AgentMiddleware, AgentState
from langchain_core.messages import (
    AIMessage,
    AnyMessage,
    MessageLikeRepresentation,
    RemoveMessage,
    ToolMessage,
)
from langchain_core.messages.human import HumanMessage
from langchain_core.messages.utils import count_tokens_approximately, trim_messages
from langgraph.graph.message import REMOVE_ALL_MESSAGES
from langgraph.runtime import Runtime

from config import settings
from services.model_factory import create_chat_model


# =============================================================================
# Type Aliases
# =============================================================================

TokenCounter = Callable[[Iterable[MessageLikeRepresentation]], int]


# =============================================================================
# Configuration Constants
# =============================================================================

_DEFAULT_TRIM_TOKEN_LIMIT = 60000
_DEFAULT_FALLBACK_MESSAGE_COUNT = 15
_SEARCH_RANGE_FOR_TOOL_PAIRS = 5


# =============================================================================
# Summary Prompt with Temporal Gradient
# =============================================================================

DEFAULT_SUMMARY_PROMPT = """<role>
Context Preservation Specialist for Technical Interview Sessions
</role>

<primary_objective>
Create a summary of the conversation history that preserves critical context needed to seamlessly continue the interview session. This summary will REPLACE the conversation history, using a temporal gradient approach where RECENT activity gets detailed coverage and OLDER activity gets high-level trail coverage.
</primary_objective>

<token_limit>
CRITICAL - NON-NEGOTIABLE TOKEN LIMIT
Your summary MUST stay under 4000 tokens. This is a HARD LIMIT.
If you exceed this limit, critical information will be cut off.
Prioritize recency: detailed recent context > compressed older trail.
</token_limit>

<temporal_gradient_strategy>
The messages are split into two temporal buckets:
1. OLDER MESSAGES (first 70% of conversation): Compress to high-level trail
2. RECENT MESSAGES (last 30% of conversation): Provide comprehensive detail

Allocate tokens accordingly:
- Older section: ~1000-1500 tokens (compressed, essential trail only)
- Recent section: ~2500-3000 tokens (detailed, comprehensive context)
</temporal_gradient_strategy>

<required_structure>
Your summary MUST have these TWO main parts:

---

## PART 1: OLDER HISTORY (Compressed Trail)

Provide HIGH-LEVEL overview only for older messages. Be concise and focus on:

### Major Milestones & Key Events
- Brief chronological trail of significant events
- Major context switches or phase changes
- Critical decisions that affect current work

### Architecture & Foundation
- Core architectural decisions still relevant
- Design patterns established
- Technology stack and dependencies (aggregate list)

### File Changes (Aggregate)
- Group file changes by feature/module
- Focus on what was built, not exhaustive detail
- Example: "Created authentication module (5 files), built API layer (8 files)"

---

## PART 2: RECENT ACTIVITY (Detailed Context)

Provide COMPREHENSIVE detail for recent messages. Include:

### 1. Recent Event Timeline
- Step-by-step actions, decisions, and events
- What was attempted, succeeded, failed (with reasons)
- Error messages and debugging steps
- Context switches if any

### 2. Recent File Modifications
- ALL files created/modified/deleted recently
- Full file paths and change types
- Purpose and key components affected
- Current state (working/broken/partial)

### 3. Current Technical Context
- Active design patterns and architecture
- State management approach
- API structure and endpoints
- Database schema changes
- UI/UX details (colors, layouts, components) if applicable

### 4. Dependencies & Configuration
- Packages/libraries added or updated (with versions)
- Environment variables and configuration changes
- Build system modifications

### 5. Key Decisions & Rationale
- Recent technical decisions and trade-offs
- Alternatives considered and rejected
- Performance/security/scalability considerations

### 6. Current State Assessment
**MOST IMPORTANT SECTION**
- What is fully functional and working NOW
- What is partially implemented NOW
- What is broken or has known issues NOW
- Current blockers and challenges
- Active TODOs and pending work

### 7. Next Steps & Context
- What candidate was working on when summarization triggered
- What should be tackled next
- Open questions or uncertainties
- Required follow-up actions

### 8. Recent Gotchas & Learnings
- Recent bugs and fixes
- Things that didn't work and why
- Platform-specific issues
- Workarounds and their rationale

</required_structure>

<formatting_guidelines>
- Use markdown headers (##, ###) for clear organization
- Bullet points for lists, **bold** for critical info
- Code snippets in backticks for technical references
- Keep sentences concise but information-dense
- Specific names, paths, values (never vague)
- Technical terminology used accurately
</formatting_guidelines>

<what_to_avoid>
- Do NOT exceed 4000 tokens (check as you write)
- Do NOT give equal detail to old and recent messages
- Do NOT use vague language ("some files", "a few changes")
- Do NOT include conversational fluff or meta-commentary
- Do NOT add information not in the conversation
- Do NOT skip the temporal gradient (compress old, detail recent)
</what_to_avoid>

<message_buckets>
Below are the conversation messages split into temporal buckets:

OLDER MESSAGES (compress to high-level trail):
{older_messages}

RECENT MESSAGES (provide comprehensive detail):
{recent_messages}
</message_buckets>

Remember: Respond ONLY with the summary following the two-part structure above. Stay under 4000 tokens. No preamble or meta-commentary."""


SUMMARY_PREFIX = "## Previous conversation summary:"


# =============================================================================
# SummarizationMiddleware Class
# =============================================================================

class SummarizationMiddleware(AgentMiddleware):
    """Middleware that summarizes conversation history when token limits are approached.

    This middleware monitors message token counts and automatically summarizes older
    messages when a threshold is reached, preserving recent messages and maintaining
    context continuity by ensuring AI/Tool message pairs remain together.

    Uses a temporal gradient approach:
    - 70% older messages get compressed, high-level summary
    - 30% recent messages get detailed, comprehensive summary
    """

    def __init__(
        self,
        model_name: str = "claude-haiku-4-5-20251001",
        max_tokens_before_summary: int | None = 15000,
        messages_to_keep: int = 8,
        token_counter: TokenCounter = count_tokens_approximately,
        summary_prompt: str = DEFAULT_SUMMARY_PROMPT,
        summary_prefix: str = SUMMARY_PREFIX,
    ) -> None:
        """Initialize the summarization middleware.

        Args:
            model_name: The model name to use for generating summaries.
                Defaults to claude-haiku-4-5-20251001 for fast/cheap summarization.
            max_tokens_before_summary: Token threshold to trigger summarization.
                If `None`, summarization is disabled.
            messages_to_keep: Number of recent messages to preserve after summarization.
                Default is 8 (reduced from 20 to minimize context after summarization).
            token_counter: Function to count tokens in messages.
            summary_prompt: Prompt template for generating summaries.
            summary_prefix: Prefix added to system message when including summary.
        """
        super().__init__()

        # Create ChatModel instance with hard token limit for summary generation
        # max_tokens=4000 enforces the non-negotiable 4k token limit in prompt
        # Uses configured summarization provider (defaults to Anthropic)
        self.model = create_chat_model(
            provider=settings.summarization_provider,
            model=model_name,
            temperature=0.2,
            max_tokens=4000,
        )

        self.max_tokens_before_summary = max_tokens_before_summary
        self.messages_to_keep = messages_to_keep
        self.token_counter = token_counter
        self.summary_prompt = summary_prompt
        self.summary_prefix = summary_prefix

    def _ensure_message_ids(self, messages: list[AnyMessage]) -> None:
        """Ensure all messages have unique IDs for the add_messages reducer."""
        for msg in messages:
            if msg.id is None:
                msg.id = str(uuid.uuid4())

    def _partition_messages(
        self,
        conversation_messages: list[AnyMessage],
        cutoff_index: int,
    ) -> tuple[list[AnyMessage], list[AnyMessage]]:
        """Partition messages into those to summarize and those to preserve.

        Also removes any orphaned ToolMessages from preserved_messages that reference
        tool calls that were in messages_to_summarize.
        """
        messages_to_summarize = conversation_messages[:cutoff_index]
        preserved_messages = conversation_messages[cutoff_index:]

        # Collect all tool_call_ids from messages that will be summarized
        summarized_tool_call_ids = set()
        for msg in messages_to_summarize:
            if self._has_tool_calls(msg):
                summarized_tool_call_ids.update(
                    self._extract_tool_call_ids(cast("AIMessage", msg))
                )

        # Filter out orphaned ToolMessages from preserved_messages
        # An orphaned ToolMessage is one whose tool_call_id references a tool_call
        # that was in a message being summarized
        filtered_preserved = []
        for msg in preserved_messages:
            if isinstance(msg, ToolMessage):
                # Check if this ToolMessage references a tool call that's being removed
                if msg.tool_call_id in summarized_tool_call_ids:
                    # Skip this orphaned ToolMessage
                    continue
            filtered_preserved.append(msg)

        return messages_to_summarize, filtered_preserved

    def _split_temporal_buckets(
        self,
        messages: list[AnyMessage],
    ) -> tuple[list[AnyMessage], list[AnyMessage]]:
        """Split messages into older (70%) and newer (30%) temporal buckets.

        This creates a recency gradient where:
        - Older messages (first 70%) get compressed, high-level summary
        - Newer messages (last 30%) get detailed, comprehensive summary

        Args:
            messages: List of messages to split into temporal buckets

        Returns:
            Tuple of (older_messages, newer_messages)
        """
        if not messages:
            return [], []

        # Split point at 70% of the message list
        split_point = int(len(messages) * 0.7)

        # Ensure at least some messages in each bucket if possible
        if split_point == 0 and len(messages) > 0:
            split_point = 1
        elif split_point == len(messages) and len(messages) > 1:
            split_point = len(messages) - 1

        older_messages = messages[:split_point]
        newer_messages = messages[split_point:]

        return older_messages, newer_messages

    def _find_safe_cutoff(self, messages: list[AnyMessage]) -> int:
        """Find safe cutoff point that preserves AI/Tool message pairs.

        Returns the index where messages can be safely cut without separating
        related AI and Tool messages. Returns 0 if no safe cutoff is found.
        """
        if len(messages) <= self.messages_to_keep:
            return 0

        target_cutoff = len(messages) - self.messages_to_keep

        for i in range(target_cutoff, -1, -1):
            if self._is_safe_cutoff_point(messages, i):
                return i

        return 0

    def _is_safe_cutoff_point(self, messages: list[AnyMessage], cutoff_index: int) -> bool:
        """Check if cutting at index would separate AI/Tool message pairs."""
        if cutoff_index >= len(messages):
            return True

        search_start = max(0, cutoff_index - _SEARCH_RANGE_FOR_TOOL_PAIRS)
        search_end = min(len(messages), cutoff_index + _SEARCH_RANGE_FOR_TOOL_PAIRS)

        for i in range(search_start, search_end):
            if not self._has_tool_calls(messages[i]):
                continue

            tool_call_ids = self._extract_tool_call_ids(cast("AIMessage", messages[i]))
            if self._cutoff_separates_tool_pair(messages, i, cutoff_index, tool_call_ids):
                return False

        return True

    def _has_tool_calls(self, message: AnyMessage) -> bool:
        """Check if message is an AI message with tool calls."""
        return (
            isinstance(message, AIMessage)
            and hasattr(message, "tool_calls")
            and message.tool_calls  # type: ignore[return-value]
        )

    def _extract_tool_call_ids(self, ai_message: AIMessage) -> set[str]:
        """Extract tool call IDs from an AI message."""
        tool_call_ids = set()
        for tc in ai_message.tool_calls:
            call_id = tc.get("id") if isinstance(tc, dict) else getattr(tc, "id", None)
            if call_id is not None:
                tool_call_ids.add(call_id)
        return tool_call_ids

    def _cutoff_separates_tool_pair(
        self,
        messages: list[AnyMessage],
        ai_message_index: int,
        cutoff_index: int,
        tool_call_ids: set[str],
    ) -> bool:
        """Check if cutoff separates an AI message from its corresponding tool messages."""
        for j in range(ai_message_index + 1, len(messages)):
            message = messages[j]
            if isinstance(message, ToolMessage) and message.tool_call_id in tool_call_ids:
                ai_before_cutoff = ai_message_index < cutoff_index
                tool_before_cutoff = j < cutoff_index
                if ai_before_cutoff != tool_before_cutoff:
                    return True
        return False

    def _validate_summary_length(self, summary: str) -> str:
        """Validate summary stays within token limits and log metrics.

        Args:
            summary: The generated summary text to validate

        Returns:
            The summary (unmodified)
        """
        # Count tokens in the summary
        try:
            # Create a simple message representation for token counting
            token_count = self.token_counter([{"role": "user", "content": summary}])

            if token_count > 4000:
                print(f"[Summarization] Warning: Summary exceeded limit: {token_count} tokens (target: 4000)")
            else:
                print(f"[Summarization] Summary within limits: {token_count} tokens")
        except Exception as e:  # noqa: BLE001
            # Best effort - don't fail if token counting has issues
            print(f"[Summarization] Warning: Could not validate summary length: {e}")

        return summary

    async def _create_summary_async(self, messages_to_summarize: list[AnyMessage]) -> str:
        """Generate summary for the given messages using temporal gradient approach.

        Splits messages into older (70%) and newer (30%) buckets, then generates
        a summary with compressed detail for older messages and comprehensive
        detail for recent messages.

        This is async to avoid blocking the event loop during LLM calls.
        """
        if not messages_to_summarize:
            return "No previous conversation history."

        # Split messages into temporal buckets (70% older, 30% newer)
        older_messages, recent_messages = self._split_temporal_buckets(messages_to_summarize)

        # Trim each bucket to fit within limits
        # Use more aggressive trimming for older messages since they'll be compressed
        trimmed_older = self._trim_messages_for_summary(
            older_messages, max_tokens=_DEFAULT_TRIM_TOKEN_LIMIT // 2
        )
        trimmed_recent = self._trim_messages_for_summary(
            recent_messages, max_tokens=_DEFAULT_TRIM_TOKEN_LIMIT
        )

        # If both buckets are empty after trimming, return fallback
        if not trimmed_older and not trimmed_recent:
            return "Previous conversation was too long to summarize."

        # Format messages as strings for the prompt
        older_text = self._format_messages_for_prompt(trimmed_older) if trimmed_older else "No older messages."
        recent_text = self._format_messages_for_prompt(trimmed_recent) if trimmed_recent else "No recent messages."

        # Format prompt with temporal buckets
        try:
            formatted_prompt = self.summary_prompt.format(
                older_messages=older_text,
                recent_messages=recent_text,
            )

            response = await self.model.ainvoke(formatted_prompt)
            summary = cast("str", response.content).strip()

            # Validate and log summary token count
            summary = self._validate_summary_length(summary)

            return summary
        except Exception as e:  # noqa: BLE001
            print(f"[Summarization] Error generating summary: {e}")
            return f"Error generating summary: {e!s}"

    def _format_messages_for_prompt(self, messages: list[AnyMessage]) -> str:
        """Format messages as readable text for the summary prompt."""
        lines = []
        for msg in messages:
            if isinstance(msg, HumanMessage):
                role = "Candidate"
            elif isinstance(msg, AIMessage):
                role = "AI Assistant"
            elif isinstance(msg, ToolMessage):
                role = "Tool Result"
            else:
                role = "System"

            content = msg.content
            if isinstance(content, list):
                # Extract text from content blocks
                text_parts = []
                for block in content:
                    if isinstance(block, str):
                        text_parts.append(block)
                    elif isinstance(block, dict) and "text" in block:
                        text_parts.append(block["text"])
                content = "\n".join(text_parts)

            # Truncate very long messages
            if len(content) > 1500:
                content = content[:1500] + "... [truncated]"

            lines.append(f"{role}: {content}")

        return "\n\n".join(lines)

    def _trim_messages_for_summary(
        self,
        messages: list[AnyMessage],
        max_tokens: int = _DEFAULT_TRIM_TOKEN_LIMIT,
    ) -> list[AnyMessage]:
        """Trim messages to fit within summary generation limits.

        Args:
            messages: Messages to trim
            max_tokens: Maximum token count for trimmed messages

        Returns:
            Trimmed message list
        """
        if not messages:
            return []

        try:
            return trim_messages(
                messages,
                max_tokens=max_tokens,
                token_counter=self.token_counter,
                start_on="human",
                strategy="last",
                allow_partial=True,
                include_system=True,
            )
        except Exception:  # noqa: BLE001
            return messages[-_DEFAULT_FALLBACK_MESSAGE_COUNT:]

    def _build_new_messages(self, summary: str) -> list[HumanMessage]:
        """Build new messages with summary.

        The metadata marks this as an internal/system message that should NOT
        be persisted to the database or shown to users. Summary messages are
        used internally by the AI for context management when token limits are
        approached, but they should remain invisible to end users.

        Args:
            summary: The conversation summary text

        Returns:
            List containing the summary message
        """
        # Parallel execution reminder - helps maintain performance after summarization
        parallel_reminder = (
            "**PERFORMANCE INSTRUCTION:**\n\n"
            "Continue using PARALLEL tool calls for ALL independent operations.\n"
            "- Feature additions: 3-10+ parallel writes\n"
            "- Bug fixes: Parallel writes for all affected files\n"
            "- Debugging: Parallel reads for inspection\n\n"
            "Parallel execution is the DEFAULT mode. Sequential is the EXCEPTION.\n\n"
            "---\n\n"
        )

        content = (
            f"{parallel_reminder}"
            f"Here is a summary of the conversation to date:\n\n{summary}"
        )

        return [
            HumanMessage(
                content=content,
                additional_kwargs={"internal": True, "message_type": "summary"}
            )
        ]

    async def abefore_model(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:  # noqa: ARG002
        """Process messages before model invocation, potentially triggering summarization.

        This async hook is called before each model invocation. If the conversation
        exceeds the token threshold, it will:
        1. Find a safe cutoff point that preserves AI/Tool pairs
        2. Generate a temporal-gradient summary of older messages
        3. Return state updates that PERSIST the summarization via RemoveMessage

        Uses async model calls to avoid blocking the event loop during LLM retries.

        Args:
            state: Current agent state containing messages
            runtime: LangGraph runtime context

        Returns:
            None if no summarization needed, or dict with state updates
        """
        messages = state.get("messages", [])
        if not messages:
            return None

        self._ensure_message_ids(messages)

        # Check if summarization is disabled
        if self.max_tokens_before_summary is None:
            return None

        total_tokens = self.token_counter(messages)
        if total_tokens < self.max_tokens_before_summary:
            return None

        print(
            f"[Summarization] Conversation has ~{total_tokens:,} tokens ({len(messages)} messages), "
            f"threshold is {self.max_tokens_before_summary:,}. Summarizing..."
        )

        cutoff_index = self._find_safe_cutoff(messages)

        if cutoff_index <= 0:
            print("[Summarization] Cannot find safe cutoff point, skipping")
            return None

        messages_to_summarize, preserved_messages = self._partition_messages(messages, cutoff_index)

        if len(messages_to_summarize) < 3:
            print(f"[Summarization] Only {len(messages_to_summarize)} messages to summarize, skipping")
            return None

        summary = await self._create_summary_async(messages_to_summarize)

        print(
            f"[Summarization] Summarized {len(messages_to_summarize)} messages, "
            f"keeping {len(preserved_messages)} recent messages"
        )

        # Build new messages with summary
        new_messages = self._build_new_messages(summary)

        return {
            "messages": [
                RemoveMessage(id=REMOVE_ALL_MESSAGES),
                *new_messages,
                *preserved_messages,
            ]
        }


# =============================================================================
# Factory Function
# =============================================================================

def create_summarization_middleware(
    model_name: str = "claude-haiku-4-5-20251001",
    max_tokens: int = 15000,
    messages_to_keep: int = 8,
) -> SummarizationMiddleware:
    """Create a summarization middleware instance.

    Args:
        model_name: Model to use for summarization.
        max_tokens: Token threshold to trigger summarization.
        messages_to_keep: Number of recent messages to preserve.

    Returns:
        SummarizationMiddleware instance
    """
    return SummarizationMiddleware(
        model_name=model_name,
        max_tokens_before_summary=max_tokens,
        messages_to_keep=messages_to_keep,
    )


# =============================================================================
# Utility Functions
# =============================================================================

def get_summarization_stats(messages: list[AnyMessage]) -> dict:
    """Get statistics about potential summarization.

    Useful for monitoring and debugging summarization behavior.

    Args:
        messages: List of messages to analyze

    Returns:
        Dict with stats including total messages, tokens, and whether
        summarization would be triggered
    """
    total = len(messages)
    total_tokens = count_tokens_approximately(messages) if messages else 0

    default_threshold = 15000
    default_keep = 8

    needs_summarization = total_tokens >= default_threshold

    if needs_summarization and total > default_keep:
        # Estimate cutoff point
        cutoff_estimate = max(0, total - default_keep)
        to_summarize = cutoff_estimate
        tokens_to_summarize = count_tokens_approximately(
            messages[:cutoff_estimate]
        ) if cutoff_estimate > 0 else 0
        messages_to_keep_count = total - cutoff_estimate
        tokens_to_keep = count_tokens_approximately(
            messages[cutoff_estimate:]
        ) if cutoff_estimate < total else 0
    else:
        to_summarize = 0
        tokens_to_summarize = 0
        messages_to_keep_count = total
        tokens_to_keep = total_tokens

    return {
        "total_messages": total,
        "total_tokens_estimate": total_tokens,
        "needs_summarization": needs_summarization,
        "messages_to_summarize": to_summarize,
        "tokens_to_summarize": tokens_to_summarize,
        "messages_to_keep": messages_to_keep_count,
        "tokens_to_keep": tokens_to_keep,
        "token_threshold": default_threshold,
    }
