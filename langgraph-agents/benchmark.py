#!/usr/bin/env python3
"""
LangGraph Agents Benchmark Script

Simulates a realistic interview flow to test all agents and verify:
1. Correct execution order
2. Prompt caching effectiveness
3. Streaming performance
4. Overall latency

Results are written to benchmark_results/ directory for analysis.

Usage:
    python benchmark.py [--iterations N] [--no-cache] [--verbose]
"""

import argparse
import asyncio
import json
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from agents import (
    EvaluationStreamingCallbacks,
    StreamingCallbacks,
    create_coding_agent,
    create_evaluation_agent,
    create_interview_agent,
    create_question_evaluation_agent,
    create_supervisor,
)
from config import settings

# =============================================================================
# Benchmark Configuration
# =============================================================================

@dataclass
class BenchmarkConfig:
    """Configuration for benchmark run."""
    iterations: int = 3
    enable_caching: bool = True
    enable_streaming: bool = True
    verbose: bool = False
    output_dir: str = "benchmark_results"
    session_prefix: str = "bench"


@dataclass
class TimingResult:
    """Timing result for a single operation."""
    operation: str
    duration_ms: float
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    is_cached: bool = False
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)


@dataclass
class BenchmarkResults:
    """Results from a complete benchmark run."""
    run_id: str
    config: dict
    start_time: str
    end_time: str
    total_duration_ms: float
    timings: list[TimingResult]
    cache_stats: dict
    errors: list[str]
    summary: dict


# =============================================================================
# Cache Tracking Utilities
# =============================================================================

class CacheTracker:
    """Tracks Anthropic prompt caching statistics."""

    def __init__(self):
        self.total_cache_creation_tokens = 0
        self.total_cache_read_tokens = 0
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.cache_hits = 0
        self.cache_misses = 0
        self.operations = []

    def record(
        self,
        operation: str,
        cache_creation_tokens: int = 0,
        cache_read_tokens: int = 0,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ):
        """Record token usage for an operation."""
        self.total_cache_creation_tokens += cache_creation_tokens
        self.total_cache_read_tokens += cache_read_tokens
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens

        is_cached = cache_read_tokens > 0
        if is_cached:
            self.cache_hits += 1
        elif cache_creation_tokens > 0:
            self.cache_misses += 1

        self.operations.append({
            "operation": operation,
            "cache_creation_tokens": cache_creation_tokens,
            "cache_read_tokens": cache_read_tokens,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "is_cached": is_cached,
        })

    def get_stats(self) -> dict:
        """Get cache statistics summary."""
        total_ops = self.cache_hits + self.cache_misses
        hit_rate = (self.cache_hits / total_ops * 100) if total_ops > 0 else 0

        # Calculate cost savings from caching
        # Cache read tokens cost 90% less than regular input tokens
        savings_tokens = self.total_cache_read_tokens * 0.9

        return {
            "total_cache_creation_tokens": self.total_cache_creation_tokens,
            "total_cache_read_tokens": self.total_cache_read_tokens,
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "cache_hits": self.cache_hits,
            "cache_misses": self.cache_misses,
            "cache_hit_rate_percent": round(hit_rate, 2),
            "estimated_savings_tokens": round(savings_tokens),
            "operations": self.operations,
        }


# =============================================================================
# Mock Data for Realistic Interview
# =============================================================================

PROBLEM_STATEMENT = """
## Reverse a Linked List

Implement a function to reverse a singly linked list.

### Requirements:
1. The function should take the head of a linked list as input
2. Return the new head of the reversed list
3. Handle edge cases (empty list, single node)
4. Use O(1) extra space (in-place reversal)

### Example:
Input: 1 -> 2 -> 3 -> 4 -> 5
Output: 5 -> 4 -> 3 -> 2 -> 1
"""

