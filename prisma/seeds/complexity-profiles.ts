/**
 * Default Complexity Profiles for Dynamic Question Generation
 *
 * These profiles define complexity dimensions (not specific problems) that
 * guide the LLM to generate truly unique, varied problems each time.
 *
 * 10 profiles: 5 seniorities × 2 assessment types for Backend role
 */

import type { AssessmentType } from "@prisma/client";

export interface ComplexityProfileSeed {
  // Targeting
  role: string;
  seniority: string;
  assessmentType: AssessmentType;

  // Complexity dimensions
  entityCountMin: number;
  entityCountMax: number;
  integrationPoints: number;
  businessLogic: "simple" | "moderate" | "complex" | "strategic";
  ambiguityLevel: "clear" | "some_decisions" | "open_ended" | "strategic";
  timeMinutes: number;

  // Skill configuration
  requiredSkills: string[];
  optionalSkillPool: string[];
  avoidSkills: string[];
  pickOptionalCount: number;

  // Domain pool
  domainPool: string[];

  // Structural constraints
  constraints: {
    mustInclude: string[];
    shouldConsider: string[];
    bonus: string[];
  };

  // Metadata
  isDefault: boolean;
}

/**
 * Domain pool shared across all profiles
 * LLM picks randomly from this list to create truly varied problems
 */
const FULL_DOMAIN_POOL = [
  "e-commerce",      // Orders, products, inventory, payments
  "healthcare",      // Appointments, patients, records, prescriptions
  "fintech",         // Transactions, accounts, transfers, compliance
  "social-media",    // Posts, users, feeds, notifications
  "logistics",       // Shipments, routes, tracking, warehouses
  "iot",             // Devices, sensors, telemetry, alerts
  "hr-tech",         // Employees, payroll, reviews, time-off
  "education",       // Courses, students, grades, assignments
  "media-streaming", // Content, subscriptions, streaming, playlists
  "travel",          // Bookings, flights, hotels, itineraries
  "food-delivery",   // Restaurants, menus, orders, delivery tracking
  "real-estate",     // Properties, listings, viewings, contracts
];

/**
 * Junior-friendly domains (simpler business contexts)
 */
const JUNIOR_DOMAINS = [
  "e-commerce",
  "education",
  "hr-tech",
  "social-media",
  "food-delivery",
];

/**
 * Complexity profiles for REAL_WORLD assessments (implementation-focused)
 */
