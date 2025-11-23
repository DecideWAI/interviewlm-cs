/**
 * Incremental Problem Seeds for Backend Interviews
 *
 * These seeds support dynamic question generation with:
 * - Framework-agnostic tech stacks (can use Express, Fastify, NestJS, etc.)
 * - Seniority-based expectations
 * - Progressive difficulty hints
 * - IRT-compatible difficulty scaling
 *
 * HOW QUESTION GENERATION WORKS:
 * ==============================
 *
 * 1. FIRST QUESTION (Q1):
 *    - Uses the `baseProblem` directly from the seed
 *    - Difficulty based on seniority (Junior=EASY, Mid=EASY, Senior=MEDIUM)
 *    - Sets baseline for IRT ability estimation (θ=0)
 *
 * 2. SUBSEQUENT QUESTIONS (Q2-Q5):
 *    - Claude generates based on previous performance
 *    - IRT targets difficulty at θ+0.3 (optimal information gain)
 *    - Uses `progressionHints.extensionTopics` if performing well
 *    - Uses `progressionHints.simplificationTopics` if struggling
 *    - Enforces `requiredTech` in all generated questions
 *
 * 3. SENIORITY ADAPTATION:
 *    - `seniorityExpectations` tells Claude what each level should achieve
 *    - Junior: Focus on basics, clear guidance
 *    - Senior/Staff: Add system design, optimization, architecture
 *
 * 4. TECH STACK FLEXIBILITY:
 *    - Seeds define tech as TechSpec[] with priority levels
 *    - "critical" = MUST use or assessment fails
 *    - "required" = Should use, flagged if missing
 *    - "recommended" = Optional bonus points
 *    - Assessment can override tech choices (e.g., use Fastify instead of Express)
 */

import type {
  TechSpec,
  RequiredTechStack,
  BaseProblem,
  ProgressionHints,
  SeniorityExpectations,
  SeedType,
  SeedStatus,
} from '@/types/seed';
import type { Difficulty } from '@prisma/client';

/**
 * Incremental Seed structure for database seeding
 */
export interface IncrementalSeedData {
  title: string;
  description: string;
  difficulty: Difficulty;
  category: string;
  domain: string;
  tags: string[];
  topics: string[];
  language: string;
  estimatedTime: number;
  seedType: SeedType;
  status: SeedStatus;

  // Incremental assessment fields
  requiredTech: RequiredTechStack;
  baseProblem: BaseProblem;
  progressionHints: ProgressionHints;
  seniorityExpectations: SeniorityExpectations;
}

/**
 * ============================================================
 * BACKEND INCREMENTAL SEEDS
 * ============================================================
 *
 * Each seed is designed to:
 * - Work with multiple frameworks (Express, Fastify, NestJS, Koa)
 * - Scale from Junior to Principal level
 * - Generate 2-5 questions based on IRT precision
 */

