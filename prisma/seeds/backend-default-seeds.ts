/**
 * Default Problem Seeds for Backend Interviews
 *
 * This file contains the 10 canonical default seeds for Backend assessments:
 * - 5 seniority levels (Junior, Mid, Senior, Staff, Principal)
 * - 2 assessment types (Real World, System Design)
 *
 * These seeds are marked as `isDefaultSeed: true` and `isSystemSeed: true`
 * to serve as the starting point for assessments.
 */

import type { Difficulty, AssessmentType } from '@prisma/client';
import type {
  RequiredTechStack,
  BaseProblem,
  ProgressionHints,
  SeniorityExpectations,
  DesignDocTemplate,
  ArchitectureHints,
  EvaluationRubric,
  REAL_WORLD_RUBRIC,
  SYSTEM_DESIGN_RUBRIC,
} from '@/types/seed';

/**
 * Default Seed structure for database seeding
 */
export interface DefaultSeedData {
  title: string;
  description: string;
  difficulty: Difficulty;
  category: string;
  domain: string;
  tags: string[];
  topics: string[];
  language: string;
  estimatedTime: number;
  seedType: 'incremental';
  status: 'active';

  // Targeting fields
  targetRole: 'backend';
  targetSeniority: 'junior' | 'mid' | 'senior' | 'staff' | 'principal';
  assessmentType: AssessmentType;
  isDefaultSeed: true;
  isSystemSeed: true;

  // Incremental assessment fields
  requiredTech: RequiredTechStack;
  baseProblem: BaseProblem;
  progressionHints: ProgressionHints;
  seniorityExpectations: SeniorityExpectations;

  // System Design specific (only for SYSTEM_DESIGN type)
  designDocTemplate?: DesignDocTemplate;
  architectureHints?: ArchitectureHints;
  implementationScope?: 'api_skeleton' | 'core_service' | 'integration_layer';

  // Evaluation rubric
  evaluationRubric: EvaluationRubric;
}

// ============================================================
// REAL WORLD PROBLEM SEEDS (5)
// ============================================================

const JUNIOR_REAL_WORLD: DefaultSeedData = {
  title: 'Todo API with Basic Validation',
  description: `Build a simple REST API for a todo list application. This assessment evaluates
fundamental backend skills: CRUD operations, input validation, error handling, and basic testing.
Perfect for entry-level candidates who should demonstrate clean code practices and understanding
of RESTful conventions.`,
  difficulty: 'EASY',
  category: 'backend',
  domain: 'API Development',
  tags: ['REST API', 'CRUD', 'Validation', 'Node.js', 'Express'],
  topics: ['API Design', 'Input Validation', 'Error Handling', 'Testing Basics'],
  language: 'typescript',
  estimatedTime: 45,
  seedType: 'incremental',
  status: 'active',

  targetRole: 'backend',
  targetSeniority: 'junior',
  assessmentType: 'REAL_WORLD',
  isDefaultSeed: true,
  isSystemSeed: true,

  requiredTech: {
    languages: [{ name: 'typescript', priority: 'critical', version: '>=4.5' }],
    frameworks: [{ name: 'express', priority: 'required' }],
    databases: [{ name: 'sqlite', priority: 'required' }],
    tools: [{ name: 'jest', priority: 'recommended' }],
  },

  baseProblem: {
    title: 'Basic Todo CRUD API',
    description: `Implement a REST API for managing todo items.

**Requirements:**
- GET /todos - List all todos
- POST /todos - Create a new todo (title required, max 200 chars)
- GET /todos/:id - Get a specific todo
- PATCH /todos/:id - Update a todo (title, completed)
- DELETE /todos/:id - Delete a todo

**Validation Rules:**
- Title is required and must be 1-200 characters
- Completed must be a boolean
- Return 400 for validation errors with helpful messages
- Return 404 for non-existent todos

**Success Criteria:**
- All endpoints return proper status codes
- Validation errors include field-level messages
- Tests cover happy path and error cases`,
    starterCode: `// src/routes/todos.ts
import { Router } from 'express';

const router = Router();

// In-memory storage (replace with DB in production)
interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
}

const todos: Map<string, Todo> = new Map();

// TODO: Implement CRUD endpoints
// Remember to:
// 1. Validate inputs
// 2. Return proper status codes
// 3. Handle errors gracefully

export default router;`,
    estimatedTime: 20,
  },

  progressionHints: {
    extensionTopics: [
      'Pagination and sorting',
      'Due date field with date validation',
      'Priority levels (low, medium, high)',
      'Simple search/filter functionality',
      'Soft delete implementation',
    ],
    simplificationTopics: [
      'Basic GET and POST only',
      'Simpler validation rules',
      'Skip pagination',
      'In-memory only (no persistence)',
    ],
  },

  seniorityExpectations: {
    junior: [
      'Implement all CRUD endpoints correctly',
      'Add proper input validation',
      'Return appropriate HTTP status codes',
      'Write basic tests for main flows',
      'Handle common error cases',
    ],
  },

  evaluationRubric: {
    type: 'REAL_WORLD',
    criteria: [
      { name: 'Problem Completion', weight: 30, description: 'All CRUD endpoints work correctly' },
      { name: 'Code Quality', weight: 25, description: 'Clean, readable, well-organized code' },
      { name: 'Testing', weight: 20, description: 'Tests cover happy path and error cases' },
      { name: 'Error Handling', weight: 15, description: 'Proper validation and error messages' },
      { name: 'Efficiency', weight: 10, description: 'Reasonable performance for simple operations' },
    ],
  },
};

