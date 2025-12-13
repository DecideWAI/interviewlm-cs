# Incremental Seed Examples

This document provides example configurations for incremental assessments across different domains and seniority levels.

## Table of Contents

1. [E-Commerce Backend (Python/FastAPI)](#1-e-commerce-backend-pythonfastapi)
2. [Financial Services API (TypeScript/Node.js)](#2-financial-services-api-typescriptnodejs)
3. [Real-Time Chat System (Go)](#3-real-time-chat-system-go)
4. [Healthcare Data Platform (Python)](#4-healthcare-data-platform-python)
5. [DevOps Infrastructure (Terraform/Kubernetes)](#5-devops-infrastructure-terraformkubernetes)

---

## 1. E-Commerce Backend (Python/FastAPI)

**Seniority**: Mid-Level
**Estimated Duration**: 60-90 minutes
**Domain**: E-commerce microservices

### Configuration

```json
{
  "title": "Microservices E-commerce Backend",
  "domain": "e-commerce",
  "description": "Build a scalable microservices backend for an e-commerce platform",
  "seedType": "incremental",
  "requiredTech": {
    "languages": [
      { "name": "python", "priority": "critical", "version": ">=3.10" }
    ],
    "frameworks": [
      { "name": "fastapi", "priority": "critical" }
    ],
    "databases": [
      { "name": "mongodb", "priority": "required" },
      { "name": "redis", "priority": "recommended" }
    ],
    "tools": [
      { "name": "docker", "priority": "recommended" },
      { "name": "pytest", "priority": "required" }
    ]
  },
  "baseProblem": {
    "title": "Create Product API Endpoints",
    "description": "Implement CRUD operations for products using FastAPI and MongoDB. Include proper validation, error handling, and basic documentation.\n\nRequirements:\n- GET /products - List all products with pagination\n- GET /products/{id} - Get single product\n- POST /products - Create new product\n- PUT /products/{id} - Update product\n- DELETE /products/{id} - Delete product\n- Use Pydantic models for validation\n- Include proper HTTP status codes\n- Handle errors gracefully",
    "starterCode": "from fastapi import FastAPI, HTTPException\nfrom motor.motor_asyncio import AsyncIOMotorClient\nfrom pydantic import BaseModel\nfrom typing import Optional\n\napp = FastAPI(title=\"E-commerce API\")\n\n# MongoDB connection\nMONGO_URL = \"mongodb://localhost:27017\"\nclient = AsyncIOMotorClient(MONGO_URL)\ndb = client.ecommerce\n\nclass Product(BaseModel):\n    name: str\n    description: Optional[str]\n    price: float\n    stock: int\n\n# TODO: Implement product endpoints",
    "estimatedTime": 25
  },
  "progressionHints": {
    "extensionTopics": [
      "caching with Redis",
      "rate limiting",
      "JWT authentication",
      "full-text search",
      "image upload",
      "inventory management",
      "order processing",
      "payment integration"
    ],
    "simplificationTopics": [
      "basic CRUD operations",
      "data validation",
      "error handling",
      "pagination",
      "filtering"
    ]
  }
}
```

### Expected Question Progression

**Q1: Product API** (Base Problem - 25 min)
→ Baseline established

**Q2 (High Performer, Score ≥75%)**: Add Caching Layer
→ Implement Redis caching for GET endpoints with cache invalidation on updates

**Q2 (Average Performer, 50-75%)**: Add Search and Filtering
→ Implement query parameters for filtering by category, price range

**Q2 (Struggling, <50%)**: Complete Basic Validation
→ Add comprehensive input validation and error messages

**Q3 (High Performer)**: Implement Authentication & Authorization
→ Add JWT-based auth, protect write endpoints, role-based access

**Q3 (Average)**: Add Inventory Management
→ Track stock levels, prevent overselling, low stock alerts

**Q4-Q5**: Progressive features like order processing, payment webhooks, or multi-service architecture

---

## 2. Financial Services API (TypeScript/Node.js)

**Seniority**: Senior
**Estimated Duration**: 90-120 minutes
**Domain**: Fintech

### Configuration

```json
{
  "title": "Financial Transaction Processing API",
  "domain": "fintech",
  "description": "Build a secure, compliant API for processing financial transactions",
  "seedType": "incremental",
  "requiredTech": {
    "languages": [
      { "name": "typescript", "priority": "critical" }
    ],
    "frameworks": [
      { "name": "express", "priority": "critical" },
      { "name": "nestjs", "priority": "recommended" }
    ],
    "databases": [
      { "name": "postgresql", "priority": "critical" },
      { "name": "redis", "priority": "required" }
    ],
    "tools": [
      { "name": "jest", "priority": "critical" },
      { "name": "docker", "priority": "required" }
    ]
  },
  "baseProblem": {
    "title": "Account Management System",
    "description": "Implement a secure account management system with proper transaction handling.\n\nRequirements:\n- Create account endpoint with KYC validation\n- Get account balance endpoint\n- Account transaction history with pagination\n- Proper error handling for invalid account IDs\n- Database transactions for data consistency\n- Input validation and sanitization\n- Comprehensive unit tests (>80% coverage)\n\nSecurity considerations:\n- No SQL injection vulnerabilities\n- Proper input validation\n- Secure error messages (no sensitive data leaks)",
    "starterCode": "import express from 'express';\nimport { Pool } from 'pg';\nimport { body, validationResult } from 'express-validator';\n\nconst app = express();\nconst pool = new Pool({\n  connectionString: process.env.DATABASE_URL\n});\n\napp.use(express.json());\n\ninterface Account {\n  id: string;\n  userId: string;\n  balance: number;\n  currency: string;\n  createdAt: Date;\n}\n\n// TODO: Implement account endpoints",
    "estimatedTime": 30
  },
  "progressionHints": {
    "extensionTopics": [
      "transaction processing with double-entry bookkeeping",
      "idempotency keys",
      "rate limiting and fraud detection",
      "multi-currency support",
      "real-time balance updates with WebSockets",
      "audit logging",
      "compliance reporting",
      "distributed transactions"
    ],
    "simplificationTopics": [
      "basic account CRUD",
      "transaction history",
      "balance queries",
      "input validation",
      "error handling"
    ]
  }
}
```

### Expected Question Progression

**Q1: Account Management** (30 min)
→ Establish baseline with proper DB transactions and tests

**Q2 (High Performer)**: Implement Transaction Processing
→ Double-entry bookkeeping, ACID compliance, idempotency

**Q3 (High Performer)**: Add Fraud Detection & Rate Limiting
→ Anomaly detection, velocity checks, distributed rate limiting

**Q4 (High Performer)**: Multi-Currency & Compliance
→ Currency conversion, regulatory reporting, audit trails

---

## 3. Real-Time Chat System (Go)

**Seniority**: Mid-Level
**Estimated Duration**: 60-90 minutes
**Domain**: Real-time communication

### Configuration

```json
{
  "title": "Real-Time Chat Application",
  "domain": "real-time-communication",
  "description": "Build a scalable real-time chat system with WebSockets",
  "seedType": "incremental",
  "requiredTech": {
    "languages": [
      { "name": "go", "priority": "critical", "version": ">=1.21" }
    ],
    "frameworks": [
      { "name": "gorilla/websocket", "priority": "critical" }
    ],
    "databases": [
      { "name": "redis", "priority": "required" },
      { "name": "postgresql", "priority": "recommended" }
    ],
    "tools": [
      { "name": "docker", "priority": "recommended" }
    ]
  },
  "baseProblem": {
    "title": "WebSocket Chat Server",
    "description": "Implement a basic WebSocket server for real-time messaging.\n\nRequirements:\n- WebSocket connection handling\n- Message broadcasting to all connected clients\n- Connection tracking (who's online)\n- Graceful disconnect handling\n- Basic message validation\n- Proper error handling\n- Connection state management\n\nMessage format:\n```json\n{\n  \"type\": \"message\" | \"join\" | \"leave\",\n  \"username\": \"string\",\n  \"content\": \"string\",\n  \"timestamp\": \"ISO8601\"\n}\n```",
    "starterCode": "package main\n\nimport (\n\t\"log\"\n\t\"net/http\"\n\t\"github.com/gorilla/websocket\"\n)\n\nvar upgrader = websocket.Upgrader{\n\tCheckOrigin: func(r *http.Request) bool {\n\t\treturn true\n\t},\n}\n\ntype Client struct {\n\tconn     *websocket.Conn\n\tusername string\n}\n\ntype Hub struct {\n\tclients    map[*Client]bool\n\tbroadcast  chan []byte\n\tregister   chan *Client\n\tunregister chan *Client\n}\n\n// TODO: Implement chat server logic",
    "estimatedTime": 25
  },
  "progressionHints": {
    "extensionTopics": [
      "private messaging",
      "chat rooms/channels",
      "message persistence",
      "typing indicators",
      "read receipts",
      "file sharing",
      "presence status",
      "message search",
      "horizontal scaling with Redis Pub/Sub"
    ],
    "simplificationTopics": [
      "basic broadcasting",
      "connection management",
      "message validation",
      "error handling",
      "graceful shutdown"
    ]
  }
}
```

---

## 4. Healthcare Data Platform (Python)

**Seniority**: Senior
**Estimated Duration**: 90-120 minutes
**Domain**: Healthcare/Compliance

### Configuration

```json
{
  "title": "HIPAA-Compliant Patient Records API",
  "domain": "healthcare",
  "description": "Build a secure, HIPAA-compliant API for managing patient health records",
  "seedType": "incremental",
  "requiredTech": {
    "languages": [
      { "name": "python", "priority": "critical", "version": ">=3.10" }
    ],
    "frameworks": [
      { "name": "fastapi", "priority": "critical" },
      { "name": "sqlalchemy", "priority": "required" }
    ],
    "databases": [
      { "name": "postgresql", "priority": "critical" }
    ],
    "tools": [
      { "name": "pytest", "priority": "critical" },
      { "name": "cryptography", "priority": "required" }
    ]
  },
  "baseProblem": {
    "title": "Secure Patient Record Management",
    "description": "Implement a secure API for managing patient records with encryption at rest.\n\nRequirements:\n- Patient CRUD endpoints with field-level encryption for PII\n- Audit logging for all access (who, when, what)\n- Role-based access control (doctor, nurse, admin)\n- Data validation and sanitization\n- Proper error handling without data leaks\n- Comprehensive tests\n\nSecurity Requirements:\n- Encrypt sensitive fields (SSN, medical history)\n- No plaintext passwords in database\n- Audit trail for compliance\n- Input validation to prevent injection attacks",
    "starterCode": "from fastapi import FastAPI, Depends, HTTPException\nfrom sqlalchemy import create_engine, Column, String, DateTime, Text\nfrom sqlalchemy.ext.declarative import declarative_base\nfrom sqlalchemy.orm import Session, sessionmaker\nfrom pydantic import BaseModel, validator\nfrom cryptography.fernet import Fernet\nfrom datetime import datetime\nimport os\n\napp = FastAPI(title=\"Healthcare Records API\")\n\nDATABASE_URL = os.getenv(\"DATABASE_URL\", \"postgresql://user:pass@localhost/health\")\nengine = create_engine(DATABASE_URL)\nSessionLocal = sessionmaker(bind=engine)\nBase = declarative_base()\n\n# Encryption key (should be from environment in production)\nENCRYPTION_KEY = Fernet.generate_key()\ncipher_suite = Fernet(ENCRYPTION_KEY)\n\nclass Patient(Base):\n    __tablename__ = \"patients\"\n    id = Column(String, primary_key=True)\n    name = Column(String, nullable=False)\n    ssn_encrypted = Column(Text, nullable=False)\n    dob = Column(DateTime, nullable=False)\n    # TODO: Add more fields\n\n# TODO: Implement secure endpoints",
    "estimatedTime": 35
  },
  "progressionHints": {
    "extensionTopics": [
      "HL7 FHIR integration",
      "prescription management",
      "lab results integration",
      "appointment scheduling",
      "insurance verification",
      "differential privacy for analytics",
      "consent management",
      "data retention policies"
    ],
    "simplificationTopics": [
      "basic CRUD operations",
      "field encryption",
      "audit logging",
      "access control",
      "input validation"
    ]
  }
}
```

---

## 5. DevOps Infrastructure (Terraform/Kubernetes)

**Seniority**: Staff/Principal
**Estimated Duration**: 90-120 minutes
**Domain**: Infrastructure as Code

### Configuration

```json
{
  "title": "Multi-Region Kubernetes Infrastructure",
  "domain": "devops-infrastructure",
  "description": "Design and implement production-grade infrastructure with Terraform and Kubernetes",
  "seedType": "incremental",
  "requiredTech": {
    "languages": [
      { "name": "hcl", "priority": "critical" }
    ],
    "frameworks": [
      { "name": "terraform", "priority": "critical" },
      { "name": "kubernetes", "priority": "critical" }
    ],
    "tools": [
      { "name": "helm", "priority": "required" },
      { "name": "aws", "priority": "recommended" },
      { "name": "prometheus", "priority": "recommended" }
    ]
  },
  "baseProblem": {
    "title": "VPC and EKS Cluster Setup",
    "description": "Create production-ready AWS infrastructure with Terraform.\n\nRequirements:\n- VPC with public/private subnets across 3 AZs\n- EKS cluster with managed node groups\n- Proper security groups and NACLs\n- IAM roles with least privilege\n- Enable VPC flow logs\n- State stored in S3 with DynamoDB locking\n- Modular, reusable code structure\n- Outputs for cluster connection\n\nBest Practices:\n- Use modules for reusability\n- Enable encryption at rest\n- Tag all resources appropriately\n- Use remote state",
    "starterCode": "# main.tf\nterraform {\n  required_version = \">= 1.0\"\n  required_providers {\n    aws = {\n      source  = \"hashicorp/aws\"\n      version = \"~> 5.0\"\n    }\n  }\n  backend \"s3\" {\n    # TODO: Configure S3 backend\n  }\n}\n\nprovider \"aws\" {\n  region = var.region\n}\n\n# TODO: Implement VPC and EKS infrastructure",
    "estimatedTime": 35
  },
  "progressionHints": {
    "extensionTopics": [
      "multi-region failover",
      "service mesh (Istio)",
      "GitOps with ArgoCD",
      "observability stack (Prometheus, Grafana, Loki)",
      "auto-scaling policies",
      "disaster recovery",
      "cost optimization",
      "security hardening (Falco, OPA)",
      "secrets management (External Secrets Operator)"
    ],
    "simplificationTopics": [
      "single-region setup",
      "basic networking",
      "cluster provisioning",
      "IAM configuration",
      "basic monitoring"
    ]
  }
}
```

---

## Best Practices for Creating Incremental Seeds

### 1. Base Problem Design

**Characteristics of a good base problem:**
- **Substantial but achievable** (20-30 min for target seniority)
- **Clear success criteria** with testable requirements
- **Foundation for extension** - creates artifacts that later questions build upon
- **Demonstrates core competency** in the required tech stack

**Example**: For a FastAPI e-commerce seed, start with Product CRUD (creates database schema, API patterns). Later questions extend this with caching, auth, search, etc.

### 2. Tech Stack Selection

**Priority Levels:**
- **Critical**: Must use or assessment automatically fails (e.g., Python for a Python backend role)
- **Required**: Expected for the role, flagged in evaluation if missing (e.g., pytest for testing)
- **Recommended**: Bonus points, shows best practices (e.g., Docker for containerization)

**Guidelines:**
- Limit critical tech to 2-3 items (language + framework)
- Required tech should be 3-5 items
- Keep recommended tech relevant to progression topics

### 3. Progression Hints

**Extension Topics** (for high performers, ≥75%):
- Advanced architectural patterns
- Performance optimization
- Security hardening
- Scalability features
- Integration with external services

**Simplification Topics** (for struggling candidates, <50%):
- Core functionality refinements
- Better error handling
- Input validation
- Code organization
- Testing basics

**Example Progression:**
```
Base: Product CRUD API
↓
High Performer → Add Redis caching + rate limiting
Average        → Add search and filtering
Struggling     → Improve validation and error messages
```

### 4. Domain Selection

**Good domains for incremental assessments:**
- **E-commerce**: Natural progression (products → cart → checkout → payments)
- **Fintech**: Security and compliance build naturally
- **Real-time systems**: Start simple, add features (chat → rooms → presence)
- **Healthcare**: Compliance and security layers
- **DevOps**: Infrastructure complexity scales well

### 5. Starter Code Quality

**Provide:**
- Proper imports and dependencies
- Database/framework initialization
- Interface/type definitions
- Clear TODO comments
- Realistic environment setup

**Don't provide:**
- Complete implementations
- Test solutions
- Architecture decisions (let candidate make them)

### 6. Estimated Time

**Base Problem:**
- Junior: 15-20 min
- Mid: 20-30 min
- Senior: 30-40 min
- Staff+: 35-45 min

**Follow-up Questions:** 15-25 min each

**Total Assessment:** 60-120 min depending on seniority

---

## Validation Checklist

Before deploying an incremental seed, verify:

- [ ] Base problem is substantial (not trivial)
- [ ] Base problem establishes foundation for extensions
- [ ] Critical tech is minimal (2-3 items max)
- [ ] Extension topics are challenging but achievable
- [ ] Simplification topics address common struggles
- [ ] Starter code is production-quality
- [ ] Estimated times are realistic
- [ ] Requirements are clear and testable
- [ ] Security considerations are addressed
- [ ] Domain is relevant to target role

---

## Example Assessment Flow

### Candidate: Mid-Level Backend Engineer
### Seed: E-Commerce Backend (Python/FastAPI)

**Question 1: Product API (25 min)**
- Candidate Score: 82%
- Time Spent: 28 min
- Tests Passed: 9/10

**Analysis:**
- Trend: N/A (first question)
- Action: EXTEND (score ≥75%)
- Difficulty Assessment: 5.5/10 (baseline)

**Question 2: Add Redis Caching Layer (20 min)**
- Builds on Product API from Q1
- Candidate Score: 78%
- Time Spent: 24 min
- Tests Passed: 7/8

**Analysis:**
- Trend: STABLE (82% → 78%, within 10pt threshold)
- Action: EXTEND (avg 80%, not declining)
- Difficulty Assessment: 7.0/10 (relative to baseline: 1.27x)

**Question 3: JWT Authentication (22 min)**
- Protect write endpoints, role-based access
- Candidate Score: 71%
- Time Spent: 26 min
- Tests Passed: 6/9

**Analysis:**
- Trend: DECLINING (80% → 71%)
- Action: MAINTAIN (avg 77%, declining trend)
- Difficulty Assessment: 7.5/10 (relative to baseline: 1.36x)

**Question 4: Search and Filtering (18 min)**
- Maintained difficulty, focused on data queries
- Candidate Score: 85%
- Time Spent: 19 min
- Tests Passed: 8/8

**Analysis:**
- Trend: IMPROVING (recent avg: 78%)
- Action: MAINTAIN (70% expertise threshold reached)
- Difficulty Assessment: 6.0/10 (relative to baseline: 1.09x)

**Final Assessment: 4 questions, 97 minutes**
- Overall Score: 79.0% (calibrated with difficulty weights)
- Expertise Level: 76% (meets 70% threshold)
- Recommendation: PASS with Strong Performance
