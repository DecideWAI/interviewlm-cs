"""
Evaluation tools for the LangGraph Evaluation Agent.

These tools analyze code, problem-solving approaches, AI collaboration,
and communication skills with evidence-based scoring.

Also includes database query tools for fetching session data.
"""

import re
from typing import Any
from datetime import datetime
import asyncpg
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig

from config import settings


# =============================================================================
# Database Connection Pool
# =============================================================================

_db_pool: asyncpg.Pool | None = None


async def get_db_pool() -> asyncpg.Pool:
    """Get or create the database connection pool."""
    global _db_pool
    if _db_pool is None:
        _db_pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=1,
            max_size=5,
        )
    return _db_pool


# =============================================================================
# Database Query Tools
# =============================================================================

@tool
async def get_session_metadata(
    session_id: str,
    config: RunnableConfig,
) -> dict[str, Any]:
    """
    Fetch session metadata including candidate info, problem, and timing.

    Use this tool FIRST to understand the context of the interview session.

    Args:
        session_id: The session recording ID

    Returns:
        Dict with session_id, candidate_id, started_at, problem_title, language, duration
    """
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Query session recording with candidate and assessment info
        row = await conn.fetchrow("""
            SELECT
                sr.id as session_id,
                sr.candidate_id,
                sr.started_at,
                sr.ended_at,
                c.preferred_language as language,
                a.title as problem_title,
                a.description as problem_description
            FROM session_recordings sr
            JOIN candidates c ON sr.candidate_id = c.id
            LEFT JOIN assessments a ON c.assessment_id = a.id
            WHERE sr.id = $1
        """, session_id)

        if not row:
            return {"error": f"Session {session_id} not found", "success": False}

        duration_minutes = None
        if row["started_at"] and row["ended_at"]:
            duration = row["ended_at"] - row["started_at"]
            duration_minutes = round(duration.total_seconds() / 60, 1)

        return {
            "success": True,
            "session_id": row["session_id"],
            "candidate_id": row["candidate_id"],
            "started_at": row["started_at"].isoformat() if row["started_at"] else None,
            "ended_at": row["ended_at"].isoformat() if row["ended_at"] else None,
            "duration_minutes": duration_minutes,
            "language": row["language"],
            "problem_title": row["problem_title"],
            "problem_description": row["problem_description"][:500] if row["problem_description"] else None,
        }


@tool
async def get_claude_interactions(
    session_id: str,
    config: RunnableConfig,
) -> dict[str, Any]:
    """
    Fetch all Claude AI interactions for a session from the database.

    Use this to see the full conversation between the candidate and AI assistant.

    Args:
        session_id: The session recording ID

    Returns:
        Dict with interactions list containing timestamp, role, content, prompt_quality
    """
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                timestamp,
                role,
                content,
                model,
                input_tokens,
                output_tokens,
                prompt_quality,
                metadata
            FROM claude_interactions
            WHERE session_id = $1
            ORDER BY timestamp ASC
        """, session_id)

        interactions = []
        for row in rows:
            interactions.append({
                "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
                "role": row["role"],
                "content": row["content"],
                "model": row["model"],
                "input_tokens": row["input_tokens"],
                "output_tokens": row["output_tokens"],
                "prompt_quality": row["prompt_quality"],
            })

        return {
            "success": True,
            "count": len(interactions),
            "interactions": interactions,
        }


@tool
async def get_test_results(
    session_id: str,
    config: RunnableConfig,
) -> dict[str, Any]:
    """
    Fetch all test results for a session from the database.

    Use this to see how the candidate's tests progressed over time.

    Args:
        session_id: The session recording ID

    Returns:
        Dict with test_results list containing timestamp, passed, failed, total, output
    """
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                timestamp,
                passed,
                failed,
                total,
                output,
                coverage
            FROM test_results
            WHERE session_id = $1
            ORDER BY timestamp ASC
        """, session_id)

        test_results = []
        for row in rows:
            test_results.append({
                "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
                "passed": row["passed"],
                "failed": row["failed"],
                "total": row["total"],
                "output": row["output"][:2000] if row["output"] else None,  # Truncate long output
                "coverage": row["coverage"],
            })

        return {
            "success": True,
            "count": len(test_results),
            "test_results": test_results,
        }


