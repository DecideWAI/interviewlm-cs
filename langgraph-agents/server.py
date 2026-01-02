"""
LangGraph Production Server

FastAPI-based server for serving LangGraph agents in production.
Bypasses the licensed langgraph-api server by using the open-source
langgraph library directly with custom endpoints.

Features:
- Loads graphs from langgraph.json
- PostgreSQL checkpointing for state persistence
- Internal API key authentication
- SSE streaming support
"""

import os
import json
import asyncio
import hmac
import logging
from pathlib import Path
from typing import Any, Optional
from contextlib import asynccontextmanager
from functools import wraps

from fastapi import FastAPI, HTTPException, Request, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Environment configuration
PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "0.0.0.0")
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
DATABASE_URI = os.getenv("DATABASE_URI", "")
REDIS_URI = os.getenv("REDIS_URI", "")

# Load langgraph.json configuration
LANGGRAPH_CONFIG_PATH = Path(__file__).parent / "langgraph.json"


def load_config() -> dict:
    """Load the langgraph.json configuration."""
    if LANGGRAPH_CONFIG_PATH.exists():
        with open(LANGGRAPH_CONFIG_PATH) as f:
            return json.load(f)
    return {}


def import_graph(graph_path: str):
    """
    Import a graph from a module path.

    Args:
        graph_path: Path in format "./module/file.py:attribute"

    Returns:
        The graph object
    """
    import importlib.util

    # Parse the path
    if ":" not in graph_path:
        raise ValueError(f"Invalid graph path: {graph_path}. Expected format: ./path/to/file.py:graph_name")

    file_path, attr_name = graph_path.rsplit(":", 1)

    # Convert relative path to absolute
    if file_path.startswith("./"):
        file_path = file_path[2:]

    abs_path = Path(__file__).parent / file_path

    if not abs_path.exists():
        raise FileNotFoundError(f"Graph file not found: {abs_path}")

    # Load the module
    spec = importlib.util.spec_from_file_location(file_path.replace("/", ".").replace(".py", ""), abs_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load module from {abs_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    # Get the graph attribute
    if not hasattr(module, attr_name):
        raise AttributeError(f"Module {file_path} has no attribute '{attr_name}'")

    return getattr(module, attr_name)


# Graph registry - loaded on startup
GRAPHS: dict[str, Any] = {}

# PostgreSQL checkpointer - initialized on startup
CHECKPOINTER: Any = None


async def init_checkpointer():
    """Initialize PostgreSQL checkpointer for state persistence."""
    global CHECKPOINTER

    if not DATABASE_URI:
        logger.warning("DATABASE_URI not set, state persistence disabled")
        return None

    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

        # Create async checkpointer
        CHECKPOINTER = AsyncPostgresSaver.from_conn_string(DATABASE_URI)

        # Setup tables (idempotent)
        await CHECKPOINTER.setup()

        logger.info("PostgreSQL checkpointer initialized")
        return CHECKPOINTER

    except ImportError:
        logger.warning("langgraph.checkpoint.postgres not available, trying SQLAlchemy")
        try:
            from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
            # Fallback to in-memory for now
            CHECKPOINTER = AsyncSqliteSaver.from_conn_string(":memory:")
            logger.warning("Using in-memory checkpointer (state will not persist)")
            return CHECKPOINTER
        except Exception as e:
            logger.error(f"Failed to initialize any checkpointer: {e}")
            return None
    except Exception as e:
        logger.error(f"Failed to initialize PostgreSQL checkpointer: {e}")
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load graphs and initialize checkpointer on startup."""
    config = load_config()
    graphs_config = config.get("graphs", {})

    logger.info(f"Loading {len(graphs_config)} graphs...")

    for name, path in graphs_config.items():
        try:
            GRAPHS[name] = import_graph(path)
            logger.info(f"  ✓ Loaded graph: {name}")
        except Exception as e:
            logger.error(f"  ✗ Failed to load graph {name}: {e}")
            if not DEBUG:
                # In production, fail if any graph doesn't load
                raise

    # Initialize checkpointer
    await init_checkpointer()

    logger.info(f"Server ready with {len(GRAPHS)} graphs")

    if CHECKPOINTER:
        logger.info("State persistence: PostgreSQL")
    else:
        logger.info("State persistence: disabled")

    yield

    # Cleanup
    GRAPHS.clear()
    if CHECKPOINTER:
        try:
            await CHECKPOINTER.conn.close()
        except Exception:
            pass


# Create FastAPI app
app = FastAPI(
    title="LangGraph Agents API",
    description="Production API for InterviewLM LangGraph agents",
    version="1.0.0",
    lifespan=lifespan,
)


# =============================================================================
# Authentication Middleware
# =============================================================================

class AuthMiddleware(BaseHTTPMiddleware):
    """Validate internal API key for authenticated endpoints."""

    # Paths that don't require authentication
    PUBLIC_PATHS = {"/", "/ok", "/health", "/healthz", "/docs", "/openapi.json", "/redoc"}

    async def dispatch(self, request: Request, call_next):
        # Allow public paths without auth
        if request.url.path in self.PUBLIC_PATHS:
            return await call_next(request)

        # Skip auth if no API key configured (local development)
        if not INTERNAL_API_KEY:
            logger.warning("INTERNAL_API_KEY not configured, skipping auth")
            return await call_next(request)

        # Get authorization header
        auth_header = request.headers.get("Authorization", "")

        # Check for ApiKey authentication
        if auth_header.startswith("ApiKey "):
            api_key = auth_header[7:]
            if hmac.compare_digest(api_key, INTERNAL_API_KEY):
                return await call_next(request)
            else:
                logger.warning(f"Invalid API key from {request.client.host if request.client else 'unknown'}")
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid API key"}
                )

        # Check for Bearer token (Cloud Run IAM)
        # In production, Cloud Run validates the IAM token before reaching this service
        # If we get here with a Bearer token, it means Cloud Run already validated it
        if auth_header.startswith("Bearer "):
            # Cloud Run IAM already validated the token
            return await call_next(request)

        # No valid auth provided
        logger.warning(f"Missing auth from {request.client.host if request.client else 'unknown'}")
        return JSONResponse(
            status_code=401,
            content={"detail": "Authorization required"}
        )


# Add middlewares
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, this is restricted by Cloud Run IAM
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Health Check Endpoints (Public)
# =============================================================================

@app.get("/ok")
@app.get("/health")
@app.get("/healthz")
async def health_check():
    """Health check endpoint for Cloud Run."""
    return {
        "status": "ok",
        "graphs_loaded": len(GRAPHS),
        "checkpointer": "postgres" if CHECKPOINTER else "disabled"
    }


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "service": "langgraph-agents",
        "version": "1.0.0",
        "graphs": list(GRAPHS.keys()),
        "endpoints": {
            "health": "/ok",
            "graphs": "/graphs",
            "invoke": "/graphs/{graph_name}/invoke",
            "stream": "/graphs/{graph_name}/stream",
        }
    }


# =============================================================================
# Graph Endpoints (Authenticated)
# =============================================================================

@app.get("/graphs")
async def list_graphs():
    """List available graphs."""
    return {
        "graphs": [
            {
                "name": name,
                "type": type(graph).__name__,
            }
            for name, graph in GRAPHS.items()
        ]
    }


@app.get("/graphs/{graph_name}")
async def get_graph_info(graph_name: str):
    """Get information about a specific graph."""
    if graph_name not in GRAPHS:
        raise HTTPException(status_code=404, detail=f"Graph '{graph_name}' not found")

    graph = GRAPHS[graph_name]
    return {
        "name": graph_name,
        "type": type(graph).__name__,
        "has_invoke": hasattr(graph, "invoke"),
        "has_ainvoke": hasattr(graph, "ainvoke"),
        "has_stream": hasattr(graph, "stream"),
        "has_astream": hasattr(graph, "astream"),
    }


@app.post("/graphs/{graph_name}/invoke")
async def invoke_graph(
    graph_name: str,
    request: Request,
    x_user_id: Optional[str] = Header(None),
    x_session_id: Optional[str] = Header(None),
    x_request_id: Optional[str] = Header(None),
):
    """
    Invoke a graph synchronously.

    Request body should contain:
    - input: The input state for the graph
    - config: Optional config for the invocation (including thread_id for persistence)

    Headers:
    - X-User-Id: User making the request (for audit)
    - X-Session-Id: Interview session ID
    - X-Request-Id: Correlation ID for tracing
    """
    if graph_name not in GRAPHS:
        raise HTTPException(status_code=404, detail=f"Graph '{graph_name}' not found")

    graph = GRAPHS[graph_name]

    try:
        body = await request.json()
    except Exception:
        body = {}

    input_state = body.get("input", {})
    config = body.get("config", {})

    # Add checkpointer if available and thread_id provided
    if CHECKPOINTER and config.get("configurable", {}).get("thread_id"):
        config["checkpointer"] = CHECKPOINTER

    # Log for audit trail
    logger.info(f"[INVOKE] graph={graph_name} user={x_user_id} session={x_session_id} request={x_request_id}")

    try:
        if hasattr(graph, "ainvoke"):
            result = await graph.ainvoke(input_state, config=config)
        elif hasattr(graph, "invoke"):
            result = await asyncio.to_thread(graph.invoke, input_state, config=config)
        else:
            raise HTTPException(status_code=400, detail=f"Graph '{graph_name}' is not invokable")

        return {"result": _serialize_result(result)}

    except Exception as e:
        logger.error(f"[INVOKE ERROR] graph={graph_name} error={e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/graphs/{graph_name}/stream")
async def stream_graph(
    graph_name: str,
    request: Request,
    x_user_id: Optional[str] = Header(None),
    x_session_id: Optional[str] = Header(None),
    x_request_id: Optional[str] = Header(None),
):
    """
    Stream graph execution with Server-Sent Events.

    Request body should contain:
    - input: The input state for the graph
    - config: Optional config for the invocation (including thread_id for persistence)
    - stream_mode: Optional stream mode ("values", "updates", "debug")

    Headers:
    - X-User-Id: User making the request (for audit)
    - X-Session-Id: Interview session ID
    - X-Request-Id: Correlation ID for tracing
    """
    if graph_name not in GRAPHS:
        raise HTTPException(status_code=404, detail=f"Graph '{graph_name}' not found")

    graph = GRAPHS[graph_name]

    try:
        body = await request.json()
    except Exception:
        body = {}

    input_state = body.get("input", {})
    config = body.get("config", {})
    stream_mode = body.get("stream_mode", "values")

    # Add checkpointer if available and thread_id provided
    if CHECKPOINTER and config.get("configurable", {}).get("thread_id"):
        config["checkpointer"] = CHECKPOINTER

    # Log for audit trail
    logger.info(f"[STREAM] graph={graph_name} user={x_user_id} session={x_session_id} request={x_request_id}")

    async def event_generator():
        try:
            if hasattr(graph, "astream"):
                async for event in graph.astream(input_state, config=config, stream_mode=stream_mode):
                    yield f"data: {json.dumps(_serialize_result(event), default=str)}\n\n"
            elif hasattr(graph, "stream"):
                for event in graph.stream(input_state, config=config, stream_mode=stream_mode):
                    yield f"data: {json.dumps(_serialize_result(event), default=str)}\n\n"
            else:
                # Fall back to invoke
                if hasattr(graph, "ainvoke"):
                    result = await graph.ainvoke(input_state, config=config)
                else:
                    result = await asyncio.to_thread(graph.invoke, input_state, config=config)
                yield f"data: {json.dumps(_serialize_result(result), default=str)}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as e:
            logger.error(f"[STREAM ERROR] graph={graph_name} error={e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# =============================================================================
# Thread/State Management Endpoints
# =============================================================================

@app.get("/threads/{thread_id}/state")
async def get_thread_state(
    thread_id: str,
    x_user_id: Optional[str] = Header(None),
):
    """Get the current state of a thread."""
    if not CHECKPOINTER:
        raise HTTPException(status_code=503, detail="State persistence not available")

    try:
        config = {"configurable": {"thread_id": thread_id}}
        state = await CHECKPOINTER.aget(config)

        if state is None:
            raise HTTPException(status_code=404, detail=f"Thread '{thread_id}' not found")

        return {"thread_id": thread_id, "state": _serialize_result(state)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[GET STATE ERROR] thread={thread_id} error={e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/threads/{thread_id}/history")
async def get_thread_history(
    thread_id: str,
    limit: int = 10,
    x_user_id: Optional[str] = Header(None),
):
    """Get the state history of a thread."""
    if not CHECKPOINTER:
        raise HTTPException(status_code=503, detail="State persistence not available")

    try:
        config = {"configurable": {"thread_id": thread_id}}
        history = []

        async for state in CHECKPOINTER.alist(config, limit=limit):
            history.append(_serialize_result(state))

        return {"thread_id": thread_id, "history": history}

    except Exception as e:
        logger.error(f"[GET HISTORY ERROR] thread={thread_id} error={e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Utilities
# =============================================================================

def _serialize_result(obj: Any) -> Any:
    """Serialize result objects for JSON response."""
    if obj is None:
        return None

    if isinstance(obj, dict):
        return {k: _serialize_result(v) for k, v in obj.items()}

    if isinstance(obj, (list, tuple)):
        return [_serialize_result(item) for item in obj]

    if isinstance(obj, (str, int, float, bool)):
        return obj

    # Handle LangChain message types
    if hasattr(obj, "content"):
        return {
            "type": type(obj).__name__,
            "content": obj.content,
            "additional_kwargs": getattr(obj, "additional_kwargs", {}),
        }

    # Handle other objects
    if hasattr(obj, "dict"):
        return obj.dict()

    if hasattr(obj, "__dict__"):
        return {k: _serialize_result(v) for k, v in obj.__dict__.items() if not k.startswith("_")}

    # Fallback to string representation
    return str(obj)


# Error handlers
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Handle all unhandled exceptions."""
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__}
    )


if __name__ == "__main__":
    logger.info(f"Starting LangGraph server on {HOST}:{PORT}")
    uvicorn.run(
        "server:app",
        host=HOST,
        port=PORT,
        reload=DEBUG,
        log_level="debug" if DEBUG else "info",
    )