CANDIDATE_CODE = '''
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def reverse_linked_list(head):
    """Reverse a singly linked list in-place."""
    prev = None
    current = head

    while current:
        next_node = current.next
        current.next = prev
        prev = current
        current = next_node

    return prev

# Test the implementation
def create_list(values):
    if not values:
        return None
    head = ListNode(values[0])
    current = head
    for val in values[1:]:
        current.next = ListNode(val)
        current = current.next
    return head

def list_to_array(head):
    result = []
    while head:
        result.append(head.val)
        head = head.next
    return result

# Test cases
test1 = create_list([1, 2, 3, 4, 5])
result1 = reverse_linked_list(test1)
print(f"Test 1: {list_to_array(result1)}")  # [5, 4, 3, 2, 1]

test2 = create_list([1])
result2 = reverse_linked_list(test2)
print(f"Test 2: {list_to_array(result2)}")  # [1]

test3 = create_list([])
result3 = reverse_linked_list(test3)
print(f"Test 3: {list_to_array(result3)}")  # []
'''

CANDIDATE_MESSAGES = [
    "Can you explain the approach for reversing a linked list? I'm thinking about using pointers.",
    "I've written the code. Can you review it and check if my pointer manipulation is correct?",
    "The tests are passing. Is there anything I should improve in terms of edge cases or efficiency?",
]

CODE_SNAPSHOTS = [
    {
        "timestamp": "2025-01-01T10:00:00Z",
        "files": {"/workspace/solution.py": "# Starting with empty file"},
    },
    {
        "timestamp": "2025-01-01T10:05:00Z",
        "files": {"/workspace/solution.py": CANDIDATE_CODE[:500]},
    },
    {
        "timestamp": "2025-01-01T10:15:00Z",
        "files": {"/workspace/solution.py": CANDIDATE_CODE},
    },
]

TEST_RESULTS = [
    {"timestamp": "2025-01-01T10:10:00Z", "passed": 1, "failed": 2, "total": 3},
    {"timestamp": "2025-01-01T10:15:00Z", "passed": 3, "failed": 0, "total": 3},
]

CLAUDE_INTERACTIONS = [
    {
        "candidate_message": CANDIDATE_MESSAGES[0],
        "assistant_message": "Great question! The key insight is to use three pointers...",
        "timestamp": "2025-01-01T10:02:00Z",
        "tools_used": [],
    },
    {
        "candidate_message": CANDIDATE_MESSAGES[1],
        "assistant_message": "Your pointer manipulation looks correct...",
        "timestamp": "2025-01-01T10:08:00Z",
        "tools_used": ["read_file"],
    },
    {
        "candidate_message": CANDIDATE_MESSAGES[2],
        "assistant_message": "Your solution handles all edge cases well...",
        "timestamp": "2025-01-01T10:16:00Z",
        "tools_used": ["run_tests"],
    },
]


# =============================================================================
# Benchmark Runner
# =============================================================================

