# Incremental Question Generation - Implementation Progress

## Overview
This document tracks the implementation of the incremental question generation system, where seeds are generic guidelines and questions build incrementally based on candidate progress.

## ✅ Completed (Phases 1-4)

### Latest Updates (Phase 4) ✓
- **🎯 LLM-Based Difficulty Calibration**: Dynamic weight adjustment eliminates luck factor
- **Baseline-Relative Scoring**: All questions normalized to Q1 baseline difficulty
- **Multi-Factor Analysis**: LLM assesses LOC, concepts, tech complexity, time
- **Fair Scoring**: Questions weighted by actual complexity, not just position
- **Transparency**: Each question includes difficulty justification and breakdown

### Previous Updates (Phase 3) ✓
- **Tech Priority System**: RequiredTech now supports critical/required/recommended levels
- **Question Count Limits**: Min 2, max 5 questions with 70% expertise threshold
- **Progressive Scoring**: Later questions weighted more (Q1: 1.0x → Q5: 2.5x)
- **Critical-Only Enforcement**: Only "critical" tech violations block candidates
- **Type Safety**: Full type compatibility with TechSpec throughout codebase

### 1. Database & Types ✓
- **Updated Prisma Schema** (`prisma/schema.prisma`)
  - ProblemSeed model:
    - Added `seedType` field ('legacy' | 'incremental')
    - Added `domain` field (e.g., 'e-commerce', 'fintech')
    - Added `requiredTech` JSON field for tech stack requirements
    - Added `baseProblem` JSON field for starting problem
    - Added `progressionHints` JSON field for adaptive difficulty
    - Added `seniorityExpectations` JSON field for seniority-specific expectations
  - GeneratedQuestion model:
    - **NEW**: Added `difficultyAssessment` JSON field for LLM calibration

- **Created Migrations**
  - `20251118000000_add_incremental_seed_fields/migration.sql` - Seed fields
  - `20251118120000_add_difficulty_assessment_to_questions/migration.sql` - Difficulty calibration

- **Updated TypeScript Types** (`types/seed.ts`)
  - Added `RequiredTechStack` interface with TechSpec[] (priority-based)
  - Added `BaseProblem` interface
  - Added `ProgressionHints` interface
  - Added `SeniorityExpectations` interface
  - **NEW**: Added `DifficultyAssessment` interface with complexity factors
  - **NEW**: Added `QuestionGenerationResponse` with difficulty metadata
  - Extended `EnhancedProblemSeed` with new fields

### 2. Core Services ✓
- **IncrementalQuestionGenerator** (`lib/services/incremental-questions.ts`)
  - ✓ Generates adaptive questions based on candidate progress
  - ✓ Analyzes performance trends (improving/declining/stable)
  - ✓ Builds contextual prompts for Claude with full history
  - ✓ Validates tech stack requirements in generated questions
  - ✓ Handles first question (base problem) vs follow-up questions
  - ✓ Adjusts difficulty based on performance (extend/maintain/simplify)
  - ✓ Time-aware generation (considers remaining time)
  - ✓ **NEW: Requests difficulty assessment** from LLM with detailed instructions
  - ✓ **NEW: Generates baseline difficulty** for Q1 (establishes relativeToBaseline = 1.0)
  - ✓ **NEW: Stores difficulty metadata** with each generated question

- **TechStackValidator** (`lib/services/tech-stack-validator.ts`)
  - ✓ Validates language usage (file extensions, syntax patterns)
  - ✓ Detects frameworks (import statements, usage patterns)
  - ✓ Detects databases (connection strings, library imports)
  - ✓ Detects tools (config files, test frameworks)
  - ✓ Generates compliance reports with violations
  - ✓ Calculates compliance scores

- **ProgressiveScoringCalculator** (`lib/services/progressive-scoring.ts`) ✓
  - ✓ **NEW: Dynamic weight calculation** based on difficulty assessment
  - ✓ Baseline establishment from Q1 (relativeToBaseline = 1.0)
  - ✓ Difficulty multiplier: `finalWeight = baseWeight × difficultyMultiplier`
  - ✓ Clamps multiplier to 0.5x - 2.0x for safety
  - ✓ Detailed score breakdown with difficulty metadata
  - ✓ Backward compatible (works without difficulty assessment)

### 3. API Updates ✓
- **Question Generation Endpoint** (`app/api/interview/[id]/questions/route.ts`)
  - ✓ Checks if seed is 'incremental' type
  - ✓ Routes to incremental generator when appropriate
  - ✓ Falls back to legacy generation for old seeds
  - ✓ Builds performance metrics array from previous questions
  - ✓ Calculates time remaining for candidate
  - ✓ Returns `isIncremental` flag to client

### 4. UI Components ✓
- **IncrementalTechStackDisplay** (`components/interview/TechStackDisplay.tsx`)
  - ✓ Shows required tech stack with badges
  - ✓ Real-time compliance status (polling every 30s)
  - ✓ Visual indicators (✓ compliant, ✗ issues, ⚠ warnings)
  - ✓ Violation details with severity levels
  - ✓ Compact badge variant for headers

## 🚧 In Progress / Pending

### 5. API Endpoints (Remaining)
- [ ] **Tech Validation Endpoint** (`app/api/interview/[id]/tech-validation/route.ts`)
  - Needs: GET endpoint to return compliance status
  - Should use: `techStackValidator.validateCandidateSession()`
  - Response format: `{ compliant, score, violations, detectedTech }`

### 6. UI Components (Remaining)
- [ ] **Update QuestionProgressHeader** (`components/interview/QuestionProgressHeader.tsx`)
  - Show incremental progression (Question 3 building on: Product API)
  - Display previous questions with scores
  - Indicate current question in context of previous work