const MID_REAL_WORLD: DefaultSeedData = {
  title: 'Product API with Authentication and Caching',
  description: `Build a product catalog API with JWT authentication, caching layer, and pagination.
This assessment evaluates mid-level skills: auth implementation, performance optimization,
database queries, and handling concurrent requests.`,
  difficulty: 'MEDIUM',
  category: 'backend',
  domain: 'E-commerce',
  tags: ['REST API', 'Authentication', 'Caching', 'Pagination', 'JWT'],
  topics: ['Auth Patterns', 'Caching Strategy', 'Database Optimization', 'API Design'],
  language: 'typescript',
  estimatedTime: 60,
  seedType: 'incremental',
  status: 'active',

  targetRole: 'backend',
  targetSeniority: 'mid',
  assessmentType: 'REAL_WORLD',
  isDefaultSeed: true,
  isSystemSeed: true,

  requiredTech: {
    languages: [{ name: 'typescript', priority: 'critical' }],
    frameworks: [{ name: 'express', priority: 'required' }],
    databases: [{ name: 'postgresql', priority: 'required' }],
    tools: [
      { name: 'jwt', priority: 'critical' },
      { name: 'redis', priority: 'recommended' },
    ],
  },

  baseProblem: {
    title: 'Product Catalog with Auth',
    description: `Implement a product catalog API with authentication.

**Requirements:**
- POST /auth/login - Return JWT token
- GET /products - List products (paginated, cached)
- GET /products/:id - Get product details
- POST /products - Create product (admin only)
- Auth middleware to protect routes

**Specifications:**
- JWT tokens expire in 1 hour
- Pagination: default 20 items, max 100
- Cache product list for 5 minutes
- Products have: id, name, price, category, stock

**Success Criteria:**
- Auth flow works correctly
- Pagination returns correct results
- Caching improves response times
- Admin-only routes are protected`,
    starterCode: `// src/app.ts
import express from 'express';
import { authRouter } from './routes/auth';
import { productRouter } from './routes/products';
import { authMiddleware } from './middleware/auth';

const app = express();

// TODO: Configure middleware
// TODO: Set up routes with auth protection
// TODO: Implement caching strategy

export default app;`,
    estimatedTime: 25,
  },

  progressionHints: {
    extensionTopics: [
      'Refresh token implementation',
      'Role-based access control (RBAC)',
      'Rate limiting per user',
      'Search with full-text indexing',
      'Bulk product operations',
      'Cache invalidation strategies',
    ],
    simplificationTopics: [
      'Simple token without refresh',
      'In-memory caching only',
      'Basic pagination without sorting',
      'Single role (user/admin)',
    ],
  },

  seniorityExpectations: {
    mid: [
      'Implement JWT authentication correctly',
      'Add pagination with cursor or offset',
      'Implement basic caching layer',
      'Protect admin routes appropriately',
      'Handle concurrent request scenarios',
      'Write integration tests',
    ],
  },

  evaluationRubric: {
    type: 'REAL_WORLD',
    criteria: [
      { name: 'Problem Completion', weight: 30, description: 'Auth, CRUD, pagination, and caching work' },
      { name: 'Code Quality', weight: 25, description: 'Well-structured, maintainable code' },
      { name: 'Testing', weight: 20, description: 'Integration tests cover key scenarios' },
      { name: 'Error Handling', weight: 15, description: 'Auth errors, validation, edge cases' },
      { name: 'Efficiency', weight: 10, description: 'Caching effective, queries optimized' },
    ],
  },
};

const SENIOR_REAL_WORLD: DefaultSeedData = {
  title: 'Order Processing with Async Jobs',
  description: `Build an order processing system with background jobs, retry logic, and transaction
handling. This assessment evaluates senior-level skills: distributed systems patterns, error recovery,
idempotency, and production-ready code quality.`,
  difficulty: 'MEDIUM',
  category: 'backend',
  domain: 'E-commerce',
  tags: ['Async Processing', 'Queues', 'Transactions', 'Error Recovery', 'Idempotency'],
  topics: ['Message Queues', 'Transaction Handling', 'Retry Patterns', 'Idempotency'],
  language: 'typescript',
  estimatedTime: 75,
  seedType: 'incremental',
  status: 'active',

  targetRole: 'backend',
  targetSeniority: 'senior',
  assessmentType: 'REAL_WORLD',
  isDefaultSeed: true,
  isSystemSeed: true,

  requiredTech: {
    languages: [{ name: 'typescript', priority: 'critical' }],
    frameworks: [{ name: 'express', priority: 'required' }],
    databases: [{ name: 'postgresql', priority: 'critical' }],
    tools: [
      { name: 'bullmq', priority: 'required' },
      { name: 'redis', priority: 'required' },
    ],
  },

  baseProblem: {
    title: 'Order Processing Pipeline',
    description: `Implement an order processing system with async job handling.

**Requirements:**
- POST /orders - Create order (validates stock, creates job)
- GET /orders/:id - Get order status
- Background job processes payment and updates stock
- Implement retry logic with exponential backoff
- Handle failures gracefully (rollback, dead-letter queue)

**Order Flow:**
1. Validate stock availability
2. Create order in PENDING state
3. Enqueue payment processing job
4. Job: Process payment -> Update stock -> Mark COMPLETED
5. On failure: Retry 3x, then move to DLQ

**Success Criteria:**
- Orders are idempotent (same request = same result)
- Failed jobs are retried correctly
- Stock is never oversold
- Partial failures are handled (rollback)`,
    starterCode: `// src/services/order-service.ts
import { Queue, Worker } from 'bullmq';

interface Order {
  id: string;
  items: Array<{ productId: string; quantity: number }>;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  idempotencyKey: string;
}

// TODO: Implement order creation with idempotency
// TODO: Set up job queue with retry logic
// TODO: Implement worker with transaction handling
// TODO: Handle failures and rollback

export class OrderService {
  // ...
}`,
    estimatedTime: 30,
  },

  progressionHints: {
    extensionTopics: [
      'Distributed locking for stock updates',
      'Saga pattern for multi-service transactions',
      'Event sourcing for order history',
      'Circuit breaker for external services',
      'Observability (tracing, metrics)',
      'Graceful shutdown handling',
    ],
    simplificationTopics: [
      'Simpler retry logic (fixed delay)',
      'Skip distributed locking',
      'Single transaction (no saga)',
      'Basic error logging only',
    ],
  },

  seniorityExpectations: {
    senior: [
      'Implement idempotent order creation',
      'Set up job queue with proper retry logic',
      'Handle transactions with rollback',
      'Implement dead-letter queue',
      'Add proper logging and error tracking',
      'Consider race conditions and locking',
    ],
  },

  evaluationRubric: {
    type: 'REAL_WORLD',
    criteria: [
      { name: 'Problem Completion', weight: 30, description: 'Order flow, jobs, retries work correctly' },
      { name: 'Code Quality', weight: 25, description: 'Production-ready, well-architected' },
      { name: 'Testing', weight: 20, description: 'Tests cover failure scenarios' },
      { name: 'Error Handling', weight: 15, description: 'Rollback, DLQ, idempotency' },
      { name: 'Efficiency', weight: 10, description: 'Handles concurrent orders, no race conditions' },
    ],
  },
};

