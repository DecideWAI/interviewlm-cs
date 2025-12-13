# Curated Question Bank

**30 Production-Ready Problem Seeds for AI-Assisted Technical Assessments**

---

## Overview

InterviewLM uses **Problem Seeds** as templates that Claude AI uses to generate unique coding interview questions. This approach ensures:

- **Uniqueness**: Each candidate gets a different variation of the same problem
- **Fairness**: All variations test the same skills at the same difficulty
- **Scalability**: One seed can generate unlimited question variations
- **Quality**: Seeds are curated and validated for realistic assessments

---

## Architecture: Seeds vs. Generated Questions

```
┌─────────────────────────────────────────────────────────────┐
│  Problem Seed (Template)                                     │
│  "Build REST API with Authentication"                        │
│  • Category: Backend                                         │
│  • Difficulty: Medium                                        │
│  • Skills: REST, JWT, Security                               │
│  • Instructions for Claude                                   │
└─────────────────────────────────────────────────────────────┘
                    ↓ (Claude generates)
   ┌────────────────────────────────────────────────────────┐
   │  Generated Question 1                                   │
   │  "Build Task Manager API with JWT"                      │
   │  • Unique starter code                                  │
   │  • Specific test cases                                  │
   │  • Detailed requirements                                │
   └────────────────────────────────────────────────────────┘

   ┌────────────────────────────────────────────────────────┐
   │  Generated Question 2                                   │
   │  "Build Blog API with Role-Based Access"               │
   │  • Different implementation details                     │
   │  • Different edge cases                                 │
   │  • Same skill assessment                                │
   └────────────────────────────────────────────────────────┘
```

**Key Difference:**
- **Problem Seed** = Template (stored in database, created by InterviewLM)
- **Generated Question** = Actual interview question (created by Claude for each candidate)

---

## Question Bank Composition

### Total: 30 Production-Ready Seeds

#### 1. Backend Development (8 seeds)
- REST API with Authentication
- Database Query Optimization
- API Rate Limiting with Redis
- Background Job Processing
- WebSocket Real-time Chat
- File Upload and Processing
- Microservice Communication
- Caching Strategy Implementation

#### 2. Frontend Development (7 seeds)
- React Component Library
- Form Validation with React Hook Form
- Infinite Scroll with React Query
- Real-time Collaborative Editor
- Dashboard with Data Visualization
- Shopping Cart with State Management
- Accessible Navigation Menu

#### 3. Algorithms & Data Structures (5 seeds)
- LRU Cache Implementation
- Binary Tree Path Finding
- Rate Limiter Algorithm
- String Pattern Matching
- Graph Algorithms Implementation

#### 4. Full-Stack Development (4 seeds)
- Real-time Todo App with Sync
- URL Shortener Service
- Blog Platform with Comments
- Event Booking System

#### 5. Specialized Topics (6 seeds)
- Machine Learning Pipeline
- Security Vulnerability Assessment
- CI/CD Pipeline Configuration
- API Design and Documentation
- Monitoring and Observability
- Database Migration Strategy

---

## Difficulty Distribution

| Difficulty | Count | Percentage | Target Audience |
|------------|-------|------------|-----------------|
| **Easy** | 0 | 0% | Junior (1-2 years) |
| **Medium** | 16 | 53% | Mid-level (2-5 years) |
| **Hard** | 14 | 47% | Senior (5+ years) |

**Note:** Easy seeds are intentionally omitted as the platform focuses on mid-to-senior level candidates who should be proficient with AI coding tools.

---

## Category Coverage

```
Backend       ████████ 27% (8 seeds)
Frontend      ███████  23% (7 seeds)
Algorithms    █████    17% (5 seeds)
Full-Stack    ████     13% (4 seeds)
Specialized   ██████   20% (6 seeds)
```

---

## How to Use

### 1. Seed the Database

Run the seed script to populate the database with all 30 problem seeds:

```bash
npm run seed

# Or with custom password
SEED_PASSWORD=your-password npm run seed
```

**Output:**
```
🌱 Starting database seed...
✅ Created test user: test@interviewlm.com
✅ Created test organization: Test Organization
✅ Linked user to organization as: OWNER
✅ Created admin user: admin@interviewlm.com

📚 Seeding problem seeds...
✅ Created 30 problem seeds (0 already existed)

🎉 Seed completed successfully!

📊 Database seeded with 30 problem seeds across 5 categories:
  • Backend (8 seeds)
  • Frontend (7 seeds)
  • Algorithms (5 seeds)
  • Full-Stack (4 seeds)
  • Specialized (6 seeds)
```

---

### 2. Create an Assessment

When creating an assessment, select problem seeds based on:

**Role Requirements:**
```typescript
// For Backend Engineer
const backendSeeds = await prisma.problemSeed.findMany({
  where: {
    category: { in: ["backend", "algorithms"] },
    difficulty: { in: ["MEDIUM", "HARD"] }
  },
  take: 3
});
```

