"""
GCS File Snapshot Service for LangGraph agents.

This is a thin wrapper that sends snapshot capture jobs to the TypeScript
worker via HTTP. The actual GCS upload logic lives in the Next.js API.

Architecture:
- Python agents call capture_file_snapshots() after tool execution
- This sends an HTTP POST to /api/sessions/[id]/snapshots/capture
- TypeScript worker reads files from Modal and uploads to GCS
- Non-blocking: Python doesn't wait for GCS upload to complete
"""

import os
import logging
import httpx
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Configuration
NEXTJS_INTERNAL_URL = os.environ.get("NEXTJS_INTERNAL_URL", "http://localhost:3000")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "")
SNAPSHOT_ENABLED = os.environ.get("GCS_ENABLED", "false").lower() == "true"

# Background executor for fire-and-forget HTTP calls
_background_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="snapshot_capture")


@dataclass
class CaptureResult:
    """Result of a snapshot capture request."""
    success: bool
    session_id: str
    files_queued: int
    error: Optional[str] = None


def _send_capture_request(
    session_id: str,
    candidate_id: str,
    files_modified: list[str],
) -> CaptureResult:
    """
    Send snapshot capture request to TypeScript worker (synchronous).

    Args:
        session_id: Session recording ID
        candidate_id: Candidate ID (used for Modal sandbox and GCS path)
        files_modified: List of file paths that were modified

    Returns:
        CaptureResult with status info
    """
    url = f"{NEXTJS_INTERNAL_URL}/api/sessions/{session_id}/snapshots/capture"

    try:
        response = httpx.post(
            url,
            json={
                "candidateId": candidate_id,
                "filesModified": files_modified,
            },
            headers={
                "Content-Type": "application/json",
                "x-internal-api-key": INTERNAL_API_KEY,
            },
            timeout=10.0,  # Short timeout - we just need the 202 Accepted
        )

        if response.status_code == 202:
            data = response.json()
            logger.info(
                f"[Snapshot] Capture queued for session {session_id}: "
                f"{data.get('filesQueued', len(files_modified))} files"
            )
            return CaptureResult(
                success=True,
                session_id=session_id,
                files_queued=data.get("filesQueued", len(files_modified)),
            )
        else:
            error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
            logger.warning(f"[Snapshot] Capture request failed: {error_msg}")
            return CaptureResult(
                success=False,
                session_id=session_id,
                files_queued=0,
                error=error_msg,
            )

    except httpx.TimeoutException:
        # Timeout is actually OK - the endpoint returns 202 immediately
        # and processes in background. If we timeout, it's likely still working.
        logger.debug(f"[Snapshot] Request timed out (may still be processing)")
        return CaptureResult(
            success=True,  # Assume success on timeout
            session_id=session_id,
            files_queued=len(files_modified),
        )

    except Exception as e:
        error_msg = str(e)
        logger.error(f"[Snapshot] Capture request error: {error_msg}")
        return CaptureResult(
            success=False,
            session_id=session_id,
            files_queued=0,
            error=error_msg,
        )


def capture_file_snapshots(
    candidate_id: str,
    session_id: str,
    files_modified: list[str],
) -> None:
    """
    Capture file snapshots from Modal sandbox and upload to GCS.

    This is a fire-and-forget operation. It sends a request to the TypeScript
    worker and returns immediately without waiting for the upload to complete.

    Called after agent tool execution to persist file state for session replay.

    Args:
        candidate_id: Candidate ID (used for Modal sandbox and GCS path)
        session_id: Session recording ID
        files_modified: List of file paths that were modified
    """
    if not files_modified:
        logger.debug(f"[Snapshot] No files to capture for session {session_id}")
        return

    if not SNAPSHOT_ENABLED:
        logger.debug(f"[Snapshot] Capture disabled (GCS_ENABLED=false)")
        return

    if not INTERNAL_API_KEY:
        logger.warning("[Snapshot] INTERNAL_API_KEY not set, skipping capture")
        return

    logger.info(
        f"[Snapshot] Queuing capture for session {session_id}: "
        f"{len(files_modified)} files ({', '.join(files_modified[:3])}{'...' if len(files_modified) > 3 else ''})"
    )

    # Fire-and-forget: submit to background executor
    _background_executor.submit(
        _send_capture_request,
        session_id,
        candidate_id,
        files_modified,
    )


async def capture_file_snapshots_async(
    candidate_id: str,
    session_id: str,
    files_modified: list[str],
) -> None:
    """
    Async version of capture_file_snapshots.

    Still fire-and-forget, but can be awaited if needed.
    """
    import asyncio

    if not files_modified:
        return

    if not SNAPSHOT_ENABLED or not INTERNAL_API_KEY:
        return

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        _background_executor,
        _send_capture_request,
        session_id,
        candidate_id,
        files_modified,
    )


# =============================================================================
# Health Check
# =============================================================================

def health_check() -> dict:
    """Check snapshot capture service health."""
    return {
        "status": "enabled" if SNAPSHOT_ENABLED else "disabled",
        "snapshot_enabled": SNAPSHOT_ENABLED,
        "nextjs_url": NEXTJS_INTERNAL_URL,
        "api_key_configured": bool(INTERNAL_API_KEY),
    }


def is_enabled() -> bool:
    """Check if snapshot capture is enabled."""
    return SNAPSHOT_ENABLED and bool(INTERNAL_API_KEY)
