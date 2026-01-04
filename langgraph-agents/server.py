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

import asyncio
import hmac
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import httpx
import sentry_sdk
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.httpx import HttpxIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from starlette.middleware.base import BaseHTTPMiddleware

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

# =============================================================================
# Sentry Initialization
# =============================================================================
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
SENTRY_ENVIRONMENT = os.getenv("SENTRY_ENVIRONMENT", os.getenv("NODE_ENV", "development"))

if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=SENTRY_ENVIRONMENT,

        # Performance monitoring - 100% sampling for full visibility
        traces_sample_rate=1.0,

        # Profiling - 10% of transactions
        profiles_sample_rate=0.1,

        # Enable distributed tracing for trace correlation with Next.js
        propagate_traces=True,

        # Integrations
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            StarletteIntegration(transaction_style="endpoint"),
            HttpxIntegration(),
            LoggingIntegration(
                level=logging.INFO,  # Capture INFO+ as breadcrumbs
                event_level=logging.ERROR,  # Create events for ERROR+
            ),
        ],

        # Filter out health check noise from traces
        traces_sampler=lambda ctx: 0.0 if ctx.get("name") in ["/ok", "/health", "/healthz"] else 1.0,

        # Release tracking
        release=f"langgraph-agents@{os.getenv('VERSION', '1.0.0')}",

        # Server name for Cloud Run
        server_name=os.getenv("K_SERVICE", "langgraph-server"),

        # Enrich events with service tag
        before_send=lambda event, hint: {
            **event,
            "tags": {**event.get("tags", {}), "service": "langgraph-agents"},
        },
    )
    logger.info(f"Sentry initialized for LangGraph server (environment: {SENTRY_ENVIRONMENT})")
else:
    logger.warning("SENTRY_DSN not set, Sentry monitoring disabled")

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
        from psycopg_pool import AsyncConnectionPool

        # Create connection pool
        pool = AsyncConnectionPool(
            conninfo=DATABASE_URI,
            max_size=20,
            kwargs={"autocommit": True},
        )
        await pool.open()

        # Create checkpointer with the pool
        CHECKPOINTER = AsyncPostgresSaver(pool)

        # Setup tables (idempotent) - creates checkpoint tables if they don't exist
        await CHECKPOINTER.setup()

        logger.info("PostgreSQL checkpointer initialized with connection pool")
        return CHECKPOINTER

    except ImportError as e:
        logger.warning(f"langgraph.checkpoint.postgres not available: {e}")
        logger.warning("State persistence disabled - install langgraph-checkpoint-postgres and psycopg")
        return None
    except Exception as e:
        logger.error(f"Failed to initialize PostgreSQL checkpointer: {e}")
        import traceback
        traceback.print_exc()
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
        except Exception as e:
            logger.warning(f"Failed to close checkpointer connection: {e}")


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

# Google token verification endpoint
GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo"

# Token cache with expiration tracking
_token_cache: dict[str, dict] = {}
_TOKEN_CACHE_MAX_SIZE = 100


async def verify_google_id_token(token: str) -> Optional[dict]:
    """
    Verify Google ID token against Google's tokeninfo endpoint.
    Caches valid tokens based on their expiration time.

    Args:
        token: The ID token from the Authorization header

    Returns:
        Token info dict if valid, None otherwise
    """
    # Check cache first - with expiration validation
    if token in _token_cache:
        cached = _token_cache[token]
        exp = cached.get("exp")
        if exp and int(exp) > time.time():
            return cached
        else:
            # Token expired, remove from cache
            del _token_cache[token]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                GOOGLE_TOKEN_INFO_URL,
                params={"id_token": token}
            )
            if resp.status_code == 200:
                token_info = resp.json()

                # Evict oldest entries if cache is full (simple FIFO)
                if len(_token_cache) >= _TOKEN_CACHE_MAX_SIZE:
                    # Remove first 10% of entries
                    keys_to_remove = list(_token_cache.keys())[:_TOKEN_CACHE_MAX_SIZE // 10]
                    for key in keys_to_remove:
                        del _token_cache[key]

                _token_cache[token] = token_info
                return token_info

    except httpx.TimeoutException:
        logger.warning("Timeout verifying Google ID token")
    except Exception as e:
        logger.warning(f"Error verifying Google ID token: {e}")

    return None


class SentryTraceMiddleware(BaseHTTPMiddleware):
    """Propagate trace context from Next.js to Sentry for distributed tracing."""

    async def dispatch(self, request: Request, call_next):
        # Get trace context from incoming headers
        x_request_id = request.headers.get("X-Request-Id")
        session_id = request.headers.get("X-Session-Id")
        user_id = request.headers.get("X-User-Id")
        sentry_trace = request.headers.get("sentry-trace")
        baggage = request.headers.get("baggage")

        # Helper to set request context within the appropriate scope
        def set_request_context():
            if x_request_id:
                sentry_sdk.set_tag("request_id", x_request_id)
                sentry_sdk.set_extra("x_request_id", x_request_id)
            if session_id:
                sentry_sdk.set_tag("session_id", session_id)
            if user_id:
                sentry_sdk.set_user({"id": user_id})

        # Continue with trace context propagation (if sentry-trace header is present)
        if sentry_trace:
            with sentry_sdk.continue_trace(
                {"sentry-trace": sentry_trace, "baggage": baggage or ""}
            ):
                # Set context inside the trace for proper association
                set_request_context()
                return await call_next(request)

        # No incoming sentry-trace header; still set per-request context
        set_request_context()
        return await call_next(request)


class AuthMiddleware(BaseHTTPMiddleware):
    """Validate internal API key and Bearer tokens for authenticated endpoints."""

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

        # Check for Bearer token (Google ID token)
        # Verify the token against Google's tokeninfo endpoint
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            token_info = await verify_google_id_token(token)
            if token_info:
                return await call_next(request)
            else:
                logger.warning(f"Invalid Bearer token from {request.client.host if request.client else 'unknown'}")
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid token"}
                )

        # No valid auth provided
        logger.warning(f"Missing auth from {request.client.host if request.client else 'unknown'}")
        return JSONResponse(
            status_code=401,
            content={"detail": "Authorization required"}
        )


# Add middlewares (executed in reverse order: last added runs first)
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, this is restricted by Cloud Run IAM
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Sentry trace middleware runs first to set up trace context
app.add_middleware(SentryTraceMiddleware)


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

    except HTTPException:
        raise
    except Exception:
        logger.exception(f"[INVOKE ERROR] graph={graph_name}")
        raise HTTPException(status_code=500, detail="Internal server error during graph invocation")


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

        except Exception:
            logger.exception(f"[STREAM ERROR] graph={graph_name}")
            yield f"data: {json.dumps({'error': 'Internal server error during graph streaming'})}\n\n"

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
    except Exception:
        logger.exception(f"[GET STATE ERROR] thread={thread_id}")
        raise HTTPException(status_code=500, detail="Internal server error retrieving thread state")


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

    except Exception:
        logger.exception(f"[GET HISTORY ERROR] thread={thread_id}")
        raise HTTPException(status_code=500, detail="Internal server error retrieving thread history")


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
    logger.exception(f"Unhandled exception on {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
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
