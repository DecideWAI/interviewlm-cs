"""
Smart Question Service

Implements intelligent reuse strategy for question generation at scale.
Balances uniqueness vs cost/latency through:
- Fresh generation when pool is building
- Reuse of proven questions (80%) vs variations (20%) when pool is mature
- Fingerprint-based uniqueness tracking

Ported from: lib/services/smart-question-service.ts
"""

import random
from typing import Literal

from langchain_core.messages import HumanMessage

from config import settings
from services.database import get_question_generation_database
from services.model_factory import create_chat_model

from .prompts import build_variation_prompt

# =============================================================================
# Constants
# =============================================================================

GLOBAL_THRESHOLD = 5000  # Total questions before enabling global reuse
PER_SEED_THRESHOLD = 100  # Questions per seed before enabling reuse
REUSE_PERCENTAGE = 0.8  # 80% reuse, 20% generate variations


# =============================================================================
# Smart Question Service
# =============================================================================

class SmartQuestionService:
    """
    Intelligent question reuse service.

    Strategy:
    - Below threshold: Always generate fresh questions (pool building)
    - Above threshold:
      - 80% chance: Reuse existing high-quality question
      - 20% chance: Generate variation of existing question

    This balances:
    - Uniqueness for candidates
    - Cost/latency optimization
    - Pool diversity through variations
    """

    def __init__(self):
        """Initialize the service."""
        self._db = None

    async def _get_db(self):
        """Lazy load database connection."""
        if self._db is None:
            self._db = await get_question_generation_database()
        return self._db

    async def get_or_generate(
        self,
        seed_id: str,
        candidate_id: str,
        generate_fresh_fn,
    ) -> tuple[dict, dict]:
        """
        Get a question using smart reuse strategy.

        Args:
            seed_id: Question seed ID
            candidate_id: Current candidate (to exclude their own questions)
            generate_fresh_fn: Async function to generate fresh question

        Returns:
            Tuple of (question_dict, strategy_dict)
        """
        db = await self._get_db()

        # Get pool statistics
        stats = await db.get_question_pool_stats(seed_id)

        if not stats or stats["total_generated"] < PER_SEED_THRESHOLD:
            # Pool building phase - always generate fresh
            question = await generate_fresh_fn()
            return question, {
                "type": "generate",
                "reason": "pool_building",
                "source_question_id": None,
            }

        # Pool is mature - use smart strategy
        if random.random() < REUSE_PERCENTAGE:
            # Try to reuse
            question = await self._select_for_reuse(seed_id, candidate_id)
            if question:
                return question, {
                    "type": "reuse",
                    "reason": "pool_mature",
                    "source_question_id": question.get("id"),
                }

        # Generate variation (20% or reuse failed)
        variation = await self._generate_variation(seed_id)
        if variation:
            return variation, {
                "type": "iterate",
                "reason": "diversity",
                "source_question_id": variation.get("parent_question_id"),
            }

        # Fallback to fresh generation
        question = await generate_fresh_fn()
        return question, {
            "type": "generate",
            "reason": "fallback",
            "source_question_id": None,
        }

    async def _select_for_reuse(
        self,
        seed_id: str,
        candidate_id: str,
    ) -> dict | None:
        """
        Select a question for reuse.

        Criteria:
        - Not previously served to this candidate
        - Has good score (>= 0.6)
        - Prefer lower reuse count (distribute load)
        """
        db = await self._get_db()

        questions = await db.get_questions_for_reuse(
            seed_id=seed_id,
            exclude_candidate_id=candidate_id,
            limit=10,
        )

        if not questions:
            return None

        # Pick randomly from top candidates (already sorted by reuse_count)
        # Use weighted selection favoring lower reuse counts
        weights = [1 / (q.get("reuse_count", 0) + 1) for q in questions]
        total = sum(weights)
        weights = [w / total for w in weights]

        selected = random.choices(questions, weights=weights, k=1)[0]

        # Increment reuse count
        await db.increment_question_reuse_count(selected["id"])

        return selected

    async def _generate_variation(
        self,
        seed_id: str,
        variation_type: Literal["similar", "different_domain", "different_approach"] = "similar",
    ) -> dict | None:
        """
        Generate a variation of an existing question.

        Args:
            seed_id: Question seed ID
            variation_type: Type of variation to create

        Returns:
            Variation question dict or None
        """
        db = await self._get_db()

        # Get a high-quality source question
        questions = await db.get_questions_for_reuse(seed_id=seed_id, limit=5)

        if not questions:
            return None

        source = random.choice(questions)

        # Build variation prompt
        prompt = build_variation_prompt(
            source_question={
                "title": source.get("title", ""),
                "description": source.get("description", ""),
                "requirements": source.get("requirements", []),
                "difficulty": source.get("difficulty", "MEDIUM"),
                "estimated_time": source.get("estimated_time", 45),
            },
            variation_type=variation_type,
        )

        # Call LLM (uses configured provider, defaults to Anthropic)
        model = create_chat_model(
            provider=settings.question_generation_provider,
            model=settings.question_generation_model_fast,
            max_tokens=32000,
            temperature=0.8,  # Higher temperature for variation
        )

        try:
            response = await model.ainvoke([HumanMessage(content=prompt)])
            content = response.content if isinstance(response.content, str) else str(response.content)

            # Parse JSON
            variation = self._parse_variation_response(content)
            variation["parent_question_id"] = source.get("id")
            variation["iteration_number"] = (source.get("iteration_number", 0) or 0) + 1

            return variation

        except Exception as e:
            print(f"[SmartQuestionService] Variation generation failed: {e}")
            return None

    def _parse_variation_response(self, content: str) -> dict:
        """Parse JSON from variation response."""
        import json

        # Extract JSON
        start = content.find("{")
        if start == -1:
            raise ValueError("No JSON found")

        depth = 0
        for i, char in enumerate(content[start:], start):
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    json_str = content[start:i+1]
                    break
        else:
            raise ValueError("Invalid JSON")

        parsed = json.loads(json_str)

        return {
            "title": parsed.get("title", ""),
            "description": parsed.get("description", ""),
            "requirements": parsed.get("requirements", []),
            "estimated_time": parsed.get("estimatedTime") or parsed.get("estimated_time", 45),
            "starter_code": parsed.get("starterCode") or parsed.get("starter_code", ""),
            "difficulty": parsed.get("difficulty", "MEDIUM"),
        }


# =============================================================================
# Factory
# =============================================================================

_service: SmartQuestionService | None = None


async def get_smart_question_service() -> SmartQuestionService:
    """Get or create the global smart question service."""
    global _service
    if _service is None:
        _service = SmartQuestionService()
    return _service
