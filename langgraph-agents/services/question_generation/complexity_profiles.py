"""
Complexity Profiles for Question Generation

Profiles are stored in the database (ComplexityProfile table).
Use config_service.get_complexity_profile() to access.

Complexity Dimensions:
- entity_count: Number of data entities (1-2 for junior, 3-5 for senior)
- integration_points: External service integrations (0-2)
- business_logic: simple | moderate | complex | strategic
- ambiguity_level: clear | some_decisions | open_ended | strategic
"""

from typing import Literal, TypedDict


class ComplexityConstraints(TypedDict):
    """Constraints for question generation."""
    mustInclude: list[str]
    shouldConsider: list[str]
    bonus: list[str]


class ComplexityProfile(TypedDict, total=False):
    """Complexity profile for question generation."""
    role: str
    seniority: str
    assessment_type: str
    entity_count_min: int
    entity_count_max: int
    integration_points: int
    business_logic: Literal["simple", "moderate", "complex", "strategic"]
    ambiguity_level: Literal["clear", "some_decisions", "open_ended", "strategic"]
    time_minutes: int
    required_skills: list[str]
    optional_skill_pool: list[str]
    avoid_skills: list[str]
    pick_optional_count: int
    domain_pool: list[str]
    constraints: ComplexityConstraints




# =============================================================================
# Profile Lookup Functions (Config Service Integration)
# =============================================================================

import logging

logger = logging.getLogger(__name__)

# Config service import (lazy to avoid circular imports)
_config_service = None


def _get_config_service():
    """Get config service instance (lazy initialization)."""
    global _config_service
    if _config_service is None:
        try:
            from services.config_service import get_config_service
            _config_service = get_config_service()
        except ImportError as e:
            logger.warning(f"Config service not available: {e}")
            return None
    return _config_service


async def get_complexity_profile(
    role: str,
    seniority: str,
    assessment_type: str,
    organization_id: str | None = None,
) -> ComplexityProfile:
    """
    Get complexity profile from database via config_service.

    Args:
        role: e.g., 'backend', 'frontend', 'fullstack'
        seniority: e.g., 'junior', 'mid', 'senior', 'staff', 'principal'
        assessment_type: 'REAL_WORLD' or 'SYSTEM_DESIGN'
        organization_id: Optional org ID for custom profiles

    Returns:
        ComplexityProfile from database

    Raises:
        RuntimeError: If config service unavailable or profile not found in DB
    """
    seniority_lower = seniority.lower()

    config_service = _get_config_service()
    if not config_service:
        raise RuntimeError(
            "Config service not available. Please ensure database is properly configured."
        )

    profile = await config_service.get_complexity_profile(
        role=role,
        seniority=seniority_lower,
        assessment_type=assessment_type,
        organization_id=organization_id,
    )

    if profile:
        logger.debug(f"Got complexity profile from DB: {role}/{seniority_lower}/{assessment_type}")
        return profile

    raise RuntimeError(
        f"Complexity profile not found for {role}/{seniority_lower}/{assessment_type}. "
        "Please run database seeds."
    )


async def get_domain_pool(
    role: str,
    seniority: str,
    assessment_type: str = "REAL_WORLD",
    organization_id: str | None = None,
) -> list[str]:
    """
    Get domain pool from complexity profile in database.

    Args:
        role: e.g., 'backend', 'frontend', 'fullstack'
        seniority: e.g., 'junior', 'mid', 'senior'
        assessment_type: 'REAL_WORLD' or 'SYSTEM_DESIGN'
        organization_id: Optional org ID for custom profiles

    Returns:
        List of domain strings from the complexity profile
    """
    profile = await get_complexity_profile(role, seniority, assessment_type, organization_id)
    return profile.get("domainPool", [])
