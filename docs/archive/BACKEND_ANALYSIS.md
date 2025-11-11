# InterviewLM Backend Implementation Map

## Summary
The InterviewLM backend uses Next.js 15 (App Router) with Prisma ORM, PostgreSQL database, and integrates with:
- **Claude API** (Anthropic) - AI chat and question generation
- **Modal AI** - Code execution sandboxes with persistent volumes
- **AWS S3** - Session recording storage
- **NextAuth.js** - Authentication

---

## API Routes

### 1. Health Check
**Route:** `GET /api/health`
**Purpose:** Health check endpoint for Docker/monitoring systems
**Returns:**
```json
{
  "status": "healthy|unhealthy",
  "timestamp": "ISO 8601",
  "database": "connected|disconnected",
  "version": "semver"
}
```
**Dependencies:** PostgreSQL connection
**Current State:** ✅ Fully implemented
**Code:** `app/api/health/route.ts` (38 lines)

---

### 2. Authentication Routes
**Routes:** 
- `GET/POST /api/auth/[...nextauth]` - NextAuth.js handlers
- `POST /api/auth/register` - User registration

**Purpose:** User registration and OAuth/credentials authentication
**Returns:**
```json
{
  "user": { "id", "name", "email" }
}
```
**Dependencies:** NextAuth.js, bcryptjs, PostgreSQL
**Supported Providers:** GitHub OAuth, Google OAuth, Credentials (email/password)
**Current State:** ✅ Fully implemented
**Code:** 
- `app/api/auth/[...nextauth]/route.ts` (1 line - imports from @/auth)
- `app/api/auth/register/route.ts` (66 lines)

---

### 3. AI Chat Endpoint
**Route:** `POST /api/interview/[id]/chat`
**Purpose:** Claude AI chat with Server-Sent Events (SSE) streaming
**Request:**
```json
{
  "message": "string (required)",
  "codeContext": {
    "fileName": "string (optional)",
    "content": "string (optional)",
    "language": "string (optional)"
  }
}
```
**Response:** SSE stream with events:
- `type: "chunk"` - Text delta
- `type: "done"` - Completion with token usage
- `type: "error"` - Error event

**Dependencies:** 
- Claude API (claude-sonnet-4-5-20250929)
- Prisma (session recording, Claude interactions)
- Authentication

**Functionality:**
- Streams responses in real-time
- Calculates prompt quality (1-5 scale)
- Records interactions to database
- Tracks token usage (input/output)

**Current State:** ✅ Fully implemented
**Code:** `app/api/interview/[id]/chat/route.ts` (295 lines)

---

### 4. Run Tests Endpoint
**Route:** `POST /api/interview/[id]/run-tests`
**Purpose:** Execute code in Modal AI sandbox and run tests
**Request:**
```json
{
  "code": "string (required)",
  "language": "javascript|typescript|python|go",
  "testCases": [
    {
      "name": "string",
      "input": "string",
      "expectedOutput": "string",
      "hidden": "boolean (optional)"
    }
  ],
  "fileName": "string (optional)",
  "questionId": "string (optional)"
}
```
**Response:**
```json
{
  "passed": "number",
  "failed": "number",
  "total": "number",
  "results": [
    {
      "name": "string",
      "passed": "boolean",
      "actualOutput": "string (optional)",
      "expectedOutput": "string",
      "error": "string (optional)",
      "duration": "number (optional)"
    }
  ],
  "executionTime": "number"
}
```
**Dependencies:** Modal API (with fallback mock)
**Current State:** ⚠️ Partially implemented
  - API route complete
  - Modal integration is a placeholder (uses mock execution)
  - Database recording works (test results, code snapshots)
**Code:** `app/api/interview/[id]/run-tests/route.ts` (287 lines)

---

### 5. Terminal SSE Stream
**Route:** `GET /api/interview/[id]/terminal`
**Purpose:** Server-Sent Events stream for terminal output
**Response:** SSE stream with:
- Initial connection message
- Queued terminal output
- Keep-alive heartbeats every 15 seconds

**Functionality:**
- Polls output queue every 100ms
- Handles client disconnect
- Demo mode bypass

**Current State:** ✅ Fully implemented (demo mode)
**Code:** `app/api/interview/[id]/terminal/route.ts` (98 lines)

---

