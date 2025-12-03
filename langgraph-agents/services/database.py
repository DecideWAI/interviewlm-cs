"""
Database service for LangGraph agents.

Uses asyncpg for async PostgreSQL access to the existing Prisma schema.
This allows Python agents to read/write to the same database as the Next.js app.
"""

import json
from datetime import datetime
from typing import Any
import asyncpg

from ..config import settings
from ..models.state import EvaluationResult, InterviewMetrics


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
            print(f"[Database] Connected to PostgreSQL")

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
