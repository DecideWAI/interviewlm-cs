/**
 * Curated Problem Seeds for InterviewLM
 *
 * These are production-ready problem seed templates that Claude uses to generate
 * unique coding interview questions. Each seed should be:
 * - General enough to generate many variations
 * - Specific enough to test target skills
 * - Realistic and interview-appropriate
 * - Time-bounded (30-90 minutes)
 */

import { Difficulty } from "@prisma/client";

export interface ProblemSeedData {
  title: string;
  description: string;
  difficulty: Difficulty;
  category: string;
  tags: string[];
  starterCode?: string;
  testCode?: string;
  language: string;
}

/**
 * Backend Problem Seeds (8 seeds)
 */
export const BACKEND_SEEDS: ProblemSeedData[] = [
  {
    title: "REST API with Authentication",
    description: `Create a RESTful API for a task management system with user authentication and authorization.

**Requirements:**
- Implement user registration and login with JWT tokens
- Create CRUD operations for tasks (title, description, status, assignee)
- Add role-based access control (admin, user roles)
- Include refresh token mechanism
- Add proper input validation and error handling
- Implement rate limiting for auth endpoints
- Use middleware for authentication checks

**Skills Tested:**
- REST API design and implementation
- JWT authentication and token management
- Security best practices (password hashing, token security)
- Express.js/Fastify middleware patterns
- Error handling and validation
- Database operations (users, tasks)

**Expected Deliverables:**
- POST /auth/register - Create new user account
- POST /auth/login - Login and receive access + refresh tokens
- POST /auth/refresh - Refresh access token
- GET /tasks - List all tasks (requires auth)
- POST /tasks - Create new task (requires auth)
- PUT /tasks/:id - Update task (requires auth, owner only)
- DELETE /tasks/:id - Delete task (requires auth, admin or owner)

**Test Cases Should Cover:**
- Successful registration and login
- Duplicate email handling
- Invalid credentials
- Token expiration
- Unauthorized access attempts
- CRUD operations with proper authorization`,
    difficulty: "MEDIUM",
    category: "backend",
    tags: ["REST API", "Authentication", "JWT", "Security", "Express.js", "Node.js"],
    language: "typescript",
    starterCode: `import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const app = express();
app.use(express.json());

// TODO: Implement authentication endpoints
// POST /auth/register
// POST /auth/login
// POST /auth/refresh

// TODO: Implement task management endpoints
// GET /tasks
// POST /tasks
// PUT /tasks/:id
// DELETE /tasks/:id

// TODO: Add authentication middleware
// TODO: Add authorization middleware

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`,
  },

  {
    title: "Database Query Optimization",
    description: `Optimize a slow-performing e-commerce database with N+1 queries, missing indexes, and inefficient queries.

**Given:**
- An existing database schema with tables: products, categories, orders, order_items, users
- Several slow API endpoints that load product listings with categories and reviews
- N+1 query problems when fetching related data
- Missing indexes on frequently queried columns

**Requirements:**
- Identify and fix N+1 query problems using joins or eager loading
- Add appropriate database indexes for common query patterns
- Rewrite inefficient queries with better SQL/ORM usage
- Implement database query caching for expensive operations
- Add query performance monitoring and logging
- Write query profiling tests to verify improvements

**Skills Tested:**
- SQL optimization techniques
- Understanding of database indexes
- N+1 query detection and resolution
- ORM usage (Prisma, TypeORM, Sequelize)
- Query performance analysis
- Caching strategies

**Expected Improvements:**
- GET /products endpoint: <100ms (currently 2000ms+)
- GET /products/:id endpoint: <50ms (currently 500ms+)
- Reduction of database queries from 50+ to <5 per request
- Proper use of EXPLAIN/ANALYZE to verify improvements`,
    difficulty: "HARD",
    category: "backend",
    tags: ["Database", "SQL", "Performance", "Optimization", "PostgreSQL", "MySQL"],
    language: "typescript",
  },

  {
    title: "API Rate Limiting with Redis",
    description: `Implement a production-ready rate limiting system using the token bucket algorithm with Redis.

**Requirements:**
- Implement token bucket algorithm for rate limiting
- Support different rate limits per user tier:
  * Free tier: 10 requests/minute
  * Premium tier: 100 requests/minute
  * Enterprise tier: 1000 requests/minute
- Store rate limit state in Redis for distributed systems
- Return proper rate limit headers in responses:
  * X-RateLimit-Limit
  * X-RateLimit-Remaining
  * X-RateLimit-Reset
- Handle rate limit exceeded with 429 status and retry-after
- Implement middleware that can be applied to any endpoint
- Add monitoring and alerting for rate limit hits

**Skills Tested:**
- Rate limiting algorithms (token bucket)
- Redis operations and data structures
- Middleware pattern implementation
- HTTP headers and status codes
- Distributed systems concepts
- Error handling and client communication

**Expected Behavior:**
- Accurate rate limiting across multiple server instances
- Graceful degradation when Redis is unavailable
- Clear error messages when limits are exceeded
- Performance: <5ms overhead per request`,
    difficulty: "MEDIUM",
    category: "backend",
    tags: ["Rate Limiting", "Redis", "System Design", "Middleware", "Distributed Systems"],
    language: "typescript",
  },

  {
    title: "Background Job Processing",
    description: `Build a robust background job processing system for handling async tasks like email sending, report generation, and data processing.

**Requirements:**
- Implement job queue using BullMQ/Bull or similar
- Support job priorities (high, normal, low)
- Implement job retries with exponential backoff
- Add job status tracking (pending, processing, completed, failed)
- Implement delayed jobs (schedule for future execution)
- Add job progress reporting
- Implement graceful shutdown (complete in-progress jobs)
- Add job monitoring dashboard data

**Use Cases:**
- Send email (with retry on failure)
- Generate PDF reports (long-running task)
- Process uploaded CSV files
- Send scheduled notifications

**Skills Tested:**
- Queue system design and implementation
- Redis-backed queues
- Error handling and retry logic
- Graceful shutdown patterns
- Job monitoring and observability
- Async/await patterns

**Expected Deliverables:**
- Job creation API
- Job status checking endpoint
- Worker process that processes jobs
- Retry logic with exponential backoff
- Job cancellation support`,
    difficulty: "HARD",
    category: "backend",
    tags: ["Background Jobs", "Queues", "BullMQ", "Redis", "Async Processing"],
    language: "typescript",
  },

  {
    title: "WebSocket Real-time Chat",
    description: `Build a real-time chat application with WebSocket support, message history, and presence tracking.

**Requirements:**
- Implement WebSocket server for bidirectional communication
- Support multiple chat rooms
- Track online users per room
- Implement typing indicators ("User is typing...")
- Add message read receipts
- Handle reconnection gracefully (resume chat state)
- Store message history in database
- Implement message pagination for history
- Add user presence (online, away, offline)

**Skills Tested:**
- WebSocket protocol and Socket.io
- Real-time event handling
- Connection state management
- Message persistence
- Scalability considerations (multiple server instances)
- Error handling for network issues

**Expected Features:**
- WebSocket connection establishment
- Room joining/leaving
- Message broadcasting to room members
- Private direct messages
- Presence updates (user joined, left, typing)
- Message history retrieval
- Graceful degradation (fallback to polling if WebSockets fail)`,
    difficulty: "HARD",
    category: "backend",
    tags: ["WebSockets", "Real-time", "Socket.io", "Chat", "Presence"],
    language: "typescript",
  },

  {
    title: "File Upload and Processing",
    description: `Implement secure file upload with validation, storage, and processing pipeline.

**Requirements:**
- Accept file uploads via multipart/form-data
- Validate file types (images, documents, CSV)
- Validate file sizes (max 10MB for images, 50MB for documents)
- Generate secure random filenames to prevent collisions
- Store files in cloud storage (S3-compatible API simulation)
- Generate thumbnails for images (using sharp library)
- Parse and validate CSV files
- Implement virus scanning placeholder (simulate with file type check)
- Track upload progress
- Clean up failed/incomplete uploads

**Skills Tested:**
- Multipart file upload handling
- Stream processing for large files
- File validation and security
- Image processing
- Error handling for corrupted files
- Storage abstraction patterns

**Expected Deliverables:**
- POST /upload endpoint with multipart support
- File validation (type, size, content)
- Secure storage with unique filenames
- Image thumbnail generation
- GET /files/:id endpoint to retrieve files
- File metadata storage in database`,
    difficulty: "MEDIUM",
    category: "backend",
    tags: ["File Upload", "Multer", "Image Processing", "Storage", "Validation"],
    language: "typescript",
  },

  {
    title: "Microservice Communication",
    description: `Implement communication between two microservices using both REST APIs and message queues.

**Scenario:**
You have two services:
- Order Service: Handles order creation and management
- Inventory Service: Manages product stock levels

**Requirements:**
- Implement REST API calls from Order Service to Inventory Service (check stock)
- Implement async message queue for order events (RabbitMQ/Redis simulation)
- Handle service unavailability with circuit breaker pattern
- Add retry logic with exponential backoff
- Implement idempotency for message processing
- Add request/response logging for debugging
- Handle partial failures gracefully

**Skills Tested:**
- Microservice architecture patterns
- REST API client implementation
- Message queue pub/sub
- Circuit breaker pattern
- Retry logic and error handling
- Distributed system resilience
- Idempotency

**Expected Behavior:**
- Synchronous: Check inventory before creating order
- Asynchronous: Publish order.created event
- Circuit breaker opens after 5 failures, auto-recovers after 30s
- Messages are processed exactly once (idempotent)`,
    difficulty: "HARD",
    category: "backend",
    tags: ["Microservices", "Message Queue", "Circuit Breaker", "Distributed Systems", "Architecture"],
    language: "typescript",
  },

  {
    title: "Caching Strategy Implementation",
    description: `Implement a multi-layer caching strategy for a blog API with Redis and in-memory caching.

**Requirements:**
- Implement Redis cache for frequently accessed blog posts
- Add in-memory LRU cache as first-level cache
- Implement cache-aside (lazy loading) pattern
- Add cache invalidation on updates/deletes
- Implement cache warming for popular posts
- Add cache hit/miss metrics
- Handle cache stampede with locking
- Set appropriate TTLs (Time To Live)

**API Endpoints:**
- GET /posts - List posts (cache for 5 minutes)
- GET /posts/:id - Get single post (cache for 30 minutes)
- POST /posts - Create post (invalidate list cache)
- PUT /posts/:id - Update post (invalidate specific cache)
- DELETE /posts/:id - Delete post (invalidate caches)

**Skills Tested:**
- Caching strategies and patterns
- Redis operations
- Cache invalidation logic
- Cache stampede prevention
- Performance optimization
- Metrics collection

**Expected Improvements:**
- 90%+ cache hit rate for popular posts
- <10ms response time for cached posts (vs 200ms+ uncached)
- Proper cache invalidation (no stale data)`,
    difficulty: "MEDIUM",
    category: "backend",
    tags: ["Caching", "Redis", "Performance", "Optimization", "LRU"],
    language: "typescript",
  },

  // =====================================================
  // NEW SEEDS: Modern Backend Technologies
  // =====================================================

  {
    title: "GraphQL API with Schema Design",
    description: `Build a GraphQL API for a social media platform with proper schema design, resolvers, and real-time subscriptions.

**Requirements:**
- Design a GraphQL schema for users, posts, comments, and likes
- Implement Query, Mutation, and Subscription types
- Add authentication middleware for protected operations
- Implement DataLoader for N+1 query prevention
- Add cursor-based pagination for feeds
- Include input validation with custom scalars
- Add real-time subscriptions for new posts and comments
- Implement proper error handling with GraphQL errors

**Schema Types:**
- User: id, username, email, avatar, posts, followers, following
- Post: id, content, author, comments, likes, createdAt
- Comment: id, content, author, post, createdAt
- Like: id, user, post

**Operations:**
- Queries: me, user, posts, post, feed
- Mutations: createPost, updatePost, deletePost, createComment, likePost, follow
- Subscriptions: onNewPost, onNewComment

**Skills Tested:**
- GraphQL schema design principles
- Resolver patterns and context
- DataLoader for efficient data fetching
- Real-time subscriptions with WebSockets
- Authentication in GraphQL
- Cursor-based pagination
- Error handling best practices

**Test Cases:**
- Schema introspection works correctly
- Authentication blocks unauthorized mutations
- DataLoader batches queries properly
- Subscriptions receive real-time updates
- Pagination returns correct cursors`,
    difficulty: "MEDIUM",
    category: "backend",
    tags: ["GraphQL", "API Design", "Subscriptions", "DataLoader", "Apollo", "Real-time"],
    language: "typescript",
    starterCode: `import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import express from 'express';

// TODO: Define GraphQL schema
const typeDefs = \`
  type Query {
    me: User
    # Add more queries
  }

  type User {
    id: ID!
    username: String!
    # Add more fields
  }

  # Add more types: Post, Comment, Like
  # Add Mutation type
  # Add Subscription type
\`;

// TODO: Implement resolvers
const resolvers = {
  Query: {
    me: (parent, args, context) => {
      // TODO: Return current user from context
    },
  },
  // Add more resolvers
};

// TODO: Add DataLoader for efficient batching
// TODO: Add authentication middleware
// TODO: Set up subscriptions with WebSocket

const app = express();
const server = new ApolloServer({ typeDefs, resolvers });

async function startServer() {
  await server.start();
  app.use('/graphql', express.json(), expressMiddleware(server));
  app.listen(4000);
}

startServer();`,
  },

  {
    title: "Serverless Event-Driven Microservices",
    description: `Design and implement a serverless order processing system using AWS Lambda, API Gateway, and EventBridge.

**System Components:**
1. Order Service - Receives and validates orders
2. Payment Service - Processes payments (mock)
3. Inventory Service - Checks and reserves stock
4. Notification Service - Sends order confirmations

**Requirements:**
- Implement Lambda functions for each service
- Use EventBridge for event-driven communication
- Add Step Functions for order orchestration
- Implement dead letter queues for failed events
- Add idempotency for retry safety
- Include structured logging with correlation IDs
- Implement circuit breaker pattern for external calls
- Add monitoring with custom CloudWatch metrics

**Event Flow:**
1. OrderCreated → PaymentService processes payment
2. PaymentSuccessful → InventoryService reserves stock
3. StockReserved → NotificationService sends confirmation
4. Any failure → Compensation/rollback events

**Skills Tested:**
- Serverless architecture patterns
- Event-driven design
- AWS Lambda best practices
- Error handling and compensation
- Idempotency in distributed systems
- Logging and observability
- Infrastructure as Code (SAM/CDK)

**Expected Behavior:**
- Order processing completes in <3 seconds
- Failed payments trigger proper rollback
- Duplicate events are handled idempotently
- All events are traceable via correlation ID`,
    difficulty: "HARD",
    category: "backend",
    tags: ["Serverless", "AWS Lambda", "EventBridge", "Microservices", "Event-Driven", "Cloud"],
    language: "typescript",
    starterCode: `// Order Service Lambda Handler
export const orderHandler = async (event: any) => {
  // TODO: Validate order
  // TODO: Publish OrderCreated event to EventBridge
  // TODO: Return order ID
};

// Payment Service Lambda Handler
export const paymentHandler = async (event: any) => {
  // TODO: Extract order from EventBridge event
  // TODO: Process payment (mock)
  // TODO: Publish PaymentSuccessful or PaymentFailed event
};

// Inventory Service Lambda Handler
export const inventoryHandler = async (event: any) => {
  // TODO: Check stock availability
  // TODO: Reserve stock
  // TODO: Publish StockReserved or StockUnavailable event
};

// Notification Service Lambda Handler
export const notificationHandler = async (event: any) => {
  // TODO: Send order confirmation email (mock)
  // TODO: Log notification sent
};

// TODO: Add EventBridge client for publishing events
// TODO: Add idempotency checks
// TODO: Add structured logging with correlation IDs`,
  },

  {
    title: "Container Orchestration with Kubernetes",
    description: `Deploy and scale a multi-tier application on Kubernetes with proper resource management and observability.

**Application Components:**
1. Frontend - React app (nginx container)
2. Backend API - Node.js Express (2-10 replicas)
3. Worker - Background job processor (1-5 replicas)
4. Database - PostgreSQL (StatefulSet)
5. Cache - Redis (single replica)

**Requirements:**
- Write Kubernetes manifests (Deployments, Services, ConfigMaps, Secrets)
- Implement Horizontal Pod Autoscaler (HPA) for API and Worker
- Add resource requests/limits for all containers
- Configure liveness and readiness probes
- Set up Ingress with TLS termination
- Implement NetworkPolicies for pod-to-pod security
- Add PodDisruptionBudgets for high availability
- Configure proper logging with Fluentd sidecar

**Skills Tested:**
- Kubernetes resource types and patterns
- Pod scheduling and resource management
- Auto-scaling configuration
- Service discovery and networking
- Secrets management
- Health checks and probes
- High availability patterns

**Expected Outcomes:**
- Application scales from 2 to 10 pods based on CPU
- Zero-downtime deployments
- Database survives pod restarts (PV/PVC)
- Proper network isolation between tiers
- All pods have health checks configured`,
    difficulty: "HARD",
    category: "backend",
    tags: ["Kubernetes", "Docker", "DevOps", "Containers", "Orchestration", "Infrastructure"],
    language: "yaml",
    starterCode: `# api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: myapp/api:latest
        # TODO: Add resource requests/limits
        # TODO: Add liveness/readiness probes
        # TODO: Add environment variables from ConfigMap/Secret

---
# TODO: Add Service for API
# TODO: Add HorizontalPodAutoscaler
# TODO: Add Ingress with TLS
# TODO: Add ConfigMap and Secret
# TODO: Add NetworkPolicy
# TODO: Add PodDisruptionBudget`,
  },

  {
    title: "Real-time Data Pipeline with Kafka",
    description: `Build a real-time data pipeline that processes user activity events for analytics and recommendations.

**Pipeline Components:**
1. Producer - Ingests clickstream events from web/mobile
2. Stream Processor - Enriches and transforms events
3. Aggregator - Computes real-time metrics
4. Consumer - Writes to data warehouse and cache

**Requirements:**
- Implement Kafka producer with batching and compression
- Create Kafka Streams application for event processing
- Add exactly-once semantics for critical events
- Implement windowed aggregations (1min, 5min, 1hour)
- Handle late-arriving data with grace periods
- Add schema registry for event schema evolution
- Implement dead letter topic for poison messages
- Add consumer lag monitoring

**Event Schema:**
\`\`\`
{
  "eventId": "uuid",
  "userId": "string",
  "eventType": "page_view|click|purchase",
  "timestamp": "ISO8601",
  "properties": { ... },
  "sessionId": "string"
}
\`\`\`

**Skills Tested:**
- Kafka producer/consumer patterns
- Stream processing with Kafka Streams
- Exactly-once vs at-least-once semantics
- Windowed aggregations
- Schema evolution and compatibility
- Error handling in streaming
- Monitoring and observability

**Expected Metrics:**
- Process 10,000 events/second
- End-to-end latency <100ms
- No data loss with exactly-once
- Real-time dashboard updates every 1 minute`,
    difficulty: "HARD",
    category: "backend",
    tags: ["Kafka", "Streaming", "Data Pipeline", "Real-time", "Event Processing", "Big Data"],
    language: "typescript",
    starterCode: `import { Kafka, Producer, Consumer } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'activity-pipeline',
  brokers: ['localhost:9092'],
});

// TODO: Implement event producer with batching
class ActivityProducer {
  private producer: Producer;

  async sendEvent(event: ActivityEvent): Promise<void> {
    // TODO: Serialize event with schema validation
    // TODO: Send to appropriate partition
  }
}

// TODO: Implement stream processor for enrichment
class EventEnricher {
  async processEvent(event: ActivityEvent): Promise<EnrichedEvent> {
    // TODO: Lookup user data
    // TODO: Add geo-location from IP
    // TODO: Classify event type
  }
}

// TODO: Implement windowed aggregator
class MetricsAggregator {
  // TODO: Compute events per minute by type
  // TODO: Compute unique users per 5-minute window
  // TODO: Handle late-arriving data
}

// TODO: Implement consumer for data warehouse
class WarehouseConsumer {
  async consume(): Promise<void> {
    // TODO: Batch events for efficient writes
    // TODO: Handle consumer lag
    // TODO: Implement exactly-once with transactions
  }
}`,
  },

  {
    title: "gRPC Service with Protocol Buffers",
    description: `Build a high-performance gRPC service for a ride-sharing platform with streaming and load balancing.

**Service Definition:**
- RideService: Request rides, track drivers, complete rides
- LocationService: Real-time driver location streaming
- PaymentService: Process ride payments

**Requirements:**
- Define Protocol Buffer schemas for all services
- Implement unary, server-streaming, and bidirectional streaming
- Add gRPC interceptors for logging and authentication
- Implement retry policies with exponential backoff
- Add deadline/timeout propagation
- Implement health checking protocol
- Add reflection for debugging
- Configure load balancing (round-robin)

**RPC Methods:**
- RequestRide (unary): Request a new ride
- TrackDriver (server-stream): Stream driver location updates
- UpdateDriverLocation (client-stream): Drivers send location updates
- RideChat (bidirectional-stream): Real-time chat during ride

**Skills Tested:**
- Protocol Buffer schema design
- gRPC service patterns
- Streaming RPC patterns
- Interceptor/middleware patterns
- Error handling and status codes
- Load balancing and resilience
- Performance optimization

**Expected Performance:**
- Unary calls: <10ms p99 latency
- Streaming: Handle 1000 concurrent streams
- Proper cancellation handling
- Graceful degradation under load`,
    difficulty: "MEDIUM",
    category: "backend",
    tags: ["gRPC", "Protocol Buffers", "Microservices", "Streaming", "Performance", "RPC"],
    language: "typescript",
    starterCode: `// ride.proto
syntax = "proto3";

package rideshare;

// TODO: Define message types
message RideRequest {
  string user_id = 1;
  Location pickup = 2;
  Location destination = 3;
}

message Location {
  double latitude = 1;
  double longitude = 2;
}

// TODO: Define service with streaming methods
service RideService {
  rpc RequestRide(RideRequest) returns (RideResponse);
  // TODO: Add TrackDriver server-streaming
  // TODO: Add UpdateDriverLocation client-streaming
  // TODO: Add RideChat bidirectional streaming
}

// server.ts
import * as grpc from '@grpc/grpc-js';

// TODO: Implement RideService handlers
const rideServiceHandlers = {
  requestRide: (call, callback) => {
    // TODO: Match with nearest driver
    // TODO: Return ride details
  },
  // TODO: Implement streaming handlers
};

// TODO: Add interceptors for logging and auth
// TODO: Add health checking
// TODO: Configure server with reflection`,
  },

  // =====================================================
  // EASY SEEDS: For Calibration and Junior Candidates
  // =====================================================

  {
    title: "Basic CRUD API",
    description: `Create a simple REST API for a todo list with basic CRUD operations.

**Requirements:**
- Implement GET /todos - List all todos
- Implement POST /todos - Create a new todo
- Implement PUT /todos/:id - Update a todo
- Implement DELETE /todos/:id - Delete a todo
- Store todos in-memory (array)
- Return proper HTTP status codes
- Add basic input validation

**Todo Structure:**
\`\`\`
{
  "id": 1,
  "title": "Buy groceries",
  "completed": false,
  "createdAt": "2024-01-01T00:00:00Z"
}
\`\`\`

**Skills Tested:**
- Basic REST API design
- HTTP methods and status codes
- Request/response handling
- Simple data validation

**Test Cases:**
- Create todo returns 201
- Get all todos returns array
- Update non-existent todo returns 404
- Delete todo returns 204`,
    difficulty: "EASY",
    category: "backend",
    tags: ["REST API", "CRUD", "Express.js", "Node.js", "Beginner"],
    language: "typescript",
    starterCode: `import express from 'express';

const app = express();
app.use(express.json());

interface Todo {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
}

const todos: Todo[] = [];
let nextId = 1;

// GET /todos - List all todos
app.get('/todos', (req, res) => {
  // TODO: Return all todos
});

// POST /todos - Create a new todo
app.post('/todos', (req, res) => {
  // TODO: Validate input
  // TODO: Create and return new todo
});

// PUT /todos/:id - Update a todo
app.put('/todos/:id', (req, res) => {
  // TODO: Find todo by id
  // TODO: Update and return todo
  // TODO: Return 404 if not found
});

// DELETE /todos/:id - Delete a todo
app.delete('/todos/:id', (req, res) => {
  // TODO: Find and delete todo
  // TODO: Return 204 on success
  // TODO: Return 404 if not found
});

app.listen(3000);`,
  },

  {
    title: "Simple Data Validation",
    description: `Implement input validation for a user registration endpoint.

**Requirements:**
- Validate email format (must contain @ and domain)
- Validate password (min 8 chars, at least 1 number)
- Validate name (not empty, max 100 chars)
- Validate age (optional, must be 18-120 if provided)
- Return clear error messages for each field
- Return 400 with validation errors
- Return 201 on successful validation

**Expected Error Format:**
\`\`\`
{
  "errors": [
    { "field": "email", "message": "Invalid email format" },
    { "field": "password", "message": "Password must be at least 8 characters" }
  ]
}
\`\`\`

**Skills Tested:**
- Input validation patterns
- Error handling and messaging
- Regular expressions
- HTTP status codes

**Test Cases:**
- Valid user returns 201
- Invalid email returns 400 with error
- Short password returns 400 with error
- Multiple errors return all of them`,
    difficulty: "EASY",
    category: "backend",
    tags: ["Validation", "Error Handling", "REST API", "Beginner"],
    language: "typescript",
    starterCode: `import express from 'express';

const app = express();
app.use(express.json());

interface ValidationError {
  field: string;
  message: string;
}

interface UserRegistration {
  name: string;
  email: string;
  password: string;
  age?: number;
}

function validateUser(data: any): ValidationError[] {
  const errors: ValidationError[] = [];

  // TODO: Validate name (not empty, max 100 chars)

  // TODO: Validate email (contains @ and domain)

  // TODO: Validate password (min 8 chars, at least 1 number)

  // TODO: Validate age if provided (18-120)

  return errors;
}

app.post('/register', (req, res) => {
  const errors = validateUser(req.body);

  if (errors.length > 0) {
    // TODO: Return 400 with errors
  }

  // TODO: Return 201 with success message
});

app.listen(3000);`,
  },
];