export const REAL_WORLD_PROFILES: ComplexityProfileSeed[] = [
  // JUNIOR - Real World
  {
    role: "backend",
    seniority: "junior",
    assessmentType: "REAL_WORLD",
    entityCountMin: 1,
    entityCountMax: 2,
    integrationPoints: 0,
    businessLogic: "simple",
    ambiguityLevel: "clear",
    timeMinutes: 45,
    requiredSkills: ["crud_operations", "input_validation", "error_handling"],
    optionalSkillPool: ["basic_auth", "simple_queries", "data_formatting", "status_codes"],
    avoidSkills: ["distributed_systems", "event_sourcing", "ml", "realtime", "saga_pattern"],
    pickOptionalCount: 1,
    domainPool: JUNIOR_DOMAINS,
    constraints: {
      mustInclude: ["input_validation", "proper_error_responses", "clear_api_structure"],
      shouldConsider: ["basic_logging", "consistent_naming"],
      bonus: [],
    },
    isDefault: true,
  },

  // MID - Real World
  {
    role: "backend",
    seniority: "mid",
    assessmentType: "REAL_WORLD",
    entityCountMin: 2,
    entityCountMax: 3,
    integrationPoints: 1,
    businessLogic: "moderate",
    ambiguityLevel: "some_decisions",
    timeMinutes: 60,
    requiredSkills: ["api_design", "data_modeling", "error_handling", "relationships"],
    optionalSkillPool: ["auth", "caching", "pagination", "search", "filtering", "soft_deletes"],
    avoidSkills: ["distributed_transactions", "saga_pattern", "ml", "multi_region"],
    pickOptionalCount: 2,
    domainPool: FULL_DOMAIN_POOL,
    constraints: {
      mustInclude: ["proper_relationships", "validation", "error_handling"],
      shouldConsider: ["pagination", "filtering", "efficient_queries"],
      bonus: ["basic_caching"],
    },
    isDefault: true,
  },

  // SENIOR - Real World
  {
    role: "backend",
    seniority: "senior",
    assessmentType: "REAL_WORLD",
    entityCountMin: 3,
    entityCountMax: 4,
    integrationPoints: 2,
    businessLogic: "complex",
    ambiguityLevel: "some_decisions",
    timeMinutes: 75,
    requiredSkills: ["api_design", "async_processing", "error_recovery", "performance"],
    optionalSkillPool: ["queues", "caching", "transactions", "idempotency", "retry_patterns", "rate_limiting", "webhooks"],
    avoidSkills: ["ml_infrastructure", "data_governance", "multi_region"],
    pickOptionalCount: 2,
    domainPool: FULL_DOMAIN_POOL,
    constraints: {
      mustInclude: ["async_handling", "error_recovery", "proper_transactions"],
      shouldConsider: ["idempotency", "rate_limiting", "monitoring_hooks"],
      bonus: ["graceful_degradation", "circuit_breakers"],
    },
    isDefault: true,
  },

  // STAFF - Real World
  {
    role: "backend",
    seniority: "staff",
    assessmentType: "REAL_WORLD",
    entityCountMin: 4,
    entityCountMax: 5,
    integrationPoints: 3,
    businessLogic: "complex",
    ambiguityLevel: "open_ended",
    timeMinutes: 90,
    requiredSkills: ["system_integration", "cross_cutting_concerns", "scalability", "resilience"],
    optionalSkillPool: ["event_driven", "saga_pattern", "multi_tenant", "feature_flags", "observability", "data_consistency", "external_api_integration"],
    avoidSkills: ["ml_model_serving"],
    pickOptionalCount: 3,
    domainPool: FULL_DOMAIN_POOL,
    constraints: {
      mustInclude: ["cross_service_coordination", "failure_handling", "data_consistency"],
      shouldConsider: ["observability", "feature_toggles", "backward_compatibility"],
      bonus: ["zero_downtime_deployment", "canary_release_support"],
    },
    isDefault: true,
  },

  // PRINCIPAL - Real World
  {
    role: "backend",
    seniority: "principal",
    assessmentType: "REAL_WORLD",
    entityCountMin: 5,
    entityCountMax: 7,
    integrationPoints: 4,
    businessLogic: "strategic",
    ambiguityLevel: "strategic",
    timeMinutes: 90,
    requiredSkills: ["architecture_decisions", "tradeoff_analysis", "migration_strategy", "team_scalability"],
    optionalSkillPool: ["legacy_integration", "cost_optimization", "team_impact", "compliance", "multi_region", "data_platform", "api_versioning"],
    avoidSkills: [],
    pickOptionalCount: 3,
    domainPool: FULL_DOMAIN_POOL,
    constraints: {
      mustInclude: ["architectural_decisions_documented", "tradeoff_analysis", "migration_path"],
      shouldConsider: ["cost_implications", "team_ownership", "operational_readiness"],
      bonus: ["runbook_outline", "incident_response_design"],
    },
    isDefault: true,
  },
];

/**
 * Complexity profiles for SYSTEM_DESIGN assessments (architecture + partial implementation)
 */