### 6. Terminal Input Handler
**Route:** `POST /api/interview/[id]/terminal/input`
**Purpose:** Handle terminal command input and command simulation
**Request:**
```json
{
  "type": "input|interrupt",
  "data": "command string"
}
```
**Simulated Commands:**
- `ls`, `ls -la` - File listing
- `pwd` - Working directory
- `cat <file>` - File contents
- `npm test` - Test execution
- `node -v`, `npm -v` - Version info
- `clear` - Clear terminal
- `help` - Show help

**Current State:** ✅ Fully implemented (demo mode)
**Code:** `app/api/interview/[id]/terminal/input/route.ts` (174 lines)

---

### 7. Questions Endpoint (Get/Generate)
**Route:** 
- `GET /api/interview/[id]/questions` - Get current question
- `POST /api/interview/[id]/questions` - Generate next question

**GET Purpose:** Fetch current question for candidate
**GET Response:**
```json
{
  "currentQuestion": { /* GeneratedProblem */ },
  "completed": "boolean",
  "totalQuestions": "number",
  "currentQuestionIndex": "number"
}
```

**POST Purpose:** Generate next question based on performance
**POST Request:**
```json
{
  "previousPerformance": {
    "questionId": "string",
    "score": "number (0-100)",
    "timeSpent": "number (minutes)",
    "testsPassedRatio": "number (0-1)"
  }
}
```
**POST Response:**
```json
{
  "question": { /* GeneratedProblem */ },
  "questionNumber": "number"
}
```

**Adaptive Difficulty Logic:**
- First question: MEDIUM
- Strong performance (score ≥ 80, tests ≥ 80%, time ratio < 1.2): HARD
- Weak performance (score < 60, tests < 50%): EASY
- Otherwise: MEDIUM

**Dependencies:** Claude API, Prisma
**Current State:** ✅ Fully implemented
**Code:** `app/api/interview/[id]/questions/route.ts` (419 lines)

---

### 8. Session Events Recording
**Route:**
- `POST /api/interview/[id]/events` - Record events (single or batch)
- `GET /api/interview/[id]/events` - Retrieve events with filtering

**POST Purpose:** Record session events for replay
**POST Request:**
```json
{
  "type": "keystroke|code_snapshot|file_*|terminal_*|test_run|ai_interaction|focus_change|idle_*|paste|copy",
  "data": { /* any object */ },
  "timestamp": "ISO 8601 (optional)",
  "fileId": "string (optional)",
  "checkpoint": "boolean (optional)"
}
```
Or batch:
```json
{
  "events": [ /* array of above */ ]
}
```

**GET Query Parameters:**
- `from` - Start timestamp (ISO 8601)
- `to` - End timestamp
- `type` - Filter by event type
- `checkpoints` - Only checkpoint events (boolean)
- `limit` - Max results (default: 1000)
- `offset` - Pagination offset

**Event Optimization:** 
- Debounces rapid keystrokes (keeps every 10th)
- Marks important events as checkpoints
- Batches inserts for performance

**Current State:** ✅ Fully implemented
**Code:** `app/api/interview/[id]/events/route.ts` (357 lines)

---

### 9. Assessment Submission
**Route:** `POST /api/interview/[id]/submit`
**Purpose:** Finalize assessment, calculate scores, generate recommendations
**Request:**
```json
{
  "finalCode": { "fileName": "code string" },
  "notes": "string (optional)"
}
```
**Response:**
```json
{
  "success": "boolean",
  "evaluation": {
    "overallScore": "number (0-100)",
    "breakdown": { /* score details */ },
    "aiCollaborationScore": "number",
    "recommendation": "STRONG_YES|YES|MAYBE|NO|STRONG_NO",
    "confidence": "number (0-100)",
    "percentileRank": "number (0-100)",
    "redFlags": "string[]",
    "greenFlags": "string[]"
  },
  "candidate": { "id", "name", "email", "status" }
}
```

**Scoring Components:**
- Technical Score: Tests passed / (tests passed + failed)
- Code Quality Score: Based on snapshots + test count
- Problem Solving Score: Completion rate
- AI Collaboration Score: Based on prompt quality, interactions, problem-solving approach
- Overall Score: Weighted combination

**Red/Green Flag Detection:**
- Red Flags: Low prompt quality, high Claude dependency, failing tests, incomplete solutions
- Green Flags: Good prompt quality, iterative development, passing tests, efficient code