/**
 * Frontend Problem Seeds (7 seeds)
 */
export const FRONTEND_SEEDS: ProblemSeedData[] = [
  {
    title: "React Component Library",
    description: `Design and build a reusable React component library with TypeScript, focusing on accessibility and customization.

**Components to Build:**
1. Button - Multiple variants (primary, secondary, ghost, danger)
2. Input - Text input with validation states
3. Select - Dropdown with search
4. Modal - Accessible dialog with focus trap
5. Toast - Notification system with auto-dismiss

**Requirements:**
- Full TypeScript type safety with proper prop types
- Accessibility (ARIA labels, keyboard navigation, focus management)
- Customizable via props and CSS classes
- Loading states for async actions
- Error states with proper messaging
- Compound component patterns where appropriate
- Proper event handling

**Skills Tested:**
- React component design patterns
- TypeScript generics and utility types
- Accessibility best practices (WCAG)
- State management within components
- Event handling and callbacks
- CSS-in-JS or Tailwind CSS
- Component composition

**Expected Deliverables:**
- Fully typed components with JSDoc comments
- Example usage for each component
- Keyboard navigation support
- Screen reader compatibility
- Responsive design`,
    difficulty: "MEDIUM",
    category: "frontend",
    tags: ["React", "TypeScript", "Components", "Accessibility", "UI/UX"],
    language: "typescript",
    starterCode: `import React from 'react';

// TODO: Implement Button component
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = (props) => {
  // TODO: Implement
  return <button>TODO</button>;
};

// TODO: Implement Input component
// TODO: Implement Select component
// TODO: Implement Modal component
// TODO: Implement Toast component`,
  },

  {
    title: "Form Validation with React Hook Form",
    description: `Build a complex multi-step registration form with comprehensive validation using React Hook Form.

**Form Steps:**
1. Personal Info (name, email, password)
2. Address (street, city, state, zip)
3. Preferences (newsletter, notifications)
4. Review and Submit

**Requirements:**
- Use React Hook Form for form state management
- Implement field-level validation with immediate feedback
- Add async validation (check email availability via API)
- Show validation errors inline with proper UX
- Implement conditional fields (show/hide based on other fields)
- Add password strength indicator
- Preserve form state across steps
- Implement form persistence (localStorage)
- Add form submission with loading state
- Show success/error messages after submission

**Skills Tested:**
- React Hook Form library usage
- Form validation patterns
- Async validation
- Multi-step form state management
- UX best practices for forms
- Error handling and display
- Local storage integration

**Expected Behavior:**
- Real-time validation feedback
- Cannot proceed to next step with errors
- Back button preserves data
- Form data persists on page refresh
- Clear error messages and recovery paths`,
    difficulty: "MEDIUM",
    category: "frontend",
    tags: ["React", "Forms", "Validation", "React Hook Form", "UX"],
    language: "typescript",
  },

  {
    title: "Infinite Scroll with React Query",
    description: `Implement an infinite scrolling feed with React Query for data fetching, caching, and optimistic updates.

**Requirements:**
- Fetch initial batch of posts (20 items)
- Implement infinite scroll (load more on scroll to bottom)
- Use React Query for data fetching and caching
- Add loading skeletons during fetch
- Implement pull-to-refresh
- Add optimistic updates for post likes
- Handle errors gracefully with retry logic
- Implement virtual scrolling for performance (react-window)
- Add search/filter functionality

**Skills Tested:**
- React Query (useInfiniteQuery)
- Intersection Observer API for scroll detection
- Virtual scrolling for performance
- Optimistic updates pattern
- Error handling and retry logic
- Loading states and skeletons
- Performance optimization

**Expected Behavior:**
- Smooth infinite scrolling with no jank
- Cached data shows instantly on revisit
- Optimistic like updates (instant feedback)
- Proper loading and error states
- Can handle 1000+ items without performance degradation`,
    difficulty: "HARD",
    category: "frontend",
    tags: ["React", "React Query", "Infinite Scroll", "Performance", "Virtual Scrolling"],
    language: "typescript",
  },

  {
    title: "Real-time Collaborative Editor",
    description: `Build a real-time collaborative text editor with cursor positions and user presence (like Google Docs).

**Requirements:**
- Rich text editor with basic formatting (bold, italic, headings)
- Real-time synchronization using WebSockets
- Show other users' cursors with names/colors
- Display who is currently editing
- Handle conflict resolution for simultaneous edits
- Implement undo/redo that works with collaboration
- Add document versioning/history
- Show connection status (connected, reconnecting, offline)

**Skills Tested:**
- Operational Transformation (OT) or CRDT concepts
- WebSocket integration
- Complex state management (cursor positions, selections)
- Real-time synchronization
- Conflict resolution
- Performance optimization for frequent updates
- Rich text editor APIs

**Expected Features:**
- Multiple users can edit simultaneously
- See others' cursors and selections in real-time
- Changes appear within 100ms
- No data loss on network issues
- Graceful degradation when offline`,
    difficulty: "HARD",
    category: "frontend",
    tags: ["React", "Real-time", "WebSockets", "Collaboration", "Editor", "CRDT"],
    language: "typescript",
  },

  {
    title: "Dashboard with Data Visualization",
    description: `Create an analytics dashboard with charts, filters, and real-time data updates.

**Requirements:**
- Build dashboard with 4-5 chart types (line, bar, pie, area)
- Use chart library (Chart.js, Recharts, or D3.js)
- Implement date range filters
- Add real-time data updates (WebSocket or polling)
- Export charts as images (PNG/SVG)
- Make dashboard responsive (mobile-friendly)
- Add loading skeletons for charts
- Implement data aggregation (daily, weekly, monthly views)
- Add tooltips with detailed information

**Dashboard Metrics:**
- User signups over time (line chart)
- Revenue by category (pie chart)
- Active users (real-time counter)
- Conversion funnel (bar chart)

**Skills Tested:**
- Data visualization libraries
- Chart configuration and customization
- Real-time data handling
- Responsive design
- Data transformation and aggregation
- Export functionality
- Performance with large datasets

**Expected Deliverables:**
- Interactive charts with hover effects
- Date range filtering updates all charts
- Smooth animations and transitions
- Mobile-responsive layout`,
    difficulty: "MEDIUM",
    category: "frontend",
    tags: ["React", "Data Visualization", "Charts", "Dashboard", "Recharts", "Analytics"],
    language: "typescript",
  },

  {
    title: "Shopping Cart with State Management",
    description: `Build a shopping cart feature with global state management using Redux Toolkit or Zustand.

**Requirements:**
- Product listing page with add to cart buttons
- Cart page showing items, quantities, prices
- Implement add/remove items from cart
- Update quantities with validation (min 1, max 10)
- Calculate totals (subtotal, tax, shipping, total)
- Persist cart to localStorage
- Implement promo code system with validation
- Add optimistic updates for better UX
- Handle sold out items (disable add to cart)
- Implement cart expiration (clear after 24 hours)

**Skills Tested:**
- Global state management (Redux Toolkit/Zustand)
- Local storage persistence
- State normalization
- Selectors and derived state
- Async actions (apply promo code)
- State persistence and rehydration
- Form validation

**Expected Behavior:**
- Cart persists across page refreshes
- Instant UI updates on quantity changes
- Proper price calculations
- Promo codes validated and applied correctly
- Sold out items handled gracefully`,
    difficulty: "MEDIUM",
    category: "frontend",
    tags: ["React", "Redux", "Zustand", "State Management", "E-commerce"],
    language: "typescript",
  },

  {
    title: "Accessible Navigation Menu",
    description: `Build a fully accessible, responsive navigation menu with dropdown submenus and mobile drawer.

**Requirements:**
- Desktop: Horizontal menu with dropdown submenus
- Mobile: Hamburger menu with slide-out drawer
- Full keyboard navigation support
- Screen reader accessibility (ARIA labels and roles)
- Focus management (trap focus in mobile drawer)
- Smooth animations and transitions
- Close menu on outside click or ESC key
- Support nested menu items (2 levels deep)
- Highlight active route
- Responsive breakpoints

**Skills Tested:**
- Accessibility best practices (WCAG AA)
- Keyboard event handling
- Focus management and focus trap
- ARIA attributes and roles
- Responsive design patterns
- Animation performance
- Event handling (outside click, ESC key)

**Expected Behavior:**
- Tab key navigates through menu items
- Arrow keys navigate within dropdowns
- ESC closes active dropdown/drawer
- Screen reader announces menu structure
- Mobile drawer prevents body scroll
- Smooth transitions and no layout shift`,
    difficulty: "MEDIUM",
    category: "frontend",
    tags: ["React", "Accessibility", "Navigation", "ARIA", "Responsive Design"],
    language: "typescript",
  },
];