const STAFF_REAL_WORLD: DefaultSeedData = {
  title: 'Multi-Tenant Platform Service',
  description: `Build a multi-tenant platform feature with tenant isolation, feature flags, and
cross-service coordination. This assessment evaluates staff-level skills: platform thinking,
tenant isolation, feature management, and cross-team coordination patterns.`,
  difficulty: 'HARD',
  category: 'backend',
  domain: 'Platform Engineering',
  tags: ['Multi-tenancy', 'Feature Flags', 'Platform', 'Isolation', 'Configuration'],
  topics: ['Tenant Isolation', 'Feature Management', 'Platform Patterns', 'Configuration'],
  language: 'typescript',
  estimatedTime: 90,
  seedType: 'incremental',
  status: 'active',

  targetRole: 'backend',
  targetSeniority: 'staff',
  assessmentType: 'REAL_WORLD',
  isDefaultSeed: true,
  isSystemSeed: true,

  requiredTech: {
    languages: [{ name: 'typescript', priority: 'critical' }],
    frameworks: [{ name: 'express', priority: 'required' }],
    databases: [{ name: 'postgresql', priority: 'critical' }],
    tools: [
      { name: 'redis', priority: 'required' },
      { name: 'launchdarkly', priority: 'recommended' },
    ],
  },

  baseProblem: {
    title: 'Tenant Feature Management',
    description: `Implement a feature flag system with tenant-specific overrides.

**Requirements:**
- Tenant context middleware (extract from JWT/header)
- Feature flag service with tenant overrides
- GET /features - List features for current tenant
- PUT /features/:key - Admin: Set tenant-specific override
- Row-level security for tenant data isolation

**Feature Flag Rules:**
1. Global default (all tenants)
2. Tenant-specific override (highest priority)
3. Percentage rollout support
4. Feature dependencies (A requires B)

**Success Criteria:**
- Tenant data is completely isolated
- Feature flags resolve correctly with overrides
- Changes propagate without restart
- Audit log for feature changes`,
    starterCode: `// src/services/feature-service.ts
interface FeatureFlag {
  key: string;
  defaultValue: boolean;
  tenantOverrides: Map<string, boolean>;
  rolloutPercentage?: number;
  dependencies?: string[];
}

interface TenantContext {
  tenantId: string;
  plan: 'free' | 'pro' | 'enterprise';
}

// TODO: Implement feature flag resolution
// TODO: Add tenant isolation layer
// TODO: Implement override management
// TODO: Add audit logging

export class FeatureService {
  // ...
}`,
    estimatedTime: 35,
  },

  progressionHints: {
    extensionTopics: [
      'A/B testing integration',
      'Feature flag targeting rules',
      'Cross-service feature sync',
      'Feature analytics and usage tracking',
      'Gradual rollout with canary',
      'Feature flag SDK design',
    ],
    simplificationTopics: [
      'Simple boolean flags only',
      'Skip percentage rollouts',
      'In-memory storage',
      'Basic tenant isolation',
    ],
  },

  seniorityExpectations: {
    staff: [
      'Design robust tenant isolation',
      'Implement feature flag with complex rules',
      'Consider cross-service coordination',
      'Add comprehensive audit logging',
      'Design for extensibility and SDK usage',
      'Document patterns for team adoption',
    ],
  },

  evaluationRubric: {
    type: 'REAL_WORLD',
    criteria: [
      { name: 'Problem Completion', weight: 30, description: 'Tenant isolation, flags, overrides work' },
      { name: 'Code Quality', weight: 25, description: 'Platform-quality, extensible code' },
      { name: 'Testing', weight: 20, description: 'Tests cover isolation and edge cases' },
      { name: 'Error Handling', weight: 15, description: 'Graceful degradation, audit logging' },
      { name: 'Efficiency', weight: 10, description: 'Flag resolution is fast, cacheable' },
    ],
  },
};