**Current State:** ✅ Fully implemented
**Code:** `app/api/interview/[id]/submit/route.ts` (395 lines)

---

## Services

### 1. Claude Service
**File:** `lib/services/claude.ts`
**Model:** `claude-sonnet-4-5-20250929`
**Configuration:**
- Max tokens: 4096
- Temperature: 0.7
- Pricing: $3/MTok input, $15/MTok output

**Key Functions:**

#### streamChatCompletion(messages, context)
**Purpose:** Stream chat responses with problem context
**Params:**
- `messages`: Message[] (user/assistant roles)
- `context`: ProblemContext (title, description, language, code, test results)
**Yields:** AsyncGenerator<StreamChunk>
**Returns:** Tokens, done flag, usage, stop reason
**Current State:** ✅ Implemented

#### getChatCompletion(messages, context)
**Purpose:** Get complete response (non-streaming)
**Returns:** ChatResponse with content, usage, latency
**Current State:** ✅ Implemented

#### testConnection()
**Purpose:** Health check for Claude API
**Returns:** boolean
**Current State:** ✅ Implemented

**System Prompt Includes:**
- Problem title, description, language
- Starter code (if provided)
- Current code (if provided)
- Recent test results (if provided)
- Guidelines: guide without solving, ask clarifications, encourage TDD, point out edge cases

**Current State:** ✅ Fully implemented
**Export:** CURRENT_MODEL constant

---

### 2. Modal Service
**File:** `lib/services/modal.ts`
**API URL:** `process.env.MODAL_API_URL` (default: "https://modal.com/api/v1")
**Configuration:**
- Execution timeout: 30 seconds
- Memory limit: 512 MB
- CPU limit: 1.0
- Volume namespace: `interviewlm` (configurable)
- Retention: 7 days (configurable)
- Workspace mount path: `/workspace`

**Key Functions:**

#### Volume Management

**createVolume(sessionId)**
- Creates persistent volume with 7-day retention
- Returns: ModalVolume with ID, name, namespace, size, dates
- State: ✅ Implemented

**volumeExists(sessionId)** - Check volume existence
**getVolume(sessionId)** - Get volume metadata
**listVolumes()** - List all volumes in namespace
**snapshotVolume(sessionId, snapshotName?)** - Create volume snapshot for replay/archive
**deleteVolume(sessionId)** - Delete volume

#### File System Operations

**readFile(sessionId, filePath)** - Read file content
**writeFile(sessionId, filePath, content)** - Write file
**getFileSystem(sessionId, rootPath?)** - Get file tree structure
**initializeVolumeFiles(sessionId, initialFiles)** - Batch write starter files

#### Sandbox Execution

**executeCode(sessionId, code, testCases)**
- Executes code with test cases using session volume
- Returns: ExecutionResult with test results, execution time
- State: ✅ Fully implemented
- Features:
  - Persistent volume mounting
  - Test case execution
  - Output/error capture
  - Duration tracking

**createSandbox(sessionId, initialFiles?)**
- Creates new sandbox with volume mount
- Initialize with starter files
- Returns: SandboxInstance metadata
- State: ✅ Implemented

**resumeSandbox(sessionId)**
- Resume from existing volume (instant resume)
- All files immediately available
- State: ✅ Implemented

**destroySandbox(sessionId, archiveToS3?, deleteVolumeAfter?)**
- Stop sandbox, optionally archive and delete volume
- Can keep volume for replay
- State: ✅ Implemented

#### Advanced Features

**getTerminalConnectionUrl(sessionId)**
- Returns WebSocket URL for terminal access
- Query params: session, workspace, token
- State: ✅ Implemented

**getSandboxStatus(sessionId)**
- Returns: Status, uptime, memory/CPU usage, volume size
- State: ✅ Implemented

**runCommand(sessionId, command, workingDir?)**
- Execute single command in volume workspace
- Returns: stdout, stderr, exitCode
- State: ✅ Implemented

**listActiveSandboxes()**
- List all active sandboxes for monitoring
- Returns: SandboxInstance[] with volume info
- State: ✅ Implemented

**testConnection()**
- Health check for Modal API
- State: ✅ Implemented

**Current State:** ✅ Fully implemented with comprehensive volume + sandbox management

---

### 3. S3 Storage Service
**File:** `lib/services/s3.ts`
**Bucket:** `interviewlm-sessions` (configurable)
**Region:** `us-east-1` (configurable)
**Presigned URL Expiry:** 1 hour