/**
 * Algorithms & Data Structures Seeds (5 seeds)
 */
export const ALGORITHMS_SEEDS: ProblemSeedData[] = [
  {
    title: "LRU Cache Implementation",
    description: `Design and implement a Least Recently Used (LRU) cache data structure.

**Requirements:**
- Implement get(key) operation in O(1) time
- Implement put(key, value) operation in O(1) time
- When cache reaches capacity, evict least recently used item
- Both get and put operations count as "using" an item
- Support generic types for key-value pairs

**Constraints:**
- Capacity: 1 <= capacity <= 1000
- Keys and values can be any type
- At most 10^4 operations total

**Skills Tested:**
- Hash map usage for O(1) lookups
- Doubly linked list for O(1) insertion/deletion
- Understanding of LRU eviction policy
- Time complexity analysis
- Data structure design

**Example:**
\`\`\`typescript
const cache = new LRUCache<number, string>(2); // capacity = 2
cache.put(1, "one");   // cache: {1: "one"}
cache.put(2, "two");   // cache: {1: "one", 2: "two"}
cache.get(1);          // returns "one", cache: {2: "two", 1: "one"}
cache.put(3, "three"); // evicts key 2, cache: {1: "one", 3: "three"}
cache.get(2);          // returns undefined (evicted)
\`\`\`

**Test Cases:**
- Basic put and get operations
- Cache at capacity (eviction)
- Get updates recency
- Put overwrites existing key
- Edge cases (capacity 1, many operations)`,
    difficulty: "HARD",
    category: "algorithms",
    tags: ["Data Structures", "Hash Map", "Linked List", "LRU", "Design"],
    language: "typescript",
    starterCode: `class LRUCache<K, V> {
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    // TODO: Initialize data structures
  }

  get(key: K): V | undefined {
    // TODO: Implement O(1) get
    return undefined;
  }

  put(key: K, value: V): void {
    // TODO: Implement O(1) put with LRU eviction
  }
}

export default LRUCache;`,
  },

  {
    title: "Binary Tree Path Finding",
    description: `Implement various binary tree traversal and path-finding algorithms.

**Requirements:**
Implement the following functions:
1. findPath(root, target): Find path from root to target node
2. lowestCommonAncestor(root, p, q): Find LCA of two nodes
3. pathSum(root, targetSum): Find all root-to-leaf paths with given sum
4. maxPathSum(root): Find maximum path sum in tree
5. isValidBST(root): Validate binary search tree

**Skills Tested:**
- Tree traversal (DFS, BFS)
- Recursion and backtracking
- Path tracking in trees
- Binary search tree properties
- Algorithm correctness and edge cases

**Tree Node Structure:**
\`\`\`typescript
class TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;
}
\`\`\`

**Expected Behavior:**
- Handle empty trees
- Work with single node trees
- Find paths efficiently (O(n) or better)
- Correct handling of negative numbers
- Proper BST validation`,
    difficulty: "HARD",
    category: "algorithms",
    tags: ["Binary Tree", "DFS", "BFS", "Recursion", "Algorithms"],
    language: "typescript",
  },

  {
    title: "Rate Limiter Algorithm",
    description: `Implement different rate limiting algorithms: Fixed Window, Sliding Window, and Token Bucket.

**Requirements:**
Implement three rate limiter classes:

1. **FixedWindowRateLimiter**
   - Allow N requests per fixed time window
   - Reset counter at window boundaries

2. **SlidingWindowRateLimiter**
   - Smooth rate limiting using sliding window
   - More accurate than fixed window

3. **TokenBucketRateLimiter**
   - Tokens added at constant rate
   - Allows bursts up to bucket capacity

**Interface:**
\`\`\`typescript
interface RateLimiter {
  allowRequest(userId: string): boolean;
  getRemainingRequests(userId: string): number;
}
\`\`\`

**Skills Tested:**
- Algorithm implementation
- Time-based logic
- Data structure selection
- Space-time complexity tradeoffs
- System design concepts

**Expected Behavior:**
- Accurate rate limiting
- Memory efficient
- Thread-safe considerations
- Proper time window handling`,
    difficulty: "MEDIUM",
    category: "algorithms",
    tags: ["Algorithms", "Rate Limiting", "System Design", "Data Structures"],
    language: "typescript",
  },

  {
    title: "String Pattern Matching",
    description: `Implement efficient string pattern matching algorithms.

**Requirements:**
Implement the following functions:

1. **KMP Search**: Find all occurrences of pattern in text using KMP algorithm
2. **Wildcard Matching**: Match text against pattern with * and ? wildcards
3. **Regex Subset**: Implement basic regex matching with . and *
4. **Longest Common Subsequence**: Find LCS of two strings
5. **Edit Distance**: Calculate minimum edits to transform string A to string B

**Skills Tested:**
- String algorithms
- Dynamic programming
- Pattern matching techniques
- Algorithm optimization
- Time complexity analysis

**Example:**
\`\`\`typescript
kmpSearch("hello world hello", "hello"); // returns [0, 12]
wildcardMatch("hello", "h*o");           // returns true
editDistance("horse", "ros");            // returns 3
\`\`\`

**Expected Behavior:**
- Efficient implementations (better than brute force)
- Handle edge cases (empty strings, no matches)
- Correct algorithm implementation
- Optimal space complexity`,
    difficulty: "HARD",
    category: "algorithms",
    tags: ["Strings", "Algorithms", "KMP", "Dynamic Programming", "Pattern Matching"],
    language: "typescript",
  },

  {
    title: "Graph Algorithms Implementation",
    description: `Implement common graph algorithms for various graph problems.

**Requirements:**
Implement the following graph algorithms:

1. **BFS/DFS**: Basic graph traversal
2. **Shortest Path (Dijkstra)**: Find shortest path between nodes
3. **Detect Cycle**: Check if graph has cycles
4. **Topological Sort**: Order nodes for dependency resolution
5. **Connected Components**: Find all connected components in undirected graph

**Graph Representation:**
\`\`\`typescript
// Adjacency list: Map<node, neighbor[]>
type Graph = Map<string, string[]>;
type WeightedGraph = Map<string, Array<{node: string, weight: number}>>;
\`\`\`

**Skills Tested:**
- Graph traversal algorithms
- Shortest path algorithms
- Cycle detection
- Topological sorting
- Graph theory concepts

**Expected Behavior:**
- Correct algorithm implementations
- Handle disconnected graphs
- Efficient time/space complexity
- Proper handling of edge cases`,
    difficulty: "HARD",
    category: "algorithms",
    tags: ["Graphs", "Algorithms", "BFS", "DFS", "Dijkstra", "Data Structures"],
    language: "typescript",
  },
];