@tool
async def get_code_snapshots(
    session_id: str,
    config: RunnableConfig,
) -> dict[str, Any]:
    """
    Fetch code snapshots for a session from the database.

    IMPORTANT: Use this tool instead of workspace exploration (list_files, read_file)
    because the interview sandbox may have expired. This tool reads saved code from
    the database which is always available.

    Args:
        session_id: The session recording ID

    Returns:
        Dict with code_snapshots list containing file_name, language, content, timestamp
    """
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                timestamp,
                file_name,
                language,
                full_content,
                lines_added,
                lines_deleted
            FROM code_snapshots
            WHERE session_id = $1
            ORDER BY timestamp DESC
        """, session_id)

        # Group by file_name, keeping only the latest snapshot per file
        files: dict[str, dict] = {}
        all_snapshots = []

        for row in rows:
            file_name = row["file_name"]
            snapshot = {
                "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
                "file_name": file_name,
                "language": row["language"],
                "content": row["full_content"],
                "lines_added": row["lines_added"],
                "lines_deleted": row["lines_deleted"],
            }
            all_snapshots.append(snapshot)

            # Keep only latest per file
            if file_name not in files:
                files[file_name] = snapshot

        return {
            "success": True,
            "count": len(all_snapshots),
            "files": files,  # Latest snapshot per file
            "all_snapshots": all_snapshots[:20],  # Limit to prevent token overflow
        }


# =============================================================================
# Code Quality Analysis
# =============================================================================

@tool
async def analyze_code_quality(
    code_snapshots: list[dict],
    test_results: list[dict],
) -> dict[str, Any]:
    """
    Analyze code quality using test results and static analysis.

    Methods:
    1. Test results (objective) - pass/fail rates
    2. Static analysis - complexity, patterns, security issues
    3. LLM code review (called separately)

    Args:
        code_snapshots: List of code snapshots with files and timestamps
        test_results: List of test run results

    Returns:
        Dict with score (0-100), confidence, evidence, and breakdown
    """
    evidence = []
    test_score = 0
    static_score = 50  # Default neutral

    # Method 1: Analyze test results
    if test_results:
        last_test = test_results[-1]
        total = last_test.get("total", 0)
        passed = last_test.get("passed", 0)

        if total > 0:
            test_score = (passed / total) * 100
            evidence.append({
                "type": "test_result",
                "description": f"{passed}/{total} tests passed",
                "timestamp": last_test.get("timestamp"),
                "value": test_score,
            })

            if last_test.get("coverage") is not None:
                evidence.append({
                    "type": "metric",
                    "description": f"Test coverage: {last_test['coverage']}%",
                    "value": last_test["coverage"],
                })

    # Method 2: Static analysis on final code
    if code_snapshots:
        final_snapshot = code_snapshots[-1]
        files = final_snapshot.get("files", {})

        total_lines = 0
        comment_lines = 0
        complexity_issues = 0
        security_issues = 0

        for file_path, content in files.items():
            if not isinstance(content, str):
                continue

            lines = content.split("\n")
            total_lines += len(lines)

            # Count comments
            for line in lines:
                stripped = line.strip()
                if stripped.startswith("//") or stripped.startswith("#") or stripped.startswith("/*"):
                    comment_lines += 1

            # Check for complexity issues
            if content.count("if ") > 10:
                complexity_issues += 1
            if content.count("for ") > 5 and content.count("for ") * 2 > len(lines) / 10:
                complexity_issues += 1

            # Check for security issues
            security_patterns = [
                r"eval\s*\(",
                r"exec\s*\(",
                r"__import__",
                r"subprocess\.call.*shell=True",
                r"innerHTML\s*=",
                r"document\.write",
            ]
            for pattern in security_patterns:
                if re.search(pattern, content):
                    security_issues += 1

        # Calculate static score
        comment_ratio = comment_lines / max(total_lines, 1)
        static_score = 70  # Base score

        # Adjust for comments (good: 5-20%)
        if 0.05 <= comment_ratio <= 0.20:
            static_score += 10
        elif comment_ratio < 0.02:
            static_score -= 10

        # Penalize complexity and security issues
        static_score -= complexity_issues * 5
        static_score -= security_issues * 15

        static_score = max(0, min(100, static_score))

        evidence.append({
            "type": "metric",
            "description": f"Static analysis: {static_score}/100",
            "value": static_score,
        })

        if security_issues > 0:
            evidence.append({
                "type": "metric",
                "description": f"{security_issues} security issue(s) detected",
                "value": security_issues,
            })

    # Combine scores
    scores = [s for s in [test_score, static_score] if s > 0]
    if not scores:
        return {
            "score": 0,
            "confidence": 0.3,
            "evidence": evidence,
            "breakdown": {"tests": 0, "static_analysis": 0},
        }

    # Multi-method validation
    max_diff = max(scores) - min(scores) if len(scores) > 1 else 0
    confidence = 0.9 if max_diff < 20 else 0.6

    score = sum(scores) / len(scores)

    return {
        "score": round(score),
        "confidence": confidence,
        "evidence": evidence,
        "breakdown": {
            "tests": test_score,
            "static_analysis": static_score,
        },
    }


# =============================================================================
# Problem Solving Analysis
# =============================================================================

@tool
async def analyze_problem_solving(
    code_snapshots: list[dict],
    test_results: list[dict],
    terminal_commands: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Analyze problem-solving approach through iteration patterns and debugging.

    Methods:
    1. Iteration patterns - code change frequency and patterns
    2. Debugging approach - test-driven improvement
    3. Terminal analysis - systematic debugging commands

    Args:
        code_snapshots: List of code snapshots with timestamps
        test_results: List of test run results
        terminal_commands: Optional list of terminal commands

    Returns:
        Dict with score (0-100), confidence, evidence, and breakdown
    """
    evidence = []

    # Method 1: Analyze iteration patterns
    iteration_count = len(code_snapshots)
    evidence.append({
        "type": "metric",
        "description": f"{iteration_count} code iterations",
        "value": iteration_count,
    })

    # Optimal iteration count follows bell curve (peak at 7)
    optimal_count = 7
    sigma = 3
    deviation = abs(iteration_count - optimal_count)
    import math
    normalized_score = math.exp(-((deviation / sigma) ** 2) / 2)
    iteration_score = 30 + normalized_score * 70

    # Method 2: Analyze debugging approach from test results
    debugging_score = 50  # Default neutral

    if test_results:
        evidence.append({
            "type": "metric",
            "description": f"{len(test_results)} test runs",
            "value": len(test_results),
        })

        # Look for improvement over time
        improvements = []
        for i in range(1, len(test_results)):
            prev = test_results[i - 1].get("passed", 0)
            curr = test_results[i].get("passed", 0)
            improvements.append(curr - prev)

        if improvements:
            positive_improvements = sum(1 for i in improvements if i > 0)
            improvement_rate = positive_improvements / len(improvements)
            debugging_score = 50 + improvement_rate * 50

    # Method 3: Analyze terminal commands
    terminal_score = 50  # Default

    if terminal_commands:
        debugging_patterns = 0
        for cmd in terminal_commands:
            command = cmd.get("command", "").lower()
            # Look for debugging patterns
            if any(p in command for p in ["print", "console.log", "debug", "breakpoint"]):
                debugging_patterns += 1
            if any(p in command for p in ["git diff", "git log", "git status"]):
                debugging_patterns += 1
            if any(p in command for p in ["npm test", "pytest", "jest", "cargo test"]):
                debugging_patterns += 1

        if debugging_patterns > 0:
            terminal_score = min(100, 50 + debugging_patterns * 10)
            evidence.append({
                "type": "metric",
                "description": f"{debugging_patterns} debugging-related commands",
                "value": debugging_patterns,
            })

    # Combine scores (30% iteration, 30% debugging, 40% terminal)
    score = round(iteration_score * 0.3 + debugging_score * 0.3 + terminal_score * 0.4)
    confidence = 0.85 if iteration_count >= 3 and len(test_results) >= 2 else 0.6

    return {
        "score": score,
        "confidence": confidence,
        "evidence": evidence,
        "breakdown": {
            "iteration_patterns": round(iteration_score),
            "debugging_approach": round(debugging_score),
            "terminal_analysis": round(terminal_score),
        },
    }


