"""
Evaluation tools for the LangGraph Evaluation Agent.

These tools analyze code, problem-solving approaches, AI collaboration,
and communication skills with evidence-based scoring.

Also includes database query tools for fetching session data.
"""

import re
from datetime import datetime
from typing import Annotated, Any

import asyncpg
from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_core.tools.base import InjectedToolCallId
from langgraph.types import Command

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
async def get_agent_questions(
    session_id: str,
    config: RunnableConfig,
) -> dict[str, Any]:
    """
    Fetch all clarifying questions the AI agent asked and candidate responses.

    Use this to evaluate the quality of the AI collaboration - how the agent
    asked questions before taking action, and how the candidate responded.

    Handles both single questions (ask_question) and batch questions (ask_questions).

    Args:
        session_id: The session recording ID

    Returns:
        Dict with questions list containing questionId, questionText, options,
        multiSelect, context, candidateAnswer, selectedOptions, and responseTime
    """
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                data,
                timestamp,
                event_type
            FROM session_event_logs
            WHERE session_id = $1
            AND event_type IN (
                'agent.question_asked', 'agent.question_answered',
                'agent.questions_asked', 'agent.questions_answered'
            )
            ORDER BY sequence_number ASC
        """, session_id)

        # Pair questions with answers
        questions: list[dict] = []
        pending_questions: dict[str, dict] = {}
        batch_timestamps: dict[str, Any] = {}  # Track batch timestamps

        for row in rows:
            data = row["data"] if isinstance(row["data"], dict) else {}
            event_type = row["event_type"]
            timestamp = row["timestamp"]

            # Single question asked
            if event_type == "agent.question_asked":
                question_id = data.get("questionId", "")
                pending_questions[question_id] = {
                    "questionId": question_id,
                    "questionText": data.get("questionText", ""),
                    "options": data.get("options", []),
                    "multiSelect": data.get("multiSelect", False),
                    "allowCustomAnswer": data.get("allowCustomAnswer", True),
                    "context": data.get("context"),
                    "batchId": None,
                    "askedAt": timestamp.isoformat() if timestamp else None,
                    "candidateAnswer": None,
                    "selectedOptions": None,
                    "responseTimeMs": None,
                }

            # Batch questions asked
            elif event_type == "agent.questions_asked":
                batch_id = data.get("batchId", "")
                batch_context = data.get("batchContext")
                batch_timestamps[batch_id] = timestamp

                for q_data in data.get("questions", []):
                    question_id = q_data.get("questionId", "")
                    pending_questions[question_id] = {
                        "questionId": question_id,
                        "questionText": q_data.get("questionText", ""),
                        "options": q_data.get("options", []),
                        "multiSelect": q_data.get("multiSelect", False),
                        "allowCustomAnswer": q_data.get("allowCustomAnswer", True),
                        "context": q_data.get("context") or batch_context,
                        "batchId": batch_id,
                        "askedAt": timestamp.isoformat() if timestamp else None,
                        "candidateAnswer": None,
                        "selectedOptions": None,
                        "responseTimeMs": None,
                    }

            # Single question answered
            elif event_type == "agent.question_answered":
                question_id = data.get("questionId", "")
                if question_id in pending_questions:
                    q = pending_questions[question_id]
                    # Determine the answer
                    answer = data.get("selectedOption") or data.get("customAnswer")
                    q["candidateAnswer"] = answer
                    q["wasCustomAnswer"] = bool(data.get("customAnswer"))

                    # Calculate response time
                    if q["askedAt"] and timestamp:
                        from datetime import datetime as dt
                        asked_time = dt.fromisoformat(q["askedAt"].replace("Z", "+00:00"))
                        if hasattr(asked_time, 'timestamp') and hasattr(timestamp, 'timestamp'):
                            q["responseTimeMs"] = int((timestamp.timestamp() - asked_time.timestamp()) * 1000)

                    questions.append(q)
                    del pending_questions[question_id]

            # Batch questions answered
            elif event_type == "agent.questions_answered":
                batch_id = data.get("batchId", "")
                answers_list = data.get("answers", [])

                for answer_data in answers_list:
                    question_id = answer_data.get("questionId", "")
                    if question_id in pending_questions:
                        q = pending_questions[question_id]

                        # Handle both single-select and multi-select answers
                        selected_options = answer_data.get("selectedOptions")
                        selected_option = answer_data.get("selectedOption")
                        custom_answer = answer_data.get("customAnswer")

                        if selected_options and len(selected_options) > 0:
                            # Multi-select answer
                            q["selectedOptions"] = selected_options
                            q["candidateAnswer"] = ", ".join(selected_options)
                            if custom_answer:
                                q["candidateAnswer"] += f", {custom_answer}"
                            q["wasMultiSelect"] = True
                        else:
                            # Single-select answer
                            q["candidateAnswer"] = selected_option or custom_answer
                            q["wasMultiSelect"] = False

                        q["wasCustomAnswer"] = bool(custom_answer)

                        # Calculate response time from batch timestamp
                        if q["askedAt"] and timestamp:
                            from datetime import datetime as dt
                            asked_time = dt.fromisoformat(q["askedAt"].replace("Z", "+00:00"))
                            if hasattr(asked_time, 'timestamp') and hasattr(timestamp, 'timestamp'):
                                q["responseTimeMs"] = int((timestamp.timestamp() - asked_time.timestamp()) * 1000)

                        questions.append(q)
                        del pending_questions[question_id]

        # Add any unanswered questions
        for q in pending_questions.values():
            q["candidateAnswer"] = None
            q["wasCustomAnswer"] = False
            q["wasMultiSelect"] = False
            questions.append(q)

        # Summary stats
        answered_count = sum(1 for q in questions if q["candidateAnswer"])
        custom_answer_count = sum(1 for q in questions if q.get("wasCustomAnswer"))
        multi_select_count = sum(1 for q in questions if q.get("wasMultiSelect"))
        avg_response_time = None
        response_times = [q["responseTimeMs"] for q in questions if q["responseTimeMs"]]
        if response_times:
            avg_response_time = sum(response_times) / len(response_times)

        # Count unique batches
        batch_ids = set(q.get("batchId") for q in questions if q.get("batchId"))

        return {
            "success": True,
            "count": len(questions),
            "answeredCount": answered_count,
            "customAnswerCount": custom_answer_count,
            "multiSelectCount": multi_select_count,
            "batchCount": len(batch_ids),
            "avgResponseTimeMs": avg_response_time,
            "questions": questions,
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
    debugging_score = 50.0  # Default neutral

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
    terminal_score = 50.0  # Default

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
        clarity = 50.0
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
    specificity = sum(specificity_scores) / len(specificity_scores) if specificity_scores else 50.0
    clarity = sum(clarity_scores) / len(clarity_scores) if clarity_scores else 50.0
    technical_depth = sum(technical_depth_scores) / len(technical_depth_scores) if technical_depth_scores else 50.0

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
# Question Evaluation Submission Tool (for Question Evaluation Agent)
# =============================================================================


@tool
def submit_question_evaluation(
    overall_score: int,
    problem_completion_score: int,
    problem_completion_feedback: str,
    code_quality_score: int,
    code_quality_feedback: str,
    best_practices_score: int,
    best_practices_feedback: str,
    error_handling_score: int,
    error_handling_feedback: str,
    efficiency_score: int,
    efficiency_feedback: str,
    feedback: str,
    strengths: list[str],
    improvements: list[str],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """Submit the final evaluation result after evaluating the candidate's code.

    IMPORTANT: You MUST call this tool at the end of your evaluation to submit
    the results. The evaluation is not complete until this tool is called.

    Each criterion is scored 0-20 points, totaling 100 points maximum.

    Args:
        overall_score: Total score (0-100), should equal sum of all criteria scores
        problem_completion_score: Score for problem completion (0-20)
        problem_completion_feedback: Feedback for problem completion
        code_quality_score: Score for code quality (0-20)
        code_quality_feedback: Feedback for code quality
        best_practices_score: Score for best practices (0-20)
        best_practices_feedback: Feedback for best practices
        error_handling_score: Score for error handling (0-20)
        error_handling_feedback: Feedback for error handling
        efficiency_score: Score for efficiency (0-20)
        efficiency_feedback: Feedback for efficiency
        feedback: Overall feedback paragraph summarizing the evaluation
        strengths: List of 2-3 key strengths demonstrated
        improvements: List of 2-3 areas for improvement

    Returns:
        Command that updates the agent state with evaluation_result
    """
    # Validate scores are in range
    def clamp(val: int, min_val: int, max_val: int) -> int:
        return max(min_val, min(max_val, val))

    problem_completion_score = clamp(problem_completion_score, 0, 20)
    code_quality_score = clamp(code_quality_score, 0, 20)
    best_practices_score = clamp(best_practices_score, 0, 20)
    error_handling_score = clamp(error_handling_score, 0, 20)
    efficiency_score = clamp(efficiency_score, 0, 20)

    # Recalculate overall score from criteria
    calculated_score = (
        problem_completion_score +
        code_quality_score +
        best_practices_score +
        error_handling_score +
        efficiency_score
    )

    # Use calculated score if provided score doesn't match
    if overall_score != calculated_score:
        overall_score = calculated_score

    overall_score = clamp(overall_score, 0, 100)

    # Build the evaluation result structure (matches QuestionEvaluationResult TypedDict)
    evaluation_result = {
        "overall_score": overall_score,
        "passed": overall_score >= 70,  # Default passing threshold
        "criteria": {
            "problem_completion": {
                "score": problem_completion_score,
                "feedback": problem_completion_feedback,
            },
            "code_quality": {
                "score": code_quality_score,
                "feedback": code_quality_feedback,
            },
            "best_practices": {
                "score": best_practices_score,
                "feedback": best_practices_feedback,
            },
            "error_handling": {
                "score": error_handling_score,
                "feedback": error_handling_feedback,
            },
            "efficiency": {
                "score": efficiency_score,
                "feedback": efficiency_feedback,
            },
        },
        "feedback": feedback,
        "strengths": strengths[:5] if strengths else [],  # Limit to 5
        "improvements": improvements[:5] if improvements else [],  # Limit to 5
        "evaluated_at": datetime.utcnow().isoformat(),
        "model": settings.evaluation_agent_model,
    }

    return Command(
        update={
            "evaluation_result": evaluation_result,
            "evaluation_complete": True,
            "messages": [
                ToolMessage(
                    content=f"Evaluation submitted successfully. Score: {overall_score}/100 ({'PASSED' if overall_score >= 70 else 'FAILED'})",
                    tool_call_id=tool_call_id,
                )
            ],
        }
    )


# Question evaluation submission tool (for Question Evaluation Agent)
QUESTION_EVALUATION_TOOLS = [submit_question_evaluation]


# =============================================================================
# Tool Lists
# =============================================================================

# Database query tools for fetching session data
DB_QUERY_TOOLS = [
    get_session_metadata,
    get_claude_interactions,
    get_test_results,
    get_code_snapshots,  # Use this instead of workspace exploration (sandbox may have expired)
    get_agent_questions,  # Clarifying questions asked by the agent and candidate responses
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


# =============================================================================
# Comprehensive Evaluation Tools (for ComprehensiveEvaluationAgent)
# =============================================================================


@tool
async def generate_actionable_report(
    session_id: str,
    role: str,
    seniority: str,
    code_quality_score: int,
    problem_solving_score: int,
    ai_collaboration_score: int,
    communication_score: int,
    overall_score: int,
    code_quality_evidence: list[dict],
    problem_solving_evidence: list[dict],
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """
    Generate actionable report with Skills Gap Matrix and Development Roadmap.

    Use this after scoring all dimensions to create a hiring manager-ready report.

    Args:
        session_id: Session ID
        role: Target role (e.g., "Backend Engineer")
        seniority: Seniority level (e.g., "Senior", "Mid", "Junior")
        code_quality_score: Code quality dimension score (0-100)
        problem_solving_score: Problem solving dimension score (0-100)
        ai_collaboration_score: AI collaboration dimension score (0-100)
        communication_score: Communication dimension score (0-100)
        overall_score: Weighted overall score (0-100)
        code_quality_evidence: Evidence list for code quality
        problem_solving_evidence: Evidence list for problem solving

    Returns:
        Dict with skills_matrix, development_roadmap, interview_insights, onboarding_notes
    """
    # Determine skill gaps based on expected level
    seniority_expectations = {
        "Junior": {"code_quality": 60, "problem_solving": 55, "ai_collaboration": 50, "communication": 50},
        "Mid": {"code_quality": 70, "problem_solving": 65, "ai_collaboration": 60, "communication": 60},
        "Senior": {"code_quality": 80, "problem_solving": 75, "ai_collaboration": 70, "communication": 70},
        "Staff": {"code_quality": 85, "problem_solving": 80, "ai_collaboration": 75, "communication": 80},
    }

    expected = seniority_expectations.get(seniority, seniority_expectations["Mid"])

    skills_matrix = {
        "code_quality": {
            "score": code_quality_score,
            "expected": expected["code_quality"],
            "gap": max(0, expected["code_quality"] - code_quality_score),
            "status": "exceeds" if code_quality_score >= expected["code_quality"] else "below",
        },
        "problem_solving": {
            "score": problem_solving_score,
            "expected": expected["problem_solving"],
            "gap": max(0, expected["problem_solving"] - problem_solving_score),
            "status": "exceeds" if problem_solving_score >= expected["problem_solving"] else "below",
        },
        "ai_collaboration": {
            "score": ai_collaboration_score,
            "expected": expected["ai_collaboration"],
            "gap": max(0, expected["ai_collaboration"] - ai_collaboration_score),
            "status": "exceeds" if ai_collaboration_score >= expected["ai_collaboration"] else "below",
        },
        "communication": {
            "score": communication_score,
            "expected": expected["communication"],
            "gap": max(0, expected["communication"] - communication_score),
            "status": "exceeds" if communication_score >= expected["communication"] else "below",
        },
    }

    # Find areas needing development
    gaps: list[tuple[str, int]] = [(k, v["gap"]) for k, v in skills_matrix.items() if v["gap"] > 0]  # type: ignore[misc,operator]
    gaps.sort(key=lambda x: x[1], reverse=True)

    # Generate development roadmap
    development_roadmap = []
    for skill, gap in gaps[:3]:  # Top 3 gaps
        if skill == "code_quality":
            development_roadmap.append({
                "area": "Code Quality",
                "priority": "high" if gap > 15 else "medium",
                "actions": [
                    "Focus on test coverage and edge case handling",
                    "Practice code review and refactoring exercises",
                    "Study design patterns for the target language",
                ],
                "timeframe": "1-2 months" if gap <= 10 else "2-3 months",
            })
        elif skill == "problem_solving":
            development_roadmap.append({
                "area": "Problem Solving",
                "priority": "high" if gap > 15 else "medium",
                "actions": [
                    "Practice algorithm challenges with focus on approach explanation",
                    "Work on breaking down complex problems into steps",
                    "Learn systematic debugging techniques",
                ],
                "timeframe": "1-2 months" if gap <= 10 else "2-3 months",
            })
        elif skill == "ai_collaboration":
            development_roadmap.append({
                "area": "AI Collaboration",
                "priority": "medium" if gap > 10 else "low",
                "actions": [
                    "Practice writing specific, contextual prompts",
                    "Learn to validate and understand AI suggestions",
                    "Balance AI assistance with independent problem-solving",
                ],
                "timeframe": "2-4 weeks",
            })
        elif skill == "communication":
            development_roadmap.append({
                "area": "Communication",
                "priority": "medium" if gap > 10 else "low",
                "actions": [
                    "Practice explaining technical decisions in writing",
                    "Improve code documentation habits",
                    "Work on structuring technical explanations",
                ],
                "timeframe": "2-4 weeks",
            })

    # Interview insights
    interview_insights: dict[str, list[str]] = {
        "follow_up_topics": [],
        "areas_to_probe": [],
        "positive_signals": [],
    }

    if code_quality_score >= expected["code_quality"]:
        interview_insights["positive_signals"].append("Strong code quality fundamentals")
    else:
        interview_insights["areas_to_probe"].append("Code organization and testing practices")

    if problem_solving_score >= expected["problem_solving"]:
        interview_insights["positive_signals"].append("Good problem-solving approach")
    else:
        interview_insights["areas_to_probe"].append("Algorithm design and debugging methodology")

    if ai_collaboration_score >= expected["ai_collaboration"]:
        interview_insights["positive_signals"].append("Effective AI tool usage")
    else:
        interview_insights["follow_up_topics"].append("Experience with AI coding assistants")

    # Onboarding notes
    onboarding_notes = {
        "recommended_mentorship_areas": [skill for skill, gap in gaps[:2]] if gaps else [],
        "pair_programming_suggested": code_quality_score < expected["code_quality"],
        "estimated_ramp_up": "standard" if overall_score >= 70 else "extended",
        "strengths_to_leverage": [
            skill for skill, data in skills_matrix.items()
            if data["status"] == "exceeds"
        ],
    }

    return {
        "success": True,
        "skills_matrix": skills_matrix,
        "development_roadmap": development_roadmap,
        "interview_insights": interview_insights,
        "onboarding_notes": onboarding_notes,
    }


@tool
async def generate_hiring_recommendation(
    overall_score: int,
    code_quality_score: int,
    problem_solving_score: int,
    ai_collaboration_score: int,
    communication_score: int,
    role: str,
    seniority: str,
    bias_flags: list[str] | None = None,
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """
    Generate hiring recommendation with confidence and detailed reasoning.

    Call this after scoring all dimensions to get a final hiring decision.

    Args:
        overall_score: Weighted overall score (0-100)
        code_quality_score: Code quality score (0-100)
        problem_solving_score: Problem solving score (0-100)
        ai_collaboration_score: AI collaboration score (0-100)
        communication_score: Communication score (0-100)
        role: Target role
        seniority: Seniority level
        bias_flags: Optional list of detected bias flags

    Returns:
        Dict with decision, confidence, and detailed reasoning
    """
    # Score thresholds by seniority
    thresholds = {
        "Junior": {"strong_yes": 75, "yes": 60, "maybe": 50},
        "Mid": {"strong_yes": 80, "yes": 65, "maybe": 55},
        "Senior": {"strong_yes": 85, "yes": 70, "maybe": 60},
        "Staff": {"strong_yes": 90, "yes": 75, "maybe": 65},
    }

    threshold = thresholds.get(seniority, thresholds["Mid"])

    # Determine decision
    if overall_score >= threshold["strong_yes"]:
        decision = "strong_yes"
    elif overall_score >= threshold["yes"]:
        decision = "yes"
    elif overall_score >= threshold["maybe"]:
        decision = "maybe"
    elif overall_score >= threshold["maybe"] - 10:
        decision = "no"
    else:
        decision = "strong_no"

    # Calculate confidence (higher when scores are consistent)
    scores = [code_quality_score, problem_solving_score, ai_collaboration_score, communication_score]
    score_variance = sum((s - overall_score) ** 2 for s in scores) / len(scores)
    score_std = score_variance ** 0.5

    # Lower variance = higher confidence
    if score_std < 10:
        confidence = 0.9
    elif score_std < 15:
        confidence = 0.8
    elif score_std < 20:
        confidence = 0.7
    else:
        confidence = 0.6

    # Reduce confidence if bias flags present
    if bias_flags and len(bias_flags) > 0:
        confidence *= 0.9

    # Build reasoning
    primary_factors = []
    concerns = []

    if code_quality_score >= 75:
        primary_factors.append(f"Strong code quality ({code_quality_score}/100)")
    elif code_quality_score < 60:
        concerns.append(f"Code quality below expectations ({code_quality_score}/100)")

    if problem_solving_score >= 70:
        primary_factors.append(f"Effective problem-solving approach ({problem_solving_score}/100)")
    elif problem_solving_score < 55:
        concerns.append(f"Problem-solving needs development ({problem_solving_score}/100)")

    if ai_collaboration_score >= 65:
        primary_factors.append(f"Good AI collaboration skills ({ai_collaboration_score}/100)")
    elif ai_collaboration_score < 50:
        concerns.append(f"AI collaboration could improve ({ai_collaboration_score}/100)")

    if communication_score >= 70:
        primary_factors.append(f"Clear communication ({communication_score}/100)")
    elif communication_score < 55:
        concerns.append(f"Communication needs improvement ({communication_score}/100)")

    # Growth potential assessment
    growth_potential = "high"
    if overall_score < 50:
        growth_potential = "uncertain"
    elif overall_score < 65:
        growth_potential = "moderate"
    elif code_quality_score > problem_solving_score + 15:
        growth_potential = "high (strong foundations, can develop approach)"

    reasoning = {
        "primary_factors": primary_factors,
        "concerns": concerns,
        "growth_potential": growth_potential,
        "seniority_fit": f"Score of {overall_score} {'meets' if overall_score >= threshold['yes'] else 'below'} {seniority} expectations",
    }

    if bias_flags:
        reasoning["bias_warning"] = f"Detected {len(bias_flags)} potential bias flag(s)"

    return {
        "success": True,
        "decision": decision,
        "confidence": round(confidence, 2),
        "reasoning": reasoning,
        "score_summary": {
            "overall": overall_score,
            "code_quality": code_quality_score,
            "problem_solving": problem_solving_score,
            "ai_collaboration": ai_collaboration_score,
            "communication": communication_score,
        },
    }


@tool
async def detect_evaluation_bias(
    session_id: str,
    code_quality_score: int,
    problem_solving_score: int,
    ai_collaboration_score: int,
    communication_score: int,
    overall_score: int,
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """
    Detect potential evaluation biases and generate fairness report.

    Call this before finalizing evaluation to check for bias issues.

    Args:
        session_id: Session ID
        code_quality_score: Code quality score (0-100)
        problem_solving_score: Problem solving score (0-100)
        ai_collaboration_score: AI collaboration score (0-100)
        communication_score: Communication score (0-100)
        overall_score: Weighted overall score (0-100)

    Returns:
        Dict with bias_flags list and fairness_report
    """
    bias_flags: list[str] = []
    fairness_report: dict[str, Any] = {
        "consistency_check": "pass",
        "weighting_check": "pass",
        "evidence_check": "pass",
        "recommendations": [],
    }

    # Check for score consistency
    scores = [code_quality_score, problem_solving_score, ai_collaboration_score, communication_score]
    max_score = max(scores)
    min_score = min(scores)

    if max_score - min_score > 40:
        bias_flags.append("large_score_variance")
        fairness_report["consistency_check"] = "warning"
        fairness_report["recommendations"].append(
            "Large variance between dimension scores - verify all dimensions had sufficient evidence"
        )

    # Check for extreme scores
    for i, (score, name) in enumerate(zip(scores, ["code_quality", "problem_solving", "ai_collaboration", "communication"])):
        if score == 0:
            bias_flags.append(f"zero_score_{name}")
            fairness_report["evidence_check"] = "warning"
            fairness_report["recommendations"].append(
                f"Zero score for {name} - ensure this reflects actual performance, not missing data"
            )
        elif score == 100:
            bias_flags.append(f"perfect_score_{name}")
            fairness_report["recommendations"].append(
                f"Perfect score for {name} - verify this is justified with evidence"
            )

    # Check weighting calculation
    expected_overall = (
        code_quality_score * 0.40 +
        problem_solving_score * 0.25 +
        ai_collaboration_score * 0.20 +
        communication_score * 0.15
    )

    if abs(overall_score - expected_overall) > 5:
        bias_flags.append("weighting_mismatch")
        fairness_report["weighting_check"] = "warning"
        fairness_report["recommendations"].append(
            f"Overall score ({overall_score}) differs from calculated weighted score ({expected_overall:.1f})"
        )

    return {
        "success": True,
        "bias_flags": bias_flags,
        "fairness_report": fairness_report,
        "bias_count": len(bias_flags),
        "is_fair": len(bias_flags) == 0,
    }


@tool
def submit_comprehensive_evaluation(
    session_id: str,
    candidate_id: str,
    code_quality_score: int,
    code_quality_confidence: float,
    code_quality_evidence: list[dict],
    problem_solving_score: int,
    problem_solving_confidence: float,
    problem_solving_evidence: list[dict],
    ai_collaboration_score: int,
    ai_collaboration_confidence: float,
    ai_collaboration_evidence: list[dict],
    communication_score: int,
    communication_confidence: float,
    communication_evidence: list[dict],
    overall_score: int,
    overall_confidence: float,
    hiring_decision: str,
    hiring_confidence: float,
    hiring_reasoning: dict,
    actionable_report: dict,
    bias_flags: list[str],
    fairness_report: dict,
    expertise_level: str,
    expertise_growth_trend: str,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Submit comprehensive evaluation result. MUST be called to complete evaluation.

    This stores all evaluation data, actionable report, and hiring recommendation.

    Args:
        session_id: Session ID
        candidate_id: Candidate ID
        code_quality_score: Score 0-100
        code_quality_confidence: Confidence 0-1
        code_quality_evidence: Evidence list
        problem_solving_score: Score 0-100
        problem_solving_confidence: Confidence 0-1
        problem_solving_evidence: Evidence list
        ai_collaboration_score: Score 0-100
        ai_collaboration_confidence: Confidence 0-1
        ai_collaboration_evidence: Evidence list
        communication_score: Score 0-100
        communication_confidence: Confidence 0-1
        communication_evidence: Evidence list
        overall_score: Weighted overall score 0-100
        overall_confidence: Overall confidence 0-1
        hiring_decision: strong_yes/yes/maybe/no/strong_no
        hiring_confidence: Confidence in hiring decision 0-1
        hiring_reasoning: Dict with primary_factors, concerns, growth_potential
        actionable_report: Dict with skills_matrix, development_roadmap, etc.
        bias_flags: List of detected bias flags
        fairness_report: Dict with bias analysis
        expertise_level: Estimated expertise level (junior/mid/senior/staff)
        expertise_growth_trend: Growth trajectory (improving/stable/declining)

    Returns:
        Command that updates agent state with evaluation_result
    """
    evaluation_result = {
        "session_id": session_id,
        "candidate_id": candidate_id,
        "code_quality": {
            "score": code_quality_score,
            "confidence": code_quality_confidence,
            "evidence": code_quality_evidence,
        },
        "problem_solving": {
            "score": problem_solving_score,
            "confidence": problem_solving_confidence,
            "evidence": problem_solving_evidence,
        },
        "ai_collaboration": {
            "score": ai_collaboration_score,
            "confidence": ai_collaboration_confidence,
            "evidence": ai_collaboration_evidence,
        },
        "communication": {
            "score": communication_score,
            "confidence": communication_confidence,
            "evidence": communication_evidence,
        },
        "overall_score": overall_score,
        "overall_confidence": overall_confidence,
        "expertise_level": expertise_level,
        "expertise_growth_trend": expertise_growth_trend,
        "bias_flags": bias_flags,
        "bias_detection": {
            "flags": bias_flags,
            "report": fairness_report,
        },
        "fairness_report": fairness_report,
        "hiring_recommendation": {
            "decision": hiring_decision,
            "confidence": hiring_confidence,
            "reasoning": hiring_reasoning,
        },
        "actionable_report": actionable_report,
        "evaluated_at": datetime.utcnow().isoformat(),
        "model": settings.comprehensive_evaluation_model,
    }

    return Command(
        update={
            "evaluation_result": evaluation_result,
            "evaluation_complete": True,
            "messages": [
                ToolMessage(
                    content=f"Comprehensive evaluation submitted. Overall: {overall_score}/100, Hiring: {hiring_decision} ({hiring_confidence:.0%} confidence)",
                    tool_call_id=tool_call_id,
                )
            ],
        }
    )


# Comprehensive evaluation tools list
COMPREHENSIVE_TOOLS = [
    generate_actionable_report,
    generate_hiring_recommendation,
    detect_evaluation_bias,
    submit_comprehensive_evaluation,
]

# All tools for comprehensive evaluation agent
ALL_COMPREHENSIVE_EVALUATION_TOOLS = (
    DB_QUERY_TOOLS +
    ANALYSIS_TOOLS +
    COMPREHENSIVE_TOOLS +
    [send_evaluation_progress]
)
