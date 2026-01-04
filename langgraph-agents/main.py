"""
LangGraph Agents - Main Entry Point

This module provides the main entry point for running the LangGraph agents.
Can be used for local development, testing, or as a standalone service.
"""

import asyncio
from typing import Optional

from agents import (
    create_coding_agent,
    create_evaluation_agent,
    create_interview_agent,
    create_supervisor,
)
from config import settings


async def demo_coding_agent():
    """Demo the Coding Agent."""
    print("=" * 60)
    print("Coding Agent Demo")
    print("=" * 60)

    agent = create_coding_agent(
        session_id="demo-session-001",
        candidate_id="demo-candidate-001",
        helpfulness_level="pair-programming",
        problem_statement="Implement a function to reverse a linked list.",
    )

    response = await agent.send_message(
        "Can you help me understand how to approach reversing a linked list?"
    )

    print(f"\nResponse: {response['text'][:500]}...")
    print(f"Tools used: {response['tools_used']}")
    print(f"Iterations: {response['metadata']['iteration_count']}")


async def demo_interview_agent():
    """Demo the Interview Agent."""
    print("\n" + "=" * 60)
    print("Interview Agent Demo")
    print("=" * 60)

    agent = create_interview_agent()

    # Process session start
    metrics = await agent.process_event(
        session_id="demo-session-001",
        candidate_id="demo-candidate-001",
        event_type="session-started",
        event_data={"difficulty": 5},
    )
    print(f"\nSession started. Initial theta: {metrics['irt_theta']}")

    # Process an AI interaction
    metrics = await agent.process_event(
        session_id="demo-session-001",
        candidate_id="demo-candidate-001",
        event_type="ai-interaction",
        event_data={
            "candidate_message": "How do I reverse a linked list? I'm stuck on the pointer manipulation.",
            "tools_used": ["read_file"],
        },
        existing_metrics=metrics,
    )
    print(f"After AI interaction. AI dependency: {metrics['ai_dependency_score']:.1f}")
    print(f"Struggling indicators: {metrics['struggling_indicators']}")

    # Process a question answered
    metrics = await agent.process_event(
        session_id="demo-session-001",
        candidate_id="demo-candidate-001",
        event_type="question-answered",
        event_data={
            "is_correct": True,
            "time_spent": 900,  # 15 minutes
            "difficulty": 5,
        },
        existing_metrics=metrics,
    )
    print(f"After question answered. New theta: {metrics['irt_theta']:.2f}")
    print(f"Recommended next difficulty: {metrics['recommended_next_difficulty']}")


async def demo_evaluation_agent():
    """Demo the Evaluation Agent."""
    print("\n" + "=" * 60)
    print("Evaluation Agent Demo")
    print("=" * 60)

    agent = create_evaluation_agent()

    # Mock session data
    code_snapshots = [
        {
            "timestamp": "2025-01-01T10:00:00Z",
            "files": {
                "/workspace/solution.py": """
def reverse_linked_list(head):
    # Reverse the linked list iteratively
    prev = None
    current = head
    while current:
        next_node = current.next
        current.next = prev
        prev = current
        current = next_node
    return prev
""",
            },
        },
    ]

    test_results = [
        {"timestamp": "2025-01-01T10:15:00Z", "passed": 3, "failed": 2, "total": 5},
        {"timestamp": "2025-01-01T10:25:00Z", "passed": 5, "failed": 0, "total": 5},
    ]

    claude_interactions = [
        {
            "candidate_message": "How do I reverse a linked list? I need to understand the approach first.",
            "timestamp": "2025-01-01T10:05:00Z",
        },
        {
            "candidate_message": "Can you explain why we need three pointers: prev, current, and next?",
            "timestamp": "2025-01-01T10:10:00Z",
        },
    ]

    result = await agent.evaluate_session(
        session_id="demo-session-001",
        candidate_id="demo-candidate-001",
        code_snapshots=code_snapshots,
        test_results=test_results,
        claude_interactions=claude_interactions,
    )

    print("\nEvaluation Results:")
    print(f"  Overall Score: {result['overall_score']}/100")
    print(f"  Code Quality: {result['code_quality']['score']}/100")
    print(f"  Problem Solving: {result['problem_solving']['score']}/100")
    print(f"  AI Collaboration: {result['ai_collaboration']['score']}/100")
    print(f"  Communication: {result['communication']['score']}/100")
    print(f"  Confidence: {result['overall_confidence']:.2f}")


async def demo_supervisor():
    """Demo the Supervisor Agent."""
    print("\n" + "=" * 60)
    print("Supervisor Agent Demo")
    print("=" * 60)

    supervisor = create_supervisor()

    result = await supervisor.run_workflow(
        task="Help the candidate with their coding task and track the interaction",
        session_id="demo-session-001",
        candidate_id="demo-candidate-001",
    )

    print("\nWorkflow Results:")
    print(f"  Coding result: {result.get('coding_result')}")
    print(f"  Interview result: {result.get('interview_result')}")
    print(f"  Evaluation result: {result.get('evaluation_result')}")


async def main():
    """Run all demos."""
    print("\n" + "=" * 60)
    print("LangGraph Agents Demo")
    print(f"Using model: {settings.coding_agent_model}")
    print("=" * 60)

    try:
        await demo_interview_agent()
        await demo_evaluation_agent()
        # Uncomment these to test with real API calls:
        # await demo_coding_agent()
        # await demo_supervisor()
    except Exception as e:
        print(f"\nError: {e}")
        print("Note: Some demos require ANTHROPIC_API_KEY to be set.")


if __name__ == "__main__":
    asyncio.run(main())