const PRINCIPAL_REAL_WORLD: DefaultSeedData = {
  title: 'Strategic API Migration',
  description: `Execute a strategic API migration with backward compatibility, feature parity
validation, and zero-downtime transition. This assessment evaluates principal-level skills:
technical strategy, risk mitigation, stakeholder communication, and long-term thinking.`,
  difficulty: 'HARD',
  category: 'backend',
  domain: 'Technical Strategy',
  tags: ['Migration', 'Backward Compatibility', 'Strategy', 'Risk Management', 'Documentation'],
  topics: ['Migration Patterns', 'Compatibility', 'Risk Assessment', 'Technical Writing'],
  language: 'typescript',
  estimatedTime: 90,
  seedType: 'incremental',
  status: 'active',

  targetRole: 'backend',
  targetSeniority: 'principal',
  assessmentType: 'REAL_WORLD',
  isDefaultSeed: true,
  isSystemSeed: true,

  requiredTech: {
    languages: [{ name: 'typescript', priority: 'critical' }],
    frameworks: [{ name: 'express', priority: 'required' }],
    databases: [{ name: 'postgresql', priority: 'required' }],
    tools: [{ name: 'openapi', priority: 'recommended' }],
  },

  baseProblem: {
    title: 'API Version Migration Layer',
    description: `Implement a migration layer for transitioning from v1 to v2 API.

**Scenario:**
Legacy v1 API has technical debt and inconsistent patterns. You're leading
the migration to a cleaner v2 while maintaining v1 support.

**Requirements:**
- Adapter layer translating v1 requests to v2 format
- Response transformer for v2 -> v1 compatibility
- Feature flag to gradually shift traffic
- Metrics to track migration progress
- Deprecation headers and documentation

**Migration Rules:**
- v1: /api/v1/users/:id -> v2: /api/v2/users/:id
- Field mappings: user_name -> username, email_addr -> email
- v1 returns XML option, v2 JSON only (adapter handles)
- Maintain v1 error codes (map from v2)

**Success Criteria:**
- Zero breaking changes for v1 consumers
- Clean v2 API without legacy constraints
- Traffic can shift incrementally
- Clear deprecation timeline communicated`,
    starterCode: `// src/migration/adapter.ts
interface V1Request {
  // Legacy format
}

interface V2Request {
  // Clean format
}

// TODO: Implement request/response adapters
// TODO: Add feature flag for traffic shifting
// TODO: Implement metrics tracking
// TODO: Add deprecation headers

export class MigrationAdapter {
  // ...
}`,
    estimatedTime: 35,
  },

  progressionHints: {
    extensionTopics: [
      'Contract testing between versions',
      'Shadow traffic validation',
      'Rollback strategy implementation',
      'Client SDK migration guide',
      'Performance comparison metrics',
      'Stakeholder communication plan',
    ],
    simplificationTopics: [
      'Simpler field mapping',
      'Skip XML support',
      'Basic feature flag',
      'Manual metric tracking',
    ],
  },

  seniorityExpectations: {
    principal: [
      'Design comprehensive migration strategy',
      'Implement backward-compatible adapters',
      'Add observability for migration tracking',
      'Document deprecation timeline clearly',
      'Consider client impact and communication',
      'Plan for rollback scenarios',
    ],
  },

  evaluationRubric: {
    type: 'REAL_WORLD',
    criteria: [
      { name: 'Problem Completion', weight: 30, description: 'Adapter works, traffic shifts correctly' },
      { name: 'Code Quality', weight: 25, description: 'Strategic, maintainable implementation' },
      { name: 'Testing', weight: 20, description: 'Contract tests, compatibility validation' },
      { name: 'Error Handling', weight: 15, description: 'Graceful degradation, clear errors' },
      { name: 'Efficiency', weight: 10, description: 'Minimal latency overhead from adapter' },
    ],
  },
};

// ============================================================
// SYSTEM DESIGN SEEDS (5)
// ============================================================

const JUNIOR_SYSTEM_DESIGN: DefaultSeedData = {
  title: 'URL Shortener Design',
  description: `Design and implement a basic URL shortener service. This assessment evaluates
foundational system design skills: API design, data modeling, and basic scalability thinking.
Candidates should demonstrate clear documentation and explanation of their choices.`,
  difficulty: 'EASY',
  category: 'backend',
  domain: 'System Design',
  tags: ['System Design', 'URL Shortener', 'API Design', 'Data Modeling'],
  topics: ['API Design', 'Data Modeling', 'Basic Scalability', 'Documentation'],
  language: 'typescript',
  estimatedTime: 50,
  seedType: 'incremental',
  status: 'active',

  targetRole: 'backend',
  targetSeniority: 'junior',
  assessmentType: 'SYSTEM_DESIGN',
  isDefaultSeed: true,
  isSystemSeed: true,

  requiredTech: {
    languages: [{ name: 'typescript', priority: 'critical' }],
    frameworks: [{ name: 'express', priority: 'required' }],
    databases: [{ name: 'sqlite', priority: 'required' }],
    tools: [],
  },

  baseProblem: {
    title: 'URL Shortener System',
    description: `Design a URL shortening service like bit.ly.

**Requirements:**
1. Document your design in DESIGN.md
2. Implement core shortening logic
3. Create API endpoints

**Design Document Sections:**
- Overview: What does the system do?
- Data Model: How are URLs stored?
- API Design: Endpoint definitions
- Short Code Generation: Your approach

**API Requirements:**
- POST /shorten { url: string } -> { shortUrl: string }
- GET /:code -> Redirect to original URL

**Success Criteria:**
- Clear design documentation
- Working implementation
- Explanation of design choices`,
    starterCode: `// DESIGN.md
# URL Shortener Design

## Overview
[Describe what your URL shortener does]

## Data Model
[Define your data structure for storing URLs]

## API Design
[Document your API endpoints]

## Short Code Generation
[Explain how you generate unique short codes]

// src/shortener.ts
// TODO: Implement URL shortening logic
// Consider: How to generate unique codes? How to handle collisions?`,
    estimatedTime: 25,
  },

  progressionHints: {
    extensionTopics: [
      'Custom short codes',
      'URL expiration',
      'Click analytics',
      'Rate limiting',
      'Collision handling strategies',
    ],
    simplificationTopics: [
      'Basic sequential IDs',
      'Skip analytics',
      'In-memory only',
      'Simple redirect',
    ],
  },

  seniorityExpectations: {
    junior: [
      'Document design clearly',
      'Implement working shortener',
      'Explain trade-offs in code generation',
      'Handle basic edge cases',
    ],
  },

  designDocTemplate: {
    sections: [
      { title: 'Overview', description: 'High-level system description', required: true },
      { title: 'Data Model', description: 'Database schema and data structures', required: true },
      { title: 'API Design', description: 'REST endpoint definitions', required: true },
      { title: 'Short Code Generation', description: 'Algorithm for generating codes', required: true },
    ],
    tradeoffs: ['Short code length vs collision probability', 'Sequential vs random codes'],
    constraints: ['Handle 1000 URLs per day', 'Codes should be URL-safe'],
  },

  architectureHints: {
    components: ['URL Encoder', 'Storage Layer', 'Redirect Service'],
    patterns: ['Hash-based encoding', 'Base62 encoding'],
    scalabilityGoals: ['Handle basic traffic'],
  },

  implementationScope: 'core_service',

  evaluationRubric: {
    type: 'SYSTEM_DESIGN',
    criteria: [
      { name: 'Design Clarity', weight: 30, description: 'Clear documentation of design choices' },
      { name: 'Trade-off Analysis', weight: 25, description: 'Discusses pros/cons of approach' },
      { name: 'API Design', weight: 20, description: 'Well-defined API contracts' },
      { name: 'Implementation', weight: 15, description: 'Core logic works correctly' },
      { name: 'Communication', weight: 10, description: 'Clear explanation of decisions' },
    ],
  },
};

