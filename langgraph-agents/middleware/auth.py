"""
Custom authentication middleware for LangGraph.

Verifies Cloud Run IAM tokens and internal API keys.
Passes user identity through for audit trails.

This middleware supports two authentication methods:
1. Google ID Token (Cloud Run IAM) - Used in production
2. Internal API Key - Used for local development and as fallback

User context is passed via custom headers for audit trails:
- X-User-Id: The user making the request
- X-Session-Id: The interview session ID
- X-Request-Id: Correlation ID for distributed tracing
"""

import os
import logging
from typing import Optional

import httpx
from langgraph_sdk import Auth

logger = logging.getLogger(__name__)

# Configuration
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo"

# Cache for verified tokens (simple in-memory cache)
_token_cache: dict[str, dict] = {}
_CACHE_MAX_SIZE = 100


async def verify_google_id_token(token: str) -> Optional[dict]:
    """
    Verify Google ID token from Cloud Run IAM.

    Args:
        token: The ID token from the Authorization header

    Returns:
        Token info dict if valid, None otherwise
    """
    # Check cache first
    if token in _token_cache:
        return _token_cache[token]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                GOOGLE_TOKEN_INFO_URL,
                params={"id_token": token}
            )
            if resp.status_code == 200:
                token_info = resp.json()

                # Simple cache management - clear if too large
                if len(_token_cache) >= _CACHE_MAX_SIZE:
                    _token_cache.clear()

                _token_cache[token] = token_info
                return token_info

    except httpx.TimeoutException:
        logger.warning("Timeout verifying Google ID token")
    except Exception as e:
        logger.error(f"Error verifying Google ID token: {e}")

    return None


def verify_api_key(api_key: str) -> bool:
    """
    Verify internal API key.

    Args:
        api_key: The API key from the Authorization header

    Returns:
        True if valid, False otherwise
    """
    if not INTERNAL_API_KEY:
        logger.warning("INTERNAL_API_KEY not configured")
        return False

    # Constant-time comparison to prevent timing attacks
    import hmac
    return hmac.compare_digest(api_key, INTERNAL_API_KEY)


# Create the Auth instance
auth = Auth()


@auth.authenticate
async def authenticate(
    authorization: Optional[str] = None,
) -> Auth.types.MinimalUserDict:
    """
    Authenticate a request.

    Supports two auth methods:
    1. Google ID Token (Cloud Run IAM) - Bearer token
    2. Internal API Key - ApiKey token

    Args:
        authorization: Authorization header value

    Returns:
        MinimalUserDict with user identity

    Raises:
        Exception: If authentication fails (returns 401)
    """
    if not authorization:
        raise Exception("Missing Authorization header")

    # Check for internal API key (ApiKey prefix)
    if authorization.startswith("ApiKey "):
        api_key = authorization[7:]
        if verify_api_key(api_key):
            logger.info("[AUTH] API key auth successful")
            return {
                "identity": "interviewlm-main-app",
                "is_authenticated": True,
            }
        else:
            logger.warning("[AUTH] Invalid API key")
            raise Exception("Invalid API key")

    # Check for Google ID token (Bearer prefix)
    if authorization.startswith("Bearer "):
        token = authorization[7:]
        token_info = await verify_google_id_token(token)
        if token_info:
            email = token_info.get("email", "unknown")
            logger.info(f"[AUTH] Google IAM auth successful: {email}")
            return {
                "identity": email,
                "email": email,
                "is_authenticated": True,
            }
        else:
            logger.warning("[AUTH] Invalid Google ID token")
            raise Exception("Invalid ID token")

    # Unknown authorization scheme
    logger.warning("[AUTH] Unknown auth scheme")
    raise Exception("Invalid authorization scheme")


# No explicit authorization handler - all authenticated users are allowed
# LangGraph defaults to allowing all authenticated requests when no @auth.on handler is defined