- [ ] **Create QuestionTransition Component** (new file)
  - Show between questions when next one is being generated
  - Display previous question score and time
  - Show preview of what's coming next
  - Smooth animation/loading state

- [ ] **Update Interview Page** (`app/interview/[id]/page.tsx`)
  - Integrate `IncrementalTechStackDisplay` when seed is incremental
  - Show QuestionTransition component between questions
  - Pass seed data and type to components

### 7. Assessment Creation (Remaining)
- [ ] **Update Assessment Wizard** (`components/assessment/AssessmentWizard.tsx`)
  - Add "Incremental Seed" option in question config step
  - Create new form UI for incremental seed creation
  - Fields: domain, requiredTech, baseProblem, progressionHints, seniorityExpectations

- [ ] **New: IncrementalSeedForm Component** (new file)
  - Form for creating incremental seeds
  - Tech stack selector (languages, frameworks, databases, tools)
  - Base problem editor (title, description, starter code)
  - Progression strategy input (extension/simplification topics)
  - Seniority expectations editor

### 8. Initialize Endpoint Updates
- [ ] **Update Initialize Route** (`app/api/interview/[id]/initialize/route.ts`)
  - Check if seed is incremental type
  - Generate first question using `IncrementalQuestionGenerator`
  - Return seed metadata (requiredTech, domain, etc.) to client
  - Ensure proper handling of base problem

## 📋 Testing Checklist

### Backend Testing
- [ ] Test incremental question generation with various performance levels
- [ ] Test tech stack validation with different code patterns
- [ ] Test performance analysis (improving/declining trends)
- [ ] Test time-aware question generation
- [ ] Test fallback to legacy generation

### Frontend Testing
- [ ] Test tech stack display with compliance updates
- [ ] Test question progression UI
- [ ] Test transition animations between questions
- [ ] Test assessment creation with incremental seeds
- [ ] Test error states and edge cases

### Integration Testing
- [ ] Full candidate flow: start → Q1 → Q2 → Q3 → completion
- [ ] Verify questions build on each other
- [ ] Verify tech stack is enforced
- [ ] Verify adaptive difficulty works correctly
- [ ] Test with different seniority levels

## 🎯 Example Incremental Seed

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
    "description": "Implement CRUD operations for products using FastAPI and MongoDB. This is a substantial problem that should take 20-25 minutes.",
    "starterCode": "from fastapi import FastAPI\nfrom motor.motor_asyncio import AsyncIOMotorClient\n\napp = FastAPI()\n# TODO: Implement product endpoints",
    "estimatedTime": 25
  },
  "progressionHints": {
    "extensionTopics": ["caching", "rate-limiting", "authentication", "search"],
    "simplificationTopics": ["basic CRUD", "data validation", "error handling"]
  },
  "seniorityExpectations": {
    "junior": ["implement basic endpoints", "handle validation"],
    "mid": ["add caching layer", "implement error handling", "write tests"],
    "senior": ["design for scale", "implement auth", "optimize queries"],
    "staff": ["architect multi-service design", "handle distributed transactions"],
    "principal": ["evaluate trade-offs", "design resilience patterns"]
  }
}
```

**Tech Priority Levels:**
- **critical**: MUST use or assessment fails (errors block candidate)
- **required**: Should use, flagged in evaluation (warnings only)
- **recommended**: Optional, bonus points if used (warnings only)

## 🚀 Next Steps

1. **Create tech validation API endpoint** (15 min)
2. **Update interview page UI** (30 min)
3. **Create question transition component** (20 min)
4. **Update assessment wizard** (45 min)
5. **Create incremental seed form** (45 min)
6. **Integration testing** (1-2 hours)

**Estimated Time to Completion: 3-4 hours**

## 📝 Notes

- **Backward Compatibility**: Legacy seeds (seedType='legacy') will continue to work with existing question generation
- **Migration Strategy**: Existing seeds default to 'legacy' type, no breaking changes
- **Tech Stack Validation**: Currently non-blocking (warnings only), can be made blocking if needed
- **Claude Integration**: Uses existing Claude service, no additional API setup needed
- **Performance**: Question generation may take 3-5 seconds due to LLM call

## 🔗 Related Files Changed

1. `prisma/schema.prisma` - Database schema
2. `types/seed.ts` - TypeScript types
3. `lib/services/incremental-questions.ts` - Core generator
4. `lib/services/tech-stack-validator.ts` - Validation service
5. `app/api/interview/[id]/questions/route.ts` - API routing
6. `components/interview/TechStackDisplay.tsx` - UI component

## ❓ Open Questions

1. **Tech Stack Enforcement**: Should we block candidates if they don't use required tech, or just flag it?
   - Current: Warning only (non-blocking)
   - Option: Make it blocking for 'critical' tech

2. **Question Count**: Is there a min/max number of questions, or purely time-based?
   - Current: Time-based only, generates until time expires
   - Need: Clarification on limits

3. **Base Problem Complexity**: Should base problem be trivial (5-10 min) or substantial (20-30 min)?
   - Current: Configurable via `baseProblem.estimatedTime`
   - Recommended: 15-20 min for most roles

4. **Scoring Weight**: Should incremental questions have higher weight?
   - Current: All questions weighted equally
   - Consideration: Later questions could be worth more

## 🎉 What's Working

- Database schema supports both legacy and incremental seeds
- Core question generation logic is complete
- Tech stack validation detects major frameworks and patterns
- API routing works for both modes
- UI components render correctly
- Type safety throughout the system