const MID_SYSTEM_DESIGN: DefaultSeedData = {
  title: 'API Gateway Design',
  description: `Design and implement an API gateway with routing, rate limiting, and authentication.
This assessment evaluates mid-level system design: request routing, middleware patterns,
and performance considerations.`,
  difficulty: 'MEDIUM',
  category: 'backend',
  domain: 'System Design',
  tags: ['System Design', 'API Gateway', 'Routing', 'Rate Limiting', 'Middleware'],
  topics: ['Gateway Patterns', 'Routing', 'Rate Limiting', 'Authentication'],
  language: 'typescript',
  estimatedTime: 65,
  seedType: 'incremental',
  status: 'active',

  targetRole: 'backend',
  targetSeniority: 'mid',
  assessmentType: 'SYSTEM_DESIGN',
  isDefaultSeed: true,
  isSystemSeed: true,

  requiredTech: {
    languages: [{ name: 'typescript', priority: 'critical' }],
    frameworks: [{ name: 'express', priority: 'required' }],
    databases: [{ name: 'redis', priority: 'required' }],
    tools: [{ name: 'jwt', priority: 'required' }],
  },

  baseProblem: {
    title: 'API Gateway System',
    description: `Design an API gateway for a microservices architecture.

**Requirements:**
1. Document your design in DESIGN.md
2. Implement core gateway functionality
3. Add rate limiting and auth

**Design Document Sections:**
- Architecture Overview
- Routing Strategy
- Rate Limiting Design
- Authentication Flow
- Error Handling

**Gateway Features:**
- Route requests to backend services
- Rate limit: 100 req/min per API key
- JWT validation for protected routes
- Request/response logging

**Success Criteria:**
- Clear architecture documentation
- Working routing and rate limiting
- Authentication middleware works`,
    starterCode: `// DESIGN.md
# API Gateway Design

## Architecture Overview
[Describe the gateway's role in the system]

## Routing Strategy
[How requests are routed to services]

## Rate Limiting Design
[Your rate limiting approach]

## Authentication Flow
[How auth is handled]

// src/gateway.ts
// TODO: Implement gateway with routing, rate limiting, auth`,
    estimatedTime: 30,
  },

  progressionHints: {
    extensionTopics: [
      'Circuit breaker pattern',
      'Request transformation',
      'Response caching',
      'Load balancing',
      'API versioning',
      'Health checks and failover',
    ],
    simplificationTopics: [
      'Simple routing only',
      'Fixed rate limits',
      'Skip load balancing',
      'Basic auth',
    ],
  },

  seniorityExpectations: {
    mid: [
      'Design clear gateway architecture',
      'Implement efficient routing',
      'Add robust rate limiting',
      'Handle authentication properly',
      'Consider failure scenarios',
    ],
  },

  designDocTemplate: {
    sections: [
      { title: 'Architecture Overview', description: 'System context and gateway role', required: true },
      { title: 'Routing Strategy', description: 'How requests are matched and forwarded', required: true },
      { title: 'Rate Limiting Design', description: 'Algorithm and storage for rate limits', required: true },
      { title: 'Authentication Flow', description: 'JWT validation and token handling', required: true },
      { title: 'Error Handling', description: 'How errors propagate through the gateway', required: true },
    ],
    tradeoffs: [
      'Centralized auth vs service-level auth',
      'In-memory vs distributed rate limiting',
      'Sync vs async request processing',
    ],
    constraints: ['Handle 1000 req/sec', 'Sub-100ms routing overhead', 'HA requirements'],
  },

  architectureHints: {
    components: ['Router', 'Rate Limiter', 'Auth Middleware', 'Service Registry'],
    patterns: ['Middleware chain', 'Token bucket', 'Circuit breaker'],
    scalabilityGoals: ['Horizontal scaling', 'Shared rate limit state'],
  },

  implementationScope: 'core_service',

  evaluationRubric: {
    type: 'SYSTEM_DESIGN',
    criteria: [
      { name: 'Design Clarity', weight: 30, description: 'Architecture is well-documented' },
      { name: 'Trade-off Analysis', weight: 25, description: 'Discusses design trade-offs' },
      { name: 'API Design', weight: 20, description: 'Gateway interfaces are clean' },
      { name: 'Implementation', weight: 15, description: 'Core features work correctly' },
      { name: 'Communication', weight: 10, description: 'Design rationale is clear' },
    ],
  },
};