/**
 * Full-Stack Seeds (4 seeds)
 */
export const FULLSTACK_SEEDS: ProblemSeedData[] = [
  {
    title: "Real-time Todo App with Sync",
    description: `Build a full-stack todo application with real-time synchronization across clients.

**Backend Requirements:**
- REST API for CRUD operations on todos
- WebSocket server for real-time updates
- Broadcast changes to all connected clients
- Persist todos to database (PostgreSQL/MongoDB)
- User authentication (simple JWT)

**Frontend Requirements:**
- React UI with todo list and form
- Optimistic updates for instant feedback
- Real-time updates when other users make changes
- Offline support with sync on reconnect
- Handle conflicts (last write wins)

**Skills Tested:**
- Full-stack architecture
- REST API + WebSocket hybrid
- Real-time synchronization
- Optimistic UI updates
- Offline-first patterns
- Conflict resolution

**Expected Features:**
- Create, update, delete, toggle todos
- Changes appear in real-time for all users
- Works offline, syncs when back online
- Smooth UX with no flickering`,
    difficulty: "HARD",
    category: "fullstack",
    tags: ["Full-Stack", "Real-time", "WebSocket", "React", "Sync", "Offline"],
    language: "typescript",
  },

  {
    title: "URL Shortener Service",
    description: `Build a complete URL shortener service like bit.ly with analytics.

**Backend Requirements:**
- POST /shorten - Create short URL from long URL
- GET /:shortCode - Redirect to original URL
- GET /stats/:shortCode - Get click analytics
- Generate collision-free short codes (6 characters)
- Track clicks, referrers, user agents
- Implement expiration (optional TTL)
- Rate limiting (100 requests/hour per IP)

**Frontend Requirements:**
- URL input form with validation
- Display generated short URL
- Copy to clipboard functionality
- Show basic analytics (clicks, top referrers)
- QR code generation for short URL

**Skills Tested:**
- URL encoding and short code generation
- Database design (URLs, analytics)
- Redirect handling (301 vs 302)
- Analytics tracking
- Rate limiting
- QR code generation

**Expected Deliverables:**
- Working URL shortening with collision prevention
- Fast redirects (<50ms)
- Accurate analytics tracking
- Clean, responsive UI`,
    difficulty: "MEDIUM",
    category: "fullstack",
    tags: ["Full-Stack", "URL Shortener", "Analytics", "Database", "API Design"],
    language: "typescript",
  },

  {
    title: "Blog Platform with Comments",
    description: `Create a blog platform with posts, comments, likes, and user profiles.

**Backend Requirements:**
- User authentication (register, login)
- CRUD operations for blog posts
- Nested comments system (replies to comments)
- Like posts and comments
- User profiles with bio and avatar
- Search posts by title/content
- Pagination for posts and comments

**Frontend Requirements:**
- Post listing page with preview
- Full post view with comments
- Comment form with nested reply support
- Rich text editor for post creation (Markdown or WYSIWYG)
- User profile page showing their posts
- Search functionality with debounced input
- Responsive design

**Skills Tested:**
- Full CRUD application
- Nested data structures (comment threads)
- Rich text handling
- Search implementation
- User authentication flow
- Pagination patterns

**Expected Features:**
- Fast post loading with pagination
- Nested comments up to 3 levels deep
- Live search results
- Markdown preview in editor
- Profile customization`,
    difficulty: "MEDIUM",
    category: "fullstack",
    tags: ["Full-Stack", "Blog", "CRUD", "Comments", "Authentication", "Search"],
    language: "typescript",
  },

  {
    title: "Event Booking System",
    description: `Build an event booking platform with seat selection and payment processing.

**Backend Requirements:**
- Event CRUD (create, list, detail events)
- Seat map management (rows, columns, availability)
- Booking system with seat locking (prevent double booking)
- Handle concurrent bookings with transactions
- Mock payment processing
- Send confirmation emails
- Booking cancellation with refunds

**Frontend Requirements:**
- Event listing with filters (date, category, location)
- Event detail page with seat map visualization
- Interactive seat selection (click to select/deselect)
- Show real-time seat availability
- Checkout flow with booking summary
- Booking confirmation page
- User booking history

**Skills Tested:**
- Database transactions and locking
- Concurrent booking handling
- Race condition prevention
- Interactive UI (seat map)
- Real-time updates (seat availability)
- Email integration
- Payment flow (mocked)

**Expected Behavior:**
- No double bookings (seats locked during checkout)
- Real-time seat availability updates
- Smooth seat selection UX
- Booking holds expire after 10 minutes`,
    difficulty: "HARD",
    category: "fullstack",
    tags: ["Full-Stack", "Booking System", "Transactions", "Concurrency", "Real-time"],
    language: "typescript",
  },
];

