/**
 * Assessment Configuration Constants and Utilities
 */

import {
  Role,
  RoleMetadata,
  SeniorityLevel,
  SeniorityMetadata,
  PricingTier,
  TierLimits,
  AssessmentTemplate,
} from "@/types/assessment";

/**
 * Role definitions with metadata
 */
export const ROLES: Record<Role, RoleMetadata> = {
  backend: {
    id: "backend",
    name: "Backend Engineer",
    description: "Server-side development, APIs, databases, and system architecture",
    icon: "Server",
    defaultDuration: 60,
    availableInTiers: ["payg", "small", "medium", "large", "enterprise"],
    status: "active",
  },
  frontend: {
    id: "frontend",
    name: "Frontend Engineer",
    description: "UI development, React/Vue, responsive design, and user experience",
    icon: "Monitor",
    defaultDuration: 60,
    availableInTiers: ["payg", "small", "medium", "large", "enterprise"],
    status: "coming_soon",
  },
  fullstack: {
    id: "fullstack",
    name: "Full-Stack Engineer",
    description: "End-to-end development across frontend, backend, and infrastructure",
    icon: "Layers",
    defaultDuration: 90,
    availableInTiers: ["payg", "small", "medium", "large", "enterprise"],
    status: "coming_soon",
  },
  database: {
    id: "database",
    name: "Database Engineer",
    description: "Database design, optimization, migrations, and data modeling",
    icon: "Database",
    defaultDuration: 60,
    availableInTiers: ["payg", "small", "medium", "large", "enterprise"],
    status: "coming_soon",
  },
  security: {
    id: "security",
    name: "Security Engineer",
    description: "Application security, penetration testing, and secure coding practices",
    icon: "Shield",
    defaultDuration: 75,
    availableInTiers: ["payg", "small", "medium", "large", "enterprise"],
    status: "coming_soon",
  },
  ml: {
    id: "ml",
    name: "ML Engineer",
    description: "Machine learning, model training, data pipelines, and MLOps",
    icon: "Brain",
    defaultDuration: 90,
    availableInTiers: ["payg", "small", "medium", "large", "enterprise"],
    status: "coming_soon",
  },
  custom: {
    id: "custom",
    name: "Custom Role",
    description: "Define your own specialized role",
    icon: "Settings",
    defaultDuration: 60,
    availableInTiers: ["large", "enterprise"],
    status: "coming_soon",
  },
};

/**
 * Seniority level definitions with metadata
 */
export const SENIORITY_LEVELS: Record<SeniorityLevel, SeniorityMetadata> = {
  junior: {
    id: "junior",
    name: "Junior",
    description: "Early-career developers with 0-2 years of experience",
    experienceYears: "0-2 years",
    defaultDuration: 40,
    difficultyMix: {
      easy: 60,
      medium: 30,
      hard: 10,
    },
  },
  mid: {
    id: "mid",
    name: "Mid-Level",
    description: "Developers with 2-5 years of solid experience",
    experienceYears: "2-5 years",
    defaultDuration: 60,
    difficultyMix: {
      easy: 20,
      medium: 60,
      hard: 20,
    },
  },
  senior: {
    id: "senior",
    name: "Senior",
    description: "Experienced engineers with 5-8 years of expertise",
    experienceYears: "5-8 years",
    defaultDuration: 75,
    difficultyMix: {
      easy: 10,
      medium: 50,
      hard: 40,
    },
  },
  staff: {
    id: "staff",
    name: "Staff",
    description: "Technical leaders with 8-12 years of experience",
    experienceYears: "8-12 years",
    defaultDuration: 90,
    difficultyMix: {
      easy: 5,
      medium: 35,
      hard: 60,
    },
  },
  principal: {
    id: "principal",
    name: "Principal",
    description: "Senior technical leaders with 12+ years of experience",
    experienceYears: "12+ years",
    defaultDuration: 90,
    difficultyMix: {
      easy: 0,
      medium: 30,
      hard: 70,
    },
  },
};

/**
 * Tier-based feature limits
 */
