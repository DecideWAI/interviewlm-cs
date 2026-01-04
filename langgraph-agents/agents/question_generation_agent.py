"""
Question Generation Agent - LangGraph v1 Implementation

Generates unique coding questions using:
- Complexity profiles for dynamic generation
- IRT (Item Response Theory) for adaptive difficulty
- Smart reuse strategies for scaling

All LLM calls trace to LangSmith automatically via langchain_anthropic.
"""

import json
import random
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from config import settings
from models.state import QuestionGenerationAgentState
from services.database import get_question_generation_database
from services.model_factory import create_chat_model
from services.question_generation.complexity_profiles import (
    get_complexity_profile,
    get_domain_pool,
)
from services.question_generation.irt_engine import (
    IRTDifficultyEngine,
    PerformanceRecord,
)
from services.question_generation.prompts import (
    build_dynamic_generation_prompt,
    build_incremental_generation_prompt,
)

# =============================================================================
# Model Creation with Multi-Provider Support
# =============================================================================

def _create_model(use_fast: bool = True):
    """
    Create LLM model with appropriate configuration for question generation.

    Supports multiple providers (Anthropic, OpenAI, Gemini) based on settings.
    Uses model_factory for unified model creation.

    Args:
        use_fast: Use fast tier (Haiku/GPT-4o-mini/Gemini-Flash) vs quality tier

    Returns:
        Configured chat model
    """
    model_name = (
        settings.question_generation_model_fast
        if use_fast
        else settings.question_generation_model_adaptive
    )

    return create_chat_model(
        provider=settings.question_generation_provider,
        model=model_name,
        temperature=0.7,  # Some creativity for unique questions
        max_tokens=32000,
        streaming=False,  # Question generation doesn't need streaming
    )


# =============================================================================
# System Prompts for Caching
# =============================================================================

QUESTION_GENERATION_SYSTEM_PROMPT = """You are a senior technical interviewer creating unique coding questions.

Your expertise includes:
- Data structures: arrays, linked lists, trees, graphs, hash maps, heaps, tries
- Algorithms: sorting, searching, dynamic programming, recursion, BFS/DFS, backtracking
- System design: APIs, databases, caching, distributed systems, microservices
- Best practices: clean code, testing, error handling, performance optimization

When creating questions, you must:
1. Test real-world problem-solving skills relevant to the role and seniority
2. Provide clear requirements with specific expected outcomes
3. Scope appropriately for the given time limit
4. Include meaningful test cases that cover edge cases
5. Allow for creative solutions while having a clear correct approach

Always respond with valid JSON containing: title, description, requirements, estimatedTime, starterCode, difficulty.
Do not include any text outside the JSON object."""


def _create_cached_messages(prompt: str) -> list:
    """Create messages with cache_control for Anthropic prompt caching.

    Uses a system message with cache_control to cache the static system prompt,
    then adds the dynamic user prompt without caching.
    """
    if settings.enable_prompt_caching:
        return [
            SystemMessage(content=[
                {
                    "type": "text",
                    "text": QUESTION_GENERATION_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"}
                }
            ]),
            HumanMessage(content=prompt)
        ]
    else:
        return [
            SystemMessage(content=QUESTION_GENERATION_SYSTEM_PROMPT),
            HumanMessage(content=prompt)
        ]


# =============================================================================
# Question Generation Agent Class
# =============================================================================

