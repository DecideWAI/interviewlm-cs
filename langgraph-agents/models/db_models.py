"""
SQLAlchemy models mirroring Prisma schema for config access.
These models are READ-ONLY views of the Prisma-managed database schema.

Note: Prisma is the source of truth for schema. These models are for
Python agents to read configuration data from the shared PostgreSQL database.
"""

from datetime import datetime
from enum import Enum
from typing import Any, List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, relationship


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


# =============================================================================
# ENUMS
# =============================================================================

class OverridePolicy(str, Enum):
    """Config override policy - determines how organizations can customize."""
    SYSTEM_ONLY = "SYSTEM_ONLY"           # Cannot be overridden
    BOUNDED = "BOUNDED"                   # Can override within constraints
    FULLY_CUSTOMIZABLE = "FULLY_CUSTOMIZABLE"  # Full control


class AgentBackend(str, Enum):
    """Agent backend type for experiment assignment."""
    CLAUDE_SDK = "CLAUDE_SDK"
    LANGGRAPH = "LANGGRAPH"


class AssessmentType(str, Enum):
    """Assessment type for complexity profiles."""
    REAL_WORLD = "REAL_WORLD"
    SYSTEM_DESIGN = "SYSTEM_DESIGN"


# =============================================================================
# CONFIG SYSTEM MODELS
# =============================================================================

class ConfigCategory(Base):
    """Configuration category with override policy."""
    __tablename__ = "config_categories"

    id = Column(String, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text)
    override_policy = Column(String, default="SYSTEM_ONLY")  # OverridePolicy enum
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    config_items = relationship("ConfigItem", back_populates="category")


class ConfigItem(Base):
    """Individual configuration item with optional constraints."""
    __tablename__ = "config_items"

    id = Column(String, primary_key=True)
    category_id = Column(String, ForeignKey("config_categories.id"), nullable=False)
    key = Column(String, nullable=False)
    value = Column(JSONB)
    value_type = Column(String)  # "number", "string", "array", "object"

    # Constraints for BOUNDED configs
    min_value = Column(Float)
    max_value = Column(Float)
    allowed_values = Column(JSONB)  # For enum-like constraints

    description = Column(Text)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    category = relationship("ConfigCategory", back_populates="config_items")
    overrides = relationship("ConfigOverride", back_populates="config_item")

    __table_args__ = (
        UniqueConstraint('category_id', 'key', name='config_items_category_id_key_key'),
    )


class ConfigOverride(Base):
    """Organization-level configuration override."""
    __tablename__ = "config_overrides"

    id = Column(String, primary_key=True)
    config_item_id = Column(String, ForeignKey("config_items.id"), nullable=False)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    value = Column(JSONB)

    # Audit trail
    created_by = Column(String)
    approved_by = Column(String)
    approved_at = Column(DateTime)
    reason = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    config_item = relationship("ConfigItem", back_populates="overrides")

    __table_args__ = (
        UniqueConstraint('config_item_id', 'organization_id',
                        name='config_overrides_config_item_id_organization_id_key'),
    )


# =============================================================================
# SECURITY CONFIG (SYSTEM_ONLY)
# =============================================================================

class SecurityConfig(Base):
    """Security configuration - blocked commands, rate limits, etc."""
    __tablename__ = "security_configs"

    id = Column(String, primary_key=True)
    config_type = Column(String, unique=True, nullable=False)  # "blocked_patterns", "allowed_commands", etc.
    value = Column(JSONB)
    description = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)


# =============================================================================
# MODEL CONFIG
# =============================================================================

class ModelConfig(Base):
    """AI model configuration with pricing."""
    __tablename__ = "model_configs"

    id = Column(String, primary_key=True)
    model_id = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    input_price_per_m_token = Column(Float)
    output_price_per_m_token = Column(Float)
    max_tokens = Column(Integer)
    context_window = Column(Integer)
    description = Column(Text)
    use_case = Column(Text)

    # Agent recommendations
    recommended_for: List[str] = Column(ARRAY(String), default=[])  # type: ignore[assignment]

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)


# =============================================================================
# SANDBOX CONFIG
# =============================================================================

class SandboxConfig(Base):
    """Per-language sandbox configuration."""
    __tablename__ = "sandbox_configs"

    id = Column(String, primary_key=True)
    language = Column(String, unique=True, nullable=False)
    docker_image = Column(String, nullable=False)

    # Resource limits
    cpu = Column(Float, default=2.0)
    memory_mb = Column(Integer, default=2048)
    timeout_seconds = Column(Integer, default=3600)

    # Constraints for BOUNDED org overrides
    max_cpu = Column(Float, default=4.0)
    max_memory_mb = Column(Integer, default=4096)
    max_timeout_seconds = Column(Integer, default=7200)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)