/**
 * Specialized Seeds (6 seeds)
 */
export const SPECIALIZED_SEEDS: ProblemSeedData[] = [
  {
    title: "Machine Learning Pipeline",
    description: `Build an end-to-end ML pipeline for a binary classification problem.

**Requirements:**
- Load and explore dataset (CSV)
- Data preprocessing (handle missing values, normalize)
- Feature engineering (create new features)
- Train/test split with stratification
- Train multiple models (Logistic Regression, Random Forest, XGBoost)
- Hyperparameter tuning with cross-validation
- Model evaluation (accuracy, precision, recall, F1, ROC-AUC)
- Feature importance analysis
- Save best model to disk

**Dataset:** Customer churn prediction (age, usage, payment, tenure → churned yes/no)

**Skills Tested:**
- Data preprocessing and cleaning
- Feature engineering
- Model training and evaluation
- Cross-validation
- Hyperparameter tuning
- Model comparison
- Python ML libraries (scikit-learn, pandas)

**Expected Deliverables:**
- Clean, documented Python code
- Model achieving >80% accuracy
- Feature importance visualization
- Model evaluation report`,
    difficulty: "HARD",
    category: "ml",
    tags: ["Machine Learning", "Python", "scikit-learn", "Classification", "Data Science"],
    language: "python",
  },

  {
    title: "Security Vulnerability Assessment",
    description: `Identify and fix common web security vulnerabilities in a given application.

**Given:** A web application with multiple security issues

**Vulnerabilities to Find and Fix:**
1. SQL Injection in login endpoint
2. XSS (Cross-Site Scripting) in comment display
3. CSRF (Cross-Site Request Forgery) on state-changing operations
4. Insecure direct object references (IDOR)
5. Missing authentication on admin endpoints
6. Weak password hashing (plain text or MD5)
7. Sensitive data exposure in API responses
8. Missing rate limiting

**Requirements:**
- Identify all vulnerabilities with explanations
- Fix each vulnerability with secure code
- Add unit tests to prevent regressions
- Document security best practices applied
- Implement security headers (CSP, HSTS, etc.)

**Skills Tested:**
- OWASP Top 10 knowledge
- Secure coding practices
- Input validation and sanitization
- Authentication and authorization
- Cryptography basics (password hashing)
- Security testing

**Expected Deliverables:**
- Vulnerability report with severity ratings
- Fixed code with explanations
- Security tests to prevent regressions`,
    difficulty: "HARD",
    category: "security",
    tags: ["Security", "OWASP", "Vulnerabilities", "Pentesting", "Best Practices"],
    language: "typescript",
  },

  {
    title: "CI/CD Pipeline Configuration",
    description: `Set up a complete CI/CD pipeline for automated testing and deployment.

**Requirements:**
- Write GitHub Actions / GitLab CI configuration
- Run tests on every pull request
- Run linting and type checking
- Build Docker image
- Run security scans (dependency audit)
- Deploy to staging on merge to main
- Deploy to production on tagged release
- Add deployment rollback capability
- Send Slack notifications for build status

**Pipeline Stages:**
1. Lint & Format check
2. Type checking (TypeScript)
3. Unit tests with coverage
4. Integration tests
5. Build Docker image
6. Security scan
7. Deploy to environment
8. Smoke tests on deployed app

**Skills Tested:**
- CI/CD concepts
- GitHub Actions / GitLab CI syntax
- Docker containerization
- Automated testing
- Deployment strategies
- Infrastructure as code

**Expected Deliverables:**
- Working pipeline configuration file
- Dockerfile for application
- Pipeline runs successfully end-to-end
- Proper environment management (staging, prod)`,
    difficulty: "MEDIUM",
    category: "devops",
    tags: ["DevOps", "CI/CD", "GitHub Actions", "Docker", "Deployment", "Automation"],
    language: "yaml",
  },

  {
    title: "API Design and Documentation",
    description: `Design a well-structured REST API with comprehensive OpenAPI documentation.

**Scenario:** Design an API for a library management system

**Requirements:**
- Design RESTful endpoints for:
  * Books (CRUD, search, borrow, return)
  * Users (registration, profile, borrow history)
  * Authors (CRUD, list books by author)
  * Categories (CRUD, list books by category)
- Write OpenAPI 3.0 specification (YAML)
- Define request/response schemas
- Include authentication (JWT)
- Add pagination, filtering, sorting
- Define error responses (4xx, 5xx)
- Add rate limiting headers
- Version the API (v1)

**Skills Tested:**
- REST API design principles
- HTTP methods and status codes
- Resource modeling
- OpenAPI specification
- API documentation
- Authentication design
- Pagination patterns

**Expected Deliverables:**
- Complete OpenAPI spec file
- Clear, consistent endpoint naming
- Proper HTTP status code usage
- Well-defined schemas
- API documentation page (Swagger UI)`,
    difficulty: "MEDIUM",
    category: "api-design",
    tags: ["API Design", "REST", "OpenAPI", "Documentation", "Architecture"],
    language: "yaml",
  },

  {
    title: "Monitoring and Observability",
    description: `Implement comprehensive monitoring, logging, and alerting for a Node.js application.

**Requirements:**
- Structured logging with Winston/Pino
- Log levels (debug, info, warn, error)
- Request/response logging middleware
- Error tracking with stack traces
- Metrics collection (Prometheus format):
  * Request count by endpoint
  * Response time percentiles
  * Error rate
  * Active connections
- Health check endpoint (/health)
- Implement distributed tracing (trace ID in logs)
- Add custom business metrics

**Monitoring Dashboard:**
- HTTP request rate and latency
- Error rate by endpoint
- Database query performance
- Memory and CPU usage

**Skills Tested:**
- Logging best practices
- Metrics collection
- Observability concepts
- Prometheus metrics format
- Health check patterns
- Performance monitoring

**Expected Deliverables:**
- Structured logs in JSON format
- Metrics endpoint (/metrics)
- Health check with dependency checks
- Error tracking with context
- Dashboard-ready metrics`,
    difficulty: "MEDIUM",
    category: "devops",
    tags: ["Monitoring", "Observability", "Logging", "Metrics", "Prometheus", "Debugging"],
    language: "typescript",
  },

  {
    title: "Database Migration Strategy",
    description: `Design and implement a safe database migration strategy for a production system.

**Scenario:**
You need to add a new required column to a large table with millions of rows in production without downtime.

**Requirements:**
- Write migration scripts (up and down)
- Implement backward-compatible changes
- Add column as nullable first
- Backfill data in batches
- Add NOT NULL constraint after backfill
- Handle rollback scenarios
- Test migrations on production-sized dataset
- Document rollback procedure

**Migration Phases:**
1. Add nullable column
2. Deploy code that writes to both old and new schema
3. Backfill existing rows in batches
4. Validate data integrity
5. Deploy code that reads from new column
6. Remove old column (separate migration)

**Skills Tested:**
- Database migration patterns
- Zero-downtime deployment
- Data backfill strategies
- Rollback planning
- Production safety practices
- SQL optimization for large tables

**Expected Deliverables:**
- Migration scripts for each phase
- Backfill script with batching
- Rollback procedure document
- Data validation queries
- Performance testing results`,
    difficulty: "HARD",
    category: "database",
    tags: ["Database", "Migrations", "Production", "Zero Downtime", "SQL", "Safety"],
    language: "typescript",
  },
];

/**
 * Combine all seeds
 */
export const ALL_PROBLEM_SEEDS = [
  ...BACKEND_SEEDS,
  ...FRONTEND_SEEDS,
  ...ALGORITHMS_SEEDS,
  ...FULLSTACK_SEEDS,
  ...SPECIALIZED_SEEDS,
];