export const TIER_LIMITS: Record<PricingTier, TierLimits> = {
  payg: {
    tier: "payg",
    maxCustomQuestions: 0,
    maxTeamMembers: 1,
    customRolesAllowed: false,
    customInstructionsAllowed: false,
    advancedAnalytics: false,
    previewTestRuns: 0,
  },
  small: {
    tier: "small",
    maxCustomQuestions: 0,
    maxTeamMembers: 3,
    customRolesAllowed: false,
    customInstructionsAllowed: true,
    advancedAnalytics: false,
    previewTestRuns: 1,
  },
  medium: {
    tier: "medium",
    maxCustomQuestions: 10,
    maxTeamMembers: 10,
    customRolesAllowed: false,
    customInstructionsAllowed: true,
    advancedAnalytics: true,
    previewTestRuns: 3,
  },
  large: {
    tier: "large",
    maxCustomQuestions: 50,
    maxTeamMembers: 25,
    customRolesAllowed: true,
    customInstructionsAllowed: true,
    advancedAnalytics: true,
    previewTestRuns: 10,
  },
  enterprise: {
    tier: "enterprise",
    maxCustomQuestions: "unlimited",
    maxTeamMembers: "unlimited",
    customRolesAllowed: true,
    customInstructionsAllowed: true,
    advancedAnalytics: true,
    previewTestRuns: "unlimited",
  },
};

/**
 * Pricing tier display information
 */
export const TIER_INFO = {
  payg: {
    name: "Pay-as-you-go",
    price: 20,
    description: "Perfect for trying out the platform",
  },
  small: {
    name: "Small Pack",
    price: 18,
    description: "10 credits for $180",
  },
  medium: {
    name: "Medium Pack",
    price: 15,
    description: "50 credits for $750",
  },
  large: {
    name: "Large Pack",
    price: 12,
    description: "200 credits for $2,400",
  },
  enterprise: {
    name: "Enterprise",
    price: 10,
    description: "500+ credits with volume discounts",
  },
};

/**
 * Pre-built assessment templates
 */