# =============================================================================
# ROLE CONFIG
# =============================================================================

class RoleConfig(Base):
    """Role definitions (Backend, Frontend, Full-Stack, etc.)."""
    __tablename__ = "role_configs"

    id = Column(String, primary_key=True)
    role_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    icon = Column(String)
    default_duration = Column(Integer, default=60)
    available_in_tiers: List[str] = Column(ARRAY(String), default=[])  # type: ignore[assignment]
    status = Column(String, default="active")

    # Multi-tenancy
    is_system = Column(Boolean, default=True)
    organization_id = Column(String, ForeignKey("organizations.id"))

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('role_id', 'organization_id', name='role_configs_role_id_organization_id_key'),
        Index('role_configs_is_system_idx', 'is_system'),
    )


# =============================================================================
# SENIORITY CONFIG
# =============================================================================

class SeniorityConfig(Base):
    """Seniority levels with scoring weights."""
    __tablename__ = "seniority_configs"

    id = Column(String, primary_key=True)
    seniority_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    experience_years = Column(String)
    default_duration = Column(Integer, default=60)

    # Difficulty distribution
    difficulty_mix = Column(JSONB)  # { easy: 60, medium: 30, hard: 10 }

    # Scoring weights
    scoring_weights = Column(JSONB)  # { technical: 0.35, aiCollaboration: 0.30, ... }

    # Multi-tenancy
    is_system = Column(Boolean, default=True)
    organization_id = Column(String, ForeignKey("organizations.id"))

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('seniority_id', 'organization_id',
                        name='seniority_configs_seniority_id_organization_id_key'),
        Index('seniority_configs_is_system_idx', 'is_system'),
    )


# =============================================================================
# COMPLEXITY PROFILE (Already exists in Prisma - mirror for Python)
# =============================================================================

class ComplexityProfile(Base):
    """Complexity profiles for dynamic question generation."""
    __tablename__ = "complexity_profiles"

    id = Column(String, primary_key=True)

    # Targeting
    role = Column(String, nullable=False)
    seniority = Column(String, nullable=False)
    assessment_type = Column(String, nullable=False)  # AssessmentType enum

    # Complexity dimensions
    entity_count_min = Column(Integer, default=1)
    entity_count_max = Column(Integer, default=2)
    integration_points = Column(Integer, default=0)
    business_logic = Column(String, default="simple")
    ambiguity_level = Column(String, default="clear")
    time_minutes = Column(Integer, default=45)

    # Skill configuration
    required_skills = Column(JSONB)
    optional_skill_pool = Column(JSONB)
    avoid_skills = Column(JSONB)
    pick_optional_count = Column(Integer, default=2)

    # Domain pool
    domain_pool = Column(JSONB)

    # Structural constraints
    constraints = Column(JSONB)

    # Metadata
    is_default = Column(Boolean, default=False)
    organization_id = Column(String, ForeignKey("organizations.id"))

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('role', 'seniority', 'assessment_type', 'organization_id',
                        name='complexity_profiles_role_seniority_assessment_type_org_key'),
        Index('complexity_profiles_role_seniority_assessment_type_idx',
              'role', 'seniority', 'assessment_type'),
    )


# =============================================================================
# TECHNOLOGY (Extended model)
# =============================================================================

class Technology(Base):
    """Technology catalog (languages, frameworks, databases, tools)."""
    __tablename__ = "technologies"

    id = Column(String, primary_key=True)
    slug = Column(String, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)  # "language", "framework", "database", "tool", "testing"
    icon = Column(String)
    description = Column(Text)
    color = Column(String)

    # Detection patterns
    detection_patterns = Column(JSONB, default=[])
    file_extensions: List[str] = Column(ARRAY(String), default=[])  # type: ignore[assignment]
    import_patterns: List[str] = Column(ARRAY(String), default=[])  # type: ignore[assignment]
    content_patterns: List[str] = Column(ARRAY(String), default=[])  # type: ignore[assignment]

    # Relationships
    paired_with_ids: List[str] = Column(ARRAY(String), default=[])  # type: ignore[assignment]

    # Role-based relevance
    suggested_for_roles = Column(JSONB)

    # Multi-tenancy
    is_active = Column(Boolean, default=True)
    is_system = Column(Boolean, default=True)
    organization_id = Column(String, ForeignKey("organizations.id"))

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('slug', 'organization_id', name='technologies_slug_organization_id_key'),
        Index('technologies_category_idx', 'category'),
        Index('technologies_is_system_idx', 'is_system'),
    )


# =============================================================================
# ORGANIZATION (Minimal - for foreign key references)
# =============================================================================

class Organization(Base):
    """Organization - minimal model for FK references."""
    __tablename__ = "organizations"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    plan = Column(String, default="FREE")

    # Relations not fully mapped - just for FK references