const SENIOR_SYSTEM_DESIGN: DefaultSeedData = {
  title: 'Distributed Task Queue Design',
  description: `Design a distributed task queue with priority scheduling, retry logic, and
exactly-once processing. This assessment evaluates senior system design: distributed systems
patterns, consistency models, and fault tolerance.`,
  difficulty: 'MEDIUM',
  category: 'backend',
  domain: 'System Design',
  tags: ['System Design', 'Distributed Systems', 'Task Queue', 'Fault Tolerance'],
  topics: ['Distributed Systems', 'Message Queues', 'Consistency', 'Fault Tolerance'],
  language: 'typescript',
  estimatedTime: 80,
  seedType: 'incremental',
  status: 'active',

  targetRole: 'backend',
  targetSeniority: 'senior',
  assessmentType: 'SYSTEM_DESIGN',
  isDefaultSeed: true,
  isSystemSeed: true,

  requiredTech: {
    languages: [{ name: 'typescript', priority: 'critical' }],
    frameworks: [{ name: 'express', priority: 'required' }],
    databases: [
      { name: 'postgresql', priority: 'required' },
      { name: 'redis', priority: 'required' },
    ],
    tools: [],
  },

  baseProblem: {
    title: 'Distributed Task Queue',
    description: `Design a distributed task queue system.

**Requirements:**
1. Document your design comprehensively
2. Implement core queue functionality
3. Handle failures and retries

**Design Document Sections:**
- System Architecture
- Data Model and Storage
- Priority Scheduling Algorithm
- Exactly-Once Processing Strategy
- Failure Handling and Recovery
- Scalability Considerations

**Queue Features:**
- Priority levels (critical, high, normal, low)
- Retry with exponential backoff (max 3 attempts)
- Dead-letter queue for failed tasks
- Exactly-once processing guarantee
- Task deduplication

**Success Criteria:**
- Comprehensive design document
- Working queue with priorities
- Retry logic handles edge cases
- Demonstrates consistency thinking`,
    starterCode: `// DESIGN.md
# Distributed Task Queue Design

## System Architecture
[Overall architecture with components]

## Data Model and Storage
[How tasks are stored and indexed]

## Priority Scheduling Algorithm
[How tasks are prioritized and dequeued]

## Exactly-Once Processing Strategy
[How you guarantee exactly-once]

## Failure Handling and Recovery
[Retry logic, DLQ, recovery procedures]

// src/queue.ts
// TODO: Implement distributed task queue`,
    estimatedTime: 35,
  },

  progressionHints: {
    extensionTopics: [
      'Delayed/scheduled tasks',
      'Task dependencies (DAG execution)',
      'Multi-region deployment',
      'Rate limiting per task type',
      'Queue sharding strategy',
      'Metrics and observability',
    ],
    simplificationTopics: [
      'Single-node queue',
      'Simpler priority (2 levels)',
      'At-least-once processing',
      'Skip deduplication',
    ],
  },

  seniorityExpectations: {
    senior: [
      'Design for distributed deployment',
      'Implement exactly-once semantics',
      'Handle network partitions',
      'Add comprehensive retry logic',
      'Consider consistency trade-offs',
      'Document failure scenarios',
    ],
  },

  designDocTemplate: {
    sections: [
      { title: 'System Architecture', description: 'Components and their interactions', required: true },
      { title: 'Data Model and Storage', description: 'Task schema and storage strategy', required: true },
      { title: 'Priority Scheduling', description: 'How tasks are prioritized', required: true },
      { title: 'Exactly-Once Processing', description: 'Guarantee mechanism', required: true },
      { title: 'Failure Handling', description: 'Retries, DLQ, recovery', required: true },
      { title: 'Scalability', description: 'Horizontal scaling approach', required: false },
    ],
    tradeoffs: [
      'Exactly-once vs at-least-once processing',
      'Push vs pull model for workers',
      'Consistency vs availability during partitions',
      'Memory vs disk-based storage',
    ],
    constraints: ['Handle 10,000 tasks/sec', '99.9% availability', 'Sub-second task pickup latency'],
  },

  architectureHints: {
    components: ['Queue Service', 'Worker Pool', 'Scheduler', 'DLQ Handler', 'Metrics Collector'],
    patterns: ['Work stealing', 'Visibility timeout', 'Idempotency keys', 'Lease-based locking'],
    scalabilityGoals: ['Horizontal worker scaling', 'Queue partitioning', 'Multi-AZ deployment'],
  },

  implementationScope: 'core_service',

  evaluationRubric: {
    type: 'SYSTEM_DESIGN',
    criteria: [
      { name: 'Design Clarity', weight: 30, description: 'Architecture is comprehensive' },
      { name: 'Trade-off Analysis', weight: 25, description: 'Distributed systems trade-offs' },
      { name: 'API Design', weight: 20, description: 'Queue interfaces are well-designed' },
      { name: 'Implementation', weight: 15, description: 'Core queue logic works' },
      { name: 'Communication', weight: 10, description: 'Explains distributed concepts clearly' },
    ],
  },
};