export const SYSTEM_DESIGN_PROFILES: ComplexityProfileSeed[] = [
  // JUNIOR - System Design
  {
    role: "backend",
    seniority: "junior",
    assessmentType: "SYSTEM_DESIGN",
    entityCountMin: 2,
    entityCountMax: 3,
    integrationPoints: 1,
    businessLogic: "simple",
    ambiguityLevel: "clear",
    timeMinutes: 45,
    requiredSkills: ["basic_architecture", "api_design", "data_modeling"],
    optionalSkillPool: ["caching_concepts", "load_basics", "database_choice"],
    avoidSkills: ["distributed_consensus", "sharding", "multi_region", "eventual_consistency"],
    pickOptionalCount: 1,
    domainPool: JUNIOR_DOMAINS,
    constraints: {
      mustInclude: ["component_diagram", "api_endpoints", "database_schema"],
      shouldConsider: ["deployment_basics", "monitoring_basics"],
      bonus: [],
    },
    isDefault: true,
  },

  // MID - System Design
  {
    role: "backend",
    seniority: "mid",
    assessmentType: "SYSTEM_DESIGN",
    entityCountMin: 3,
    entityCountMax: 5,
    integrationPoints: 2,
    businessLogic: "moderate",
    ambiguityLevel: "some_decisions",
    timeMinutes: 60,
    requiredSkills: ["system_components", "scalability_basics", "api_design", "data_flow"],
    optionalSkillPool: ["caching_strategy", "async_processing", "load_balancing", "database_scaling", "message_queues"],
    avoidSkills: ["distributed_consensus", "multi_region", "global_scale"],
    pickOptionalCount: 2,
    domainPool: FULL_DOMAIN_POOL,
    constraints: {
      mustInclude: ["system_diagram", "data_flow", "api_contracts", "scaling_considerations"],
      shouldConsider: ["bottleneck_analysis", "failure_modes"],
      bonus: ["capacity_estimation"],
    },
    isDefault: true,
  },

  // SENIOR - System Design
  {
    role: "backend",
    seniority: "senior",
    assessmentType: "SYSTEM_DESIGN",
    entityCountMin: 5,
    entityCountMax: 7,
    integrationPoints: 3,
    businessLogic: "complex",
    ambiguityLevel: "open_ended",
    timeMinutes: 75,
    requiredSkills: ["distributed_systems", "scalability", "reliability", "performance_optimization"],
    optionalSkillPool: ["eventual_consistency", "caching_layers", "database_sharding", "service_mesh", "observability", "security_architecture"],
    avoidSkills: ["ml_systems", "blockchain"],
    pickOptionalCount: 3,
    domainPool: FULL_DOMAIN_POOL,
    constraints: {
      mustInclude: ["architecture_diagram", "data_model", "api_design", "scaling_strategy", "failure_handling"],
      shouldConsider: ["cost_analysis", "operational_complexity", "team_structure"],
      bonus: ["disaster_recovery", "compliance_considerations"],
    },
    isDefault: true,
  },

  // STAFF - System Design
  {
    role: "backend",
    seniority: "staff",
    assessmentType: "SYSTEM_DESIGN",
    entityCountMin: 6,
    entityCountMax: 10,
    integrationPoints: 5,
    businessLogic: "complex",
    ambiguityLevel: "open_ended",
    timeMinutes: 90,
    requiredSkills: ["platform_architecture", "organizational_scalability", "technical_strategy", "cross_team_design"],
    optionalSkillPool: ["data_platform", "ml_infrastructure", "multi_region", "compliance_architecture", "api_gateway", "service_ownership"],
    avoidSkills: [],
    pickOptionalCount: 3,
    domainPool: FULL_DOMAIN_POOL,
    constraints: {
      mustInclude: ["platform_vision", "component_ownership", "integration_patterns", "evolution_strategy"],
      shouldConsider: ["build_vs_buy", "technology_selection_criteria", "migration_risks"],
      bonus: ["team_topology_impact", "developer_experience"],
    },
    isDefault: true,
  },

  // PRINCIPAL - System Design
  {
    role: "backend",
    seniority: "principal",
    assessmentType: "SYSTEM_DESIGN",
    entityCountMin: 8,
    entityCountMax: 15,
    integrationPoints: 6,
    businessLogic: "strategic",
    ambiguityLevel: "strategic",
    timeMinutes: 90,
    requiredSkills: ["technical_vision", "organizational_architecture", "strategic_tradeoffs", "multi_year_planning"],
    optionalSkillPool: ["industry_trends", "competitive_analysis", "budget_planning", "vendor_strategy", "acquisition_integration", "platform_ecosystem"],
    avoidSkills: [],
    pickOptionalCount: 4,
    domainPool: FULL_DOMAIN_POOL,
    constraints: {
      mustInclude: ["strategic_vision", "phased_roadmap", "risk_analysis", "organizational_impact"],
      shouldConsider: ["industry_positioning", "talent_strategy", "technology_bets"],
      bonus: ["board_level_summary", "competitive_differentiation"],
    },
    isDefault: true,
  },
];

/**
 * All default complexity profiles (10 total)
 */
export const ALL_COMPLEXITY_PROFILES: ComplexityProfileSeed[] = [
  ...REAL_WORLD_PROFILES,
  ...SYSTEM_DESIGN_PROFILES,
];