**Key Features:**
- Gzip compression (level 9)
- Presigned URLs for direct access
- S3 key structure: `sessions/YYYY/MM/DD/sessionId/type.json.gz`

**Key Functions:**

**uploadSessionRecording(sessionId, events, metadata?)**
- Upload and compress session events
- Returns: UploadResult with compression ratio, size, URL, ETag
- State: ✅ Implemented

**downloadSessionRecording(sessionId)**
- Download and decompress session
- Returns: DownloadResult with events, sizes, metadata
- State: ✅ Implemented

**generatePresignedUrl(sessionId, expiresIn?)**
- Generate download URL (default 1 hour)
- State: ✅ Implemented

**generatePresignedUploadUrl(sessionId, expiresIn?)**
- Generate upload URL for direct client uploads
- State: ✅ Implemented

**sessionRecordingExists(sessionId)**
- Check if recording exists
- State: ✅ Implemented

**deleteSessionRecording(sessionId)**
- Irreversible deletion
- State: ✅ Implemented

**uploadCodeSnapshots(sessionId, snapshots)**
- Upload code snapshots separately
- Returns: UploadResult
- State: ✅ Implemented

**getStorageStats(sessionId)**
- Returns: exists, size, compressedSize, lastModified
- State: ✅ Implemented

**testConnection()**
- Health check (test upload/delete)
- State: ✅ Implemented

**Current State:** ✅ Fully implemented

---

### 4. Session Recording Service
**File:** `lib/services/sessions.ts`
**Database:** Prisma with PostgreSQL
**Buffering:** 
- Flush interval: 10 seconds
- Buffer max size: 100 events

**Key Functions:**

**createSession(candidateId)**
- Creates SessionRecording in database
- Initializes event buffer
- Starts periodic flush
- Returns: SessionRecording
- State: ✅ Implemented

**recordEvent(sessionId, event)**
- Add event to buffer (batch insert optimization)
- Flushes if buffer reaches 100 events
- Returns: SessionEvent
- State: ✅ Implemented

**recordClaudeInteraction(sessionId, message, metadata?)**
- Records Claude conversation turns
- Metadata: promptQuality (1-5 rating)
- Also records as session event for replay
- Returns: ClaudeInteraction
- State: ✅ Implemented

**recordCodeSnapshot(sessionId, snapshot, previousContent?)**
- Records code state with diff from previous
- Calculates SHA256 content hash
- Counts lines added/deleted
- Marks as checkpoint for fast seeking
- Returns: CodeSnapshot
- State: ✅ Implemented

**recordTestResult(sessionId, testResult)**
- Records test execution result
- Marks as checkpoint
- Returns: TestResult
- State: ✅ Implemented

**closeSession(sessionId, status?)**
- Finalizes session (flushes buffers, uploads to S3)
- Calculates session duration
- Uploads events and snapshots to S3
- Returns: SessionRecording
- State: ✅ Implemented

**getSessionRecording(sessionId)**
- Retrieves complete session with all related data
- Includes: events, interactions, snapshots, test results
- Returns: SessionRecording + relations
- State: ✅ Implemented

**getSessionStats(sessionId)**
- Returns analytics: event count, interaction count, tokens used, tests passed, duration
- State: ✅ Implemented

**Internal Functions:**
- `flushEventBuffer(sessionId)` - Batch insert buffered events
- `startPeriodicFlush(sessionId)` - Start timer for periodic flush
- `stopPeriodicFlush(sessionId)` - Stop timer (cleanup)

**Current State:** ✅ Fully implemented

---

### 5. Question Generation Service
**File:** `lib/services/questions.ts`
**Model:** Claude Sonnet 4.5

**Key Functions:**

**generateQuestion(params)**
**Purpose:** Generate adaptive coding questions using Claude AI
**Params:**
- `candidateId`: string
- `seed`: string (optional - problem seed ID)
- `difficulty`: "EASY" | "MEDIUM" | "HARD"
- `language`: string (default: "typescript")
- `previousPerformance`: number 0-1 (optional)

**Features:**
- Adaptive difficulty based on previous performance
- Generates full problem structure:
  - Title, description, requirements
  - Starter code templates
  - Test cases (mix of visible + hidden)
  - Estimated time
- Returns: QuestionGenerationResult with generation time, tokens used

