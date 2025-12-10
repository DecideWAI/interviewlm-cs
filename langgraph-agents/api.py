"""
LangGraph HTTP API Server

FastAPI server providing HTTP endpoints for the LangGraph multi-agent system.
Supports both REST endpoints and Server-Sent Events (SSE) for streaming responses.

Endpoints:
- POST /api/coding/chat - Chat with coding agent (streaming SSE)
- POST /api/interview/event - Record interview event
- POST /api/evaluation/evaluate - Evaluate a completed session
- POST /api/supervisor/workflow - Run multi-agent workflow
- GET /health - Health check
"""

import asyncio
import json
from datetime import datetime
from typing import AsyncGenerator, Literal, Optional
from contextlib import asynccontextmanager

import os
import secrets
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
import uvicorn

from agents import (
    create_coding_agent,
    create_interview_agent,
    create_evaluation_agent,
    create_question_evaluation_agent,
    create_supervisor,
)
from config import settings


# =============================================================================
# Authentication
# =============================================================================

# API key for authenticating requests from Next.js server
# In production, this should be a secure, randomly generated key
LANGGRAPH_API_KEY = os.environ.get("LANGGRAPH_API_KEY", "")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3003").split(",")

security = HTTPBearer(auto_error=False)


async def verify_api_key(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> bool:
    """Verify API key from Authorization header."""
    # Skip auth in development mode if no API key is configured
    if not LANGGRAPH_API_KEY:
        return True

    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Compare using constant-time comparison to prevent timing attacks
    if not secrets.compare_digest(credentials.credentials, LANGGRAPH_API_KEY):
        raise HTTPException(
            status_code=401,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return True


# =============================================================================
# Request/Response Models
# =============================================================================

class CodingChatRequest(BaseModel):
    """Request for coding agent chat."""
    session_id: str
    candidate_id: str
    message: str
    helpfulness_level: Literal["consultant", "pair-programming", "full-copilot"] = "pair-programming"
    problem_statement: Optional[str] = None
    code_context: Optional[dict] = None


class CodingChatResponse(BaseModel):
    """Response from coding agent chat (non-streaming)."""
    text: str
    tools_used: list[str]
    files_modified: list[str]
    metadata: dict


class InterviewEventRequest(BaseModel):
    """Request to record an interview event."""
    session_id: str
    candidate_id: str
    event_type: Literal[
        "session-started",
        "ai-interaction",
        "code-changed",
        "test-run",
        "question-answered",
        "session-completed",
    ]
    event_data: dict = Field(default_factory=dict)


class InterviewMetricsResponse(BaseModel):
    """Response with current interview metrics."""
    session_id: str
    irt_theta: float
    current_difficulty: int
    recommended_next_difficulty: int
    ai_dependency_score: float
    questions_answered: int
    struggling_indicators: list[str]


class EvaluationRequest(BaseModel):
    """Request to evaluate a completed session.

    The evaluation agent uses agentic discovery - it will:
    1. Query the database for session metadata, interactions, and test results
    2. Explore the Modal workspace to read code files
    3. Analyze and score across all 4 dimensions
    """
    session_id: str
    candidate_id: str


class EvaluationResponse(BaseModel):
    """Evaluation result response."""
    session_id: str
    candidate_id: str
    overall_score: int
    code_quality: dict
    problem_solving: dict
    ai_collaboration: dict
    communication: dict
    confidence: float
    bias_flags: list[str]


class QuestionEvaluationRequest(BaseModel):
    """Request to evaluate a single question submission."""
    session_id: str
    candidate_id: str
    question_id: str
    question_title: str
    question_description: str
    question_difficulty: str = "medium"
    question_requirements: Optional[list[str]] = None
    code: str
    language: str
    file_name: Optional[str] = None
    test_output: Optional[str] = None
    tests_passed: Optional[int] = None
    tests_failed: Optional[int] = None
    passing_threshold: int = 70
    use_agent_mode: bool = False  # If True, use Claude Code tools


class QuestionEvaluationCriterion(BaseModel):
    """Single criterion score."""
    score: int
    maxScore: int = 20
    feedback: str


class QuestionEvaluationResponse(BaseModel):
    """Question evaluation result response."""
    overallScore: int
    passed: bool
    criteria: dict[str, QuestionEvaluationCriterion]
    feedback: str
    strengths: list[str]
    improvements: list[str]


class SupervisorWorkflowRequest(BaseModel):
    """Request for supervisor workflow."""
    task: str
    session_id: str
    candidate_id: Optional[str] = None


class SupervisorWorkflowResponse(BaseModel):
    """Response from supervisor workflow."""
    coding_result: Optional[dict] = None
    interview_result: Optional[dict] = None
    evaluation_result: Optional[dict] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    timestamp: str
    version: str


# =============================================================================
# App State Management
# =============================================================================

# Store active agent instances by session_id
active_coding_agents: dict = {}
interview_metrics_cache: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    print(f"[API] Starting LangGraph API server")
    print(f"[API] Using model: {settings.coding_agent_model}")
    yield
    # Cleanup on shutdown
    active_coding_agents.clear()
    interview_metrics_cache.clear()
    print("[API] Shutting down LangGraph API server")


# =============================================================================
# FastAPI Application
# =============================================================================

app = FastAPI(
    title="InterviewLM LangGraph API",
    description="HTTP API for LangGraph multi-agent interview system",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration - restrict origins in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if LANGGRAPH_API_KEY else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


# =============================================================================
# Health Check
# =============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.utcnow().isoformat(),
        version="1.0.0",
    )


# =============================================================================
# Coding Agent Endpoints
# =============================================================================

async def stream_coding_response(
    session_id: str,
    candidate_id: str,
    message: str,
    helpfulness_level: str,
    problem_statement: Optional[str],
) -> AsyncGenerator[str, None]:
    """
    Generate SSE stream for coding agent response.

    Uses true token-by-token streaming via LangGraph's astream_events.
    Streams text as it's generated, and tool events as they occur.

    Events emitted:
    - start: Connection established
    - text_delta: Token/chunk of response text
    - tool_start: Tool execution starting
    - tool_end: Tool execution completed
    - done: Response complete with metadata
    - error: Error occurred
    """
    try:
        # Get or create agent for this session
        agent_key = f"{session_id}:{candidate_id}"

        if agent_key not in active_coding_agents:
            active_coding_agents[agent_key] = create_coding_agent(
                session_id=session_id,
                candidate_id=candidate_id,
                helpfulness_level=helpfulness_level,
                problem_statement=problem_statement,
            )

        agent = active_coding_agents[agent_key]

        # Send initial event
        yield f"event: start\ndata: {json.dumps({'session_id': session_id})}\n\n"

        # Use true streaming with astream_events
        async for event in agent.send_message_streaming(message):
            event_type = event.get("type")

            if event_type == "text_delta":
                # Stream text as it's generated
                event_data = {"delta": event.get("delta", ""), "type": "text"}
                yield f"event: text_delta\ndata: {json.dumps(event_data)}\n\n"

            elif event_type == "tool_start":
                # Tool execution starting
                tool_data = {
                    "tool": event.get("name"),
                    "input": event.get("input", {}),
                }
                yield f"event: tool_start\ndata: {json.dumps(tool_data)}\n\n"

            elif event_type == "tool_end":
                # Tool execution completed
                tool_data = {
                    "tool": event.get("name"),
                    "output": event.get("output"),
                }
                yield f"event: tool_end\ndata: {json.dumps(tool_data)}\n\n"

            elif event_type == "done":
                # Response complete
                response = event.get("response", {})
                done_data = {
                    "response": response.get("text", ""),
                    "tools_used": response.get("tools_used", []),
                    "files_modified": response.get("files_modified", []),
                    "metadata": response.get("metadata", {}),
                }
                yield f"event: done\ndata: {json.dumps(done_data)}\n\n"

            elif event_type == "error":
                # Error occurred
                error_data = {"error": event.get("error"), "type": "error"}
                yield f"event: error\ndata: {json.dumps(error_data)}\n\n"

    except Exception as e:
        error_data = {"error": str(e), "type": "error"}
        yield f"event: error\ndata: {json.dumps(error_data)}\n\n"


@app.post("/api/coding/chat", dependencies=[Depends(verify_api_key)])
async def coding_chat_stream(request: CodingChatRequest):
    """
    Chat with the Coding Agent (SSE streaming).

    Streams response in real-time using Server-Sent Events.

    Events:
    - start: Initial connection event
    - thinking: Text chunks as they're generated
    - tool_used: Tool execution notification
    - file_modified: File modification notification
    - done: Final response with metadata
    - error: Error occurred
    """
    return StreamingResponse(
        stream_coding_response(
            session_id=request.session_id,
            candidate_id=request.candidate_id,
            message=request.message,
            helpfulness_level=request.helpfulness_level,
            problem_statement=request.problem_statement,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/coding/chat/sync", response_model=CodingChatResponse, dependencies=[Depends(verify_api_key)])
async def coding_chat_sync(request: CodingChatRequest):
    """
    Chat with the Coding Agent (non-streaming).

    Returns complete response after processing.
    Use /api/coding/chat for streaming responses.
    """
    try:
        agent_key = f"{request.session_id}:{request.candidate_id}"

        if agent_key not in active_coding_agents:
            active_coding_agents[agent_key] = create_coding_agent(
                session_id=request.session_id,
                candidate_id=request.candidate_id,
                helpfulness_level=request.helpfulness_level,
                problem_statement=request.problem_statement,
            )

        agent = active_coding_agents[agent_key]
        response = await agent.send_message(request.message)

        return CodingChatResponse(
            text=response.get("text", ""),
            tools_used=response.get("tools_used", []),
            files_modified=response.get("files_modified", []),
            metadata=response.get("metadata", {}),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Interview Agent Endpoints
# =============================================================================

@app.post("/api/interview/event", response_model=InterviewMetricsResponse, dependencies=[Depends(verify_api_key)])
async def record_interview_event(request: InterviewEventRequest):
    """
    Record an interview event and get updated metrics.

    The Interview Agent tracks candidate progress in real-time,
    adjusting difficulty using IRT (Item Response Theory).

    Event types:
    - session-started: Initialize new session
    - ai-interaction: Candidate asked AI for help
    - code-changed: Candidate modified code
    - test-run: Candidate ran tests
    - question-answered: Candidate completed a question
    - session-completed: Session ended
    """
    try:
        agent = create_interview_agent()

        # Get existing metrics from cache
        existing_metrics = interview_metrics_cache.get(request.session_id)

        # Process event
        metrics = await agent.process_event(
            session_id=request.session_id,
            candidate_id=request.candidate_id,
            event_type=request.event_type,
            event_data=request.event_data,
            existing_metrics=existing_metrics,
        )

        # Cache updated metrics
        interview_metrics_cache[request.session_id] = metrics

        return InterviewMetricsResponse(
            session_id=metrics["session_id"],
            irt_theta=metrics["irt_theta"],
            current_difficulty=metrics["current_difficulty"],
            recommended_next_difficulty=metrics["recommended_next_difficulty"],
            ai_dependency_score=metrics["ai_dependency_score"],
            questions_answered=metrics["questions_answered"],
            struggling_indicators=metrics["struggling_indicators"],
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/interview/{session_id}/metrics", response_model=InterviewMetricsResponse, dependencies=[Depends(verify_api_key)])
async def get_interview_metrics(session_id: str):
    """
    Get current interview metrics for a session.

    Returns cached metrics without processing a new event.
    """
    metrics = interview_metrics_cache.get(session_id)

    if not metrics:
        raise HTTPException(status_code=404, detail="Session metrics not found")

    return InterviewMetricsResponse(
        session_id=metrics["session_id"],
        irt_theta=metrics["irt_theta"],
        current_difficulty=metrics["current_difficulty"],
        recommended_next_difficulty=metrics["recommended_next_difficulty"],
        ai_dependency_score=metrics["ai_dependency_score"],
        questions_answered=metrics["questions_answered"],
        struggling_indicators=metrics["struggling_indicators"],
    )


# =============================================================================
# Evaluation Agent Endpoints
# =============================================================================

@app.post("/api/evaluation/evaluate", response_model=EvaluationResponse, dependencies=[Depends(verify_api_key)])
async def evaluate_session(request: EvaluationRequest):
    """
    Evaluate a completed interview session using agentic discovery.

    The agent will autonomously:
    1. Query the database for session metadata, interactions, and test results
    2. Explore the Modal workspace to read code files
    3. Analyze and score across all 4 dimensions

    Returns scores (0-100) for each dimension with evidence.
    """
    try:
        agent = create_evaluation_agent()

        result = await agent.evaluate_session(
            session_id=request.session_id,
            candidate_id=request.candidate_id,
        )

        return EvaluationResponse(
            session_id=request.session_id,
            candidate_id=request.candidate_id,
            overall_score=result["overall_score"],
            code_quality=result["code_quality"],
            problem_solving=result["problem_solving"],
            ai_collaboration=result["ai_collaboration"],
            communication=result["communication"],
            confidence=result["overall_confidence"],
            bias_flags=result.get("bias_flags", []),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Question Evaluation Agent Endpoints
# =============================================================================

@app.post("/api/question-evaluation/evaluate", response_model=QuestionEvaluationResponse, dependencies=[Depends(verify_api_key)])
async def evaluate_question(request: QuestionEvaluationRequest):
    """
    Evaluate a single question submission during an interview.

    Uses 5 criteria (20 points each = 100 total):
    1. Problem Completion - Does solution meet requirements?
    2. Code Quality - Clean, readable, well-organized?
    3. Best Practices - Follows language conventions?
    4. Error Handling - Handles edge cases?
    5. Efficiency - Reasonably performant?

    Returns scores and feedback to determine if candidate can proceed.
    """
    try:
        agent = create_question_evaluation_agent(use_agent_mode=request.use_agent_mode)

        result = await agent.evaluate_question(
            session_id=request.session_id,
            candidate_id=request.candidate_id,
            question_id=request.question_id,
            question_title=request.question_title,
            question_description=request.question_description,
            question_difficulty=request.question_difficulty,
            code=request.code,
            language=request.language,
            question_requirements=request.question_requirements,
            file_name=request.file_name,
            test_output=request.test_output,
            tests_passed=request.tests_passed,
            tests_failed=request.tests_failed,
            passing_threshold=request.passing_threshold,
        )

        # Convert to API response format (camelCase for frontend)
        return QuestionEvaluationResponse(
            overallScore=result["overall_score"],
            passed=result["passed"],
            criteria={
                "problemCompletion": QuestionEvaluationCriterion(
                    score=result["criteria"]["problem_completion"]["score"],
                    feedback=result["criteria"]["problem_completion"]["feedback"],
                ),
                "codeQuality": QuestionEvaluationCriterion(
                    score=result["criteria"]["code_quality"]["score"],
                    feedback=result["criteria"]["code_quality"]["feedback"],
                ),
                "bestPractices": QuestionEvaluationCriterion(
                    score=result["criteria"]["best_practices"]["score"],
                    feedback=result["criteria"]["best_practices"]["feedback"],
                ),
                "errorHandling": QuestionEvaluationCriterion(
                    score=result["criteria"]["error_handling"]["score"],
                    feedback=result["criteria"]["error_handling"]["feedback"],
                ),
                "efficiency": QuestionEvaluationCriterion(
                    score=result["criteria"]["efficiency"]["score"],
                    feedback=result["criteria"]["efficiency"]["feedback"],
                ),
            },
            feedback=result["feedback"],
            strengths=result["strengths"],
            improvements=result["improvements"],
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Question Generation Endpoints
# =============================================================================

class GenerateQuestionRequest(BaseModel):
    """Request for dynamic question generation."""
    role: str = Field(description="e.g., 'backend', 'frontend', 'fullstack'")
    seniority: str = Field(description="e.g., 'junior', 'mid', 'senior', 'staff'")
    assessment_type: str = Field(default="REAL_WORLD")
    tech_stack: list[str] = Field(default_factory=list)
    organization_id: Optional[str] = None


class GenerateNextQuestionRequest(BaseModel):
    """Request for incremental/adaptive question generation."""
    session_id: str
    candidate_id: str
    seed_id: str
    seniority: str
    previous_questions: list[dict]
    previous_performance: list[dict]
    time_remaining: int = Field(description="Remaining time in seconds")
    current_code_snapshot: Optional[str] = None
    assessment_type: Optional[str] = None


class GeneratedQuestionResponse(BaseModel):
    """Generated question content."""
    title: str
    description: str
    requirements: list[str]
    estimated_time: int
    starter_code: str
    difficulty: Optional[str] = None
    domain: Optional[str] = None
    skills: Optional[list[str]] = None
    difficulty_assessment: Optional[dict] = None


class IRTDataResponse(BaseModel):
    """IRT analysis data."""
    ability_estimate: dict
    difficulty_targeting: dict
    difficulty_visibility: dict
    should_continue: dict


class GenerateNextQuestionResponse(BaseModel):
    """Response for incremental question generation."""
    question: GeneratedQuestionResponse
    irt_data: Optional[IRTDataResponse] = None
    strategy: dict


class QuestionPoolStatsResponse(BaseModel):
    """Question pool statistics."""
    seed_id: str
    total_generated: int
    unique_questions: int
    avg_reuse_count: float
    threshold: int
    last_generated_at: Optional[str] = None
    total_candidates_served: int
    avg_uniqueness_score: float


@app.post("/api/question-generation/generate", response_model=GeneratedQuestionResponse, dependencies=[Depends(verify_api_key)])
async def generate_question(request: GenerateQuestionRequest):
    """
    Generate a dynamic question using complexity profiles.

    Uses Claude Haiku for fast generation (~13s).
    All LLM calls are automatically traced to LangSmith.

    Complexity is determined by role + seniority + assessment type.
    """
    from agents.question_generation_agent import get_question_generation_agent

    try:
        agent = await get_question_generation_agent()

        question = await agent.generate_dynamic(
            role=request.role,
            seniority=request.seniority,
            assessment_type=request.assessment_type,
            tech_stack=request.tech_stack,
            organization_id=request.organization_id,
        )

        return GeneratedQuestionResponse(
            title=question.get("title", ""),
            description=question.get("description", ""),
            requirements=question.get("requirements", []),
            estimated_time=question.get("estimated_time", 45),
            starter_code=question.get("starter_code", ""),
            difficulty=question.get("difficulty"),
            domain=question.get("domain"),
            skills=question.get("skills"),
            difficulty_assessment=question.get("difficulty_assessment"),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/question-generation/generate-next", response_model=GenerateNextQuestionResponse, dependencies=[Depends(verify_api_key)])
async def generate_next_question(request: GenerateNextQuestionRequest):
    """
    Generate next question using IRT-based adaptive difficulty.

    Analyzes candidate performance and targets optimal difficulty.
    Uses Claude Sonnet for better reasoning on adaptive generation.

    Returns question with IRT analysis and strategy used.
    """
    from agents.question_generation_agent import get_question_generation_agent

    try:
        agent = await get_question_generation_agent()

        result = await agent.generate_incremental(
            session_id=request.session_id,
            candidate_id=request.candidate_id,
            seed_id=request.seed_id,
            seniority=request.seniority,
            previous_questions=request.previous_questions,
            previous_performance=request.previous_performance,
            time_remaining=request.time_remaining,
            assessment_type=request.assessment_type,
            current_code_snapshot=request.current_code_snapshot,
        )

        question = result["question"]
        irt_data = result.get("irt_data")
        strategy = result.get("strategy", {"type": "generate", "reason": "incremental"})

        return GenerateNextQuestionResponse(
            question=GeneratedQuestionResponse(
                title=question.get("title", ""),
                description=question.get("description", ""),
                requirements=question.get("requirements", []),
                estimated_time=question.get("estimated_time", 45),
                starter_code=question.get("starter_code", ""),
                difficulty=question.get("difficulty"),
                difficulty_assessment=question.get("difficulty_assessment"),
            ),
            irt_data=IRTDataResponse(
                ability_estimate=irt_data["ability_estimate"],
                difficulty_targeting=irt_data["difficulty_targeting"],
                difficulty_visibility=irt_data["difficulty_visibility"],
                should_continue=irt_data["should_continue"],
            ) if irt_data else None,
            strategy=strategy,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/question-generation/pool-stats/{seed_id}", response_model=QuestionPoolStatsResponse, dependencies=[Depends(verify_api_key)])
async def get_question_pool_stats(seed_id: str):
    """
    Get question pool statistics for a seed.

    Used by smart reuse strategy to determine when to reuse vs generate.
    """
    from services.database import get_question_generation_database

    try:
        db = await get_question_generation_database()
        stats = await db.get_question_pool_stats(seed_id)

        if not stats:
            raise HTTPException(status_code=404, detail="Seed not found or no questions generated")

        return QuestionPoolStatsResponse(
            seed_id=stats["seed_id"],
            total_generated=stats["total_generated"],
            unique_questions=stats["unique_questions"],
            avg_reuse_count=stats["avg_reuse_count"],
            threshold=stats["threshold"],
            last_generated_at=stats.get("last_generated_at"),
            total_candidates_served=stats["total_candidates_served"],
            avg_uniqueness_score=stats["avg_uniqueness_score"],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Supervisor Endpoints
# =============================================================================

@app.post("/api/supervisor/workflow", response_model=SupervisorWorkflowResponse, dependencies=[Depends(verify_api_key)])
async def run_supervisor_workflow(request: SupervisorWorkflowRequest):
    """
    Run a multi-agent workflow through the Supervisor.

    The Supervisor coordinates between Coding, Interview,
    and Evaluation agents based on the task requirements.
    """
    try:
        supervisor = create_supervisor()

        result = await supervisor.run_workflow(
            task=request.task,
            session_id=request.session_id,
            candidate_id=request.candidate_id,
        )

        return SupervisorWorkflowResponse(
            coding_result=result.get("coding_result"),
            interview_result=result.get("interview_result"),
            evaluation_result=result.get("evaluation_result"),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Session Management
# =============================================================================

@app.delete("/api/sessions/{session_id}", dependencies=[Depends(verify_api_key)])
async def clear_session(session_id: str):
    """
    Clear cached data for a session.

    Removes agent instances and metrics from memory.
    """
    # Clear coding agents for this session
    keys_to_remove = [k for k in active_coding_agents.keys() if k.startswith(session_id)]
    for key in keys_to_remove:
        del active_coding_agents[key]

    # Clear metrics
    if session_id in interview_metrics_cache:
        del interview_metrics_cache[session_id]

    return {"status": "cleared", "session_id": session_id}


# =============================================================================
# Main Entry Point
# =============================================================================

def start_server(host: str = "0.0.0.0", port: int = 8080, reload: bool = False):
    """Start the FastAPI server."""
    uvicorn.run(
        "api:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info",
    )


if __name__ == "__main__":
    start_server(reload=True)
