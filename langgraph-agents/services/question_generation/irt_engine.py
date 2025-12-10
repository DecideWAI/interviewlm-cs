"""
IRT (Item Response Theory) Difficulty Engine

Implements a 2-Parameter Logistic (2-PL) model for adaptive difficulty targeting.
This ensures consistent, fair scoring across dynamically generated questions by:

1. Estimating candidate ability (theta) from performance history
2. Calculating optimal next question difficulty (theta + 0.3 for max information)
3. Calibrating scores to account for question difficulty variation

IRT Model: P(correct | theta, a, b) = 1 / (1 + exp(-a * (theta - b)))
Where:
  theta = candidate ability (typically -3 to +3)
  a = discrimination parameter (how well question differentiates ability levels)
  b = difficulty parameter (ability level needed for 50% success)

Ported from: lib/services/irt-difficulty-engine.ts
"""

import math
from dataclasses import dataclass
from typing import Literal


@dataclass
class PerformanceRecord:
    """Performance record for IRT calculations."""
    question_id: str
    score: float  # 0-1 normalized score
    difficulty: float  # Question difficulty (b parameter)
    discrimination: float  # Question discrimination (a parameter)
    time_spent: float  # Minutes
    expected_time: float  # Expected minutes


@dataclass
class CandidateAbilityEstimate:
    """Estimated candidate ability from IRT."""
    theta: float  # Estimated ability (-3 to +3)
    standard_error: float  # Uncertainty in estimate
    confidence_interval: tuple[float, float]  # 95% CI (lower, upper)
    reliability: float  # 0-1, how reliable is this estimate
    questions_used: int  # Number of questions used in estimate

    def to_dict(self) -> dict:
        return {
            "theta": self.theta,
            "standard_error": self.standard_error,
            "confidence_interval_lower": self.confidence_interval[0],
            "confidence_interval_upper": self.confidence_interval[1],
            "reliability": self.reliability,
            "questions_used": self.questions_used,
        }


@dataclass
class DifficultyTargeting:
    """Optimal difficulty for next question."""
    target_difficulty: float  # Optimal difficulty for next question
    target_range: tuple[float, float]  # Acceptable range (min, max)
    reasoning: str  # Human-readable explanation
    information_gain: float  # Expected information gain at this difficulty

    def to_dict(self) -> dict:
        return {
            "target_difficulty": self.target_difficulty,
            "target_range_min": self.target_range[0],
            "target_range_max": self.target_range[1],
            "reasoning": self.reasoning,
            "information_gain": self.information_gain,
        }


@dataclass
class DifficultyVisibility:
    """Difficulty info visible to candidate."""
    level: str  # e.g., 'Intermediate'
    description: str  # Friendly description
    progress_indicator: str  # Visual indicator e.g., '███░░'
    encouragement: str  # Motivational message

    def to_dict(self) -> dict:
        return {
            "level": self.level,
            "description": self.description,
            "progress_indicator": self.progress_indicator,
            "encouragement": self.encouragement,
        }