**Seniority Level:**
```typescript
// For Senior Engineer
const seniorSeeds = await prisma.problemSeed.findMany({
  where: {
    difficulty: "HARD",
    category: { in: ["backend", "fullstack", "specialized"] }
  },
  take: 3
});
```

**Skill Focus:**
```typescript
// For API/Backend specialist
const apiSeeds = await prisma.problemSeed.findMany({
  where: {
    tags: { hasSome: ["REST API", "Authentication", "Database"] }
  },
  take: 3
});
```

---

### 3. Generate Questions During Interview

The system automatically generates unique questions from seeds:

```typescript
// lib/services/questions.ts
const result = await generateQuestion({
  candidateId: "cand_123",
  seed: "seed-rest-api",           // Problem seed ID
  difficulty: "MEDIUM",             // Can adapt based on performance
  language: "typescript",
  previousPerformance: 0.85         // Candidate scored 85% on previous question
});

// Claude generates a unique variation:
// - "Build a Task Manager API with JWT authentication"
// - Unique starter code and test cases
// - Same skills tested as the seed
```

**Adaptive Difficulty:**
- If candidate scores high (>80%): Next question uses HARD difficulty
- If candidate scores low (<60%): Next question uses MEDIUM/EASY difficulty
- Claude adjusts complexity within the seed's constraints

---

## Question Seed Structure

Each seed contains:

```typescript
interface ProblemSeed {
  // Core Content
  title: string;              // "REST API with Authentication"
  description: string;        // Detailed problem description
  difficulty: Difficulty;     // EASY | MEDIUM | HARD

  // Categorization
  category: string;           // "backend" | "frontend" | "algorithms"
  tags: string[];             // ["REST API", "JWT", "Security"]

  // Optional Templates
  starterCode?: string;       // Boilerplate code (Claude can customize)
  testCode?: string;          // Test suite template
  language: string;           // "typescript" | "python" | "javascript"

  // Metadata (populated over time)
  usageCount: number;         // How many times used
  avgCandidateScore: number;  // Average score (0-100)
  avgCompletionRate: number;  // % who complete it
}
```

---

## Validation Criteria

Each seed in the curated bank meets these quality standards:

### ✅ Technical Quality
- [ ] Tests realistic, interview-appropriate scenarios
- [ ] Clear, unambiguous requirements
- [ ] Solvable within estimated time (30-90 minutes)
- [ ] Appropriate difficulty level
- [ ] Well-defined success criteria

### ✅ AI-Friendly
- [ ] General enough for Claude to generate variations
- [ ] Specific enough to test target skills
- [ ] Clear instructions for Claude
- [ ] Good examples of expected deliverables

### ✅ Assessment Value
- [ ] Tests practical, job-relevant skills
- [ ] Multiple paths to solution (creativity allowed)
- [ ] Differentiates between skill levels
- [ ] Measures ability to use AI coding tools effectively

---

## Extending the Question Bank

### Adding New Seeds

1. **Create seed data:**

```typescript
// prisma/seeds/custom-seeds.ts
export const CUSTOM_SEEDS: ProblemSeedData[] = [
  {
    title: "Your New Problem",
    description: "Detailed problem description...",
    difficulty: "MEDIUM",
    category: "backend",
    tags: ["API", "Database"],
    language: "typescript"
  }
];
```

2. **Add to seed script:**

```typescript
// prisma/seed.ts
import { CUSTOM_SEEDS } from "./seeds/custom-seeds";

// Add CUSTOM_SEEDS to the seeding loop
for (const seedData of [...ALL_PROBLEM_SEEDS, ...CUSTOM_SEEDS]) {
  // ...
}
```

3. **Run seed:**

```bash
npm run seed
```

---

### Seed Quality Checklist

Before adding a new seed, ensure it meets these criteria:

**Problem Design:**
- [ ] Clear problem statement
- [ ] Realistic scenario (mimics actual work)
- [ ] Appropriate scope (30-90 minutes)
- [ ] Well-defined success criteria
- [ ] Multiple valid approaches

**Instructions for Claude:**
- [ ] Clear requirements list
- [ ] Expected deliverables specified
- [ ] Skills to be tested listed
- [ ] Example test cases provided
- [ ] Edge cases mentioned

**Technical Specifications:**
- [ ] Correct difficulty rating
- [ ] Appropriate category/tags
- [ ] Language specified
- [ ] Optional starter code template
- [ ] Optional test template

**Validation:**
- [ ] Generate 3-5 questions from seed
- [ ] Verify variations test same skills
- [ ] Confirm solvability within time limit
- [ ] Check clarity of generated questions

---

## Analytics & Iteration

Track seed performance to improve question quality:

```typescript
// Get seed analytics
const seedStats = await prisma.problemSeed.findUnique({
  where: { id: "seed-rest-api" },
  include: {
    questions: {
      include: {
        candidate: {
          select: {
            score: true,
            status: true
          }
        }
      }
    }
  }
});

// Calculate metrics
const usageCount = seedStats.questions.length;
const completedQuestions = seedStats.questions.filter(q => q.status === "COMPLETED");
const avgScore = calculateAverage(completedQuestions.map(q => q.score));
const completionRate = completedQuestions.length / usageCount;
```