class QuestionGenerationAgent:
    """
    Question Generation Agent.

    Generates unique coding questions using complexity profiles and IRT.
    Does NOT use LangGraph's create_agent (no tools needed) - uses direct
    model invocation for JSON output.
    """

    def __init__(self):
        """Initialize the agent."""
        self._db = None

    async def _get_db(self):
        """Lazy load database connection."""
        if self._db is None:
            self._db = await get_question_generation_database()
        return self._db

    # =========================================================================
    # Dynamic Question Generation
    # =========================================================================

    async def generate_dynamic(
        self,
        role: str,
        seniority: str,
        assessment_type: str = "REAL_WORLD",
        tech_stack: list[str] | None = None,
        organization_id: str | None = None,
    ) -> dict:
        """
        Generate a dynamic question using complexity profiles.

        This is the primary method for generating fresh, unique questions.

        Args:
            role: e.g., 'backend', 'frontend', 'fullstack'
            seniority: e.g., 'junior', 'mid', 'senior'
            assessment_type: 'REAL_WORLD' or 'SYSTEM_DESIGN'
            tech_stack: Required technologies
            organization_id: Optional org for custom profiles

        Returns:
            Generated question dict with title, description, requirements, etc.
        """
        tech_stack = tech_stack or []
        db = await self._get_db()

        # 1. Get complexity profile
        profile = await get_complexity_profile(
            role=role,
            seniority=seniority,
            assessment_type=assessment_type,
            organization_id=organization_id,
            db=db,
        )

        if not profile:
            # Use hardcoded fallback
            from services.question_generation.complexity_profiles import DEFAULT_PROFILES
            profile = DEFAULT_PROFILES.get(
                (role, seniority.lower(), assessment_type),
                DEFAULT_PROFILES[("backend", "mid", "REAL_WORLD")]
            )

        # 2. Randomize domain and skills
        domain_pool = profile.get("domain_pool", []) or get_domain_pool(seniority)
        optional_skill_pool = profile.get("optional_skill_pool", [])
        required_skills = profile.get("required_skills", [])
        avoid_skills = profile.get("avoid_skills", [])
        constraints = profile.get("constraints", {})
        time_minutes = profile.get("time_minutes", 45)

        # Pick random domain and optional skills
        domain = random.choice(domain_pool) if domain_pool else "e-commerce"
        pick_count = profile.get("pick_optional_count", 1)
        selected_optional = random.sample(
            optional_skill_pool,
            min(pick_count, len(optional_skill_pool))
        ) if optional_skill_pool else []
        all_skills = required_skills + selected_optional

        # 3. Build complexity dict
        complexity = {
            "entity_count_min": profile.get("entity_count_min", 2),
            "entity_count_max": profile.get("entity_count_max", 4),
            "integration_points": profile.get("integration_points", 1),
            "business_logic": profile.get("business_logic", "moderate"),
            "ambiguity_level": profile.get("ambiguity_level", "some_decisions"),
        }

        # 4. Build prompt
        prompt = build_dynamic_generation_prompt(
            role=role,
            seniority=seniority,
            assessment_type=assessment_type,
            tech_stack=tech_stack,
            domain=domain,
            skills=all_skills,
            avoid_skills=avoid_skills,
            complexity=complexity,
            constraints=constraints,
            time_minutes=time_minutes,
        )

        # 5. Call LLM (Haiku for speed) with cached system prompt
        model = _create_model(use_fast=True)
        messages = _create_cached_messages(prompt)
        response = await model.ainvoke(messages)

        # 6. Parse JSON response
        content = response.content if isinstance(response.content, str) else str(response.content)
        question = self._parse_json_response(content)

        # Add metadata
        question["domain"] = domain
        question["skills"] = all_skills
        question["model"] = settings.question_generation_model_fast

        return question

    # =========================================================================
    # Incremental Question Generation (IRT-based)
    # =========================================================================

    async def generate_incremental(
        self,
        session_id: str,
        candidate_id: str,
        seed_id: str,
        seniority: str,
        previous_questions: list[dict],
        previous_performance: list[dict],
        time_remaining: int,
        assessment_type: str | None = None,
        current_code_snapshot: str | None = None,
    ) -> dict:
        """
        Generate next question using IRT-based adaptive difficulty.

        Args:
            session_id: Session ID
            candidate_id: Candidate ID
            seed_id: Problem seed ID
            seniority: Candidate seniority
            previous_questions: Completed questions data
            previous_performance: Performance metrics for each question
            time_remaining: Remaining time in seconds
            assessment_type: Optional assessment type override
            current_code_snapshot: Optional current code state

        Returns:
            Dict with question and IRT analysis data
        """
        db = await self._get_db()

        # 1. Get seed context
        seed_context = await db.get_problem_seed(seed_id) if seed_id else None
        assessment_type = assessment_type or (seed_context or {}).get("assessment_type", "REAL_WORLD")
        tech_stack = (seed_context or {}).get("required_tech", []) or []

        # 2. Calculate IRT metrics
        question_number = len(previous_questions) + 1

        # Convert performance to IRT records
        irt_records = self._convert_to_irt_records(previous_questions, previous_performance)

        # Estimate ability
        ability_estimate = IRTDifficultyEngine.estimate_ability(irt_records)

        # Calculate target difficulty
        difficulty_targeting = IRTDifficultyEngine.calculate_target_difficulty(
            ability_estimate=ability_estimate,
            question_number=question_number,
        )

        # Should we continue?
        should_continue = IRTDifficultyEngine.should_continue_assessment(
            ability_estimate=ability_estimate,
            questions_completed=len(previous_questions),
        )

        # Generate difficulty visibility for candidate
        difficulty_visibility = IRTDifficultyEngine.generate_difficulty_visibility(
            question_number=question_number,
            target_difficulty=difficulty_targeting.target_difficulty,
            ability_estimate=ability_estimate,
        )

        # 3. Analyze performance
        performance_analysis = self._analyze_performance(
            previous_questions,
            previous_performance,
            ability_estimate.theta,
        )

        # 4. Build incremental prompt
        prompt = build_incremental_generation_prompt(
            role="backend",  # Could be extracted from seed
            seniority=seniority,
            assessment_type=assessment_type,
            tech_stack=tech_stack,
            previous_questions=previous_questions,
            performance_analysis=performance_analysis,
            irt_targeting=difficulty_targeting,
            seed_context=seed_context,
            time_remaining=time_remaining,
            question_number=question_number,
        )

        # 5. Call LLM (Sonnet for better reasoning) with cached system prompt
        model = _create_model(use_fast=False)
        messages = _create_cached_messages(prompt)
        response = await model.ainvoke(messages)

        # 6. Parse response
        content = response.content if isinstance(response.content, str) else str(response.content)
        question = self._parse_json_response(content)

        # 7. Add IRT metadata
        question["difficulty_assessment"] = {
            "raw_difficulty": difficulty_targeting.target_difficulty,
            "calibrated_difficulty": difficulty_targeting.target_difficulty,
            "complexity_score": (difficulty_targeting.target_difficulty + 3) / 6,
            "reasoning": difficulty_targeting.reasoning,
        }

        return {
            "question": question,
            "irt_data": {
                "ability_estimate": ability_estimate.to_dict(),
                "difficulty_targeting": difficulty_targeting.to_dict(),
                "difficulty_visibility": difficulty_visibility.to_dict(),
                "should_continue": should_continue,
            },
            "strategy": {
                "type": "generate",
                "reason": "incremental_irt",
                "source_question_id": None,
            },
        }

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _parse_json_response(self, content: str) -> dict:
        """Parse JSON from LLM response."""
        # Try to extract JSON from response
        json_match = None

        # Try finding JSON object
        start = content.find("{")
        if start != -1:
            # Find matching closing brace
            depth = 0
            for i, char in enumerate(content[start:], start):
                if char == "{":
                    depth += 1
                elif char == "}":
                    depth -= 1
                    if depth == 0:
                        json_match = content[start:i+1]
                        break

        if not json_match:
            raise ValueError(f"No JSON found in response: {content[:200]}...")

        try:
            parsed = json.loads(json_match)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in response: {e}")

        # Validate required fields
        required = ["title", "description", "requirements"]
        for field in required:
            if field not in parsed:
                raise ValueError(f"Missing required field: {field}")

        # Normalize field names (camelCase to snake_case)
        return {
            "title": parsed.get("title", ""),
            "description": parsed.get("description", ""),
            "requirements": parsed.get("requirements", []),
            "estimated_time": parsed.get("estimatedTime") or parsed.get("estimated_time", 45),
            "starter_code": parsed.get("starterCode") or parsed.get("starter_code", ""),
            "difficulty": parsed.get("difficulty"),
        }

    def _convert_to_irt_records(
        self,
        questions: list[dict],
        performance: list[dict],
    ) -> list[PerformanceRecord]:
        """Convert question/performance data to IRT records."""
        # Create lookup for performance by question_id
        perf_lookup = {p.get("question_id") or p.get("questionId"): p for p in performance}

        records = []
        for q in questions:
            q_id = q.get("id", "")
            perf = perf_lookup.get(q_id, {})

            score = perf.get("score") or q.get("score")
            if score is None:
                continue

            # Calculate time spent
            time_spent = perf.get("time_spent") or perf.get("timeSpent")
            if time_spent is None:
                started = q.get("started_at") or q.get("startedAt")
                completed = q.get("completed_at") or q.get("completedAt")
                if started and completed:
                    from datetime import datetime
                    if isinstance(started, str):
                        started = datetime.fromisoformat(started.replace("Z", "+00:00"))
                        completed = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                    time_spent = (completed - started).total_seconds() / 60
                else:
                    time_spent = q.get("estimated_time") or q.get("estimatedTime", 30)

            records.append(PerformanceRecord(
                question_id=q_id,
                score=float(score),
                difficulty=IRTDifficultyEngine.categorical_difficulty_to_theta(
                    q.get("difficulty", "MEDIUM")
                ),
                discrimination=IRTDifficultyEngine.DEFAULT_DISCRIMINATION,
                time_spent=time_spent,
                expected_time=q.get("estimated_time") or q.get("estimatedTime", 30),
            ))

        return records

    def _analyze_performance(
        self,
        questions: list[dict],
        performance: list[dict],
        ability_theta: float,
    ) -> dict:
        """Analyze candidate performance for prompt context."""
        if not questions or not performance:
            return {
                "avg_score": 0,
                "trend": "stable",
                "code_quality": "unknown",
                "time_management": "unknown",
                "ability_estimate": ability_theta,
            }

        scores = [p.get("score", 0) for p in performance if p.get("score") is not None]
        avg_score = sum(scores) / len(scores) if scores else 0

        # Determine trend
        if len(scores) >= 2:
            recent = scores[-2:]
            earlier = scores[:-2] if len(scores) > 2 else scores[:1]
            recent_avg = sum(recent) / len(recent)
            earlier_avg = sum(earlier) / len(earlier) if earlier else recent_avg

            if recent_avg > earlier_avg + 0.1:
                trend = "improving"
            elif recent_avg < earlier_avg - 0.1:
                trend = "declining"
            else:
                trend = "stable"
        else:
            trend = "stable"

        # Code quality assessment
        if avg_score >= 0.8:
            code_quality = "excellent"
        elif avg_score >= 0.6:
            code_quality = "good"
        elif avg_score >= 0.4:
            code_quality = "adequate"
        else:
            code_quality = "needs_improvement"

        # Time management
        time_ratios = []
        for q, p in zip(questions, performance):
            expected = q.get("estimated_time") or q.get("estimatedTime", 30)
            actual = p.get("time_spent") or p.get("timeSpent", expected)
            if expected > 0:
                time_ratios.append(actual / expected)

        avg_time_ratio = sum(time_ratios) / len(time_ratios) if time_ratios else 1.0

        if avg_time_ratio <= 0.8:
            time_management = "efficient"
        elif avg_time_ratio <= 1.2:
            time_management = "on_track"
        else:
            time_management = "slow"

        return {
            "avg_score": avg_score,
            "trend": trend,
            "code_quality": code_quality,
            "time_management": time_management,
            "ability_estimate": ability_theta,
        }


