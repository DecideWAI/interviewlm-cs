"""Tests for the Interview Agent."""

import pytest

from agents.interview_agent import (
    calculate_recommended_difficulty,
    create_default_metrics,
    create_interview_agent,
    update_irt_theta,
)


class TestInterviewAgent:
    """Test cases for Interview Agent."""

    def test_create_default_metrics(self):
        """Test default metrics creation."""
        metrics = create_default_metrics("test-session", difficulty=5)

        assert metrics["session_id"] == "test-session"
        assert metrics["irt_theta"] == 0.0
        assert metrics["current_difficulty"] == 5
        assert metrics["questions_answered"] == 0
        assert len(metrics["struggling_indicators"]) == 0

    def test_update_irt_theta_correct_answer(self):
        """Test IRT theta increases for correct answers on hard questions."""
        new_theta, new_se = update_irt_theta(
            current_theta=0.0,
            question_difficulty=7,  # Hard question
            is_correct=True,
            questions_answered=1,
        )

        # Theta should increase for correct answer on hard question
        assert new_theta > 0.0
        assert -3 <= new_theta <= 3

    def test_update_irt_theta_incorrect_answer(self):
        """Test IRT theta decreases for incorrect answers on easy questions."""
        new_theta, new_se = update_irt_theta(
            current_theta=0.0,
            question_difficulty=3,  # Easy question
            is_correct=False,
            questions_answered=1,
        )

        # Theta should decrease for incorrect answer on easy question
        assert new_theta < 0.0
        assert -3 <= new_theta <= 3

    def test_calculate_recommended_difficulty(self):
        """Test difficulty recommendation based on theta."""
        # Average ability -> medium difficulty
        difficulty = calculate_recommended_difficulty(0.0)
        assert 4 <= difficulty <= 7

        # High ability -> higher difficulty
        difficulty = calculate_recommended_difficulty(2.0)
        assert difficulty >= 7

        # Low ability -> lower difficulty
        difficulty = calculate_recommended_difficulty(-2.0)
        assert difficulty <= 4

    @pytest.mark.asyncio
    async def test_process_session_started_event(self):
        """Test processing session started event."""
        agent = create_interview_agent()

        metrics = await agent.process_event(
            session_id="test-session",
            candidate_id="test-candidate",
            event_type="session-started",
            event_data={"difficulty": 6},
        )

        assert metrics["session_id"] == "test-session"
        assert metrics["current_difficulty"] == 6
        assert metrics["irt_theta"] == 0.0

    @pytest.mark.asyncio
    async def test_process_ai_interaction_event(self):
        """Test processing AI interaction event."""
        agent = create_interview_agent()

        # Start session first
        metrics = await agent.process_event(
            session_id="test-session",
            candidate_id="test-candidate",
            event_type="session-started",
            event_data={"difficulty": 5},
        )

        # Process AI interaction
        metrics = await agent.process_event(
            session_id="test-session",
            candidate_id="test-candidate",
            event_type="ai-interaction",
            event_data={
                "candidate_message": "I'm stuck on this problem, can you help?",
                "tools_used": ["read_file", "write_file"],
            },
            existing_metrics=metrics,
        )

        assert metrics["ai_interactions_count"] == 1
        assert "asking_for_help" in metrics["struggling_indicators"]

    @pytest.mark.asyncio
    async def test_process_test_run_event(self):
        """Test processing test run event."""
        agent = create_interview_agent()

        metrics = await agent.process_event(
            session_id="test-session",
            candidate_id="test-candidate",
            event_type="session-started",
            event_data={"difficulty": 5},
        )

        # Process test run with failures
        metrics = await agent.process_event(
            session_id="test-session",
            candidate_id="test-candidate",
            event_type="test-run",
            event_data={"passed": 1, "failed": 4, "total": 5},
            existing_metrics=metrics,
        )

        assert metrics["test_failure_rate"] > 0
        assert "high_test_failure_rate" in metrics["struggling_indicators"]

    @pytest.mark.asyncio
    async def test_process_question_answered_event(self):
        """Test processing question answered event."""
        agent = create_interview_agent()

        metrics = await agent.process_event(
            session_id="test-session",
            candidate_id="test-candidate",
            event_type="session-started",
            event_data={"difficulty": 5},
        )

        # Answer a question correctly
        metrics = await agent.process_event(
            session_id="test-session",
            candidate_id="test-candidate",
            event_type="question-answered",
            event_data={
                "is_correct": True,
                "time_spent": 600,
                "difficulty": 5,
            },
            existing_metrics=metrics,
        )

        assert metrics["questions_answered"] == 1
        assert metrics["questions_correct"] == 1
        assert metrics["questions_incorrect"] == 0
