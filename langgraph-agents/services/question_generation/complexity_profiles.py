"""
Complexity Profiles for Question Generation

Default profiles matching TypeScript seeds in prisma/seeds/complexity-profiles.ts.
Used as fallback when database profiles not available.

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
# Domain Pools
# =============================================================================

DOMAIN_POOLS = {
    "junior": [
        "e-commerce",
        "education",
        "hr-tech",
        "social-media",
        "food-delivery",
    ],
    "full": [
        "e-commerce",
        "healthcare",
        "fintech",
        "social-media",
        "logistics",
        "iot",
        "hr-tech",
        "education",
        "media-streaming",
        "travel",
        "food-delivery",
        "real-estate",
    ],
}


# =============================================================================
# Default Profiles (fallback when database empty)
# =============================================================================

DEFAULT_PROFILES: dict[tuple[str, str, str], ComplexityProfile] = {
    # ===================
    # Backend - Junior
    # ===================
    ("backend", "junior", "REAL_WORLD"): {
        "role": "backend",
        "seniority": "junior",
        "assessment_type": "REAL_WORLD",
        "entity_count_min": 1,
        "entity_count_max": 2,
        "integration_points": 0,
        "business_logic": "simple",
        "ambiguity_level": "clear",
        "time_minutes": 45,
        "required_skills": ["crud_operations", "input_validation", "error_handling"],
        "optional_skill_pool": [
            "basic_auth",
            "simple_queries",
            "data_formatting",
            "status_codes",
        ],
        "avoid_skills": [
            "distributed_systems",
            "event_sourcing",
            "ml",
            "realtime",
            "saga_pattern",
        ],
        "pick_optional_count": 1,
        "domain_pool": DOMAIN_POOLS["junior"],
        "constraints": {
            "mustInclude": [
                "input_validation",
                "proper_error_responses",
                "clear_api_structure",
            ],
            "shouldConsider": ["basic_logging", "consistent_naming"],
            "bonus": [],
        },
    },

    # ===================
    # Backend - Mid
    # ===================
    ("backend", "mid", "REAL_WORLD"): {
        "role": "backend",
        "seniority": "mid",
        "assessment_type": "REAL_WORLD",
        "entity_count_min": 2,
        "entity_count_max": 3,
        "integration_points": 1,
        "business_logic": "moderate",
        "ambiguity_level": "some_decisions",
        "time_minutes": 60,
        "required_skills": [
            "api_design",
            "database_queries",
            "error_handling",
            "authentication",
        ],
        "optional_skill_pool": [
            "caching",
            "rate_limiting",
            "pagination",
            "search_filtering",
            "webhooks",
            "background_jobs",
        ],
        "avoid_skills": [
            "distributed_transactions",
            "event_sourcing",
            "ml_integration",
            "realtime_sync",
        ],
        "pick_optional_count": 2,
        "domain_pool": DOMAIN_POOLS["full"],
        "constraints": {
            "mustInclude": [
                "proper_authentication",
                "input_validation",
                "error_handling",
                "api_documentation",
            ],
            "shouldConsider": ["caching_strategy", "logging", "testing"],
            "bonus": ["performance_optimization"],
        },
    },

    # ===================
    # Backend - Senior
    # ===================
    ("backend", "senior", "REAL_WORLD"): {
        "role": "backend",
        "seniority": "senior",
        "assessment_type": "REAL_WORLD",
        "entity_count_min": 3,
        "entity_count_max": 5,
        "integration_points": 2,
        "business_logic": "complex",
        "ambiguity_level": "open_ended",
        "time_minutes": 75,
        "required_skills": [
            "system_design",
            "api_design",
            "database_optimization",
            "security",
        ],
        "optional_skill_pool": [
            "event_driven",
            "caching_strategies",
            "rate_limiting",
            "monitoring",
            "distributed_systems",
            "message_queues",
            "microservices",
        ],
        "avoid_skills": ["ml_implementation", "blockchain"],
        "pick_optional_count": 3,
        "domain_pool": DOMAIN_POOLS["full"],
        "constraints": {
            "mustInclude": [
                "security_considerations",
                "scalability",
                "error_handling",
                "api_documentation",
            ],
            "shouldConsider": [
                "caching",
                "monitoring",
                "testing_strategy",
                "deployment",
            ],
            "bonus": ["performance_optimization", "observability"],
        },
    },

    # ===================
    # Backend - Staff/Principal
    # ===================
    ("backend", "staff", "REAL_WORLD"): {
        "role": "backend",
        "seniority": "staff",
        "assessment_type": "REAL_WORLD",
        "entity_count_min": 4,
        "entity_count_max": 6,
        "integration_points": 3,
        "business_logic": "strategic",
        "ambiguity_level": "strategic",
        "time_minutes": 90,
        "required_skills": [
            "system_architecture",
            "cross_team_design",
            "scalability",
            "security_architecture",
        ],
        "optional_skill_pool": [
            "event_sourcing",
            "cqrs",
            "distributed_consensus",
            "multi_region",
            "observability_platform",
            "api_gateway",
            "service_mesh",
        ],
        "avoid_skills": [],
        "pick_optional_count": 3,
        "domain_pool": DOMAIN_POOLS["full"],
        "constraints": {
            "mustInclude": [
                "architecture_decisions",
                "trade_off_analysis",
                "security",
                "scalability",
            ],
            "shouldConsider": [
                "cost_optimization",
                "team_workflow",
                "documentation",
            ],
            "bonus": ["innovation", "mentorship_opportunity"],
        },
    },

    # ===================
    # Frontend - Junior
    # ===================
    ("frontend", "junior", "REAL_WORLD"): {
        "role": "frontend",
        "seniority": "junior",
        "assessment_type": "REAL_WORLD",
        "entity_count_min": 1,
        "entity_count_max": 2,
        "integration_points": 0,
        "business_logic": "simple",
        "ambiguity_level": "clear",
        "time_minutes": 45,
        "required_skills": ["react_basics", "component_design", "state_management"],
        "optional_skill_pool": [
            "form_handling",
            "api_integration",
            "styling",
            "responsive_design",
        ],
        "avoid_skills": [
            "ssr",
            "advanced_optimization",
            "complex_state",
            "testing_advanced",
        ],
        "pick_optional_count": 1,
        "domain_pool": DOMAIN_POOLS["junior"],
        "constraints": {
            "mustInclude": [
                "clean_components",
                "proper_props",
                "basic_styling",
            ],
            "shouldConsider": ["accessibility_basics", "error_states"],
            "bonus": [],
        },
    },

    # ===================
    # Frontend - Mid
    # ===================
    ("frontend", "mid", "REAL_WORLD"): {
        "role": "frontend",
        "seniority": "mid",
        "assessment_type": "REAL_WORLD",
        "entity_count_min": 2,
        "entity_count_max": 3,
        "integration_points": 1,
        "business_logic": "moderate",
        "ambiguity_level": "some_decisions",
        "time_minutes": 60,
        "required_skills": [
            "react_patterns",
            "state_management",
            "api_integration",
            "typescript",
        ],
        "optional_skill_pool": [
            "testing",
            "performance_optimization",
            "accessibility",
            "animations",
            "custom_hooks",
            "context_api",
        ],
        "avoid_skills": ["ssr_advanced", "micro_frontends", "graphql_advanced"],
        "pick_optional_count": 2,
        "domain_pool": DOMAIN_POOLS["full"],
        "constraints": {
            "mustInclude": [
                "typescript",
                "proper_state_management",
                "error_handling",
            ],
            "shouldConsider": ["testing", "accessibility", "performance"],
            "bonus": ["code_splitting"],
        },
    },

    # ===================
    # Frontend - Senior
    # ===================
    ("frontend", "senior", "REAL_WORLD"): {
        "role": "frontend",
        "seniority": "senior",
        "assessment_type": "REAL_WORLD",
        "entity_count_min": 3,
        "entity_count_max": 5,
        "integration_points": 2,
        "business_logic": "complex",
        "ambiguity_level": "open_ended",
        "time_minutes": 75,
        "required_skills": [
            "architecture",
            "performance_optimization",
            "testing_strategy",
            "accessibility",
        ],
        "optional_skill_pool": [
            "design_systems",
            "micro_frontends",
            "ssr_csr",
            "bundler_optimization",
            "monitoring",
            "ci_cd",
        ],
        "avoid_skills": [],
        "pick_optional_count": 3,
        "domain_pool": DOMAIN_POOLS["full"],
        "constraints": {
            "mustInclude": [
                "architecture_decisions",
                "performance",
                "accessibility",
                "testing",
            ],
            "shouldConsider": ["scalability", "maintainability", "documentation"],
            "bonus": ["innovation", "mentorship_pattern"],
        },
    },

    # ===================
    # Fullstack - Mid
    # ===================
    ("fullstack", "mid", "REAL_WORLD"): {
        "role": "fullstack",
        "seniority": "mid",
        "assessment_type": "REAL_WORLD",
        "entity_count_min": 2,
        "entity_count_max": 4,
        "integration_points": 1,
        "business_logic": "moderate",
        "ambiguity_level": "some_decisions",
        "time_minutes": 60,
        "required_skills": [
            "api_design",
            "react",
            "database",
            "authentication",
        ],
        "optional_skill_pool": [
            "caching",
            "testing",
            "deployment",
            "security",
            "typescript",
            "state_management",
        ],
        "avoid_skills": ["distributed_systems", "ml", "realtime_complex"],
        "pick_optional_count": 2,
        "domain_pool": DOMAIN_POOLS["full"],
        "constraints": {
            "mustInclude": [
                "end_to_end_feature",
                "api_design",
                "frontend_component",
                "data_persistence",
            ],
            "shouldConsider": ["testing", "error_handling", "security"],
            "bonus": ["deployment_config"],
        },
    },

    # ===================
    # System Design - Senior
    # ===================
    ("backend", "senior", "SYSTEM_DESIGN"): {
        "role": "backend",
        "seniority": "senior",
        "assessment_type": "SYSTEM_DESIGN",
        "entity_count_min": 5,
        "entity_count_max": 10,
        "integration_points": 3,
        "business_logic": "complex",
        "ambiguity_level": "strategic",
        "time_minutes": 90,
        "required_skills": [
            "system_architecture",
            "scalability",
            "data_modeling",
            "api_design",
        ],
        "optional_skill_pool": [
            "distributed_systems",
            "caching",
            "message_queues",
            "database_sharding",
            "cdn",
            "load_balancing",
            "monitoring",
        ],
        "avoid_skills": [],
        "pick_optional_count": 4,
        "domain_pool": DOMAIN_POOLS["full"],
        "constraints": {
            "mustInclude": [
                "architecture_diagram",
                "component_design",
                "data_flow",
                "scalability_plan",
            ],
            "shouldConsider": [
                "failure_handling",
                "cost_estimation",
                "security",
            ],
            "bonus": ["trade_off_analysis", "evolution_path"],
        },
    },
}


# =============================================================================
# Profile Lookup Functions
# =============================================================================

async def get_complexity_profile(
    role: str,
    seniority: str,
    assessment_type: str,
    organization_id: str | None = None,
    db=None,
) -> ComplexityProfile | None:
    """
    Get complexity profile from database or fallback to config.

    Args:
        role: e.g., 'backend', 'frontend', 'fullstack'
        seniority: e.g., 'junior', 'mid', 'senior', 'staff', 'principal'
        assessment_type: 'REAL_WORLD' or 'SYSTEM_DESIGN'
        organization_id: Optional org ID for custom profiles
        db: Optional database service instance

    Returns:
        ComplexityProfile or None if not found
    """
    # Normalize seniority
    seniority_lower = seniority.lower()

    # Try database first if provided
    if db:
        try:
            profile = await db.get_complexity_profile(
                role=role,
                seniority=seniority_lower,
                assessment_type=assessment_type,
                organization_id=organization_id,
            )
            if profile:
                return profile
        except Exception:
            pass  # Fall through to default profiles

    # Fallback to Python config
    key = (role, seniority_lower, assessment_type)
    profile = DEFAULT_PROFILES.get(key)

    # Try variations if exact match not found
    if not profile:
        # Try without assessment type variation
        for k, v in DEFAULT_PROFILES.items():
            if k[0] == role and k[1] == seniority_lower:
                return v

        # Try generic backend as fallback
        profile = DEFAULT_PROFILES.get(("backend", "mid", "REAL_WORLD"))

    return profile


def get_domain_pool(seniority: str) -> list[str]:
    """Get appropriate domain pool based on seniority."""
    if seniority.lower() in ["junior"]:
        return DOMAIN_POOLS["junior"]
    return DOMAIN_POOLS["full"]