const STAFF_SYSTEM_DESIGN: DefaultSeedData = {
  title: 'Event-Driven Architecture Design',
  description: `Design an event-driven architecture for a complex business domain with event
sourcing, CQRS, and saga orchestration. This assessment evaluates staff-level design:
domain modeling, event patterns, and cross-service coordination.`,
  difficulty: 'HARD',
  category: 'backend',
  domain: 'System Design',
  tags: ['System Design', 'Event-Driven', 'CQRS', 'Event Sourcing', 'Sagas'],
  topics: ['Event-Driven Architecture', 'CQRS', 'Event Sourcing', 'Saga Pattern'],
  language: 'typescript',
  estimatedTime: 90,
  seedType: 'incremental',
  status: 'active',

  targetRole: 'backend',
  targetSeniority: 'staff',
  assessmentType: 'SYSTEM_DESIGN',
  isDefaultSeed: true,
  isSystemSeed: true,

  requiredTech: {
    languages: [{ name: 'typescript', priority: 'critical' }],
    frameworks: [{ name: 'express', priority: 'required' }],
    databases: [
      { name: 'postgresql', priority: 'required' },
      { name: 'redis', priority: 'required' },
    ],
    tools: [{ name: 'kafka', priority: 'recommended' }],
  },

  baseProblem: {
    title: 'Event-Driven Order System',
    description: `Design an event-driven architecture for order management.

**Business Domain:**
Order processing spans: Inventory, Payment, Shipping, Notifications

**Requirements:**
1. Comprehensive architecture document
2. Event schema and versioning strategy
3. Saga implementation for order flow
4. CQRS read model design

**Design Document Sections:**
- Domain Events Catalog
- Event Schema and Versioning
- Saga Orchestration Pattern
- CQRS Read Model Design
- Failure Compensation Logic
- Event Store Design

**Order Saga Flow:**
1. OrderPlaced -> ReserveInventory
2. InventoryReserved -> ProcessPayment
3. PaymentProcessed -> ArrangeShipping
4. ShippingArranged -> NotifyCustomer
5. (Any failure) -> Compensating transactions

**Success Criteria:**
- Complete event catalog
- Working saga orchestrator
- Clear compensation logic
- Event versioning strategy`,
    starterCode: `// DESIGN.md
# Event-Driven Order System

## Domain Events Catalog
[List all events with schemas]

## Event Schema and Versioning
[How events evolve over time]

## Saga Orchestration Pattern
[Order saga flow and state machine]

## CQRS Read Model Design
[Query optimization with projections]

## Failure Compensation Logic
[How failures trigger rollback]

// src/saga/order-saga.ts
// TODO: Implement order saga orchestrator`,
    estimatedTime: 40,
  },

  progressionHints: {
    extensionTopics: [
      'Event sourcing storage optimization',
      'Snapshot strategy for aggregates',
      'Multi-tenant event isolation',
      'Event replay and debugging',
      'Schema registry integration',
      'Temporal coupling analysis',
    ],
    simplificationTopics: [
      'Choreography instead of orchestration',
      'Skip event versioning',
      'Simple state machine',
      'Basic compensation',
    ],
  },

  seniorityExpectations: {
    staff: [
      'Design comprehensive event catalog',
      'Implement saga orchestration',
      'Handle event versioning',
      'Design efficient read models',
      'Plan compensation strategies',
      'Consider team adoption patterns',
    ],
  },

  designDocTemplate: {
    sections: [
      { title: 'Domain Events Catalog', description: 'All events with schemas and ownership', required: true },
      { title: 'Event Schema and Versioning', description: 'Schema evolution strategy', required: true },
      { title: 'Saga Orchestration', description: 'Order flow state machine', required: true },
      { title: 'CQRS Read Models', description: 'Query-optimized projections', required: true },
      { title: 'Failure Compensation', description: 'Rollback and retry logic', required: true },
      { title: 'Event Store Design', description: 'Storage and replay capabilities', required: false },
    ],
    tradeoffs: [
      'Orchestration vs choreography',
      'Event sourcing vs traditional storage',
      'Eventual vs strong consistency',
      'Schema evolution approaches',
    ],
    constraints: [
      'Events must be immutable',
      'Support 100,000 events/sec',
      'Event replay must be deterministic',
      'Cross-service transactions',
    ],
  },

  architectureHints: {
    components: ['Event Bus', 'Saga Orchestrator', 'Event Store', 'Projection Service', 'Compensation Handler'],
    patterns: ['Event Sourcing', 'CQRS', 'Saga', 'Outbox', 'Idempotent Consumer'],
    scalabilityGoals: ['Event partitioning', 'Read replica scaling', 'Saga parallelization'],
  },

  implementationScope: 'core_service',

  evaluationRubric: {
    type: 'SYSTEM_DESIGN',
    criteria: [
      { name: 'Design Clarity', weight: 30, description: 'Event architecture is comprehensive' },
      { name: 'Trade-off Analysis', weight: 25, description: 'EDA trade-offs discussed' },
      { name: 'API Design', weight: 20, description: 'Event schemas and interfaces clean' },
      { name: 'Implementation', weight: 15, description: 'Saga orchestrator works' },
      { name: 'Communication', weight: 10, description: 'Domain concepts explained clearly' },
    ],
  },
};