export const BACKEND_INCREMENTAL_SEEDS: IncrementalSeedData[] = [
  // ============================================================
  // SEED 1: REST API with Authentication
  // ============================================================
  {
    title: "REST API with Authentication System",
    description: `Build a production-ready REST API for a task management system with JWT authentication,
role-based access control, and proper security practices. This assessment evaluates your ability to
design secure APIs, implement authentication patterns, and handle real-world scenarios like token
refresh and rate limiting.`,
    difficulty: "MEDIUM",
    category: "backend",
    domain: "API Development",
    tags: ["REST API", "Authentication", "JWT", "Security", "RBAC"],
    topics: ["API Design", "Auth Patterns", "Security", "Middleware", "Database"],
    language: "typescript", // Default, but not enforced - requiredTech defines actual requirements
    estimatedTime: 60,
    seedType: "incremental",
    status: "active",

    // TECH STACK: Framework-agnostic, can work with any Node.js framework
    requiredTech: {
      languages: [
        { name: "typescript", priority: "critical", version: ">=4.5" },
        // Alternative: { name: "javascript", priority: "critical" }
      ],
      frameworks: [
        // Any of these can be used - assessment specifies which one
        { name: "express", priority: "required" },
        // Alternatives: fastify, nestjs, koa, hapi
      ],
      databases: [
        { name: "postgresql", priority: "required" },
        // Alternatives: mongodb, mysql
      ],
      tools: [
        { name: "jwt", priority: "critical" },
        { name: "bcrypt", priority: "required" },
      ],
    },

    // BASE PROBLEM: Substantial first question (25-30 mins)
    baseProblem: {
      title: "Basic JWT Authentication",
      description: `Implement user registration and login endpoints with JWT token generation.

**Requirements:**
- POST /auth/register - Register new user (email, password, name)
- POST /auth/login - Authenticate and return JWT access token
- Use bcrypt for password hashing (cost factor 10+)
- JWT should include userId and role in payload
- Token expiry: 15 minutes for access token
- Return proper error messages for invalid credentials

**Success Criteria:**
- Passwords are never stored in plain text
- JWT tokens are properly signed
- Duplicate email registration is rejected
- Invalid credentials return 401 status`,
      starterCode: `// src/auth/routes.ts
import { Router } from 'express'; // Or your framework's router

const router = Router();

// TODO: Implement user registration
// POST /auth/register
// - Validate email format
// - Hash password with bcrypt
// - Store user in database
// - Return user (without password)

// TODO: Implement login
// POST /auth/login
// - Find user by email
// - Compare password with bcrypt
// - Generate JWT token
// - Return token

export default router;`,
      estimatedTime: 25,
    },

    // PROGRESSION HINTS: Guide Claude's question generation
    progressionHints: {
      // Topics to explore if candidate performs well (score >= 75%)
      extensionTopics: [
        "Refresh token mechanism with rotation",
        "Role-based access control middleware",
        "Rate limiting for auth endpoints",
        "Multi-factor authentication flow",
        "Session invalidation and logout",
        "Password reset with secure tokens",
        "OAuth2 integration patterns",
      ],
      // Topics to simplify to if candidate struggles (score < 50%)
      simplificationTopics: [
        "Basic middleware authentication check",
        "Simple password validation",
        "Token verification without refresh",
        "Single-role authorization",
        "Basic error handling",
      ],
    },

    // SENIORITY EXPECTATIONS: What each level should demonstrate
    seniorityExpectations: {
      junior: [
        "Implement basic registration and login",
        "Use bcrypt for password hashing",
        "Generate valid JWT tokens",
        "Handle basic validation errors",
        "Write simple middleware",
      ],
      mid: [
        "Implement refresh token mechanism",
        "Add role-based access control",
        "Implement rate limiting",
        "Add comprehensive error handling",
        "Write integration tests",
        "Use environment variables for secrets",
      ],
      senior: [
        "Design scalable auth architecture",
        "Implement token rotation and invalidation",
        "Add security headers and CORS",
        "Implement audit logging",
        "Consider horizontal scaling (Redis for sessions)",
        "Document API with OpenAPI spec",
      ],
      staff: [
        "Design multi-tenant authentication",
        "Implement SSO/SAML integration",
        "Design for zero-trust architecture",
        "Implement compliance requirements (SOC2, GDPR)",
        "Create auth SDK for other services",
      ],
      principal: [
        "Design organization-wide auth strategy",
        "Implement cryptographic best practices",
        "Design disaster recovery for auth",
        "Create security review guidelines",
        "Mentor team on security practices",
      ],
    },
  },

  // ============================================================
  // SEED 2: Database Performance Optimization
  // ============================================================
  {
    title: "Database Query Optimization",
    description: `Optimize a slow e-commerce API with N+1 queries, missing indexes, and inefficient data access
patterns. This assessment tests your ability to identify performance bottlenecks, use database profiling
tools, and implement caching strategies.`,
    difficulty: "HARD",
    category: "backend",
    domain: "Database & Performance",
    tags: ["Database", "SQL", "Performance", "Optimization", "Caching"],
    topics: ["Query Optimization", "Indexing", "N+1 Problems", "Caching", "Profiling"],
    language: "typescript",
    estimatedTime: 60,
    seedType: "incremental",
    status: "active",

    requiredTech: {
      languages: [
        { name: "typescript", priority: "critical" },
      ],
      frameworks: [
        { name: "prisma", priority: "required" },
        // Alternatives: typeorm, sequelize, knex
      ],
      databases: [
        { name: "postgresql", priority: "critical" },
      ],
      tools: [
        { name: "redis", priority: "recommended" },
      ],
    },

    baseProblem: {
      title: "Fix N+1 Query Problem",
      description: `The product listing endpoint is extremely slow (2000ms+). Identify and fix the N+1 query problem.

**Given Code (problematic):**
\`\`\`typescript
async function getProducts() {
  const products = await prisma.product.findMany();
  // N+1: Each product triggers separate query for category
  for (const product of products) {
    product.category = await prisma.category.findUnique({
      where: { id: product.categoryId }
    });
  }
  return products;
}
\`\`\`

**Requirements:**
- Reduce endpoint response time to <100ms
- Use eager loading or joins to eliminate N+1
- Add database indexes for frequently queried columns
- Log query count before/after optimization

**Success Criteria:**
- Single database round trip instead of N+1
- Query execution time reduced by 90%+
- Proper use of Prisma includes or raw SQL joins`,
      starterCode: `// src/products/service.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// TODO: Optimize this function to eliminate N+1 queries
export async function getProducts() {
  const products = await prisma.product.findMany();

  // PROBLEM: This causes N+1 queries!
  for (const product of products) {
    (product as any).category = await prisma.category.findUnique({
      where: { id: product.categoryId }
    });
  }

  return products;
}

// TODO: Add appropriate indexes to schema.prisma
// TODO: Add query performance logging`,
      estimatedTime: 25,
    },

    progressionHints: {
      extensionTopics: [
        "Implement multi-level caching (memory + Redis)",
        "Add cache invalidation on writes",
        "Implement query result pagination",
        "Add database connection pooling",
        "Implement read replicas for scaling",
        "Add query timeout and circuit breaker",
        "Implement batch operations for bulk updates",
      ],
      simplificationTopics: [
        "Basic Prisma includes syntax",
        "Simple index creation",
        "Single-level caching",
        "Basic pagination",
      ],
    },

    seniorityExpectations: {
      junior: [
        "Identify the N+1 problem",
        "Use Prisma includes for eager loading",
        "Add basic indexes",
        "Measure query time before/after",
      ],
      mid: [
        "Implement proper caching with TTL",
        "Add cache invalidation strategy",
        "Use database EXPLAIN to analyze queries",
        "Implement cursor-based pagination",
        "Add monitoring for slow queries",
      ],
      senior: [
        "Design multi-tier caching architecture",
        "Implement cache stampede protection",
        "Add database query profiling",
        "Design for high read throughput",
        "Implement graceful degradation",
      ],
      staff: [
        "Design sharding strategy",
        "Implement read replica routing",
        "Design cache warming strategies",
        "Create performance testing framework",
      ],
      principal: [
        "Design organization-wide caching standards",
        "Create database scaling playbook",
        "Establish performance SLOs",
        "Design cost-optimized data architecture",
      ],
    },
  },

  // ============================================================
  // SEED 3: Background Job Processing
  // ============================================================
  {
    title: "Background Job Processing System",
    description: `Build a robust background job system for handling async tasks like email sending,
report generation, and data processing. This tests your understanding of queue systems,
retry logic, and distributed system patterns.`,
    difficulty: "HARD",
    category: "backend",
    domain: "Distributed Systems",
    tags: ["Background Jobs", "Queues", "Async", "Redis", "Workers"],
    topics: ["Job Queues", "Retry Logic", "Error Handling", "Monitoring", "Distributed"],
    language: "typescript",
    estimatedTime: 60,
    seedType: "incremental",
    status: "active",

    requiredTech: {
      languages: [
        { name: "typescript", priority: "critical" },
      ],
      frameworks: [
        { name: "bullmq", priority: "required" },
        // Alternatives: bull, agenda, bee-queue
      ],
      databases: [
        { name: "redis", priority: "critical" },
      ],
      tools: [
        { name: "ioredis", priority: "required" },
      ],
    },

    baseProblem: {
      title: "Basic Job Queue with Retries",
      description: `Implement a job queue that processes email sending with automatic retries on failure.

**Requirements:**
- Create an "email" queue using BullMQ
- Implement job producer that adds email jobs
- Implement worker that processes email jobs
- Add retry logic with exponential backoff (3 attempts)
- Log job status changes (added, processing, completed, failed)

**Job Data Structure:**
\`\`\`typescript
{
  to: string;
  subject: string;
  body: string;
  priority: 'high' | 'normal' | 'low';
}
\`\`\`

**Success Criteria:**
- Jobs are processed in priority order
- Failed jobs retry with increasing delay
- Job status is trackable
- Proper error handling for invalid jobs`,
      starterCode: `// src/jobs/email-queue.ts
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis();

// TODO: Create email queue
export const emailQueue = new Queue('email', {
  connection,
  // Add retry configuration
});

// TODO: Create email worker
export const emailWorker = new Worker('email', async (job) => {
  // TODO: Process email job
  // TODO: Simulate sending (throw error 30% of time for testing)
  // TODO: Log job progress
}, {
  connection,
  // Add worker configuration
});

// TODO: Add event listeners for job status changes
// TODO: Implement addEmailJob function with priority support`,
      estimatedTime: 25,
    },

    progressionHints: {
      extensionTopics: [
        "Job priority queues with multiple workers",
        "Delayed jobs (schedule for future)",
        "Job progress reporting",
        "Dead letter queue for failed jobs",
        "Graceful shutdown (complete in-progress)",
        "Job rate limiting",
        "Distributed job locking",
        "Job dependencies (workflow)",
      ],
      simplificationTopics: [
        "Basic queue setup",
        "Simple retry without backoff",
        "Single worker processing",
        "Basic logging",
      ],
    },

    seniorityExpectations: {
      junior: [
        "Set up BullMQ queue and worker",
        "Implement basic job processing",
        "Add simple retry logic",
        "Log job events",
      ],
      mid: [
        "Implement exponential backoff",
        "Add dead letter queue",
        "Implement graceful shutdown",
        "Add job progress tracking",
        "Write integration tests",
      ],
      senior: [
        "Design multi-queue architecture",
        "Implement job orchestration",
        "Add comprehensive monitoring",
        "Handle edge cases (duplicate jobs)",
        "Design for horizontal scaling",
      ],
      staff: [
        "Design job processing platform",
        "Implement cross-service job coordination",
        "Create job observability dashboard",
        "Design disaster recovery",
      ],
      principal: [
        "Design organization job architecture",
        "Create job processing standards",
        "Establish SLOs for job processing",
        "Design cost-efficient scaling",
      ],
    },
  },

  // ============================================================
  // SEED 4: Real-time WebSocket Chat
  // ============================================================
  {
    title: "Real-time WebSocket Communication",
    description: `Build a real-time chat system with WebSockets, supporting multiple rooms,
presence tracking, and message history. Tests your understanding of real-time protocols,
connection management, and scaling considerations.`,
    difficulty: "HARD",
    category: "backend",
    domain: "Real-time Systems",
    tags: ["WebSocket", "Real-time", "Chat", "Presence", "Scaling"],
    topics: ["WebSocket Protocol", "Connection Management", "Broadcasting", "Scaling"],
    language: "typescript",
    estimatedTime: 60,
    seedType: "incremental",
    status: "active",

    requiredTech: {
      languages: [
        { name: "typescript", priority: "critical" },
      ],
      frameworks: [
        { name: "socket.io", priority: "required" },
        // Alternatives: ws, uWebSockets.js
      ],
      databases: [
        { name: "redis", priority: "recommended" },
        { name: "postgresql", priority: "required" },
      ],
      tools: [],
    },

    baseProblem: {
      title: "Basic Chat Room with WebSockets",
      description: `Implement a WebSocket server that supports chat rooms with message broadcasting.

**Requirements:**
- Create WebSocket server using Socket.io
- Support multiple chat rooms (join/leave)
- Broadcast messages to all users in a room
- Track connected users per room
- Send "user joined/left" notifications

**Events to Handle:**
- connection: New client connects
- join_room: User joins a room
- leave_room: User leaves a room
- send_message: User sends a message
- disconnect: Client disconnects

**Success Criteria:**
- Messages reach all room members
- Room membership is accurate
- Proper cleanup on disconnect
- Handle invalid room/message data`,
      starterCode: `// src/websocket/server.ts
import { Server } from 'socket.io';
import { createServer } from 'http';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// Track users in rooms
const roomUsers = new Map<string, Set<string>>();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // TODO: Handle join_room event
  socket.on('join_room', (roomId: string, username: string) => {
    // Join the room
    // Track user in room
    // Notify others in room
  });

  // TODO: Handle send_message event
  socket.on('send_message', (roomId: string, message: string) => {
    // Validate message
    // Broadcast to room
  });

  // TODO: Handle disconnect
  socket.on('disconnect', () => {
    // Remove from all rooms
    // Notify others
  });
});

httpServer.listen(3001);`,
      estimatedTime: 25,
    },

    progressionHints: {
      extensionTopics: [
        "Typing indicators",
        "Message read receipts",
        "Message history from database",
        "User presence (online/away/offline)",
        "Private direct messages",
        "File/image sharing",
        "Horizontal scaling with Redis adapter",
        "Reconnection with message sync",
      ],
      simplificationTopics: [
        "Single room chat",
        "Basic message broadcasting",
        "Simple connection tracking",
      ],
    },

    seniorityExpectations: {
      junior: [
        "Set up Socket.io server",
        "Implement room join/leave",
        "Broadcast messages to rooms",
        "Track connected users",
      ],
      mid: [
        "Add typing indicators",
        "Implement message history",
        "Add user presence tracking",
        "Handle reconnection gracefully",
        "Write tests for WebSocket events",
      ],
      senior: [
        "Scale with Redis adapter",
        "Implement message queuing",
        "Add rate limiting per user",
        "Design for 10K+ concurrent connections",
        "Add monitoring and metrics",
      ],
      staff: [
        "Design real-time platform architecture",
        "Implement cross-region messaging",
        "Create real-time SDK",
        "Design for millions of connections",
      ],
      principal: [
        "Design organization real-time strategy",
        "Create scalability playbook",
        "Establish real-time SLOs",
        "Design cost-efficient infrastructure",
      ],
    },
  },

  // ============================================================
  // SEED 5: GraphQL API with DataLoader (NEW)
  // ============================================================
  {
    title: "GraphQL API with Efficient Data Loading",
    description: `Design and implement a GraphQL API with proper schema design, resolvers,
and DataLoader for efficient batching. Tests your understanding of GraphQL patterns,
N+1 prevention, and real-time subscriptions.`,
    difficulty: "MEDIUM",
    category: "backend",
    domain: "API Development",
    tags: ["GraphQL", "DataLoader", "Apollo", "Subscriptions", "API"],
    topics: ["GraphQL Schema", "Resolvers", "Batching", "Subscriptions", "Auth"],
    language: "typescript",
    estimatedTime: 60,
    seedType: "incremental",
    status: "active",

    requiredTech: {
      languages: [
        { name: "typescript", priority: "critical" },
      ],
      frameworks: [
        { name: "apollo-server", priority: "required" },
        // Alternatives: graphql-yoga, mercurius
      ],
      databases: [
        { name: "postgresql", priority: "required" },
      ],
      tools: [
        { name: "dataloader", priority: "critical" },
        { name: "prisma", priority: "required" },
      ],
    },

    baseProblem: {
      title: "Basic GraphQL Schema with DataLoader",
      description: `Create a GraphQL API for a blog with Users, Posts, and Comments using DataLoader for efficient queries.

**Schema Types:**
- User: id, name, email, posts
- Post: id, title, content, author, comments
- Comment: id, text, author, post

**Requirements:**
- Define GraphQL schema with proper types
- Implement Query resolvers: users, user(id), posts, post(id)
- Use DataLoader to batch author lookups (prevent N+1)
- Add basic input validation

**Success Criteria:**
- Schema introspection works
- DataLoader batches multiple author lookups into single query
- Proper error handling for not found
- Nested queries work (post.author.posts)`,
      starterCode: `// src/graphql/schema.ts
import { gql } from 'apollo-server-express';

export const typeDefs = gql\`
  type User {
    id: ID!
    name: String!
    email: String!
    posts: [Post!]!
  }

  type Post {
    id: ID!
    title: String!
    content: String!
    author: User!
    comments: [Comment!]!
  }

  type Comment {
    id: ID!
    text: String!
    author: User!
  }

  type Query {
    users: [User!]!
    user(id: ID!): User
    posts: [Post!]!
    post(id: ID!): Post
  }
\`;

// src/graphql/resolvers.ts
import DataLoader from 'dataloader';
import { prisma } from '../db';

// TODO: Create DataLoader for batching user lookups
const userLoader = new DataLoader(async (userIds: readonly string[]) => {
  // TODO: Batch fetch users
  // Return in same order as input ids
});

export const resolvers = {
  Query: {
    users: () => prisma.user.findMany(),
    // TODO: Implement other queries
  },
  Post: {
    author: (post) => {
      // TODO: Use userLoader instead of direct query
    },
  },
};`,
      estimatedTime: 25,
    },

    progressionHints: {
      extensionTopics: [
        "Mutations for CRUD operations",
        "Authentication middleware",
        "Cursor-based pagination (connections)",
        "Real-time subscriptions",
        "Input validation with custom scalars",
        "Rate limiting per operation",
        "Query complexity analysis",
        "Persisted queries",
      ],
      simplificationTopics: [
        "Basic queries without DataLoader",
        "Simple schema without nesting",
        "Single entity CRUD",
      ],
    },

    seniorityExpectations: {
      junior: [
        "Define GraphQL schema",
        "Implement basic resolvers",
        "Understand DataLoader concept",
        "Handle simple errors",
      ],
      mid: [
        "Use DataLoader for all nested resolvers",
        "Implement mutations with validation",
        "Add authentication context",
        "Implement pagination",
        "Write resolver tests",
      ],
      senior: [
        "Design schema for scalability",
        "Implement subscriptions",
        "Add query complexity limits",
        "Design efficient caching",
        "Document with GraphQL voyager",
      ],
      staff: [
        "Design federated GraphQL architecture",
        "Create schema governance",
        "Implement schema registry",
        "Design breaking change process",
      ],
      principal: [
        "Design organization GraphQL strategy",
        "Create API standards",
        "Establish performance SLOs",
        "Design deprecation process",
      ],
    },
  },

  // ============================================================
  // SEED 6: Basic CRUD API (EASY - For Junior Calibration)
  // ============================================================
  {
    title: "RESTful CRUD API Fundamentals",
    description: `Build a simple REST API for managing a resource, demonstrating understanding
of HTTP methods, status codes, and basic validation. Designed for Junior candidates.`,
    difficulty: "EASY",
    category: "backend",
    domain: "API Development",
    tags: ["REST API", "CRUD", "HTTP", "Validation", "Beginner"],
    topics: ["HTTP Methods", "Status Codes", "Validation", "Error Handling"],
    language: "typescript",
    estimatedTime: 45,
    seedType: "incremental",
    status: "active",

    requiredTech: {
      languages: [
        { name: "typescript", priority: "required" },
      ],
      frameworks: [
        { name: "express", priority: "required" },
      ],
      databases: [], // In-memory is fine for EASY
      tools: [],
    },

    baseProblem: {
      title: "Basic Todo CRUD",
      description: `Create REST endpoints for managing todos with proper HTTP semantics.

**Requirements:**
- GET /todos - List all todos (return array)
- POST /todos - Create todo (title required)
- PUT /todos/:id - Update todo (returns updated todo)
- DELETE /todos/:id - Delete todo (returns 204)
- Use in-memory array for storage
- Return proper status codes (200, 201, 204, 400, 404)

**Todo Structure:**
\`\`\`typescript
{ id: number, title: string, completed: boolean }
\`\`\`

**Success Criteria:**
- All CRUD operations work
- Missing title returns 400
- Non-existent id returns 404
- Proper response codes used`,
      starterCode: `import express from 'express';
const app = express();
app.use(express.json());

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

const todos: Todo[] = [];
let nextId = 1;

// GET /todos - Return all todos
app.get('/todos', (req, res) => {
  // TODO: Return todos array
});

// POST /todos - Create new todo
app.post('/todos', (req, res) => {
  // TODO: Validate title exists
  // TODO: Create and return todo with 201
});

// PUT /todos/:id - Update todo
app.put('/todos/:id', (req, res) => {
  // TODO: Find todo
  // TODO: Return 404 if not found
  // TODO: Update and return todo
});

// DELETE /todos/:id - Delete todo
app.delete('/todos/:id', (req, res) => {
  // TODO: Find and delete
  // TODO: Return 204 or 404
});

app.listen(3000);`,
      estimatedTime: 20,
    },

    progressionHints: {
      extensionTopics: [
        "Input validation (title length)",
        "Pagination for list endpoint",
        "Filtering by completed status",
        "Sorting options",
        "Timestamps (createdAt, updatedAt)",
      ],
      simplificationTopics: [
        "Just GET and POST",
        "No validation",
        "Basic error handling",
      ],
    },

    seniorityExpectations: {
      junior: [
        "Implement all CRUD endpoints",
        "Use correct HTTP methods",
        "Return proper status codes",
        "Basic input validation",
      ],
      mid: [
        "Add query parameters for filtering",
        "Implement pagination",
        "Add request logging",
        "Write unit tests",
      ],
      // Senior+ would use more complex seeds
    },
  },

  // ============================================================
  // SEED 7: Microservice Communication (HARD)
  // ============================================================
  {
    title: "Microservice Communication Patterns",
    description: `Implement reliable communication between microservices using both synchronous
REST calls and asynchronous message queues. Tests understanding of distributed system
patterns like circuit breakers, retries, and idempotency.`,
    difficulty: "HARD",
    category: "backend",
    domain: "Distributed Systems",
    tags: ["Microservices", "Message Queue", "Circuit Breaker", "Distributed", "Resilience"],
    topics: ["Service Communication", "Message Queues", "Fault Tolerance", "Idempotency"],
    language: "typescript",
    estimatedTime: 60,
    seedType: "incremental",
    status: "active",

    requiredTech: {
      languages: [
        { name: "typescript", priority: "critical" },
      ],
      frameworks: [
        { name: "express", priority: "required" },
      ],
      databases: [
        { name: "redis", priority: "required" },
      ],
      tools: [
        { name: "axios", priority: "required" },
        { name: "bullmq", priority: "required" },
      ],
    },

    baseProblem: {
      title: "REST Client with Retry Logic",
      description: `Create a service client that calls another service with automatic retries and timeout handling.

**Scenario:**
Order Service needs to check inventory from Inventory Service before creating an order.

**Requirements:**
- Create HTTP client with configurable timeout (5s default)
- Implement retry logic (3 attempts with exponential backoff)
- Log all requests and responses
- Handle network errors gracefully
- Return meaningful errors to caller

**Success Criteria:**
- Successful calls work normally
- Transient failures retry automatically
- Timeout after configured duration
- Errors include context for debugging`,
      starterCode: `// src/clients/inventory-client.ts
import axios, { AxiosInstance } from 'axios';

interface InventoryCheckResult {
  productId: string;
  available: boolean;
  quantity: number;
}

export class InventoryClient {
  private client: AxiosInstance;
  private maxRetries = 3;
  private timeout = 5000;

  constructor(baseURL: string) {
    this.client = axios.create({ baseURL, timeout: this.timeout });
  }

  async checkInventory(productId: string): Promise<InventoryCheckResult> {
    // TODO: Implement with retry logic
    // - Attempt request
    // - On failure, wait and retry (exponential backoff)
    // - Log each attempt
    // - After max retries, throw with context
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// TODO: Add request/response logging interceptor`,
      estimatedTime: 25,
    },

    progressionHints: {
      extensionTopics: [
        "Circuit breaker pattern",
        "Async message queue communication",
        "Idempotency for message processing",
        "Saga pattern for distributed transactions",
        "Service discovery",
        "Health check aggregation",
        "Distributed tracing",
      ],
      simplificationTopics: [
        "Simple retry without backoff",
        "Basic timeout handling",
        "Simple error wrapping",
      ],
    },

    seniorityExpectations: {
      junior: [
        "Implement basic HTTP client",
        "Add simple retry logic",
        "Handle timeout errors",
        "Log requests/responses",
      ],
      mid: [
        "Implement circuit breaker",
        "Add message queue communication",
        "Implement idempotency keys",
        "Add comprehensive logging",
        "Write integration tests",
      ],
      senior: [
        "Design service mesh patterns",
        "Implement saga orchestration",
        "Add distributed tracing",
        "Design for partial failures",
        "Create resilience testing",
      ],
      staff: [
        "Design organization service patterns",
        "Create service template/SDK",
        "Establish communication standards",
        "Design chaos engineering approach",
      ],
      principal: [
        "Design platform architecture",
        "Create service governance",
        "Establish reliability standards",
        "Design organization observability",
      ],
    },
  },
];