**Red Flags:**
- Completion rate <50%: Too difficult or unclear
- Average score <40%: Unrealistic expectations
- Average score >90%: Too easy, not differentiating
- High skip rate: Unappealing or intimidating

**Iterate:**
- Adjust difficulty rating
- Clarify requirements in description
- Update starter code to be more helpful
- Refine test cases

---

## Best Practices

### For Assessment Creators

1. **Match seeds to role requirements**
   - Backend role → Backend + Algorithms seeds
   - Frontend role → Frontend + Full-Stack seeds
   - Full-Stack role → Mix of Backend, Frontend, Full-Stack

2. **Consider difficulty progression**
   - Start MEDIUM → Adapt based on performance
   - Don't start with HARD (intimidating)
   - Use adaptive difficulty (built into system)

3. **Limit questions per assessment**
   - 2-3 questions optimal (60-120 minutes total)
   - 1 question minimum (too short, limited signal)
   - 4+ questions (too long, candidate fatigue)

4. **Tag combinations matter**
   ```typescript
   // Good: Specific skill focus
   tags: ["REST API", "Authentication", "JWT"]

   // Avoid: Too broad
   tags: ["Backend", "Programming"]
   ```

### For Seed Creators

1. **Write for Claude, not candidates**
   - Seeds are templates for Claude to generate from
   - Include instructions like "Generate unique variants"
   - Specify what should vary vs. stay constant

2. **Be specific about skills tested**
   ```typescript
   // Good
   "Skills Tested: JWT authentication, password hashing, token refresh, middleware patterns"

   // Avoid
   "Skills Tested: Backend development"
   ```

3. **Provide example test cases**
   - Helps Claude generate realistic test suites
   - Ensures consistent assessment criteria
   - Prevents trivial or impossible tests

4. **Include edge cases in description**
   ```
   "Test cases should cover:
   - Successful authentication
   - Invalid credentials
   - Expired tokens
   - Concurrent requests
   - Rate limiting"
   ```

---

## Frequently Asked Questions

### Q: How many seeds should an assessment use?

**A:** 2-3 seeds is optimal. This provides:
- 60-120 minutes of assessment time
- Multiple data points for evaluation
- Coverage of different skill areas
- Manageable for candidates

### Q: Can I create organization-specific seeds?

**A:** Yes! Seeds are scoped to organizations. Create custom seeds that match your:
- Tech stack (e.g., GraphQL instead of REST)
- Specific requirements (e.g., your internal frameworks)
- Company values (e.g., accessibility focus)

### Q: How does adaptive difficulty work?

**A:** The system adjusts difficulty based on performance:
1. Candidate completes Question 1 (MEDIUM seed)
2. Scores 92% → System selects HARD seed for Question 2
3. Scores 45% → System selects MEDIUM or adjusts to easier variant

Claude also adjusts complexity within the seed's instructions.

### Q: What if a seed generates low-quality questions?

**A:** This indicates the seed needs refinement:
1. Review the seed description (too vague?)
2. Add more specific requirements
3. Include better examples
4. Test generation 5-10 times
5. Archive and create improved version

### Q: Should I archive old seeds?

**A:** Yes, archive seeds that:
- Have low completion rates (<50%)
- Generate unclear questions
- Are outdated (old technologies)
- Are superseded by better versions

### Q: How do I test a new seed before using it?

**A:** Use the test generation endpoint:

```bash
curl -X POST /api/admin/seeds/test-generate \
  -H "Content-Type: application/json" \
  -d '{
    "seedId": "seed-new-problem",
    "variations": 5
  }'
```

This generates 5 variations without creating a candidate.

---

## Seed Files Reference

```
prisma/
├── seed.ts                          # Main seed script
└── seeds/
    ├── problem-seeds.ts             # 30 curated seeds
    │   ├── BACKEND_SEEDS (8)
    │   ├── FRONTEND_SEEDS (7)
    │   ├── ALGORITHMS_SEEDS (5)
    │   ├── FULLSTACK_SEEDS (4)
    │   └── SPECIALIZED_SEEDS (6)
    └── custom-seeds.ts (optional)   # Your organization's seeds
```

---

## Next Steps

1. **Run the seed script** to populate your database
2. **Create your first assessment** using 2-3 seeds
3. **Invite a test candidate** to validate the flow
4. **Review generated questions** for quality
5. **Iterate on seed descriptions** based on results
6. **Build your organization's custom seeds**

---

## Support

**Documentation:**
- Question Generation: `lib/services/questions.ts`
- Seed Selection: `components/assessment/wizard-steps/QuestionConfigStep.tsx`
- Dynamic Question UX: `docs/DYNAMIC_QUESTION_UX_ANALYSIS.md`

**Need Help?**
- Check seed analytics in dashboard
- Review generated questions for patterns
- Test seeds with internal candidates first
- Iterate based on completion rates and scores

---

**Version:** 1.0
**Last Updated:** 2025-01-24
**Total Seeds:** 30 (8 backend, 7 frontend, 5 algorithms, 4 fullstack, 6 specialized)
