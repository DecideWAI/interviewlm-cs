"""
Config Service for Python agents.
Provides layered config access with caching.

Resolution order:
1. Organization override (if exists and allowed by policy)
2. System default from database
3. Hardcoded fallback (for migration period)
"""

import asyncio
import logging
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from config.settings import settings
from models.db_models import (
    ComplexityProfile,
    ConfigCategory,
    ConfigItem,
    ConfigOverride,
    ModelConfig,
    RoleConfig,
    SandboxConfig,
    SecurityConfig,
    SeniorityConfig,
    Technology,
)

logger = logging.getLogger(__name__)

# Cache configuration
CONFIG_CACHE_TTL_SECONDS = 300  # 5 minutes


class ConfigService:
    """
    Layered config service with caching.

    Supports three override policies:
    - SYSTEM_ONLY: No org overrides allowed
    - BOUNDED: Org overrides within min/max constraints
    - FULLY_CUSTOMIZABLE: Full org control
    """

    _instance: Optional["ConfigService"] = None
    _cache: Dict[str, tuple[Any, datetime]] = {}

    def __init__(self, database_url: Optional[str] = None):
        """Initialize with database connection."""
        # Convert PostgreSQL URL to async format
        db_url = database_url or settings.database_url
        if db_url.startswith("postgresql://"):
            db_url = db_url.replace("postgresql://", "postgresql+asyncpg://")
        elif db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql+asyncpg://")

        self.database_url = db_url
        self._engine = None
        self._session_factory = None
        self._initialized = False

    async def _ensure_initialized(self) -> None:
        """Lazy initialization of database connection."""
        if not self._initialized:
            self._engine = create_async_engine(
                self.database_url,
                pool_size=5,
                max_overflow=10,
                pool_pre_ping=True,
            )
            self._session_factory = async_sessionmaker(
                self._engine,
                class_=AsyncSession,
                expire_on_commit=False,
            )
            self._initialized = True

    @classmethod
    def get_instance(cls) -> "ConfigService":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = ConfigService()
        return cls._instance

    def _get_cache_key(self, config_type: str, key: str, org_id: Optional[str] = None) -> str:
        """Generate cache key."""
        return f"{config_type}:{key}:{org_id or 'system'}"

    def _is_cache_valid(self, cache_key: str) -> bool:
        """Check if cache entry is still valid."""
        if cache_key not in self._cache:
            return False
        _, timestamp = self._cache[cache_key]
        return datetime.utcnow() - timestamp < timedelta(seconds=CONFIG_CACHE_TTL_SECONDS)

    def _set_cache(self, cache_key: str, value: Any) -> None:
        """Set cache entry."""
        self._cache[cache_key] = (value, datetime.utcnow())

    def _get_cache(self, cache_key: str) -> Optional[Any]:
        """Get cache entry if valid."""
        if self._is_cache_valid(cache_key):
            return self._cache[cache_key][0]
        return None

    # =========================================================================
    # SECURITY CONFIG (SYSTEM_ONLY)
    # =========================================================================

    async def get_security_config(self, config_type: str) -> Any:
        """
        Get security config (SYSTEM_ONLY, no overrides).

        Args:
            config_type: Type of security config (e.g., "blocked_patterns", "allowed_commands")

        Returns:
            Config value or None if not found
        """
        cache_key = f"security:{config_type}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        await self._ensure_initialized()

        async with self._session_factory() as session:
            result = await session.execute(
                select(SecurityConfig).where(SecurityConfig.config_type == config_type)
            )
            config = result.scalar_one_or_none()

            value = config.value if config else None
            self._set_cache(cache_key, value)
            return value

    async def get_blocked_patterns(self) -> List[str]:
        """Get blocked bash command patterns."""
        patterns = await self.get_security_config("blocked_patterns")
        return patterns if isinstance(patterns, list) else []

    async def get_allowed_commands(self) -> List[str]:
        """Get allowed bash commands."""
        commands = await self.get_security_config("allowed_commands")
        return commands if isinstance(commands, list) else []

    async def get_rate_limits(self) -> Dict[str, Any]:
        """Get rate limit configuration."""
        limits = await self.get_security_config("rate_limits")
        return limits if isinstance(limits, dict) else {}

    async def get_session_timeouts(self) -> Dict[str, int]:
        """Get session timeout configuration."""
        timeouts = await self.get_security_config("session_timeouts")
        return timeouts if isinstance(timeouts, dict) else {}

    # =========================================================================
    # MODEL CONFIG
    # =========================================================================

    async def get_model_config(self, model_id: str) -> Optional[Dict[str, Any]]:
        """Get AI model configuration."""
        cache_key = f"model:{model_id}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        await self._ensure_initialized()

        async with self._session_factory() as session:
            result = await session.execute(
                select(ModelConfig)
                .where(ModelConfig.model_id == model_id)
                .where(ModelConfig.is_active == True)
            )
            model = result.scalar_one_or_none()

            if not model:
                self._set_cache(cache_key, None)
                return None

            value = {
                "id": model.model_id,
                "name": model.name,
                "inputPricePerMToken": model.input_price_per_m_token,
                "outputPricePerMToken": model.output_price_per_m_token,
                "maxTokens": model.max_tokens,
                "contextWindow": model.context_window,
                "description": model.description,
                "useCase": model.use_case,
                "recommendedFor": model.recommended_for or [],
            }
            self._set_cache(cache_key, value)
            return value

    async def get_all_models(self) -> List[Dict[str, Any]]:
        """Get all active model configurations."""
        cache_key = "models:all"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        await self._ensure_initialized()

        async with self._session_factory() as session:
            result = await session.execute(
                select(ModelConfig).where(ModelConfig.is_active == True)
            )
            models = result.scalars().all()

            value = [
                {
                    "id": m.model_id,
                    "name": m.name,
                    "inputPricePerMToken": m.input_price_per_m_token,
                    "outputPricePerMToken": m.output_price_per_m_token,
                    "maxTokens": m.max_tokens,
                    "contextWindow": m.context_window,
                    "recommendedFor": m.recommended_for or [],
                }
                for m in models
            ]
            self._set_cache(cache_key, value)
            return value

    # =========================================================================
    # SANDBOX CONFIG
    # =========================================================================

    async def get_sandbox_config(self, language: str) -> Optional[Dict[str, Any]]:
        """Get sandbox configuration for a language."""
        cache_key = f"sandbox:{language}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        await self._ensure_initialized()

        async with self._session_factory() as session:
            # Try specific language first
            result = await session.execute(
                select(SandboxConfig)
                .where(SandboxConfig.language == language)
                .where(SandboxConfig.is_active == True)
            )
            config = result.scalar_one_or_none()

            # Fall back to default
            if not config:
                result = await session.execute(
                    select(SandboxConfig)
                    .where(SandboxConfig.language == "default")
                    .where(SandboxConfig.is_active == True)
                )
                config = result.scalar_one_or_none()

            if not config:
                self._set_cache(cache_key, None)
                return None

            value = {
                "language": config.language,
                "dockerImage": config.docker_image,
                "cpu": config.cpu,
                "memoryMb": config.memory_mb,
                "timeoutSeconds": config.timeout_seconds,
            }
            self._set_cache(cache_key, value)
            return value

    async def get_image_map(self) -> Dict[str, str]:
        """Get language to Docker image mapping."""
        cache_key = "sandbox:image_map"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        await self._ensure_initialized()

        async with self._session_factory() as session:
            result = await session.execute(
                select(SandboxConfig).where(SandboxConfig.is_active == True)
            )
            configs = result.scalars().all()

            value = {c.language: c.docker_image for c in configs}
            self._set_cache(cache_key, value)
            return value

    # =========================================================================
    # COMPLEXITY PROFILE
    # =========================================================================

    async def get_complexity_profile(
        self,
        role: str,
        seniority: str,
        assessment_type: str,
        organization_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get complexity profile for question generation.

        Supports org-level overrides (FULLY_CUSTOMIZABLE).
        """
        cache_key = f"complexity:{role}:{seniority}:{assessment_type}:{organization_id or 'system'}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        await self._ensure_initialized()

        async with self._session_factory() as session:
            # Try org-specific first if org_id provided
            profile = None
            if organization_id:
                result = await session.execute(
                    select(ComplexityProfile)
                    .where(ComplexityProfile.role == role)
                    .where(ComplexityProfile.seniority == seniority)
                    .where(ComplexityProfile.assessment_type == assessment_type)
                    .where(ComplexityProfile.organization_id == organization_id)
                )
                profile = result.scalar_one_or_none()

            # Fall back to system default
            if not profile:
                result = await session.execute(
                    select(ComplexityProfile)
                    .where(ComplexityProfile.role == role)
                    .where(ComplexityProfile.seniority == seniority)
                    .where(ComplexityProfile.assessment_type == assessment_type)
                    .where(ComplexityProfile.organization_id == None)
                    .where(ComplexityProfile.is_default == True)
                )
                profile = result.scalar_one_or_none()

            if not profile:
                self._set_cache(cache_key, None)
                return None

            value = {
                "role": profile.role,
                "seniority": profile.seniority,
                "assessmentType": profile.assessment_type,
                "entityCountMin": profile.entity_count_min,
                "entityCountMax": profile.entity_count_max,
                "integrationPoints": profile.integration_points,
                "businessLogic": profile.business_logic,
                "ambiguityLevel": profile.ambiguity_level,
                "timeMinutes": profile.time_minutes,
                "requiredSkills": profile.required_skills or [],
                "optionalSkillPool": profile.optional_skill_pool or [],
                "avoidSkills": profile.avoid_skills or [],
                "pickOptionalCount": profile.pick_optional_count,
                "domainPool": profile.domain_pool or [],
                "constraints": profile.constraints or {},
            }
            self._set_cache(cache_key, value)
            return value

    # =========================================================================
    # TECHNOLOGY
    # =========================================================================

    async def get_technologies(
        self,
        category: Optional[str] = None,
        organization_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get technologies, including org-specific ones."""
        cache_key = f"tech:{category or 'all'}:{organization_id or 'system'}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        await self._ensure_initialized()

        async with self._session_factory() as session:
            query = select(Technology).where(Technology.is_active == True)

            if category:
                query = query.where(Technology.category == category)

            # Include system techs + org-specific techs
            if organization_id:
                query = query.where(
                    (Technology.is_system == True) |
                    (Technology.organization_id == organization_id)
                )
            else:
                query = query.where(Technology.is_system == True)

            result = await session.execute(query.order_by(Technology.name))
            techs = result.scalars().all()

            value = [
                {
                    "id": t.slug,
                    "name": t.name,
                    "category": t.category,
                    "description": t.description,
                    "color": t.color,
                    "fileExtensions": t.file_extensions or [],
                    "importPatterns": t.import_patterns or [],
                    "pairedWithIds": t.paired_with_ids or [],
                }
                for t in techs
            ]
            self._set_cache(cache_key, value)
            return value

    # =========================================================================
    # SENIORITY CONFIG
    # =========================================================================

    async def get_seniority_config(
        self,
        seniority_id: str,
        organization_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Get seniority config with scoring weights."""
        cache_key = f"seniority:{seniority_id}:{organization_id or 'system'}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        await self._ensure_initialized()

        async with self._session_factory() as session:
            # Try org-specific first
            config = None
            if organization_id:
                result = await session.execute(
                    select(SeniorityConfig)
                    .where(SeniorityConfig.seniority_id == seniority_id)
                    .where(SeniorityConfig.organization_id == organization_id)
                )
                config = result.scalar_one_or_none()

            # Fall back to system
            if not config:
                result = await session.execute(
                    select(SeniorityConfig)
                    .where(SeniorityConfig.seniority_id == seniority_id)
                    .where(SeniorityConfig.is_system == True)
                )
                config = result.scalar_one_or_none()

            if not config:
                self._set_cache(cache_key, None)
                return None

            value = {
                "id": config.seniority_id,
                "name": config.name,
                "description": config.description,
                "experienceYears": config.experience_years,
                "defaultDuration": config.default_duration,
                "difficultyMix": config.difficulty_mix or {},
                "scoringWeights": config.scoring_weights or {},
            }
            self._set_cache(cache_key, value)
            return value

    async def get_scoring_weights(
        self,
        seniority_id: str,
        organization_id: Optional[str] = None,
    ) -> Dict[str, float]:
        """Get scoring weights for a seniority level."""
        config = await self.get_seniority_config(seniority_id, organization_id)
        return config.get("scoringWeights", {}) if config else {}

    # =========================================================================
    # CACHE MANAGEMENT
    # =========================================================================

    def invalidate_cache(self, pattern: Optional[str] = None) -> None:
        """Invalidate cache entries."""
        if pattern is None:
            self._cache.clear()
            logger.info("Cleared all config cache")
        else:
            keys_to_remove = [k for k in self._cache if pattern in k]
            for k in keys_to_remove:
                del self._cache[k]
            logger.info(f"Invalidated {len(keys_to_remove)} cache entries matching '{pattern}'")

    async def close(self) -> None:
        """Close database connections."""
        if self._engine:
            await self._engine.dispose()
            self._initialized = False
            logger.info("Config service database connections closed")


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

# Global instance
_config_service: Optional[ConfigService] = None


def get_config_service() -> ConfigService:
    """Get the global config service instance."""
    global _config_service
    if _config_service is None:
        _config_service = ConfigService.get_instance()
    return _config_service


async def get_security_config(config_type: str) -> Any:
    """Get security configuration."""
    return await get_config_service().get_security_config(config_type)


async def get_blocked_patterns() -> List[str]:
    """Get blocked bash command patterns."""
    return await get_config_service().get_blocked_patterns()


async def get_allowed_commands() -> List[str]:
    """Get allowed bash commands."""
    return await get_config_service().get_allowed_commands()


async def get_model_config(model_id: str) -> Optional[Dict[str, Any]]:
    """Get AI model configuration."""
    return await get_config_service().get_model_config(model_id)


async def get_sandbox_config(language: str) -> Optional[Dict[str, Any]]:
    """Get sandbox configuration for a language."""
    return await get_config_service().get_sandbox_config(language)


async def get_image_map() -> Dict[str, str]:
    """Get language to Docker image mapping."""
    return await get_config_service().get_image_map()


async def get_complexity_profile(
    role: str,
    seniority: str,
    assessment_type: str,
    organization_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Get complexity profile for question generation."""
    return await get_config_service().get_complexity_profile(
        role, seniority, assessment_type, organization_id
    )


async def get_scoring_weights(
    seniority_id: str,
    organization_id: Optional[str] = None,
) -> Dict[str, float]:
    """Get scoring weights for a seniority level."""
    return await get_config_service().get_scoring_weights(seniority_id, organization_id)