/**
 * EXAMPLE: How Question Generation Works
 * ======================================
 *
 * Scenario: Senior candidate, "REST API with Authentication" seed
 *
 * Q1 (baseProblem): "Basic JWT Authentication"
 *   - Candidate implements registration, login, JWT generation
 *   - Score: 82% (above 75% threshold)
 *   - IRT estimates θ = 0.3 (slightly above neutral)
 *
 * Q2 (generated by Claude):
 *   - IRT targets θ = 0.6 (0.3 + 0.3 offset)
 *   - progressAnalysis.recommendedAction = "extend"
 *   - Claude uses extensionTopics: "Refresh token mechanism"
 *   - Generated: "Implement Refresh Token with Rotation"
 *     - Add refresh token generation on login
 *     - Implement token rotation (old refresh token invalidated)
 *     - Store refresh tokens with expiry
 *   - Candidate score: 78%
 *   - IRT updates θ = 0.45
 *
 * Q3 (generated by Claude):
 *   - IRT targets θ = 0.75
 *   - Uses seniorityExpectations.senior: "Add security headers and CORS"
 *   - Generated: "Security Hardening and CORS Configuration"
 *     - Add Helmet.js for security headers
 *     - Configure CORS with allowed origins
 *     - Add rate limiting middleware
 *   - Candidate score: 85%
 *   - IRT updates θ = 0.7, SE = 0.35
 *
 * Q4: Assessment complete!
 *   - SE < 0.4 (sufficient precision)
 *   - Reliability = 0.75 (above 0.7 threshold)
 *   - Final θ = 0.7 (Advanced level)
 *
 * Total questions: 3 (stopped early due to high precision)
 */

export default BACKEND_INCREMENTAL_SEEDS;