**Adaptive Difficulty Algorithm:**
- Performance < 40%: Reduce difficulty (hard→medium→easy)
- Performance > 85%: Increase difficulty (easy→medium→hard)
- Otherwise: Maintain difficulty

**Current State:** ⚠️ Partially implemented (file truncated at 200 lines, function incomplete)

**Supporting Functions:**
- `buildQuestionGenerationPrompt()`
- `calculateAdaptiveDifficulty()`
- `parseQuestionResponse()`
- `getNextQuestion()`
- `startQuestion()`
- `completeQuestion()`
- `getCandidateQuestions()`
- `calculatePerformance()`

**Current State:** Needs completion

---

### 6. Index/Exports
**File:** `lib/services/index.ts`
**Purpose:** Central export point for all services
**Exports:**
- claudeService: All Claude functions
- modalService: All Modal functions
- s3Service: All S3 functions
- sessionService: All session recording functions
- questionService: All question generation functions
- Individual functions for direct imports

**Current State:** ✅ Fully implemented

---

## Database Schema (Prisma)

### Authentication Models

#### User
- Roles: USER, ADMIN
- OAuth + Credentials support
- Relations: accounts, sessions, organizations, assessments, candidates

#### Account (NextAuth)
- OAuth provider account linking
- Unique per provider

#### Session (NextAuth)
- Session tokens for authentication
- Auto-cleanup on expiry

#### VerificationToken
- Email verification tokens
- Password reset tokens

---

### Organization Models

#### Organization
- Plans: FREE, STARTUP, GROWTH, ENTERPRISE
- Contains: members, assessments, candidates, problem seeds
- Slug-based URLs

#### OrganizationMember
- Roles: OWNER, ADMIN, MEMBER
- Track join/invite dates

---

### Assessment Models

#### Assessment
- Seniority levels: JUNIOR, MID, SENIOR, LEAD, PRINCIPAL
- Status: DRAFT, PUBLISHED, ARCHIVED
- Configurable: enableCoding, enableTerminal, enableAI
- Duration in minutes
- Relations: organization, creator, questions, candidates

#### AssessmentQuestion
- Difficulty: EASY, MEDIUM, HARD
- Types: CODING, SYSTEM_DESIGN, BEHAVIORAL
- Can reference ProblemSeed
- Time limit per question

#### ProblemSeed
- Reusable problem templates
- Includes: starter code, test code, language
- Tagged for discovery

---

### Candidate Models

#### Candidate
- Status: INVITED, IN_PROGRESS, COMPLETED, EVALUATED, HIRED, REJECTED
- Scoring: overall, coding, communication, problemSolving
- Timestamps: invited, started, completed
- Session data stored as JSON

#### GeneratedQuestion
- Dynamic questions per candidate
- Status: PENDING, IN_PROGRESS, COMPLETED, SKIPPED
- Stores: title, description, difficulty, language
- Starter code and test cases as JSON
- Scoring and timestamps

---

### Session Recording Models

#### SessionRecording
- Status: ACTIVE, PAUSED, COMPLETED, ABANDONED
- Storage: path (S3) and size
- Event count tracking

#### SessionEvent
- Type: keystroke, code_snapshot, file_created, terminal_output, etc.
- Data: flexible JSON
- Checkpoint: for fast seeking in replay
- Indexed by session + timestamp

#### ClaudeInteraction
- Role: user, assistant, system
- Token tracking: input + output
- Latency in milliseconds
- Prompt quality rating (1-5)
- Indexed for fast retrieval

#### CodeSnapshot
- Tracks code evolution
- Content hash (SHA256)
- Diff from previous version
- Lines added/deleted

#### TestResult
- Test name, status (passed/failed)
- Output and error messages
- Duration per test
- Indexed for analytics

---

## Environment Variables

### Database
```
DATABASE_URL=postgresql://user:password@localhost:5432/interviewlm
```

### NextAuth.js
```
NEXTAUTH_SECRET=<random-secret>
NEXTAUTH_URL=http://localhost:3000
```

### OAuth Providers
```
GITHUB_CLIENT_ID=<from github.com/settings/developers>
GITHUB_CLIENT_SECRET=<secret>
GOOGLE_CLIENT_ID=<from console.cloud.google.com>
GOOGLE_CLIENT_SECRET=<secret>
```

### Claude API
```
ANTHROPIC_API_KEY=<from console.anthropic.com>
```

