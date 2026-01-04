"""
Database service for LangGraph agents.

Uses asyncpg for async PostgreSQL access to the existing Prisma schema.
This allows Python agents to read/write to the same database as the Next.js app.
"""

import json
from datetime import datetime
from typing import Any

import asyncpg

from config import settings
from models.state import EvaluationResult, InterviewMetrics


class DatabaseService:
    """
    Async database service for LangGraph agents.

    Provides CRUD operations for:
    - Session recordings
    - Claude interactions
    - Code snapshots
    - Test results
    - Evaluations
    - Interview metrics (stored in session_data)
    """

    def __init__(self, database_url: str | None = None):
        """Initialize database service."""
        self.database_url = database_url or settings.database_url
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        """Create connection pool."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self.database_url,
                min_size=2,
                max_size=10,
                command_timeout=30,
            )
            print("[Database] Connected to PostgreSQL")

    async def disconnect(self) -> None:
        """Close connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None
            print("[Database] Disconnected from PostgreSQL")

    async def _get_pool(self) -> asyncpg.Pool:
        """Get or create connection pool."""
        if self._pool is None:
            await self.connect()
        return self._pool  # type: ignore

    # =========================================================================
    # Session Recording Operations
    # =========================================================================

    async def get_session_recording(self, session_id: str) -> dict | None:
        """Get session recording by ID."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM session_recordings WHERE id = $1
                """,
                session_id,
            )
            return dict(row) if row else None

    async def get_session_by_candidate(self, candidate_id: str) -> dict | None:
        """Get session recording by candidate ID."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM session_recordings WHERE candidate_id = $1
                """,
                candidate_id,
            )
            return dict(row) if row else None

    # =========================================================================
    # Code Snapshot Operations
    # =========================================================================

    async def get_code_snapshots(self, session_id: str) -> list[dict]:
        """Get all code snapshots for a session."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM code_snapshots
                WHERE session_id = $1
                ORDER BY timestamp ASC
                """,
                session_id,
            )
            return [dict(row) for row in rows]

    async def get_latest_code_snapshot(self, session_id: str, file_id: str) -> dict | None:
        """Get the latest code snapshot for a specific file."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM code_snapshots
                WHERE session_id = $1 AND file_id = $2
                ORDER BY timestamp DESC
                LIMIT 1
                """,
                session_id,
                file_id,
            )
            return dict(row) if row else None

    # =========================================================================
    # Claude Interaction Operations
    # =========================================================================

    async def get_claude_interactions(self, session_id: str) -> list[dict]:
        """Get all Claude interactions for a session."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM claude_interactions
                WHERE session_id = $1
                ORDER BY timestamp ASC
                """,
                session_id,
            )
            return [dict(row) for row in rows]

    async def save_claude_interaction(
        self,
        session_id: str,
        role: str,
        content: str,
        model: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        latency: int | None = None,
        stop_reason: str | None = None,
        prompt_quality: float | None = None,
    ) -> str:
        """Save a new Claude interaction."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO claude_interactions (
                    session_id, role, content, model,
                    input_tokens, output_tokens, latency,
                    stop_reason, prompt_quality
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
                """,
                session_id,
                role,
                content,
                model,
                input_tokens,
                output_tokens,
                latency,
                stop_reason,
                prompt_quality,
            )
            return row["id"]

    # =========================================================================
    # Test Result Operations
    # =========================================================================

    async def get_test_results(self, session_id: str) -> list[dict]:
        """Get all test results for a session."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM test_results
                WHERE session_id = $1
                ORDER BY timestamp ASC
                """,
                session_id,
            )
            return [dict(row) for row in rows]

    async def save_test_result(
        self,
        session_id: str,
        test_name: str,
        passed: bool,
        output: str | None = None,
        error: str | None = None,
        duration: int | None = None,
    ) -> str:
        """Save a new test result."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO test_results (
                    session_id, test_name, passed, output, error, duration
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
                """,
                session_id,
                test_name,
                passed,
                output,
                error,
                duration,
            )
            return row["id"]

    # =========================================================================
    # Terminal Command Operations
    # =========================================================================

    async def get_terminal_commands(self, session_id: str) -> list[dict]:
        """Get all terminal commands for a session."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM terminal_commands
                WHERE session_id = $1
                ORDER BY timestamp ASC
                """,
                session_id,
            )
            return [dict(row) for row in rows]

    # =========================================================================
    # Evaluation Operations
    # =========================================================================

    async def get_evaluation(self, candidate_id: str) -> dict | None:
        """Get evaluation for a candidate."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM evaluations WHERE candidate_id = $1
                """,
                candidate_id,
            )
            return dict(row) if row else None

    async def save_evaluation(
        self,
        candidate_id: str,
        session_id: str,
        result: EvaluationResult,
    ) -> str:
        """Save or update evaluation result."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Check if evaluation exists
            existing = await conn.fetchrow(
                """
                SELECT id FROM evaluations WHERE candidate_id = $1
                """,
                candidate_id,
            )

            if existing:
                # Update existing evaluation
                await conn.execute(
                    """
                    UPDATE evaluations SET
                        code_quality_score = $2,
                        code_quality_evidence = $3,
                        code_quality_confidence = $4,
                        problem_solving_score = $5,
                        problem_solving_evidence = $6,
                        problem_solving_confidence = $7,
                        ai_collaboration_score = $8,
                        ai_collaboration_evidence = $9,
                        ai_collaboration_confidence = $10,
                        communication_score = $11,
                        communication_evidence = $12,
                        communication_confidence = $13,
                        overall_score = $14,
                        confidence = $15,
                        bias_flags = $16,
                        model = $17,
                        updated_at = NOW()
                    WHERE candidate_id = $1
                    """,
                    candidate_id,
                    result["code_quality"]["score"],
                    json.dumps(result["code_quality"]["evidence"]),
                    result["code_quality"]["confidence"],
                    result["problem_solving"]["score"],
                    json.dumps(result["problem_solving"]["evidence"]),
                    result["problem_solving"]["confidence"],
                    result["ai_collaboration"]["score"],
                    json.dumps(result["ai_collaboration"]["evidence"]),
                    result["ai_collaboration"]["confidence"],
                    result["communication"]["score"],
                    json.dumps(result["communication"]["evidence"]),
                    result["communication"]["confidence"],
                    result["overall_score"],
                    result["overall_confidence"],
                    result.get("bias_flags", []),
                    result.get("model", "claude-sonnet-4-20250514"),
                )
                return existing["id"]
            else:
                # Insert new evaluation
                row = await conn.fetchrow(
                    """
                    INSERT INTO evaluations (
                        candidate_id, session_id,
                        code_quality_score, code_quality_evidence, code_quality_confidence,
                        problem_solving_score, problem_solving_evidence, problem_solving_confidence,
                        ai_collaboration_score, ai_collaboration_evidence, ai_collaboration_confidence,
                        communication_score, communication_evidence, communication_confidence,
                        overall_score, confidence, bias_flags, model
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                    RETURNING id
                    """,
                    candidate_id,
                    session_id,
                    result["code_quality"]["score"],
                    json.dumps(result["code_quality"]["evidence"]),
                    result["code_quality"]["confidence"],
                    result["problem_solving"]["score"],
                    json.dumps(result["problem_solving"]["evidence"]),
                    result["problem_solving"]["confidence"],
                    result["ai_collaboration"]["score"],
                    json.dumps(result["ai_collaboration"]["evidence"]),
                    result["ai_collaboration"]["confidence"],
                    result["communication"]["score"],
                    json.dumps(result["communication"]["evidence"]),
                    result["communication"]["confidence"],
                    result["overall_score"],
                    result["overall_confidence"],
                    result.get("bias_flags", []),
                    result.get("model", "claude-sonnet-4-20250514"),
                )
                return row["id"]

    # =========================================================================
    # Candidate Operations
    # =========================================================================

    async def get_candidate(self, candidate_id: str) -> dict | None:
        """Get candidate by ID."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM candidates WHERE id = $1
                """,
                candidate_id,
            )
            return dict(row) if row else None

    async def update_candidate_scores(
        self,
        candidate_id: str,
        overall_score: float,
        coding_score: float | None = None,
        communication_score: float | None = None,
        problem_solving_score: float | None = None,
    ) -> None:
        """Update candidate scores after evaluation."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE candidates SET
                    overall_score = $2,
                    coding_score = $3,
                    communication_score = $4,
                    problem_solving_score = $5,
                    status = 'EVALUATED',
                    updated_at = NOW()
                WHERE id = $1
                """,
                candidate_id,
                overall_score,
                coding_score,
                communication_score,
                problem_solving_score,
            )

    async def save_interview_metrics(
        self,
        candidate_id: str,
        metrics: InterviewMetrics,
    ) -> None:
        """Save interview metrics to candidate session_data."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Get existing session_data
            row = await conn.fetchrow(
                """
                SELECT session_data FROM candidates WHERE id = $1
                """,
                candidate_id,
            )

            session_data = row["session_data"] if row and row["session_data"] else {}
            if isinstance(session_data, str):
                session_data = json.loads(session_data)

            # Update with new metrics
            session_data["interview_metrics"] = dict(metrics)

            await conn.execute(
                """
                UPDATE candidates SET
                    session_data = $2,
                    updated_at = NOW()
                WHERE id = $1
                """,
                candidate_id,
                json.dumps(session_data),
            )

    async def get_interview_metrics(self, candidate_id: str) -> InterviewMetrics | None:
        """Get interview metrics from candidate session_data."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT session_data FROM candidates WHERE id = $1
                """,
                candidate_id,
            )

            if row and row["session_data"]:
                session_data = row["session_data"]
                if isinstance(session_data, str):
                    session_data = json.loads(session_data)
                return session_data.get("interview_metrics")

            return None

    # =========================================================================
    # Session Data Aggregation (for evaluation)
    # =========================================================================

    async def get_full_session_data(self, session_id: str) -> dict:
        """
        Get all session data needed for evaluation.

        Returns:
            Dict with code_snapshots, test_results, claude_interactions, terminal_commands
        """
        code_snapshots = await self.get_code_snapshots(session_id)
        test_results = await self.get_test_results(session_id)
        claude_interactions = await self.get_claude_interactions(session_id)
        terminal_commands = await self.get_terminal_commands(session_id)

        # Format for evaluation
        return {
            "code_snapshots": [
                {
                    "timestamp": str(s["timestamp"]),
                    "files": {s["file_id"]: s.get("full_content", "")},
                }
                for s in code_snapshots
            ],
            "test_results": [
                {
                    "timestamp": str(r["timestamp"]),
                    "test_name": r["test_name"],
                    "passed": r["passed"],
                    "output": r.get("output"),
                    "error": r.get("error"),
                    "duration": r.get("duration"),
                }
                for r in test_results
            ],
            "claude_interactions": [
                {
                    "timestamp": str(i["timestamp"]),
                    "role": i["role"],
                    "content": i["content"],
                    "prompt_quality": i.get("prompt_quality"),
                }
                for i in claude_interactions
            ],
            "terminal_commands": [
                {
                    "timestamp": str(c["timestamp"]),
                    "command": c["command"],
                    "output": c.get("output"),
                    "exit_code": c.get("exit_code", 0),
                }
                for c in terminal_commands
            ],
        }