# =============================================================================
# AI Collaboration Analysis
# =============================================================================

@tool
async def analyze_ai_collaboration(
    claude_interactions: list[dict],
    metrics: dict | None = None,
) -> dict[str, Any]:
    """
    Analyze AI collaboration quality (unique to InterviewLM).

    Methods:
    1. Prompt quality - specificity, clarity, technical depth
    2. AI usage effectiveness - appropriate dependency level

    Args:
        claude_interactions: List of AI chat interactions
        metrics: Optional session metrics including AI dependency score

    Returns:
        Dict with score (0-100), confidence, evidence, and breakdown
    """
    evidence = []

    if not claude_interactions:
        return {
            "score": 0,
            "confidence": 1.0,
            "evidence": [{"type": "metric", "description": "No AI interactions", "value": 0}],
            "breakdown": {},
        }

    # Analyze prompt quality
    specificity_scores = []
    clarity_scores = []
    technical_depth_scores = []

    for interaction in claude_interactions:
        user_message = interaction.get("candidate_message", interaction.get("userMessage", ""))
        if not user_message:
            continue

        words = user_message.split()
        word_count = len(words)

        # Specificity: longer, detailed prompts score higher
        if word_count >= 20:
            specificity_scores.append(80)
        elif word_count >= 10:
            specificity_scores.append(60)
        elif word_count >= 5:
            specificity_scores.append(40)
        else:
            specificity_scores.append(20)

        # Clarity: look for clear structure (questions, bullet points)
        has_question = "?" in user_message
        has_structure = any(p in user_message for p in ["1.", "2.", "-", "*", "first", "then", "finally"])
        clarity = 50
        if has_question:
            clarity += 20
        if has_structure:
            clarity += 20
        clarity_scores.append(min(100, clarity))

        # Technical depth: look for code references, technical terms
        technical_terms = ["function", "class", "error", "debug", "test", "api", "async", "await", "promise"]
        has_code = "```" in user_message or "`" in user_message
        term_count = sum(1 for term in technical_terms if term.lower() in user_message.lower())

        depth = 40
        if has_code:
            depth += 30
        depth += min(30, term_count * 10)
        technical_depth_scores.append(min(100, depth))

    # Calculate averages
    specificity = sum(specificity_scores) / len(specificity_scores) if specificity_scores else 50
    clarity = sum(clarity_scores) / len(clarity_scores) if clarity_scores else 50
    technical_depth = sum(technical_depth_scores) / len(technical_depth_scores) if technical_depth_scores else 50

    prompt_quality_score = (specificity + clarity + technical_depth) / 3

    evidence.extend([
        {"type": "metric", "description": f"Prompt specificity: {round(specificity)}/100", "value": specificity},
        {"type": "metric", "description": f"Prompt clarity: {round(clarity)}/100", "value": clarity},
        {"type": "metric", "description": f"Technical depth: {round(technical_depth)}/100", "value": technical_depth},
    ])

    # AI usage effectiveness
    ai_dependency = 50  # Default moderate
    if metrics and "ai_dependency_score" in metrics:
        ai_dependency = metrics["ai_dependency_score"]
    elif metrics and "aiDependencyScore" in metrics:
        ai_dependency = metrics["aiDependencyScore"]

    # Optimal: moderate AI usage (not too dependent, not ignoring it)
    usage_effectiveness_score = 100 - abs(50 - ai_dependency)

    evidence.append({
        "type": "metric",
        "description": f"AI dependency score: {round(ai_dependency)}/100",
        "value": ai_dependency,
    })

    # Combine scores (70% prompt quality, 30% usage effectiveness)
    score = round(prompt_quality_score * 0.7 + usage_effectiveness_score * 0.3)
    confidence = 0.9 if len(claude_interactions) >= 5 else 0.6

    return {
        "score": score,
        "confidence": confidence,
        "evidence": evidence,
        "breakdown": {
            "specificity": round(specificity),
            "clarity": round(clarity),
            "technical_depth": round(technical_depth),
            "usage_effectiveness": round(usage_effectiveness_score),
        },
    }