class IRTDifficultyEngine:
    """
    IRT Difficulty Engine.

    Core engine for adaptive difficulty calculations using 2-PL IRT model.
    """

    # Constants for IRT calculations
    THETA_MIN = -3.0
    THETA_MAX = 3.0
    DEFAULT_DISCRIMINATION = 1.0
    DEFAULT_DIFFICULTY = 0.0
    OPTIMAL_OFFSET = 0.3  # Target difficulty above current ability

    # Mapping from categorical difficulty to IRT b-parameter
    DIFFICULTY_TO_THETA: dict[str, float] = {
        "EASY": -1.0,
        "MEDIUM": 0.0,
        "HARD": 1.5,
    }

    @classmethod
    def probability(cls, theta: float, a: float, b: float) -> float:
        """
        Calculate probability of success given theta and question parameters.

        P(correct | theta, a, b) = 1 / (1 + exp(-a * (theta - b)))

        Args:
            theta: Candidate ability
            a: Discrimination parameter
            b: Difficulty parameter

        Returns:
            Probability of success (0-1)
        """
        return 1 / (1 + math.exp(-a * (theta - b)))

    @classmethod
    def estimate_ability(
        cls,
        performance_history: list[PerformanceRecord]
    ) -> CandidateAbilityEstimate:
        """
        Estimate candidate ability from performance history.

        Uses Maximum Likelihood Estimation (MLE) with Newton-Raphson iteration.

        Args:
            performance_history: List of performance records

        Returns:
            CandidateAbilityEstimate with theta, standard error, confidence interval
        """
        if not performance_history:
            # No history - return prior (neutral ability)
            return CandidateAbilityEstimate(
                theta=0.0,
                standard_error=1.5,
                confidence_interval=(-1.5, 1.5),
                reliability=0.0,
                questions_used=0,
            )

        # Use MLE to estimate theta
        theta = cls._maximum_likelihood_estimate(performance_history)

        # Calculate standard error
        se = cls._calculate_standard_error(performance_history, theta)

        # Calculate reliability (based on number of questions and consistency)
        reliability = cls._calculate_reliability(performance_history, theta)

        # Clamp theta to valid range
        theta = max(cls.THETA_MIN, min(cls.THETA_MAX, theta))

        return CandidateAbilityEstimate(
            theta=theta,
            standard_error=se,
            confidence_interval=(theta - 1.96 * se, theta + 1.96 * se),
            reliability=reliability,
            questions_used=len(performance_history),
        )

    @classmethod
    def _maximum_likelihood_estimate(
        cls,
        performance_history: list[PerformanceRecord]
    ) -> float:
        """
        Maximum Likelihood Estimation for theta using Newton-Raphson iteration.

        Args:
            performance_history: List of performance records

        Returns:
            Estimated theta value
        """
        theta = 0.0  # Start at neutral ability
        max_iterations = 20
        convergence_threshold = 0.001

        for _ in range(max_iterations):
            first_derivative = 0.0
            second_derivative = 0.0

            for record in performance_history:
                a = record.discrimination or cls.DEFAULT_DISCRIMINATION
                b = record.difficulty
                score = record.score

                # P(theta) = 1 / (1 + exp(-a * (theta - b)))
                p = cls.probability(theta, a, b)
                q = 1 - p

                # First derivative of log-likelihood
                first_derivative += a * (score - p)

                # Second derivative of log-likelihood
                second_derivative -= a * a * p * q

            # Newton-Raphson update
            if abs(second_derivative) < 0.0001:
                break

            delta = -first_derivative / second_derivative
            theta += delta

            # Clamp to valid range
            theta = max(cls.THETA_MIN, min(cls.THETA_MAX, theta))

            if abs(delta) < convergence_threshold:
                break

        return theta

    @classmethod
    def _calculate_standard_error(
        cls,
        performance_history: list[PerformanceRecord],
        theta: float
    ) -> float:
        """
        Calculate standard error of theta estimate.

        SE = 1 / sqrt(Fisher information)

        Args:
            performance_history: List of performance records
            theta: Estimated ability

        Returns:
            Standard error
        """
        information = 0.0

        for record in performance_history:
            a = record.discrimination or cls.DEFAULT_DISCRIMINATION
            b = record.difficulty
            p = cls.probability(theta, a, b)
            q = 1 - p

            # Fisher information for 2-PL model
            information += a * a * p * q

        # SE = 1 / sqrt(information)
        return 1 / math.sqrt(information) if information > 0 else 1.5

    @classmethod
    def _calculate_reliability(
        cls,
        performance_history: list[PerformanceRecord],
        theta: float
    ) -> float:
        """
        Calculate reliability of ability estimate.

        Based on consistency of performance relative to predictions.

        Args:
            performance_history: List of performance records
            theta: Estimated ability

        Returns:
            Reliability (0-1)
        """
        if len(performance_history) < 2:
            return 0.3

        # Calculate consistency of performance relative to predicted
        sum_squared_residuals = 0.0

        for record in performance_history:
            a = record.discrimination or cls.DEFAULT_DISCRIMINATION
            b = record.difficulty
            predicted = cls.probability(theta, a, b)
            actual = record.score

            sum_squared_residuals += (actual - predicted) ** 2

        # Higher reliability when predictions match actual performance
        consistency = 1 - (sum_squared_residuals / len(performance_history))

        # Adjust for number of questions
        n_factor = min(1.0, len(performance_history) / 5)

        return max(0.0, min(1.0, consistency * 0.7 + n_factor * 0.3))

    @classmethod
    def calculate_target_difficulty(
        cls,
        ability_estimate: CandidateAbilityEstimate,
        question_number: int,
        max_questions: int = 5
    ) -> DifficultyTargeting:
        """
        Calculate optimal difficulty for next question.

        Targets difficulty where candidate has ~70% success probability.

        Args:
            ability_estimate: Current ability estimate
            question_number: Which question we're generating (1-indexed)
            max_questions: Maximum questions in assessment

        Returns:
            DifficultyTargeting with target difficulty and reasoning
        """
        theta = ability_estimate.theta

        # Optimal targeting: question at theta + offset gives max information
        # But adjust based on where we are in the assessment
        if question_number <= 2:
            # Early questions (Q1-Q2): Be more conservative, target near theta
            target_offset = 0.1 + (question_number - 1) * 0.1
        elif question_number == 3:
            # Middle questions (Q3): Standard offset
            target_offset = cls.OPTIMAL_OFFSET
        else:
            # Later questions (Q4-Q5): Push higher if performing well
            target_offset = 0.5 if theta > 0 else 0.3

        target_difficulty = theta + target_offset

        # Calculate target range (±0.5 from target)
        target_range = (
            max(cls.THETA_MIN, target_difficulty - 0.5),
            min(cls.THETA_MAX, target_difficulty + 0.5),
        )

        # Calculate expected information gain at target difficulty
        information_gain = cls._calculate_information_gain(
            theta,
            target_difficulty,
            cls.DEFAULT_DISCRIMINATION
        )

        # Generate reasoning
        ability_level = cls._ability_to_label(theta)
        target_level = cls._ability_to_label(target_difficulty)
        success_prob = cls.probability(theta, 1.0, target_difficulty)

        reasoning = (
            f"Candidate demonstrates {ability_level} ability (θ={theta:.2f}). "
            f"Targeting {target_level} difficulty (θ={target_difficulty:.2f}) for Q{question_number} "
            f"to maximize measurement precision. Expected ~{int(success_prob * 100)}% success rate."
        )

        return DifficultyTargeting(
            target_difficulty=max(cls.THETA_MIN, min(cls.THETA_MAX, target_difficulty)),
            target_range=target_range,
            reasoning=reasoning,
            information_gain=information_gain,
        )

    @classmethod
    def _calculate_information_gain(
        cls,
        theta: float,
        difficulty: float,
        discrimination: float
    ) -> float:
        """Calculate Fisher Information at a specific difficulty level."""
        p = cls.probability(theta, discrimination, difficulty)
        return discrimination * discrimination * p * (1 - p)

    @classmethod
    def theta_to_categorical_difficulty(cls, theta: float) -> Literal["EASY", "MEDIUM", "HARD"]:
        """Convert IRT theta to categorical difficulty."""
        if theta < -0.5:
            return "EASY"
        if theta < 0.75:
            return "MEDIUM"
        return "HARD"

    @classmethod
    def categorical_difficulty_to_theta(cls, difficulty: str) -> float:
        """Convert categorical difficulty to IRT theta."""
        return cls.DIFFICULTY_TO_THETA.get(difficulty.upper(), cls.DEFAULT_DIFFICULTY)

    @classmethod
    def _ability_to_label(cls, theta: float) -> str:
        """Convert theta to human-readable ability label."""
        if theta < -1.5:
            return "foundational"
        if theta < -0.5:
            return "beginner"
        if theta < 0.5:
            return "intermediate"
        if theta < 1.5:
            return "advanced"
        return "expert"

    @classmethod
    def calculate_calibrated_score(
        cls,
        raw_score: float,
        question_difficulty: float,
        candidate_theta: float,
        discrimination: float = 1.0
    ) -> float:
        """
        Calculate difficulty-calibrated score.

        Adjusts raw score based on question difficulty relative to candidate ability.

        Args:
            raw_score: Raw score (0-1)
            question_difficulty: Question difficulty (b parameter)
            candidate_theta: Candidate ability estimate
            discrimination: Question discrimination

        Returns:
            Calibrated score (0-1)
        """
        # Expected probability of success
        expected_p = cls.probability(candidate_theta, discrimination, question_difficulty)

        # If question was harder than expected (lower expectedP), boost score
        # If question was easier than expected (higher expectedP), penalize slightly
        difficulty_factor = 1 + (0.5 - expected_p) * 0.4

        calibrated_score = raw_score * difficulty_factor

        # Clamp to 0-1
        return max(0.0, min(1.0, calibrated_score))

    @classmethod
    def should_continue_assessment(
        cls,
        ability_estimate: CandidateAbilityEstimate,
        questions_completed: int,
        min_questions: int = 2,
        max_questions: int = 5,
        target_se: float = 0.4  # Stop when SE < 0.4
    ) -> dict:
        """
        Determine if assessment should continue based on IRT information.

        Args:
            ability_estimate: Current ability estimate
            questions_completed: Number of questions completed
            min_questions: Minimum questions required
            max_questions: Maximum questions allowed
            target_se: Target standard error for stopping

        Returns:
            Dict with 'continue' (bool) and 'reason' (str)
        """
        # Must complete minimum questions
        if questions_completed < min_questions:
            return {
                "continue": True,
                "reason": f"Minimum {min_questions} questions required (completed: {questions_completed})",
            }

        # Check if we've hit maximum
        if questions_completed >= max_questions:
            return {
                "continue": False,
                "reason": f"Maximum {max_questions} questions reached",
            }

        # Check if we have sufficient precision
        if (ability_estimate.standard_error <= target_se and
            ability_estimate.reliability >= 0.7):
            return {
                "continue": False,
                "reason": (
                    f"Sufficient measurement precision achieved "
                    f"(SE={ability_estimate.standard_error:.2f}, "
                    f"reliability={ability_estimate.reliability:.2f})"
                ),
            }

        # Continue for more precision
        return {
            "continue": True,
            "reason": (
                f"Need more questions for precision "
                f"(SE={ability_estimate.standard_error:.2f}, target={target_se})"
            ),
        }

    @classmethod
    def convert_performance_to_irt(
        cls,
        questions: list[dict]
    ) -> list[PerformanceRecord]:
        """
        Convert question data to IRT performance records.

        Args:
            questions: List of question dicts with id, difficulty, score, timing info

        Returns:
            List of PerformanceRecord objects
        """
        records = []
        for q in questions:
            if q.get("score") is None:
                continue

            # Calculate time spent
            started_at = q.get("started_at") or q.get("startedAt")
            completed_at = q.get("completed_at") or q.get("completedAt")
            estimated_time = q.get("estimated_time") or q.get("estimatedTime") or 30

            if started_at and completed_at:
                # Handle both string timestamps and datetime objects
                if isinstance(started_at, str):
                    from datetime import datetime
                    started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                    completed_at = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))
                time_spent = (completed_at - started_at).total_seconds() / 60
            else:
                time_spent = estimated_time

            records.append(PerformanceRecord(
                question_id=q.get("id", ""),
                score=q["score"],
                difficulty=cls.categorical_difficulty_to_theta(q.get("difficulty", "MEDIUM")),
                discrimination=cls.DEFAULT_DISCRIMINATION,
                time_spent=time_spent,
                expected_time=estimated_time,
            ))

        return records

    @classmethod
    def generate_difficulty_visibility(
        cls,
        question_number: int,
        target_difficulty: float,
        ability_estimate: CandidateAbilityEstimate
    ) -> DifficultyVisibility:
        """
        Generate difficulty visibility info for candidates.

        Args:
            question_number: Which question (1-indexed)
            target_difficulty: Target difficulty for this question
            ability_estimate: Current ability estimate

        Returns:
            DifficultyVisibility with level, description, progress, encouragement
        """
        level = cls._ability_to_label(target_difficulty).capitalize()

        # Calculate expected success probability
        success_prob = cls.probability(
            ability_estimate.theta,
            cls.DEFAULT_DISCRIMINATION,
            target_difficulty
        )

        # Generate progress bar (5 segments)
        filled_segments = round((target_difficulty + 3) / 6 * 5)
        filled_segments = max(0, min(5, filled_segments))
        progress_indicator = "█" * filled_segments + "░" * (5 - filled_segments)

        # Generate encouraging description
        if success_prob > 0.7:
            description = f"Question {question_number} is well-suited to your demonstrated skills."
            encouragement = "You've shown strong fundamentals. This builds on what you know."
        elif success_prob > 0.5:
            description = f"Question {question_number} presents a moderate challenge."
            encouragement = "This is designed to help you demonstrate your depth of knowledge."
        else:
            description = f"Question {question_number} is a challenging extension."
            encouragement = "This tests advanced concepts. Show your problem-solving approach!"

        return DifficultyVisibility(
            level=level,
            description=description,
            progress_indicator=progress_indicator,
            encouragement=encouragement,
        )


# Convenience alias
irt_engine = IRTDifficultyEngine
