"""Iteration Tracking Middleware - monitors step budget and detects tool loops.

This middleware tracks the agent's iterations and tool calls to:
1. Inject progressive warnings as the step budget depletes
2. Detect repetitive tool call patterns (loops)
3. Add step budget awareness to the agent's context
4. Signal when the agent should ask for permission to continue

Uses AgentMiddleware.before_model to persist state updates.
"""

import logging
import uuid
from collections import Counter
from typing import Any, cast

from langchain.agents.middleware.types import (
    AgentMiddleware,
    AgentState,
)
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.runtime import Runtime

logger = logging.getLogger(__name__)


# =============================================================================
# Configuration
# =============================================================================

# Default step budget (can be overridden per-task)
DEFAULT_STEP_BUDGET = 100

# Warning thresholds (percentage of budget)
WARNING_THRESHOLDS = {
    0.50: "[STEP BUDGET NOTICE] You have used {used}/{total} steps (50%). Consider consolidating your approach - ask clarifying questions if needed rather than trying more variations.",
    0.75: "[STEP BUDGET WARNING] You have used {used}/{total} steps (75%). Focus on completing core functionality. If stuck, ask the candidate for guidance.",
    0.90: "[STEP BUDGET CRITICAL] You have used {used}/{total} steps (90%). Wrap up current work NOW. Summarize progress and ask if you should continue.",
}

# Loop detection: patterns that indicate problematic behavior
# Format: (sequence of tool names, minimum occurrences to trigger)
LOOP_PATTERNS = [
    (["read_file", "edit_file", "read_file"], 2),  # Read-edit-read cycle, 2 occurrences
    (["read_file", "edit_file"], 4),  # Read-edit cycle, 4 occurrences
    (["run_tests", "edit_file"], 4),  # Test-edit cycle, 4 occurrences
    (["run_bash", "edit_file"], 4),  # Bash-edit cycle, 4 occurrences
    (["write_file", "read_file"], 4),  # Write-read cycle, 4 occurrences
]

# Minimum iterations before loop detection kicks in
LOOP_DETECTION_MIN_ITERATIONS = 10

# Same tool threshold in recent calls
SAME_TOOL_THRESHOLD = 7
RECENT_CALLS_WINDOW = 10


# =============================================================================
# Helper Functions
# =============================================================================

def _extract_tool_sequence(messages: list) -> list[str]:
    """Extract the sequence of tool calls from messages."""
    tools = []
    for msg in messages:
        if isinstance(msg, AIMessage):
            # Check for tool_calls attribute (LangChain format)
            if hasattr(msg, 'tool_calls') and msg.tool_calls:
                for tc in msg.tool_calls:
                    if isinstance(tc, dict) and 'name' in tc:
                        tools.append(tc['name'])
                    elif hasattr(tc, 'name'):
                        tools.append(tc.name)
            # Check content blocks for tool_use (Anthropic format)
            if isinstance(msg.content, list):
                for block in msg.content:
                    if isinstance(block, dict) and block.get('type') == 'tool_use':
                        tools.append(block.get('name', 'unknown'))
    return tools


def _detect_loops(tool_sequence: list[str]) -> list[str]:
    """Detect if the tool sequence contains any loop patterns.

    Returns a list of detected loop descriptions.
    """
    if len(tool_sequence) < LOOP_DETECTION_MIN_ITERATIONS:
        return []

    detected_loops = []

    # Check for defined patterns
    for pattern, min_occurrences in LOOP_PATTERNS:
        pattern_len = len(pattern)
        occurrences = 0

        # Slide through the sequence looking for pattern matches
        for i in range(len(tool_sequence) - pattern_len + 1):
            window = tool_sequence[i:i + pattern_len]
            if window == pattern:
                occurrences += 1

        if occurrences >= min_occurrences:
            pattern_str = " -> ".join(pattern)
            detected_loops.append(
                f"Pattern '{pattern_str}' repeated {occurrences}x"
            )

    # Also detect excessive repeated single tool usage
    if len(tool_sequence) >= RECENT_CALLS_WINDOW:
        recent_tools = tool_sequence[-RECENT_CALLS_WINDOW:]
        counter = Counter(recent_tools)
        for tool, count in counter.items():
            if count >= SAME_TOOL_THRESHOLD:
                detected_loops.append(
                    f"Excessive use of '{tool}': {count}/{RECENT_CALLS_WINDOW} recent calls"
                )

    return detected_loops


def _get_step_count(state: AgentState) -> int:
    """Get the current step count from state by counting ToolMessages."""
    messages = state.get("messages", [])
    tool_count = 0
    for msg in messages:
        if isinstance(msg, ToolMessage):
            tool_count += 1
    return tool_count


def _get_step_budget(state: AgentState, default: int = DEFAULT_STEP_BUDGET) -> int:
    """Get the step budget for this task."""
    return cast(int, state.get("step_budget", default))


def _get_highest_crossed_threshold(used: int, total: int, last_threshold: float) -> tuple[float, str | None]:
    """Get the highest threshold we've crossed that's new.

    Returns (threshold, message) or (last_threshold, None) if no new threshold.
    """
    if total <= 0:
        return last_threshold, None

    usage_ratio = used / total

    # Find the highest threshold we've crossed that's above last_threshold
    new_threshold = last_threshold
    message = None

    for threshold in sorted(WARNING_THRESHOLDS.keys()):
        if usage_ratio >= threshold and threshold > last_threshold:
            new_threshold = threshold
            message = WARNING_THRESHOLDS[threshold].format(used=used, total=total)

    return new_threshold, message


# =============================================================================
# AgentMiddleware Implementation
# =============================================================================