class InterviewBenchmark:
    """Runs a complete interview benchmark simulation."""

    def __init__(self, config: BenchmarkConfig):
        self.config = config
        self.cache_tracker = CacheTracker()
        self.timings: list[TimingResult] = []
        self.errors: list[str] = []
        self.run_id = f"{config.session_prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        # Create output directory
        self.output_dir = Path(config.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Configure caching
        if not config.enable_caching:
            settings.enable_prompt_caching = False
            print("[Config] Prompt caching DISABLED")
        else:
            settings.enable_prompt_caching = True
            print("[Config] Prompt caching ENABLED")

    def log(self, message: str):
        """Log message if verbose mode is enabled."""
        if self.config.verbose:
            print(f"  {message}")

    async def time_operation(
        self,
        name: str,
        coro,
        extract_cache_info: bool = False,
    ) -> tuple[any, TimingResult]:
        """Time an async operation and record metrics."""
        start = time.perf_counter()
        error = None
        result = None
        cache_creation = 0
        cache_read = 0
        input_tokens = 0
        output_tokens = 0

        try:
            result = await coro

            # Try to extract cache info from result
            if extract_cache_info and isinstance(result, dict):
                metadata = result.get("metadata", {})
                # These would come from Anthropic's response headers
                cache_creation = metadata.get("cache_creation_input_tokens", 0)
                cache_read = metadata.get("cache_read_input_tokens", 0)
                input_tokens = metadata.get("input_tokens", 0)
                output_tokens = metadata.get("output_tokens", 0)

        except Exception as e:
            error = str(e)
            self.errors.append(f"{name}: {error}")

        duration = (time.perf_counter() - start) * 1000  # Convert to ms

        timing = TimingResult(
            operation=name,
            duration_ms=round(duration, 2),
            cache_creation_tokens=cache_creation,
            cache_read_tokens=cache_read,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            is_cached=cache_read > 0,
            error=error,
        )

        self.timings.append(timing)
        self.cache_tracker.record(
            name,
            cache_creation_tokens=cache_creation,
            cache_read_tokens=cache_read,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

        status = "✓" if not error else "✗"
        cache_status = " [CACHED]" if cache_read > 0 else ""
        print(f"  {status} {name}: {duration:.0f}ms{cache_status}")

        return result, timing

    async def run_interview_flow(self, iteration: int) -> dict:
        """Run a complete interview flow simulation."""
        session_id = f"{self.run_id}_iter{iteration}"
        candidate_id = f"candidate_{iteration}"

        print(f"\n{'='*60}")
        print(f"Interview Flow - Iteration {iteration + 1}/{self.config.iterations}")
        print(f"Session: {session_id}")
        print(f"{'='*60}")

        flow_results = {
            "iteration": iteration,
            "session_id": session_id,
            "steps": [],
        }

        # ---------------------------------------------------------------------
        # Step 1: Interview Agent - Session Start
        # ---------------------------------------------------------------------
        print("\n[1/8] Interview Agent: Session Start")
        interview_agent = create_interview_agent()

        result, timing = await self.time_operation(
            "interview_session_start",
            interview_agent.process_event(
                session_id=session_id,
                candidate_id=candidate_id,
                event_type="session-started",
                event_data={"difficulty": 5},
            ),
        )
        flow_results["steps"].append({"step": "session_start", "timing": asdict(timing)})

        metrics = result
        self.log(f"Initial IRT theta: {metrics.get('irt_theta', 0)}")

        # ---------------------------------------------------------------------
        # Step 2: Coding Agent - First Interaction (explain approach)
        # ---------------------------------------------------------------------
        print("\n[2/8] Coding Agent: First Interaction (explain approach)")
        coding_agent = create_coding_agent(
            session_id=session_id,
            candidate_id=candidate_id,
            helpfulness_level="pair-programming",
            problem_statement=PROBLEM_STATEMENT,
        )

        result, timing = await self.time_operation(
            "coding_first_interaction",
            coding_agent.send_message(CANDIDATE_MESSAGES[0]),
            extract_cache_info=True,
        )
        flow_results["steps"].append({"step": "coding_first", "timing": asdict(timing)})

        if result:
            self.log(f"Response length: {len(result.get('text', ''))} chars")
            self.log(f"Tools used: {result.get('tools_used', [])}")

        # ---------------------------------------------------------------------
        # Step 3: Interview Agent - Record AI Interaction
        # ---------------------------------------------------------------------
        print("\n[3/8] Interview Agent: Record AI Interaction")

        result, timing = await self.time_operation(
            "interview_ai_interaction_1",
            interview_agent.process_event(
                session_id=session_id,
                candidate_id=candidate_id,
                event_type="ai-interaction",
                event_data={
                    "candidate_message": CANDIDATE_MESSAGES[0],
                    "tools_used": [],
                },
                existing_metrics=metrics,
            ),
        )
        flow_results["steps"].append({"step": "interview_ai_1", "timing": asdict(timing)})
        metrics = result

        # ---------------------------------------------------------------------
        # Step 4: Coding Agent - Second Interaction (code review)
        # ---------------------------------------------------------------------
        print("\n[4/8] Coding Agent: Second Interaction (code review)")

        # This should benefit from prompt caching (same system prompt)
        result, timing = await self.time_operation(
            "coding_second_interaction",
            coding_agent.send_message(CANDIDATE_MESSAGES[1]),
            extract_cache_info=True,
        )
        flow_results["steps"].append({"step": "coding_second", "timing": asdict(timing)})

        if result:
            self.log(f"Response length: {len(result.get('text', ''))} chars")

        # ---------------------------------------------------------------------
        # Step 5: Interview Agent - Record Code Change + Test Run
        # ---------------------------------------------------------------------
        print("\n[5/8] Interview Agent: Record Code Change & Test Run")

        # Code change
        result, timing = await self.time_operation(
            "interview_code_change",
            interview_agent.process_event(
                session_id=session_id,
                candidate_id=candidate_id,
                event_type="code-changed",
                event_data={
                    "file": "/workspace/solution.py",
                    "lines_added": 30,
                    "lines_removed": 0,
                },
                existing_metrics=metrics,
            ),
        )
        flow_results["steps"].append({"step": "interview_code", "timing": asdict(timing)})
        metrics = result

        # Test run
        result, timing = await self.time_operation(
            "interview_test_run",
            interview_agent.process_event(
                session_id=session_id,
                candidate_id=candidate_id,
                event_type="test-run",
                event_data={
                    "passed": 3,
                    "failed": 0,
                    "total": 3,
                },
                existing_metrics=metrics,
            ),
        )
        flow_results["steps"].append({"step": "interview_test", "timing": asdict(timing)})
        metrics = result

        # ---------------------------------------------------------------------
        # Step 6: Coding Agent - Third Interaction (final review)
        # ---------------------------------------------------------------------
        print("\n[6/8] Coding Agent: Third Interaction (final review)")

        # Should also benefit from caching
        result, timing = await self.time_operation(
            "coding_third_interaction",
            coding_agent.send_message(CANDIDATE_MESSAGES[2]),
            extract_cache_info=True,
        )
        flow_results["steps"].append({"step": "coding_third", "timing": asdict(timing)})

        # ---------------------------------------------------------------------
        # Step 7: Interview Agent - Question Answered
        # ---------------------------------------------------------------------
        print("\n[7/8] Interview Agent: Question Answered")

        result, timing = await self.time_operation(
            "interview_question_answered",
            interview_agent.process_event(
                session_id=session_id,
                candidate_id=candidate_id,
                event_type="question-answered",
                event_data={
                    "is_correct": True,
                    "time_spent": 900,  # 15 minutes
                    "difficulty": 5,
                },
                existing_metrics=metrics,
            ),
        )
        flow_results["steps"].append({"step": "interview_answered", "timing": asdict(timing)})
        metrics = result

        self.log(f"Final IRT theta: {metrics.get('irt_theta', 0):.2f}")
        self.log(f"Recommended next difficulty: {metrics.get('recommended_next_difficulty', 5)}")

        # ---------------------------------------------------------------------
        # Step 8: Evaluation Agent - Full Session Evaluation
        # ---------------------------------------------------------------------
        print("\n[8/8] Evaluation Agent: Session Evaluation")
        evaluation_agent = create_evaluation_agent()

        result, timing = await self.time_operation(
            "evaluation_full_session",
            evaluation_agent.evaluate_session(
                session_id=session_id,
                candidate_id=candidate_id,
                code_snapshots=CODE_SNAPSHOTS,
                test_results=TEST_RESULTS,
                claude_interactions=CLAUDE_INTERACTIONS,
            ),
        )
        flow_results["steps"].append({"step": "evaluation", "timing": asdict(timing)})

        if result:
            self.log(f"Overall score: {getattr(result, 'overall_score', 'N/A')}")
            self.log(f"Overall confidence: {getattr(result, 'overall_confidence', 'N/A')}")

        return flow_results

    async def run_streaming_test(self) -> dict:
        """Test streaming functionality separately."""
        print(f"\n{'='*60}")
        print("Streaming Test")
        print(f"{'='*60}")

        if not self.config.enable_streaming:
            print("  Streaming disabled, skipping...")
            return {"skipped": True}

        session_id = f"{self.run_id}_streaming"
        streaming_results = {
            "session_id": session_id,
            "events": [],
            "timings": {},
        }

        # Test coding agent streaming
        print("\n[Streaming] Coding Agent")
        coding_agent = create_coding_agent(
            session_id=session_id,
            candidate_id="streaming_test",
            helpfulness_level="pair-programming",
            problem_statement=PROBLEM_STATEMENT,
        )

        events_received = []
        text_chunks = 0
        tool_events = 0

        start = time.perf_counter()
        first_token_time = None

        async for event in coding_agent.send_message_streaming(
            "What's the time complexity of reversing a linked list?"
        ):
            event_type = event.get("type")

            if event_type == "text_delta" and first_token_time is None:
                first_token_time = time.perf_counter() - start

            if event_type == "text_delta":
                text_chunks += 1
            elif event_type in ["tool_start", "tool_end"]:
                tool_events += 1

            events_received.append(event_type)

        total_time = (time.perf_counter() - start) * 1000

        streaming_results["timings"]["coding_streaming"] = {
            "total_ms": round(total_time, 2),
            "time_to_first_token_ms": round(first_token_time * 1000, 2) if first_token_time else None,
            "text_chunks": text_chunks,
            "tool_events": tool_events,
            "total_events": len(events_received),
        }

        print(f"  ✓ Total time: {total_time:.0f}ms")
        print(f"  ✓ Time to first token: {first_token_time*1000:.0f}ms" if first_token_time else "  - No text tokens")
        print(f"  ✓ Text chunks: {text_chunks}, Tool events: {tool_events}")

        # Test evaluation agent streaming
        print("\n[Streaming] Evaluation Agent")
        evaluation_agent = create_evaluation_agent()

        dimension_timings = {}
        current_dimension = None
        dimension_start = None

        start = time.perf_counter()

        async for event in evaluation_agent.evaluate_session_streaming(
            session_id=session_id,
            candidate_id="streaming_test",
            code_snapshots=CODE_SNAPSHOTS,
            test_results=TEST_RESULTS,
            claude_interactions=CLAUDE_INTERACTIONS,
        ):
            event_type = event.get("type")

            if event_type == "dimension_start":
                current_dimension = event.get("dimension")
                dimension_start = time.perf_counter()
                self.log(f"Starting: {current_dimension}")

            elif event_type == "dimension_complete":
                dim = event.get("dimension")
                if dimension_start:
                    dimension_timings[dim] = round((time.perf_counter() - dimension_start) * 1000, 2)
                self.log(f"Completed: {dim}")

            elif event_type == "complete":
                self.log("Evaluation complete")

        total_time = (time.perf_counter() - start) * 1000

        streaming_results["timings"]["evaluation_streaming"] = {
            "total_ms": round(total_time, 2),
            "dimension_timings": dimension_timings,
        }

        print(f"  ✓ Total time: {total_time:.0f}ms")
        for dim, timing in dimension_timings.items():
            print(f"    - {dim}: {timing:.0f}ms")

        return streaming_results

    async def run_question_evaluation_test(self) -> dict:
        """Test question evaluation agent."""
        print(f"\n{'='*60}")
        print("Question Evaluation Test")
        print(f"{'='*60}")

        session_id = f"{self.run_id}_qeval"

        # Test simple mode (no tools)
        print("\n[Question Eval] Simple Mode")
        simple_agent = create_question_evaluation_agent(use_agent_mode=False)

        result, timing = await self.time_operation(
            "question_eval_simple",
            simple_agent.evaluate_question(
                session_id=session_id,
                candidate_id="qeval_test",
                question_id="q1",
                question_title="Reverse Linked List",
                question_description=PROBLEM_STATEMENT,
                question_difficulty="medium",
                code=CANDIDATE_CODE,
                language="python",
                test_output="All tests passed",
                tests_passed=3,
                tests_failed=0,
            ),
        )

        if result:
            self.log(f"Score: {getattr(result, 'overall_score', 'N/A')}/100")
            self.log(f"Passed: {getattr(result, 'passed', 'N/A')}")

        return {
            "session_id": session_id,
            "simple_mode": asdict(timing),
            "score": getattr(result, 'overall_score', 0) if result else 0,
        }

    async def run(self) -> BenchmarkResults:
        """Run the complete benchmark suite."""
        print("\n" + "="*60)
        print("LangGraph Agents Benchmark")
        print("="*60)
        print(f"Run ID: {self.run_id}")
        print(f"Iterations: {self.config.iterations}")
        print(f"Caching: {'Enabled' if self.config.enable_caching else 'Disabled'}")
        print(f"Streaming: {'Enabled' if self.config.enable_streaming else 'Disabled'}")
        print(f"Model: {settings.coding_agent_model}")

        start_time = datetime.now()
        all_results = {
            "interview_flows": [],
            "streaming_test": None,
            "question_eval_test": None,
        }

        # Run interview flow iterations
        for i in range(self.config.iterations):
            try:
                flow_result = await self.run_interview_flow(i)
                all_results["interview_flows"].append(flow_result)
            except Exception as e:
                self.errors.append(f"Interview flow {i}: {str(e)}")
                print(f"  ✗ Error in iteration {i}: {e}")

        # Run streaming test
        try:
            all_results["streaming_test"] = await self.run_streaming_test()
        except Exception as e:
            self.errors.append(f"Streaming test: {str(e)}")
            print(f"  ✗ Streaming test error: {e}")

        # Run question evaluation test
        try:
            all_results["question_eval_test"] = await self.run_question_evaluation_test()
        except Exception as e:
            self.errors.append(f"Question eval test: {str(e)}")
            print(f"  ✗ Question eval error: {e}")

        end_time = datetime.now()
        total_duration = (end_time - start_time).total_seconds() * 1000

        # Generate summary
        summary = self.generate_summary()

        # Create results object
        results = BenchmarkResults(
            run_id=self.run_id,
            config=asdict(self.config),
            start_time=start_time.isoformat(),
            end_time=end_time.isoformat(),
            total_duration_ms=round(total_duration, 2),
            timings=[asdict(t) for t in self.timings],
            cache_stats=self.cache_tracker.get_stats(),
            errors=self.errors,
            summary=summary,
        )

        # Write results to files
        self.write_results(results, all_results)

        # Print summary
        self.print_summary(results)

        return results

    def generate_summary(self) -> dict:
        """Generate summary statistics."""
        if not self.timings:
            return {}

        # Group timings by operation type
        by_operation = {}
        for timing in self.timings:
            op = timing.operation
            if op not in by_operation:
                by_operation[op] = []
            by_operation[op].append(timing.duration_ms)

        # Calculate stats for each operation
        operation_stats = {}
        for op, durations in by_operation.items():
            operation_stats[op] = {
                "count": len(durations),
                "min_ms": round(min(durations), 2),
                "max_ms": round(max(durations), 2),
                "avg_ms": round(sum(durations) / len(durations), 2),
            }

        # Overall stats
        all_durations = [t.duration_ms for t in self.timings]

        return {
            "total_operations": len(self.timings),
            "total_errors": len(self.errors),
            "operation_stats": operation_stats,
            "overall": {
                "min_ms": round(min(all_durations), 2),
                "max_ms": round(max(all_durations), 2),
                "avg_ms": round(sum(all_durations) / len(all_durations), 2),
                "total_ms": round(sum(all_durations), 2),
            },
        }

    def write_results(self, results: BenchmarkResults, detailed_results: dict):
        """Write results to output files."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Main results JSON
        results_file = self.output_dir / f"benchmark_{timestamp}.json"
        with open(results_file, "w") as f:
            json.dump(asdict(results), f, indent=2, default=str)
        print(f"\n[Output] Results: {results_file}")

        # Detailed results JSON
        detailed_file = self.output_dir / f"benchmark_{timestamp}_detailed.json"
        with open(detailed_file, "w") as f:
            json.dump(detailed_results, f, indent=2, default=str)
        print(f"[Output] Detailed: {detailed_file}")

        # Cache analysis CSV
        cache_file = self.output_dir / f"benchmark_{timestamp}_cache.csv"
        with open(cache_file, "w") as f:
            f.write("operation,duration_ms,cache_creation_tokens,cache_read_tokens,is_cached,error\n")
            for timing in self.timings:
                f.write(f"{timing.operation},{timing.duration_ms},{timing.cache_creation_tokens},"
                       f"{timing.cache_read_tokens},{timing.is_cached},{timing.error or ''}\n")
        print(f"[Output] Cache CSV: {cache_file}")

        # Summary text report
        report_file = self.output_dir / f"benchmark_{timestamp}_report.txt"
        with open(report_file, "w") as f:
            f.write(self.generate_text_report(results))
        print(f"[Output] Report: {report_file}")

    def generate_text_report(self, results: BenchmarkResults) -> str:
        """Generate a human-readable text report."""
        lines = [
            "=" * 70,
            "LANGGRAPH AGENTS BENCHMARK REPORT",
            "=" * 70,
            "",
            f"Run ID: {results.run_id}",
            f"Date: {results.start_time}",
            f"Duration: {results.total_duration_ms:.0f}ms",
            "",
            "CONFIGURATION",
            "-" * 40,
            f"  Iterations: {results.config['iterations']}",
            f"  Caching: {'Enabled' if results.config['enable_caching'] else 'Disabled'}",
            f"  Streaming: {'Enabled' if results.config['enable_streaming'] else 'Disabled'}",
            "",
            "CACHE STATISTICS",
            "-" * 40,
            f"  Cache Hits: {results.cache_stats['cache_hits']}",
            f"  Cache Misses: {results.cache_stats['cache_misses']}",
            f"  Hit Rate: {results.cache_stats['cache_hit_rate_percent']}%",
            f"  Cache Creation Tokens: {results.cache_stats['total_cache_creation_tokens']}",
            f"  Cache Read Tokens: {results.cache_stats['total_cache_read_tokens']}",
            f"  Estimated Savings: {results.cache_stats['estimated_savings_tokens']} tokens",
            "",
            "TIMING SUMMARY",
            "-" * 40,
        ]

        for op, stats in results.summary.get("operation_stats", {}).items():
            lines.append(f"  {op}:")
            lines.append(f"    Count: {stats['count']}, Avg: {stats['avg_ms']}ms, "
                        f"Min: {stats['min_ms']}ms, Max: {stats['max_ms']}ms")

        lines.extend([
            "",
            "OVERALL",
            "-" * 40,
            f"  Total Operations: {results.summary.get('total_operations', 0)}",
            f"  Total Errors: {results.summary.get('total_errors', 0)}",
            f"  Avg Latency: {results.summary.get('overall', {}).get('avg_ms', 0)}ms",
        ])

        if results.errors:
            lines.extend([
                "",
                "ERRORS",
                "-" * 40,
            ])
            for error in results.errors:
                lines.append(f"  - {error}")

        lines.extend(["", "=" * 70])

        return "\n".join(lines)

    def print_summary(self, results: BenchmarkResults):
        """Print summary to console."""
        print("\n" + "=" * 60)
        print("BENCHMARK SUMMARY")
        print("=" * 60)

        print(f"\nTotal Duration: {results.total_duration_ms:.0f}ms")
        print(f"Total Operations: {results.summary.get('total_operations', 0)}")
        print(f"Errors: {len(results.errors)}")

        print("\nCache Statistics:")
        print(f"  Hit Rate: {results.cache_stats['cache_hit_rate_percent']}%")
        print(f"  Hits: {results.cache_stats['cache_hits']}, Misses: {results.cache_stats['cache_misses']}")

        if results.cache_stats['cache_hit_rate_percent'] == 0 and self.config.enable_caching:
            print("\n  ⚠️  WARNING: Cache hit rate is 0%!")
            print("     This may indicate prompt caching is not working correctly.")
            print("     Check that the anthropic-beta header is being sent.")

        print("\nAverage Latencies by Operation:")
        for op, stats in results.summary.get("operation_stats", {}).items():
            cached_indicator = ""
            # Check if this operation had any cache hits
            for timing in self.timings:
                if timing.operation == op and timing.is_cached:
                    cached_indicator = " [CACHED]"
                    break
            print(f"  {op}: {stats['avg_ms']}ms{cached_indicator}")

        print("\n" + "=" * 60)


# =============================================================================
# Main
# =============================================================================

async def main():
    parser = argparse.ArgumentParser(description="Benchmark LangGraph agents")
    parser.add_argument("--iterations", "-n", type=int, default=3,
                       help="Number of interview flow iterations (default: 3)")
    parser.add_argument("--no-cache", action="store_true",
                       help="Disable prompt caching")
    parser.add_argument("--no-streaming", action="store_true",
                       help="Disable streaming tests")
    parser.add_argument("--verbose", "-v", action="store_true",
                       help="Enable verbose output")
    parser.add_argument("--output", "-o", type=str, default="benchmark_results",
                       help="Output directory (default: benchmark_results)")

    args = parser.parse_args()

    config = BenchmarkConfig(
        iterations=args.iterations,
        enable_caching=not args.no_cache,
        enable_streaming=not args.no_streaming,
        verbose=args.verbose,
        output_dir=args.output,
    )

    benchmark = InterviewBenchmark(config)

    try:
        results = await benchmark.run()

        # Exit with error code if there were failures
        if results.errors:
            sys.exit(1)

    except KeyboardInterrupt:
        print("\n\nBenchmark interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n\nBenchmark failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