const PRINCIPAL_SYSTEM_DESIGN: DefaultSeedData = {
  title: 'Enterprise Data Platform Design',
  description: `Design a company-wide data platform for analytics, ML pipelines, and real-time
dashboards. This assessment evaluates principal-level design: enterprise architecture,
cost optimization, data governance, and long-term technical vision.`,
  difficulty: 'HARD',
  category: 'backend',
  domain: 'System Design',
  tags: ['System Design', 'Data Platform', 'Enterprise Architecture', 'Data Governance'],
  topics: ['Data Architecture', 'ML Infrastructure', 'Data Governance', 'Cost Optimization'],
  language: 'typescript',
  estimatedTime: 90,
  seedType: 'incremental',
  status: 'active',

  targetRole: 'backend',
  targetSeniority: 'principal',
  assessmentType: 'SYSTEM_DESIGN',
  isDefaultSeed: true,
  isSystemSeed: true,

  requiredTech: {
    languages: [{ name: 'typescript', priority: 'critical' }],
    frameworks: [{ name: 'express', priority: 'required' }],
    databases: [
      { name: 'postgresql', priority: 'required' },
      { name: 'snowflake', priority: 'recommended' },
    ],
    tools: [
      { name: 'kafka', priority: 'required' },
      { name: 'airflow', priority: 'recommended' },
    ],
  },

  baseProblem: {
    title: 'Enterprise Data Platform',
    description: `Design a data platform for a 500-person company.

**Business Context:**
Multiple teams need: analytics dashboards, ML features, regulatory reports

**Requirements:**
1. Strategic architecture document
2. Data ingestion pipeline design
3. API for data access
4. Governance and cost model

**Design Document Sections:**
- Platform Vision and Goals
- Data Architecture (Lake/Warehouse/Lakehouse)
- Ingestion Pipeline Design
- Data Access Patterns and API
- Governance and Quality Framework
- Cost Model and Optimization
- Team Organization Recommendation

**Platform Capabilities:**
- Ingest from 20+ sources (APIs, databases, events)
- Support batch and real-time processing
- Self-service analytics for business teams
- ML feature store integration
- Data lineage and quality monitoring

**Success Criteria:**
- Strategic vision document
- Working ingestion prototype
- Clear governance framework
- Realistic cost projections`,
    starterCode: `// DESIGN.md
# Enterprise Data Platform

## Platform Vision and Goals
[3-year vision for the data platform]

## Data Architecture
[Lake vs Warehouse vs Lakehouse decision]

## Ingestion Pipeline Design
[How data flows into the platform]

## Data Access Patterns and API
[How teams consume data]

## Governance and Quality Framework
[Data quality, lineage, access control]

## Cost Model and Optimization
[Infrastructure costs and optimization]

// src/platform/ingestion.ts
// TODO: Implement data ingestion prototype`,
    estimatedTime: 40,
  },

  progressionHints: {
    extensionTopics: [
      'Real-time ML feature serving',
      'Data mesh architecture',
      'Cross-region replication',
      'Compliance automation (GDPR, SOC2)',
      'Self-service data discovery',
      'Data marketplace concept',
    ],
    simplificationTopics: [
      'Single region deployment',
      'Batch processing only',
      'Basic governance',
      'Pre-built connectors only',
    ],
  },

  seniorityExpectations: {
    principal: [
      'Articulate long-term platform vision',
      'Design scalable data architecture',
      'Address governance and compliance',
      'Provide realistic cost analysis',
      'Recommend team structure',
      'Consider build vs buy decisions',
    ],
  },

  designDocTemplate: {
    sections: [
      { title: 'Platform Vision and Goals', description: '3-year strategic vision', required: true },
      { title: 'Data Architecture', description: 'Core architectural decisions', required: true },
      { title: 'Ingestion Pipeline', description: 'Data flow and processing', required: true },
      { title: 'Data Access Patterns', description: 'API design and consumption', required: true },
      { title: 'Governance Framework', description: 'Quality, lineage, access control', required: true },
      { title: 'Cost Model', description: 'TCO and optimization strategy', required: true },
      { title: 'Team Organization', description: 'Platform team structure', required: false },
    ],
    tradeoffs: [
      'Data lake vs warehouse vs lakehouse',
      'Build vs buy for each component',
      'Centralized vs federated governance',
      'Real-time vs batch processing',
      'Cost vs performance optimization',
    ],
    constraints: [
      'Support 10TB daily ingestion',
      'Sub-minute freshness for dashboards',
      'SOC2 and GDPR compliance',
      'Multi-team self-service',
      'Budget: $500K annual infrastructure',
    ],
  },

  architectureHints: {
    components: [
      'Data Lake',
      'Data Warehouse',
      'Stream Processing',
      'Orchestrator',
      'Data Catalog',
      'Quality Monitor',
      'Access Control',
    ],
    patterns: ['Lambda Architecture', 'Kappa Architecture', 'Data Mesh', 'Medallion Architecture'],
    scalabilityGoals: ['Petabyte-scale storage', 'Multi-tenant isolation', 'Global distribution'],
  },

  implementationScope: 'api_skeleton',

  evaluationRubric: {
    type: 'SYSTEM_DESIGN',
    criteria: [
      { name: 'Design Clarity', weight: 30, description: 'Strategic vision is comprehensive' },
      { name: 'Trade-off Analysis', weight: 25, description: 'Enterprise trade-offs analyzed' },
      { name: 'API Design', weight: 20, description: 'Data access APIs well-defined' },
      { name: 'Implementation', weight: 15, description: 'Prototype demonstrates concept' },
      { name: 'Communication', weight: 10, description: 'Vision communicated effectively' },
    ],
  },
};

// ============================================================
// EXPORT ALL DEFAULT SEEDS
// ============================================================

export const BACKEND_DEFAULT_SEEDS: DefaultSeedData[] = [
  // Real World Problems (5)
  JUNIOR_REAL_WORLD,
  MID_REAL_WORLD,
  SENIOR_REAL_WORLD,
  STAFF_REAL_WORLD,
  PRINCIPAL_REAL_WORLD,

  // System Design (5)
  JUNIOR_SYSTEM_DESIGN,
  MID_SYSTEM_DESIGN,
  SENIOR_SYSTEM_DESIGN,
  STAFF_SYSTEM_DESIGN,
  PRINCIPAL_SYSTEM_DESIGN,
];

export {
  JUNIOR_REAL_WORLD,
  MID_REAL_WORLD,
  SENIOR_REAL_WORLD,
  STAFF_REAL_WORLD,
  PRINCIPAL_REAL_WORLD,
  JUNIOR_SYSTEM_DESIGN,
  MID_SYSTEM_DESIGN,
  SENIOR_SYSTEM_DESIGN,
  STAFF_SYSTEM_DESIGN,
  PRINCIPAL_SYSTEM_DESIGN,
};