class IterationTrackingMiddleware(AgentMiddleware):
    """Middleware that tracks iterations and injects warnings/loop detection.

    This middleware monitors the agent's step budget usage and tool patterns,
    injecting context-aware warnings to guide the agent toward efficient completion.

    The middleware persists its tracking state and injects system-like messages
    to make the agent aware of its resource usage.
    """

    def __init__(
        self,
        step_budget: int = DEFAULT_STEP_BUDGET,
        enable_loop_detection: bool = True,
        enable_warnings: bool = True,
    ) -> None:
        """Initialize the iteration tracking middleware.

        Args:
            step_budget: Maximum steps allowed before agent should ask permission.
            enable_loop_detection: Whether to detect and warn about loops.
            enable_warnings: Whether to inject progressive warnings.
        """
        super().__init__()
        self.step_budget = step_budget
        self.enable_loop_detection = enable_loop_detection
        self.enable_warnings = enable_warnings

    def before_model(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        """Process state before model invocation.

        Injects warnings and loop detection messages into the context.
        Returns state updates that persist.
        """
        messages = state.get("messages", [])
        if not messages:
            return None

        step_count = _get_step_count(state)
        step_budget = cast(int, state.get("step_budget", self.step_budget))
        last_warning_threshold = cast(float, state.get("last_warning_threshold", 0.0))
        warnings_issued = cast(list[str], state.get("warnings_issued", []))

        injected_messages: list[HumanMessage] = []
        state_updates: dict[str, Any] = {}

        # =====================================================================
        # 1. Progressive Warnings
        # =====================================================================
        if self.enable_warnings and step_budget > 0:
            new_threshold, warning_msg = _get_highest_crossed_threshold(
                step_count, step_budget, last_warning_threshold
            )

            if warning_msg and new_threshold > last_warning_threshold:
                # Inject warning as a system-like HumanMessage
                injected_messages.append(
                    HumanMessage(
                        id=str(uuid.uuid4()),
                        content=warning_msg,
                        additional_kwargs={"internal": True, "type": "budget_warning"},
                    )
                )

                state_updates["last_warning_threshold"] = new_threshold
                warnings_issued = warnings_issued + [f"{int(new_threshold * 100)}%"]
                state_updates["warnings_issued"] = warnings_issued

                logger.info(f"[IterationTracking] Budget warning at {int(new_threshold * 100)}%: {step_count}/{step_budget} steps")

        # =====================================================================
        # 2. Loop Detection
        # =====================================================================
        if self.enable_loop_detection:
            tool_sequence = _extract_tool_sequence(messages)
            detected_loops = _detect_loops(tool_sequence)

            # Only warn if we haven't already flagged loop_detected
            if detected_loops and not state.get("loop_detected", False):
                loop_warning = (
                    "[LOOP DETECTED - STOP AND REASSESS]\n\n"
                    "You appear to be stuck in a repetitive pattern:\n"
                    + "\n".join(f"  - {loop}" for loop in detected_loops) +
                    "\n\n"
                    "This suggests the current approach isn't working. You MUST:\n"
                    "1. STOP making tool calls\n"
                    "2. Explain to the candidate what you've tried\n"
                    "3. Ask: 'What would you like me to try next?'\n\n"
                    "Do NOT continue with the same pattern."
                )

                injected_messages.append(
                    HumanMessage(
                        id=str(uuid.uuid4()),
                        content=loop_warning,
                        additional_kwargs={"internal": True, "type": "loop_warning"},
                    )
                )

                state_updates["loop_detected"] = True
                logger.warning(f"[IterationTracking] Loop detected: {detected_loops}")

        # =====================================================================
        # 3. Budget Exhausted - Ask for Permission
        # =====================================================================
        if step_count >= step_budget and not state.get("budget_exhausted_warned", False):
            exhausted_message = (
                "[STEP BUDGET EXHAUSTED]\n\n"
                f"You have used all {step_budget} allocated steps.\n\n"
                "Before making any more tool calls, you MUST ask the candidate:\n"
                "'I've used my step budget for this task. Would you like me to:\n"
                "  A) Continue working on this\n"
                "  B) Take a different approach\n"
                "  C) Move on to something else'\n\n"
                "Wait for their response before proceeding."
            )

            injected_messages.append(
                HumanMessage(
                    id=str(uuid.uuid4()),
                    content=exhausted_message,
                    additional_kwargs={"internal": True, "type": "budget_exhausted"},
                )
            )

            state_updates["budget_exhausted_warned"] = True
            logger.warning(f"[IterationTracking] Budget exhausted: {step_count}/{step_budget}")

        # =====================================================================
        # 4. Return State Updates
        # =====================================================================
        if injected_messages or state_updates:
            result: dict[str, Any] = {**state_updates}
            if injected_messages:
                result["messages"] = injected_messages
            result["step_count"] = step_count  # Always persist current count
            return result

        return None


# =============================================================================
# Factory Function
# =============================================================================

def create_iteration_tracking_middleware(
    step_budget: int = DEFAULT_STEP_BUDGET,
    enable_loop_detection: bool = True,
    enable_warnings: bool = True,
) -> IterationTrackingMiddleware:
    """Create an iteration tracking middleware instance.

    Args:
        step_budget: Maximum steps allowed before agent should ask permission.
        enable_loop_detection: Whether to detect and warn about loops.
        enable_warnings: Whether to inject progressive warnings.

    Returns:
        IterationTrackingMiddleware instance
    """
    return IterationTrackingMiddleware(
        step_budget=step_budget,
        enable_loop_detection=enable_loop_detection,
        enable_warnings=enable_warnings,
    )