export const ASSESSMENT_TEMPLATES: AssessmentTemplate[] = [
  {
    id: "backend-junior",
    name: "Junior Backend Engineer",
    role: "backend",
    seniority: "junior",
    description: "Assess fundamental backend skills: REST APIs, basic database queries, and code structure",
    estimatedDuration: 40,
    problemCount: 3,
    minTier: "payg",
    questionSeeds: [
      {
        instructions: "Create simple REST API endpoints for a task management system. Focus on proper HTTP methods, status codes, and basic error handling.",
        topics: ["REST APIs", "HTTP Methods", "Error Handling"],
        difficultyDistribution: { easy: 60, medium: 30, hard: 10 },
      },
      {
        instructions: "Implement a function to process a list of orders and calculate the total revenue by product category. Handle edge cases like missing data or invalid formats.",
        topics: ["Data Processing", "Algorithms", "Error Handling"],
        difficultyDistribution: { easy: 70, medium: 30, hard: 0 },
      },
      {
        instructions: "Design a database schema for a simple blog application (users, posts, comments) and write SQL queries to fetch the latest posts with author details.",
        topics: ["Database Design", "SQL", "Data Modeling"],
        difficultyDistribution: { easy: 50, medium: 50, hard: 0 },
      },
    ],
  },
  {
    id: "backend-mid",
    name: "Mid-Level Backend Engineer",
    role: "backend",
    seniority: "mid",
    description: "Evaluate API design, database optimization, and authentication implementation",
    estimatedDuration: 60,
    problemCount: 4,
    minTier: "payg",
    questionSeeds: [
      {
        instructions: "Build a scalable API with authentication, database relationships, and proper error handling. Include rate limiting and input validation.",
        topics: ["Authentication", "Database Design", "API Security", "Performance"],
        difficultyDistribution: { easy: 20, medium: 60, hard: 20 },
      },
      {
        instructions: "Implement a caching layer for a high-traffic API endpoint using Redis. Handle cache invalidation and consistency strategies.",
        topics: ["Caching", "Redis", "Performance Optimization"],
        difficultyDistribution: { easy: 10, medium: 70, hard: 20 },
      },
      {
        instructions: "Design a background job processing system for handling email notifications. Ensure reliability, retries, and failure handling.",
        topics: ["Async Processing", "Message Queues", "System Design"],
        difficultyDistribution: { easy: 10, medium: 60, hard: 30 },
      },
    ],
  },
  {
    id: "backend-senior",
    name: "Senior Backend Engineer",
    role: "backend",
    seniority: "senior",
    description: "Test system design, microservices architecture, and performance optimization",
    estimatedDuration: 75,
    problemCount: 4,
    minTier: "payg",
    questionSeeds: [
      {
        instructions: "Design and implement a distributed system with message queues, caching, and database replication. Focus on scalability, reliability, and monitoring.",
        topics: ["System Design", "Microservices", "Caching", "Message Queues", "Monitoring"],
        difficultyDistribution: { easy: 10, medium: 50, hard: 40 },
      },
      {
        instructions: "Optimize a slow database query involving multiple joins and millions of rows. Analyze the query plan and implement indexing or schema changes.",
        topics: ["Database Optimization", "Performance Tuning", "SQL"],
        difficultyDistribution: { easy: 0, medium: 40, hard: 60 },
      },
      {
        instructions: "Architect a real-time chat application using WebSockets and a pub/sub system. Handle connection management, message persistence, and scalability.",
        topics: ["Real-time Systems", "WebSockets", "System Architecture"],
        difficultyDistribution: { easy: 0, medium: 50, hard: 50 },
      },
    ],
  },
  {
    id: "frontend-junior",
    name: "Junior Frontend Engineer",
    role: "frontend",
    seniority: "junior",
    description: "Assess React basics, component structure, and state management fundamentals",
    estimatedDuration: 40,
    problemCount: 3,
    minTier: "payg",
    questionSeeds: [
      {
        instructions: "Build basic React components with state management, event handling, and API integration. Focus on proper component structure and hooks usage.",
        topics: ["React Components", "Hooks", "State Management", "API Integration"],
        difficultyDistribution: { easy: 60, medium: 30, hard: 10 },
      },
    ],
  },
  {
    id: "frontend-mid",
    name: "Mid-Level Frontend Engineer",
    role: "frontend",
    seniority: "mid",
    description: "Evaluate advanced React patterns, performance optimization, and responsive design",
    estimatedDuration: 60,
    problemCount: 4,
    minTier: "payg",
    questionSeeds: [
      {
        instructions: "Create a complex UI with advanced state management, optimistic updates, error boundaries, and responsive design. Include performance optimizations.",
        topics: ["Advanced Patterns", "Performance", "Responsive Design", "Error Handling"],
        difficultyDistribution: { easy: 20, medium: 60, hard: 20 },
      },
    ],
  },
  {
    id: "fullstack-senior",
    name: "Senior Full-Stack Engineer",
    role: "fullstack",
    seniority: "senior",
    description: "Comprehensive end-to-end feature development with frontend, backend, and database",
    estimatedDuration: 90,
    problemCount: 5,
    minTier: "payg",
    questionSeeds: [
      {
        instructions: "Build a complete feature from database schema to API endpoints to React UI. Include authentication, real-time updates, and proper error handling throughout the stack.",
        topics: ["Full-Stack Development", "Real-time Features", "System Design", "Code Architecture"],
        difficultyDistribution: { easy: 10, medium: 50, hard: 40 },
      },
    ],
  },
  {
    id: "ml-mid",
    name: "Mid-Level ML Engineer",
    role: "ml",
    seniority: "mid",
    description: "Assess model training, feature engineering, and basic MLOps",
    estimatedDuration: 75,
    problemCount: 4,
    minTier: "payg",
    questionSeeds: [
      {
        instructions: "Implement a machine learning pipeline including data preprocessing, feature engineering, model training, and evaluation. Focus on practical ML engineering skills.",
        topics: ["ML Pipelines", "Feature Engineering", "Model Training", "Evaluation Metrics"],
        difficultyDistribution: { easy: 20, medium: 60, hard: 20 },
      },
    ],
  },
];

/**
 * Get tier limits for a specific tier
 */
export function getTierLimits(tier: PricingTier): TierLimits {
  return TIER_LIMITS[tier];
}

/**
 * Check if a role is available for a tier
 */
export function isRoleAvailableForTier(role: Role, tier: PricingTier): boolean {
  return ROLES[role].availableInTiers.includes(tier);
}

/**
 * Get templates filtered by role and seniority
 */
export function getTemplates(
  role?: Role,
  seniority?: SeniorityLevel
): AssessmentTemplate[] {
  return ASSESSMENT_TEMPLATES.filter((template) => {
    if (role && template.role !== role) return false;
    if (seniority && template.seniority !== seniority) return false;
    return true;
  });
}

/**
 * Calculate recommended duration based on role and seniority
 */
export function getRecommendedDuration(
  role: Role,
  seniority: SeniorityLevel
): number {
  const roleDefault = ROLES[role].defaultDuration;
  const seniorityDefault = SENIORITY_LEVELS[seniority].defaultDuration;

  // Average the two recommendations
  return Math.round((roleDefault + seniorityDefault) / 2);
}

/**
 * Get difficulty distribution for a seniority level
 */
export function getDifficultyMix(seniority: SeniorityLevel) {
  return SENIORITY_LEVELS[seniority].difficultyMix;
}