# =============================================================================
# Factory Functions
# =============================================================================

def create_question_generation_agent() -> QuestionGenerationAgent:
    """Create a Question Generation Agent instance."""
    return QuestionGenerationAgent()


# Global agent instance (lazy loaded)
_agent: QuestionGenerationAgent | None = None


async def get_question_generation_agent() -> QuestionGenerationAgent:
    """Get or create the global question generation agent."""
    global _agent
    if _agent is None:
        _agent = create_question_generation_agent()
    return _agent


# =============================================================================
# LangGraph StateGraph Wrapper
# =============================================================================

from langgraph.graph import END, START, StateGraph


async def generate_node(state: QuestionGenerationAgentState) -> dict:
    """
    Node that generates a question based on state parameters.

    Routes to either dynamic or incremental generation based on state.
    """
    agent = await get_question_generation_agent()

    # Determine generation mode
    is_incremental = bool(state.get("seed_id") and state.get("previous_questions"))

    try:
        if is_incremental:
            # Incremental generation (IRT-based)
            result = await agent.generate_incremental(
                session_id=state.get("session_id", ""),
                candidate_id=state.get("candidate_id", ""),
                seed_id=state.get("seed_id", ""),
                seniority=state.get("seniority", "mid"),
                previous_questions=state.get("previous_questions", []),
                previous_performance=state.get("previous_performance", []),
                time_remaining=state.get("time_remaining", 3600),
                assessment_type=state.get("assessment_type"),
                current_code_snapshot=state.get("current_code_snapshot"),
            )

            return {
                "generated_question": result.get("question"),
                "irt_ability_estimate": result.get("irt_data", {}).get("ability_estimate"),
                "irt_difficulty_targeting": result.get("irt_data", {}).get("difficulty_targeting"),
                "generation_strategy": result.get("strategy"),
                "generation_complete": True,
            }
        else:
            # Dynamic generation
            result = await agent.generate_dynamic(
                role=state.get("role", "backend"),
                seniority=state.get("seniority", "mid"),
                assessment_type=state.get("assessment_type", "REAL_WORLD"),
                tech_stack=state.get("tech_stack", []),
                organization_id=state.get("organization_id"),
            )

            return {
                "generated_question": result,
                "generation_strategy": {
                    "type": "generate",
                    "reason": "dynamic",
                    "source_question_id": None,
                },
                "generation_complete": True,
            }
    except Exception as e:
        return {
            "error": str(e),
            "generation_complete": True,
        }


def create_question_generation_graph() -> StateGraph:
    """
    Create a LangGraph StateGraph for question generation.

    This graph exposes the question generation agent via the LangGraph SDK.
    """
    # Create graph with state schema
    graph = StateGraph(QuestionGenerationAgentState)

    # Add single generation node
    graph.add_node("generate", generate_node)

    # Simple flow: START -> generate -> END
    graph.add_edge(START, "generate")
    graph.add_edge("generate", END)

    return graph.compile()


# =============================================================================
# Graph Export for LangGraph Cloud
# =============================================================================
# LangGraph Cloud automatically handles checkpointing - do NOT specify checkpointer
# The platform injects its own PostgreSQL-backed checkpointer

question_generation_graph = create_question_generation_graph()
