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
    """Request to evaluate a completed session."""
    session_id: str
    candidate_id: str
    # Session data passed directly (alternative: fetch from DB)
    code_snapshots: Optional[list[dict]] = None
    test_results: Optional[list[dict]] = None
    claude_interactions: Optional[list[dict]] = None


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
    """Generate SSE stream for coding agent response."""
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

        # Process message with streaming
        # Note: Current implementation collects full response
        # For true token streaming, agent would need streaming callback support
        response = await agent.send_message(message)

        # Stream thinking/response chunks
        text = response.get("text", "")
        chunk_size = 50  # Characters per chunk for streaming effect

        for i in range(0, len(text), chunk_size):
            chunk = text[i:i + chunk_size]
            event_data = {"delta": chunk, "type": "text"}
            yield f"event: thinking\ndata: {json.dumps(event_data)}\n\n"
            await asyncio.sleep(0.02)  # Small delay for streaming effect

        # Send tool usage events
        for tool in response.get("tools_used", []):
            yield f"event: tool_used\ndata: {json.dumps({'tool': tool})}\n\n"

        # Send file modification events
        for file_path in response.get("files_modified", []):
            yield f"event: file_modified\ndata: {json.dumps({'path': file_path})}\n\n"

        # Send done event with full response
        done_data = {
            "response": text,
            "tools_used": response.get("tools_used", []),
            "files_modified": response.get("files_modified", []),
            "metadata": response.get("metadata", {}),
        }
        yield f"event: done\ndata: {json.dumps(done_data)}\n\n"

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
    Evaluate a completed interview session.

    Analyzes code quality, problem solving approach,
    AI collaboration patterns, and communication skills.

    Returns scores (0-100) for each dimension with evidence.
    """
    try:
        agent = create_evaluation_agent()

        result = await agent.evaluate_session(
            session_id=request.session_id,
            candidate_id=request.candidate_id,
            code_snapshots=request.code_snapshots or [],
            test_results=request.test_results or [],
            claude_interactions=request.claude_interactions or [],
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
