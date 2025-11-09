/**
 * Mock problem seeds data for demo/development
 * Seeds are LLM instruction templates that generate actual coding problems
 */

import { Role, SeniorityLevel, QuestionSeed } from "@/types/assessment";

/**
 * Enhanced QuestionSeed with metadata for library management
 */
export interface EnhancedQuestionSeed extends QuestionSeed {
  id: string;
  title: string;
  description?: string;

  // Metadata
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  role: Role | "any";
  seniority: SeniorityLevel | "any";
  tags: string[];
  estimatedTime: number; // minutes

  // Usage analytics
  usageCount: number;
  avgCandidateScore?: number;
  avgCompletionRate?: number;
  rating?: number; // 1-5 stars

  // Status
  status: "draft" | "active" | "archived";

  // For tier-gated preview feature
  lastPreviewedAt?: string;
}

/**
 * Mock problem seeds
 */
export const MOCK_PROBLEM_SEEDS: EnhancedQuestionSeed[] = [
  {
    id: "seed-1",
    title: "REST API with Authentication",
    description: "Build a complete REST API with JWT authentication and role-based access control",
    instructions: "Create a RESTful API for a task management system with user authentication, authorization, and CRUD operations. Include JWT token generation, refresh tokens, and role-based middleware. Focus on security best practices and proper error handling.",
    topics: ["REST APIs", "Authentication", "Security", "Express.js", "JWT"],
    difficultyDistribution: { easy: 20, medium: 50, hard: 30 },
    examples: [
      "POST /auth/register - Create new user account",
      "POST /auth/login - Login and receive JWT token",
      "GET /tasks - List all tasks (requires auth)",
      "POST /tasks - Create new task (requires auth)",
    ],

    // Metadata
    createdBy: "you@company.com",
    createdAt: "2025-01-10T10:00:00Z",
    updatedAt: "2025-01-20T14:00:00Z",
    role: "backend",
    seniority: "mid",
    tags: ["API", "Authentication", "Security", "Backend"],
    estimatedTime: 45,

    // Analytics
    usageCount: 24,
    avgCandidateScore: 78,
    avgCompletionRate: 0.85,
    rating: 4.5,

    status: "active",
    lastPreviewedAt: "2025-01-20T09:00:00Z",
  },
  {
    id: "seed-2",
    title: "React Component Library",
    description: "Design and build reusable React components with TypeScript",
    instructions: "Create a small component library with Button, Input, Modal, and Card components. Use TypeScript for type safety, implement proper prop validation, add loading states, and ensure accessibility (ARIA labels, keyboard navigation). Include Storybook-style examples.",
    topics: ["React", "TypeScript", "Component Design", "Accessibility", "UI/UX"],
    difficultyDistribution: { easy: 30, medium: 50, hard: 20 },

    createdBy: "you@company.com",
    createdAt: "2025-01-12T11:00:00Z",
    updatedAt: "2025-01-18T16:00:00Z",
    role: "frontend",
    seniority: "mid",
    tags: ["React", "TypeScript", "Components", "UI"],
    estimatedTime: 40,

    usageCount: 18,
    avgCandidateScore: 82,
    avgCompletionRate: 0.90,
    rating: 4.8,

    status: "active",
  },
  {
    id: "seed-3",
    title: "Database Query Optimization",
    description: "Optimize slow queries and design efficient database schema",
    instructions: "Given a slow-performing e-commerce database, identify bottlenecks, add proper indexes, optimize N+1 queries, and implement caching strategies. Include query profiling and explain plans. Focus on PostgreSQL or MySQL.",
    topics: ["Databases", "SQL", "Performance", "Optimization", "Indexing"],
    difficultyDistribution: { easy: 10, medium: 40, hard: 50 },

    createdBy: "you@company.com",
    createdAt: "2025-01-08T09:00:00Z",
    updatedAt: "2025-01-15T10:00:00Z",
    role: "database",
    seniority: "senior",
    tags: ["Database", "SQL", "Performance", "Optimization"],
    estimatedTime: 60,

    usageCount: 12,
    avgCandidateScore: 71,
    avgCompletionRate: 0.75,
    rating: 4.2,

    status: "active",
  },
  {
    id: "seed-4",
    title: "Real-time Chat Application",
    description: "Build a real-time messaging feature with WebSockets",
    instructions: "Implement a real-time chat system with WebSocket support, message history, typing indicators, online status, and message read receipts. Handle reconnection logic and ensure messages aren't lost. Use Socket.io or native WebSockets.",
    topics: ["WebSockets", "Real-time", "Full-Stack", "Socket.io", "State Management"],
    difficultyDistribution: { easy: 15, medium: 45, hard: 40 },

    createdBy: "teammate@company.com",
    createdAt: "2025-01-05T14:00:00Z",
    updatedAt: "2025-01-22T11:00:00Z",
    role: "fullstack",
    seniority: "senior",
    tags: ["WebSockets", "Real-time", "Full-Stack", "Chat"],
    estimatedTime: 75,

    usageCount: 15,
    avgCandidateScore: 74,
    avgCompletionRate: 0.68,
    rating: 4.6,

    status: "active",
  },
  {
    id: "seed-5",
    title: "API Rate Limiting Implementation",
    description: "Implement token bucket rate limiting for API endpoints",
    instructions: "Create a rate limiting middleware using the token bucket algorithm. Support different rate limits per user tier (free, premium, enterprise), provide clear error messages when limits are hit, and include rate limit headers in responses. Use Redis for distributed rate limiting.",
    topics: ["System Design", "Rate Limiting", "Redis", "Middleware", "API Design"],
    difficultyDistribution: { easy: 20, medium: 50, hard: 30 },

    createdBy: "you@company.com",
    createdAt: "2025-01-14T13:00:00Z",
    updatedAt: "2025-01-14T13:00:00Z",
    role: "backend",
    seniority: "senior",
    tags: ["Rate Limiting", "System Design", "Redis", "Backend"],
    estimatedTime: 50,

    usageCount: 9,
    avgCandidateScore: 76,
    avgCompletionRate: 0.82,
    rating: 4.3,

    status: "active",
  },
  {
    id: "seed-6",
    title: "Form Validation with React Hook Form",
    description: "Build complex form validation with custom rules",
    instructions: "Create a multi-step registration form with React Hook Form. Include async validation (check email availability), custom validation rules, conditional fields, and proper error handling. Ensure good UX with inline errors and field-level validation.",
    topics: ["React", "Forms", "Validation", "UX", "React Hook Form"],
    difficultyDistribution: { easy: 35, medium: 45, hard: 20 },

    createdBy: "you@company.com",
    createdAt: "2025-01-16T10:00:00Z",
    updatedAt: "2025-01-16T10:00:00Z",
    role: "frontend",
    seniority: "mid",
    tags: ["Forms", "Validation", "React", "UX"],
    estimatedTime: 35,

    usageCount: 7,
    avgCandidateScore: 80,
    avgCompletionRate: 0.88,
    rating: 4.4,

    status: "active",
  },
  {
    id: "seed-7",
    title: "ML Model Training Pipeline",
    description: "Build an end-to-end machine learning pipeline",
    instructions: "Create a complete ML pipeline for a classification problem: data loading, preprocessing, feature engineering, model training (try multiple algorithms), hyperparameter tuning, and evaluation. Include proper train/test splits, cross-validation, and metrics reporting. Use scikit-learn or similar.",
    topics: ["Machine Learning", "Data Science", "Python", "scikit-learn", "Model Training"],
    difficultyDistribution: { easy: 15, medium: 50, hard: 35 },

    createdBy: "teammate@company.com",
    createdAt: "2025-01-11T15:00:00Z",
    updatedAt: "2025-01-19T09:00:00Z",
    role: "ml",
    seniority: "mid",
    tags: ["ML", "Data Science", "Python", "Pipeline"],
    estimatedTime: 70,

    usageCount: 5,
    avgCandidateScore: 72,
    avgCompletionRate: 0.71,
    rating: 4.1,

    status: "active",
  },
  {
    id: "seed-8",
    title: "Microservices Communication",
    description: "Implement inter-service communication patterns",
    instructions: "Build two microservices that communicate via both REST APIs and message queues (RabbitMQ/Kafka). Include service discovery, circuit breaker patterns, and proper error handling. Demonstrate both synchronous and asynchronous communication patterns.",
    topics: ["Microservices", "System Design", "Message Queues", "Distributed Systems", "Architecture"],
    difficultyDistribution: { easy: 5, medium: 35, hard: 60 },

    createdBy: "you@company.com",
    createdAt: "2025-01-07T12:00:00Z",
    updatedAt: "2025-01-21T14:00:00Z",
    role: "backend",
    seniority: "staff",
    tags: ["Microservices", "Architecture", "Distributed Systems"],
    estimatedTime: 90,

    usageCount: 3,
    avgCandidateScore: 68,
    avgCompletionRate: 0.62,
    rating: 4.7,

    status: "active",
  },
  {
    id: "seed-9",
    title: "Security Vulnerability Assessment",
    description: "Identify and fix common security vulnerabilities",
    instructions: "Given a web application with multiple security vulnerabilities (SQL injection, XSS, CSRF, insecure authentication), identify all issues, explain the risks, and implement fixes. Include input sanitization, parameterized queries, CSRF tokens, and secure session management.",
    topics: ["Security", "OWASP", "Web Security", "Penetration Testing", "Best Practices"],
    difficultyDistribution: { easy: 10, medium: 40, hard: 50 },

    createdBy: "teammate@company.com",
    createdAt: "2025-01-13T11:00:00Z",
    updatedAt: "2025-01-13T11:00:00Z",
    role: "security",
    seniority: "senior",
    tags: ["Security", "OWASP", "Vulnerabilities", "Best Practices"],
    estimatedTime: 65,

    usageCount: 6,
    avgCandidateScore: 75,
    avgCompletionRate: 0.79,
    rating: 4.5,

    status: "active",
  },
  {
    id: "seed-10",
    title: "Basic CRUD API",
    description: "Simple REST API with CRUD operations (Draft)",
    instructions: "Build a basic REST API with Create, Read, Update, Delete operations for a simple entity (e.g., books, users, products). Include proper HTTP methods, status codes, and basic error handling. No authentication required.",
    topics: ["REST APIs", "CRUD", "HTTP", "Basic Backend"],
    difficultyDistribution: { easy: 70, medium: 25, hard: 5 },

    createdBy: "you@company.com",
    createdAt: "2025-01-23T14:00:00Z",
    updatedAt: "2025-01-23T14:00:00Z",
    role: "backend",
    seniority: "junior",
    tags: ["CRUD", "REST", "Backend", "Beginner"],
    estimatedTime: 30,

    usageCount: 0,

    status: "draft",
  },
];