### Modal AI Sandbox
```
MODAL_TOKEN_ID=<from modal.com/settings>
MODAL_TOKEN_SECRET=<secret>
MODAL_WORKSPACE=<workspace-name>
MODAL_API_URL=https://modal.com/api/v1
MODAL_VOLUME_NAMESPACE=interviewlm
MODAL_RETENTION_DAYS=7
```

### AWS S3
```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<aws-key>
AWS_SECRET_ACCESS_KEY=<aws-secret>
AWS_S3_BUCKET=interviewlm-sessions
```

### Optional
```
NODE_ENV=development
EMAIL_SERVER=smtp://user:pass@smtp.example.com:587
EMAIL_FROM=noreply@interviewlm.com
REDIS_URL=redis://localhost:6379
SENTRY_DSN=<sentry-dsn>
ANALYTICS_ID=<analytics-id>
```

---

## Implementation Status Summary

### Fully Implemented ✅
- Health check endpoint
- Authentication (register, OAuth, credentials)
- Chat with Claude (streaming)
- Terminal SSE + command input (demo)
- Session event recording + retrieval
- Assessment submission + scoring
- Session recording service
- Code snapshots + test results
- S3 storage operations
- Modal volume management + sandbox control
- Claude API integration

### Partially Implemented ⚠️
- Test execution (API complete, Modal integration is mock)
- Question generation service (file truncated)

### Needs Implementation ❌
- Full Modal sandbox code execution (currently mock in run-tests)
- Question generation completion

---

## Frontend-Backend Integration Points

### Critical Flows

#### 1. Chat Flow
```
Frontend → POST /api/interview/[id]/chat
Server → Claude API (streaming)
Server → Records to Prisma
Frontend ← SSE stream
```

#### 2. Code Execution Flow
```
Frontend → POST /api/interview/[id]/run-tests
Server → Modal Sandbox (via executeCode)
Server → Records test results + snapshot
Frontend ← Test results
```

#### 3. Question Generation Flow
```
Frontend → POST /api/interview/[id]/questions
Server → Claude API (generates problem)
Server → Saves to GeneratedQuestion
Frontend ← New question
```

#### 4. Session Recording Flow
```
Frontend → POST /api/interview/[id]/events (batch)
Server → Buffer → Flush to Prisma
Server → S3 on closeSession
```

#### 5. Assessment Submission Flow
```
Frontend → POST /api/interview/[id]/submit
Server → Calculate scores
Server → Generate recommendation
Server → Upload to S3
Frontend ← Evaluation results
```

---

## Available Frontend Services to Consume

The frontend can import and use:

```typescript
// Claude API
import { streamChatCompletion, getChatCompletion, CURRENT_MODEL } from '@/lib/services'

// Modal Sandbox
import { 
  executeCode, 
  createSandbox, 
  resumeSandbox, 
  destroySandbox,
  getTerminalConnectionUrl,
  getFileSystem,
  readFile,
  writeFile
} from '@/lib/services'

// S3 Storage
import {
  uploadSessionRecording,
  downloadSessionRecording,
  generatePresignedUrl
} from '@/lib/services'

// Session Recording
import {
  createSession,
  recordEvent,
  recordClaudeInteraction,
  recordCodeSnapshot,
  recordTestResult,
  closeSession
} from '@/lib/services'

// Question Generation
import {
  generateQuestion,
  getNextQuestion,
  calculatePerformance
} from '@/lib/services'
```

---

## Performance Considerations

1. **Event Buffering:** Debounces keystrokes (keeps every 10th), flushes every 10 seconds or 100 events
2. **Compression:** S3 uses gzip level 9, typically achieves 5-10x compression
3. **Pagination:** Event retrieval supports limit/offset (default 1000)
4. **Database Indexes:** SessionEvent indexed by (sessionId, timestamp) and (sessionId, checkpoint)
5. **Checkpoint Events:** Important events marked for fast seeking in replay
6. **Volume Persistence:** 7-day retention prevents constant re-initialization

---

## Error Handling & Fallbacks

1. **Chat:** Throws on API error, caught by route handler
2. **Tests:** Falls back to mock execution if Modal unavailable
3. **Questions:** Falls back to default problem if LLM generation fails
4. **S3:** Non-critical failures don't break flow (returns empty string)
5. **Modal:** Volume deletion failures logged but not thrown