# =============================================================================
# Communication Analysis
# =============================================================================

@tool
async def analyze_communication(
    claude_interactions: list[dict],
    code_snapshots: list[dict],
) -> dict[str, Any]:
    """
    Analyze communication skills through prompts and code documentation.

    Methods:
    1. Prompt clarity - from AI interactions
    2. Code documentation - comments and structure

    Args:
        claude_interactions: List of AI chat interactions
        code_snapshots: List of code snapshots

    Returns:
        Dict with score (0-100), confidence, evidence, and breakdown
    """
    evidence = []

    # Prompt clarity (reuse from AI collaboration analysis)
    clarity_scores = []

    for interaction in claude_interactions:
        user_message = interaction.get("candidate_message", interaction.get("userMessage", ""))
        if not user_message:
            continue

        # Clear communication indicators
        has_greeting = any(g in user_message.lower() for g in ["please", "thank", "could you"])
        has_context = len(user_message) > 50
        has_question = "?" in user_message

        clarity = 50
        if has_greeting:
            clarity += 15
        if has_context:
            clarity += 20
        if has_question:
            clarity += 15
        clarity_scores.append(min(100, clarity))

    avg_clarity = sum(clarity_scores) / len(clarity_scores) if clarity_scores else 50
    evidence.append({
        "type": "metric",
        "description": f"Prompt clarity: {round(avg_clarity)}/100",
        "value": avg_clarity,
    })

    # Code documentation analysis
    documentation_score = 50  # Default

    if code_snapshots:
        final_snapshot = code_snapshots[-1]
        files = final_snapshot.get("files", {})

        total_lines = 0
        doc_lines = 0

        for content in files.values():
            if not isinstance(content, str):
                continue

            lines = content.split("\n")
            total_lines += len(lines)

            for line in lines:
                stripped = line.strip()
                # Count documentation lines
                if stripped.startswith("//") or stripped.startswith("#"):
                    doc_lines += 1
                if stripped.startswith("/*") or stripped.startswith("'''") or stripped.startswith('"""'):
                    doc_lines += 1
                if stripped.startswith("*") and not stripped.startswith("*/"):
                    doc_lines += 1

        if total_lines > 0:
            doc_ratio = doc_lines / total_lines
            # Optimal documentation: 5-15%
            if 0.05 <= doc_ratio <= 0.15:
                documentation_score = 85
            elif 0.02 <= doc_ratio < 0.05:
                documentation_score = 70
            elif doc_ratio > 0.15:
                documentation_score = 75  # Too much can be verbose
            else:
                documentation_score = 50

            evidence.append({
                "type": "metric",
                "description": f"Documentation ratio: {round(doc_ratio * 100)}%",
                "value": doc_ratio,
            })

    evidence.append({
        "type": "metric",
        "description": f"Documentation score: {documentation_score}/100",
        "value": documentation_score,
    })

    # Combine scores
    score = round((avg_clarity + documentation_score) / 2)
    confidence = 0.75 if len(claude_interactions) >= 3 else 0.5

    return {
        "score": score,
        "confidence": confidence,
        "evidence": evidence,
        "breakdown": {
            "prompt_clarity": round(avg_clarity),
            "documentation": documentation_score,
        },
    }