# Global database instance
_db: DatabaseService | None = None


async def get_database() -> DatabaseService:
    """Get or create the global database service."""
    global _db
    if _db is None:
        _db = DatabaseService()
        await _db.connect()
    return _db


async def close_database() -> None:
    """Close the global database connection."""
    global _db
    if _db:
        await _db.disconnect()
        _db = None


# =============================================================================
# Extended Database Service for Question Generation
# =============================================================================

class QuestionGenerationDatabaseService(DatabaseService):
    """
    Extended database service with question generation queries.

    Provides CRUD operations for:
    - Complexity profiles
    - Generated questions
    - Question pool statistics
    """

    # =========================================================================
    # Complexity Profile Operations
    # =========================================================================

    async def get_complexity_profile(
        self,
        role: str,
        seniority: str,
        assessment_type: str,
        organization_id: str | None = None,
    ) -> dict | None:
        """
        Get complexity profile from database.

        Tries org-specific override first, falls back to system default.

        Args:
            role: e.g., 'backend', 'frontend'
            seniority: e.g., 'junior', 'mid', 'senior'
            assessment_type: 'REAL_WORLD' or 'SYSTEM_DESIGN'
            organization_id: Optional org ID for custom profiles

        Returns:
            Complexity profile dict or None
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Try org-specific first
            if organization_id:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM complexity_profiles
                    WHERE role = $1 AND seniority = $2 AND assessment_type = $3::\"AssessmentType\"
                    AND organization_id = $4
                    """,
                    role,
                    seniority,
                    assessment_type,
                    organization_id,
                )
                if row:
                    return self._parse_complexity_profile(row)

            # Fall back to system default
            row = await conn.fetchrow(
                """
                SELECT * FROM complexity_profiles
                WHERE role = $1 AND seniority = $2 AND assessment_type = $3::\"AssessmentType\"
                AND is_default = true AND organization_id IS NULL
                """,
                role,
                seniority,
                assessment_type,
            )

            return self._parse_complexity_profile(row) if row else None

    def _parse_complexity_profile(self, row) -> dict:
        """Parse database row into complexity profile dict."""
        return {
            "role": row["role"],
            "seniority": row["seniority"],
            "assessment_type": row["assessment_type"],
            "entity_count_min": row["entity_count_min"],
            "entity_count_max": row["entity_count_max"],
            "integration_points": row["integration_points"],
            "business_logic": row["business_logic"],
            "ambiguity_level": row["ambiguity_level"],
            "time_minutes": row["time_minutes"],
            "required_skills": row["required_skills"] if row["required_skills"] else [],
            "optional_skill_pool": row["optional_skill_pool"] if row["optional_skill_pool"] else [],
            "avoid_skills": row["avoid_skills"] if row["avoid_skills"] else [],
            "pick_optional_count": row["pick_optional_count"],
            "domain_pool": row["domain_pool"] if row["domain_pool"] else [],
            "constraints": row["constraints"] if row["constraints"] else {},
        }

    # =========================================================================
    # Generated Question Operations
    # =========================================================================

    async def save_generated_question(
        self,
        candidate_id: str,
        question_seed_id: str | None,
        order: int,
        title: str,
        description: str,
        difficulty: str,
        language: str,
        requirements: list[str],
        estimated_time: int,
        starter_code: str | dict,
        test_cases: list | None = None,
        difficulty_assessment: dict | None = None,
        fingerprint: str | None = None,
    ) -> str:
        """
        Save a generated question to the database.

        Returns:
            Question ID
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO generated_questions (
                    candidate_id, question_seed_id, \"order\", title, description,
                    difficulty, language, requirements, estimated_time,
                    starter_code, test_cases, difficulty_assessment, fingerprint
                )
                VALUES ($1, $2, $3, $4, $5, $6::\"Difficulty\", $7, $8, $9, $10, $11, $12, $13)
                RETURNING id
                """,
                candidate_id,
                question_seed_id,
                order,
                title,
                description,
                difficulty,
                language,
                requirements,
                estimated_time,
                json.dumps(starter_code) if isinstance(starter_code, dict) else starter_code,
                json.dumps(test_cases) if test_cases else None,
                json.dumps(difficulty_assessment) if difficulty_assessment else None,
                fingerprint,
            )
            return row["id"]

    async def get_generated_questions(
        self,
        candidate_id: str,
        session_id: str | None = None,
    ) -> list[dict]:
        """Get all generated questions for a candidate."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM generated_questions
                WHERE candidate_id = $1
                ORDER BY \"order\" ASC
                """,
                candidate_id,
            )
            return [self._parse_generated_question(row) for row in rows]

    async def get_previous_questions(
        self,
        session_id: str,
    ) -> list[dict]:
        """
        Get previous questions for a session (for incremental generation).

        Joins with candidate to get session-specific questions.
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Get candidate_id from session
            session_row = await conn.fetchrow(
                """
                SELECT candidate_id FROM session_recordings WHERE id = $1
                """,
                session_id,
            )
            if not session_row:
                return []

            candidate_id = session_row["candidate_id"]

            rows = await conn.fetch(
                """
                SELECT * FROM generated_questions
                WHERE candidate_id = $1 AND status = 'COMPLETED'
                ORDER BY \"order\" ASC
                """,
                candidate_id,
            )
            return [self._parse_generated_question(row) for row in rows]

    def _parse_generated_question(self, row) -> dict:
        """Parse database row into generated question dict."""
        starter_code = row["starter_code"]
        if isinstance(starter_code, str) and starter_code.startswith("{"):
            try:
                starter_code = json.loads(starter_code)
            except json.JSONDecodeError:
                pass

        return {
            "id": row["id"],
            "candidate_id": row["candidate_id"],
            "question_seed_id": row["question_seed_id"],
            "order": row["order"],
            "title": row["title"],
            "description": row["description"],
            "difficulty": row["difficulty"],
            "language": row["language"],
            "requirements": row["requirements"] if row["requirements"] else [],
            "estimated_time": row["estimated_time"],
            "starter_code": starter_code,
            "test_cases": row["test_cases"] if row["test_cases"] else [],
            "status": row["status"],
            "score": row["score"],
            "started_at": str(row["started_at"]) if row["started_at"] else None,
            "completed_at": str(row["completed_at"]) if row["completed_at"] else None,
            "difficulty_assessment": row["difficulty_assessment"],
            "fingerprint": row["fingerprint"],
            "reuse_count": row["reuse_count"],
        }

    # =========================================================================
    # Question Pool Statistics (Smart Reuse)
    # =========================================================================

    async def get_question_pool_stats(self, seed_id: str) -> dict | None:
        """
        Get question pool statistics for smart reuse.

        Args:
            seed_id: Question seed ID

        Returns:
            Pool stats dict or None
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM question_pool_stats WHERE seed_id = $1
                """,
                seed_id,
            )
            if not row:
                # Calculate stats from generated_questions
                stats_row = await conn.fetchrow(
                    """
                    SELECT
                        COUNT(*) as total_generated,
                        COUNT(DISTINCT fingerprint) as unique_questions,
                        AVG(reuse_count) as avg_reuse_count,
                        MAX(created_at) as last_generated_at,
                        COUNT(DISTINCT candidate_id) as total_candidates_served
                    FROM generated_questions
                    WHERE question_seed_id = $1
                    """,
                    seed_id,
                )
                if stats_row:
                    return {
                        "seed_id": seed_id,
                        "total_generated": stats_row["total_generated"] or 0,
                        "unique_questions": stats_row["unique_questions"] or 0,
                        "avg_reuse_count": float(stats_row["avg_reuse_count"] or 0),
                        "threshold": 100,  # Default threshold
                        "last_generated_at": str(stats_row["last_generated_at"]) if stats_row["last_generated_at"] else None,
                        "total_candidates_served": stats_row["total_candidates_served"] or 0,
                        "avg_uniqueness_score": 1.0,
                    }
                return None

            return {
                "seed_id": row["seed_id"],
                "total_generated": row["total_generated"],
                "unique_questions": row["unique_questions"],
                "avg_reuse_count": float(row["avg_reuse_count"] or 0),
                "threshold": row["threshold"],
                "last_generated_at": str(row["last_generated_at"]) if row["last_generated_at"] else None,
                "total_candidates_served": row["total_candidates_served"],
                "avg_uniqueness_score": float(row["avg_uniqueness_score"] or 1.0),
            }

    async def get_questions_for_reuse(
        self,
        seed_id: str,
        exclude_candidate_id: str | None = None,
        limit: int = 10,
    ) -> list[dict]:
        """
        Get questions available for reuse.

        Excludes questions already served to the candidate.

        Args:
            seed_id: Question seed ID
            exclude_candidate_id: Candidate to exclude (don't reuse their own questions)
            limit: Maximum questions to return

        Returns:
            List of question dicts
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            if exclude_candidate_id:
                rows = await conn.fetch(
                    """
                    SELECT * FROM generated_questions
                    WHERE question_seed_id = $1
                    AND candidate_id != $2
                    AND score >= 0.6
                    ORDER BY reuse_count ASC, created_at DESC
                    LIMIT $3
                    """,
                    seed_id,
                    exclude_candidate_id,
                    limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM generated_questions
                    WHERE question_seed_id = $1
                    AND score >= 0.6
                    ORDER BY reuse_count ASC, created_at DESC
                    LIMIT $2
                    """,
                    seed_id,
                    limit,
                )
            return [self._parse_generated_question(row) for row in rows]

    async def increment_question_reuse_count(self, question_id: str) -> None:
        """Increment reuse count for a question."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE generated_questions
                SET reuse_count = reuse_count + 1
                WHERE id = $1
                """,
                question_id,
            )

    # =========================================================================
    # Problem Seed Operations
    # =========================================================================

    async def get_problem_seed(self, seed_id: str) -> dict | None:
        """Get problem seed by ID."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM problem_seeds WHERE id = $1
                """,
                seed_id,
            )
            if not row:
                return None

            return {
                "id": row["id"],
                "title": row["title"],
                "description": row["description"],
                "seed_type": row["seed_type"],
                "assessment_type": row["assessment_type"],
                "status": row["status"],
                "required_tech": row["required_tech"],
                "base_problem": row["base_problem"],
                "progression_hints": row["progression_hints"],
                "seniority_expectations": row["seniority_expectations"],
            }


# Global question generation database instance
_qgen_db: QuestionGenerationDatabaseService | None = None


async def get_question_generation_database() -> QuestionGenerationDatabaseService:
    """Get or create the global question generation database service."""
    global _qgen_db
    if _qgen_db is None:
        _qgen_db = QuestionGenerationDatabaseService()
        await _qgen_db.connect()
    return _qgen_db