/**
 * Get seeds filtered by criteria
 */
export function getSeeds(filters?: {
  role?: Role | "any";
  seniority?: SeniorityLevel | "any";
  status?: "draft" | "active" | "archived";
  tags?: string[];
  searchQuery?: string;
}): EnhancedQuestionSeed[] {
  return MOCK_PROBLEM_SEEDS.filter((seed) => {
    if (filters?.role && filters.role !== "any" && seed.role !== filters.role && seed.role !== "any") {
      return false;
    }
    if (filters?.seniority && filters.seniority !== "any" && seed.seniority !== filters.seniority && seed.seniority !== "any") {
      return false;
    }
    if (filters?.status && seed.status !== filters.status) {
      return false;
    }
    if (filters?.tags && filters.tags.length > 0) {
      const hasAllTags = filters.tags.every(tag =>
        seed.tags.some(seedTag => seedTag.toLowerCase().includes(tag.toLowerCase()))
      );
      if (!hasAllTags) return false;
    }
    if (filters?.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const matchesSearch =
        seed.title.toLowerCase().includes(query) ||
        seed.description?.toLowerCase().includes(query) ||
        seed.tags.some(tag => tag.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }
    return true;
  });
}

/**
 * Get all unique tags from seeds
 */
export function getAllTags(): string[] {
  const tagSet = new Set<string>();
  MOCK_PROBLEM_SEEDS.forEach(seed => {
    seed.tags.forEach(tag => tagSet.add(tag));
  });
  return Array.from(tagSet).sort();
}

/**
 * Get seed statistics
 */
export function getSeedStats() {
  const activeSeeds = MOCK_PROBLEM_SEEDS.filter(s => s.status === "active");
  const totalUsage = MOCK_PROBLEM_SEEDS.reduce((sum, s) => sum + s.usageCount, 0);
  const avgScore = activeSeeds.reduce((sum, s) => sum + (s.avgCandidateScore || 0), 0) / activeSeeds.length;
  const avgCompletionRate = activeSeeds.reduce((sum, s) => sum + (s.avgCompletionRate || 0), 0) / activeSeeds.length;

  return {
    totalSeeds: MOCK_PROBLEM_SEEDS.length,
    activeSeeds: activeSeeds.length,
    draftSeeds: MOCK_PROBLEM_SEEDS.filter(s => s.status === "draft").length,
    archivedSeeds: MOCK_PROBLEM_SEEDS.filter(s => s.status === "archived").length,
    totalUsage,
    avgScore: Math.round(avgScore),
    avgCompletionRate: Math.round(avgCompletionRate * 100),
  };
}