# =============================================================================
# Store Evaluation Result
# =============================================================================

@tool
async def store_evaluation_result(
    session_id: str,
    candidate_id: str,
    code_quality_score: int,
    code_quality_evidence: list[dict],
    code_quality_confidence: float,
    problem_solving_score: int,
    problem_solving_evidence: list[dict],
    problem_solving_confidence: float,
    ai_collaboration_score: int,
    ai_collaboration_evidence: list[dict],
    ai_collaboration_confidence: float,
    communication_score: int,
    communication_evidence: list[dict],
    communication_confidence: float,
    overall_score: int,
    overall_confidence: float,
    bias_flags: list[str] | None = None,
    hiring_recommendation: str | None = None,
    hiring_confidence: float | None = None,
    hiring_reasoning: dict | None = None,
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """
    Store evaluation results to the database and trigger SSE update.

    Use this tool AFTER analyzing all dimensions to persist the final evaluation.
    This also triggers a real-time update to any connected frontend clients.

    Args:
        session_id: The session recording ID
        candidate_id: The candidate ID
        code_quality_score: Score 0-100 for code quality dimension
        code_quality_evidence: Evidence list for code quality
        code_quality_confidence: Confidence 0-1 for code quality
        problem_solving_score: Score 0-100 for problem solving dimension
        problem_solving_evidence: Evidence list for problem solving
        problem_solving_confidence: Confidence 0-1 for problem solving
        ai_collaboration_score: Score 0-100 for AI collaboration dimension
        ai_collaboration_evidence: Evidence list for AI collaboration
        ai_collaboration_confidence: Confidence 0-1 for AI collaboration
        communication_score: Score 0-100 for communication dimension
        communication_evidence: Evidence list for communication
        communication_confidence: Confidence 0-1 for communication
        overall_score: Weighted overall score 0-100
        overall_confidence: Overall confidence 0-1
        bias_flags: Optional list of detected bias flags
        hiring_recommendation: Optional hiring recommendation (strong_yes, yes, maybe, no, strong_no)
        hiring_confidence: Optional confidence in hiring recommendation
        hiring_reasoning: Optional reasoning for hiring recommendation

    Returns:
        Dict with success status, evaluation_id, and any errors
    """
    import json
    import httpx

    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            # Check if evaluation already exists for this session
            existing = await conn.fetchval(
                "SELECT id FROM evaluations WHERE session_id = $1",
                session_id
            )

            if existing:
                # Update existing evaluation
                await conn.execute("""
                    UPDATE evaluations SET
                        code_quality_score = $1,
                        code_quality_evidence = $2,
                        code_quality_confidence = $3,
                        problem_solving_score = $4,
                        problem_solving_evidence = $5,
                        problem_solving_confidence = $6,
                        ai_collaboration_score = $7,
                        ai_collaboration_evidence = $8,
                        ai_collaboration_confidence = $9,
                        communication_score = $10,
                        communication_evidence = $11,
                        communication_confidence = $12,
                        overall_score = $13,
                        confidence = $14,
                        bias_flags = $15,
                        hiring_recommendation = $16,
                        hiring_confidence = $17,
                        hiring_reasoning = $18,
                        evaluated_at = NOW(),
                        updated_at = NOW()
                    WHERE session_id = $19
                """,
                    code_quality_score,
                    json.dumps(code_quality_evidence),
                    code_quality_confidence,
                    problem_solving_score,
                    json.dumps(problem_solving_evidence),
                    problem_solving_confidence,
                    ai_collaboration_score,
                    json.dumps(ai_collaboration_evidence),
                    ai_collaboration_confidence,
                    communication_score,
                    json.dumps(communication_evidence),
                    communication_confidence,
                    overall_score,
                    overall_confidence,
                    bias_flags or [],
                    hiring_recommendation,
                    hiring_confidence,
                    json.dumps(hiring_reasoning) if hiring_reasoning else None,
                    session_id,
                )
                evaluation_id = existing
            else:
                # Insert new evaluation
                evaluation_id = await conn.fetchval("""
                    INSERT INTO evaluations (
                        id, candidate_id, session_id,
                        code_quality_score, code_quality_evidence, code_quality_confidence,
                        problem_solving_score, problem_solving_evidence, problem_solving_confidence,
                        ai_collaboration_score, ai_collaboration_evidence, ai_collaboration_confidence,
                        communication_score, communication_evidence, communication_confidence,
                        overall_score, confidence, bias_flags,
                        hiring_recommendation, hiring_confidence, hiring_reasoning,
                        evaluated_at, created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), $1, $2,
                        $3, $4, $5,
                        $6, $7, $8,
                        $9, $10, $11,
                        $12, $13, $14,
                        $15, $16, $17,
                        $18, $19, $20,
                        NOW(), NOW(), NOW()
                    )
                    RETURNING id
                """,
                    candidate_id, session_id,
                    code_quality_score, json.dumps(code_quality_evidence), code_quality_confidence,
                    problem_solving_score, json.dumps(problem_solving_evidence), problem_solving_confidence,
                    ai_collaboration_score, json.dumps(ai_collaboration_evidence), ai_collaboration_confidence,
                    communication_score, json.dumps(communication_evidence), communication_confidence,
                    overall_score, overall_confidence, bias_flags or [],
                    hiring_recommendation, hiring_confidence,
                    json.dumps(hiring_reasoning) if hiring_reasoning else None,
                )

            # Update candidate status to EVALUATED
            await conn.execute("""
                UPDATE candidates
                SET status = 'EVALUATED', overall_score = $1, updated_at = NOW()
                WHERE id = $2
            """, overall_score, candidate_id)

        # Trigger SSE notification to frontend
        sse_payload = {
            "sessionId": session_id,
            "candidateId": candidate_id,
            "evaluationId": str(evaluation_id),
            "type": "evaluation_complete",
            "overallScore": overall_score,
            "codeQualityScore": code_quality_score,
            "problemSolvingScore": problem_solving_score,
            "aiCollaborationScore": ai_collaboration_score,
            "communicationScore": communication_score,
            "confidence": overall_confidence,
        }

        # Call Next.js internal API to broadcast SSE event
        try:
            async with httpx.AsyncClient() as client:
                # Use internal API URL (localhost in dev, internal service URL in prod)
                internal_url = settings.nextjs_internal_url or "http://localhost:3000"
                await client.post(
                    f"{internal_url}/api/internal/evaluation/notify",
                    json=sse_payload,
                    timeout=5.0,
                )
        except Exception as sse_error:
            # Log but don't fail - SSE notification is best-effort
            print(f"[EvaluationTools] SSE notification failed: {sse_error}")

        return {
            "success": True,
            "evaluation_id": str(evaluation_id),
            "message": "Evaluation result stored successfully",
        }

    except Exception as e:
        print(f"[EvaluationTools] Error storing evaluation: {e}")
        return {
            "success": False,
            "error": str(e),
        }


@tool
async def send_evaluation_progress(
    session_id: str,
    candidate_id: str,
    status: str,
    progress_percent: int,
    current_step: str,
    details: dict | None = None,
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """
    Send real-time progress update to frontend during evaluation.

    Use this tool to notify the frontend about evaluation progress as you work
    through different analysis steps.

    Args:
        session_id: The session recording ID
        candidate_id: The candidate ID
        status: Current status (analyzing, scoring, finalizing)
        progress_percent: Progress percentage 0-100
        current_step: Human-readable description of current step
        details: Optional additional details

    Returns:
        Dict with success status
    """
    import httpx

    sse_payload = {
        "sessionId": session_id,
        "candidateId": candidate_id,
        "type": "evaluation_progress",
        "status": status,
        "progressPercent": progress_percent,
        "currentStep": current_step,
        "details": details or {},
        "timestamp": datetime.utcnow().isoformat(),
    }

    try:
        async with httpx.AsyncClient() as client:
            internal_url = settings.nextjs_internal_url or "http://localhost:3000"
            await client.post(
                f"{internal_url}/api/internal/evaluation/notify",
                json=sse_payload,
                timeout=5.0,
            )
        return {"success": True}
    except Exception as e:
        print(f"[EvaluationTools] Progress notification failed: {e}")
        return {"success": False, "error": str(e)}


# =============================================================================
# Tool Lists
# =============================================================================

# Database query tools for fetching session data
DB_QUERY_TOOLS = [
    get_session_metadata,
    get_claude_interactions,
    get_test_results,
    get_code_snapshots,  # Use this instead of workspace exploration (sandbox may have expired)
]

# Analysis tools for scoring dimensions
ANALYSIS_TOOLS = [
    analyze_code_quality,
    analyze_problem_solving,
    analyze_ai_collaboration,
    analyze_communication,
]

# Storage and notification tools
STORAGE_TOOLS = [
    store_evaluation_result,
    send_evaluation_progress,
]

# All evaluation tools (DB query + analysis + storage)
EVALUATION_TOOLS = DB_QUERY_TOOLS + ANALYSIS_TOOLS + STORAGE_TOOLS
