"""
No-op authentication module for development.
Allows all requests with a default user identity.
"""

from langgraph_sdk import Auth

auth = Auth()


@auth.authenticate
async def authenticate(headers: dict) -> Auth.types.MinimalUserDict:
    """
    Always authenticate with a default user for development.
    In production, this should be replaced with real authentication.
    """
    return {
        "identity": "default-user",
        "is_authenticated": True,
        "display_name": "Default User",
        "permissions": ["read", "write", "delete"],
    }
