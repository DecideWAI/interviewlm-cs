# Comprehensive Testing Plan

## Overview

This document outlines the testing strategy for InterviewLM platform, covering all implemented features from Sprints 1, 2, and Session Replay.

## Testing Pyramid

```
       /\
      /E2E\       <- 5-10 critical user flows
     /------\
    /  API   \    <- 30-40 integration tests
   /----------\
  /   Unit     \  <- 50-100 unit tests
 /--------------\
```

## 1. Unit Tests

### Services (`lib/services/`)

**Modal Service** (`modal.ts`)
- [x] `createVolume()` - Creates volume and returns volumeId
- [x] `writeFile()` - Writes file to volume
- [x] `readFile()` - Reads file from volume
- [x] `getFileSystem()` - Returns file tree structure
- [x] `createSandbox()` - Creates sandbox with language runtime
- [x] `runCommand()` - Executes shell command
- [x] `executeCode()` - Runs code with test cases
- [x] `listActiveSandboxes()` - Lists running sandboxes

**Sessions Service** (`sessions.ts`)
- [x] `createSession()` - Creates new session recording
- [x] `recordEvent()` - Records session event
- [x] `recordClaudeInteraction()` - Records AI interaction
- [x] `createSnapshot()` - Creates code snapshot
- [x] `recordTestResult()` - Records test result
- [x] `endSession()` - Completes session recording
- [x] `getSessionRecording()` - Retrieves session with events

**Questions Service** (`questions.ts`)
- [x] `generateQuestion()` - Generates question for role/seniority
- [x] `validateQuestion()` - Validates question structure
- [x] `generateTestCases()` - Creates test cases for problem

### Scoring Logic (`lib/scoring.ts`)
- [x] `calculateOverallScore()` - Computes final score
- [x] `calculateAICollaborationScore()` - Evaluates AI usage
- [x] `detectRedFlags()` - Identifies negative patterns
- [x] `detectGreenFlags()` - Identifies positive patterns
- [x] `calculatePercentileRank()` - Computes percentile
- [x] `generateHiringRecommendation()` - Makes hiring decision

### Utilities
- [x] `cn()` - Class name utility
- [x] `formatDuration()` - Time formatting
- [x] `debounce()` - Debounce utility

## 2. Integration Tests (API Routes)

### Interview Flow APIs

**POST /api/interview/[id]/initialize**
- [x] ✓ Requires authentication
- [x] ✓ Creates session recording if not exists
- [x] ✓ Generates question for first-time candidates
- [x] ✓ Creates Modal volume with starter files
- [x] ✓ Records session_start event
- [x] ✓ Returns complete session data
- [x] ✗ Handles invalid candidate ID (404)
- [x] ✗ Prevents double initialization

**GET /api/interview/[id]/files?path={path}**
- [x] ✓ Requires authentication
- [x] ✓ Returns file tree when no path provided
- [x] ✓ Returns file content when path provided
- [x] ✓ Supports demo mode
- [x] ✗ Returns 404 for non-existent files
- [x] ✗ Handles invalid paths gracefully

**POST /api/interview/[id]/files**
- [x] ✓ Requires authentication
- [x] ✓ Writes file to Modal volume
- [x] ✓ Records code_edit event
- [x] ✓ Creates code snapshot for significant changes
- [x] ✗ Validates file path
- [x] ✗ Handles write errors gracefully
- [x] ✗ Respects file size limits

**POST /api/interview/[id]/terminal/input**
- [x] ✓ Handles demo mode commands
- [x] ✓ Executes real commands in Modal sandbox
- [x] ✓ Records terminal_input event
- [x] ✓ Records terminal_output event
- [x] ✓ Handles command errors gracefully
- [x] ✗ Prevents dangerous commands (rm -rf, etc.)
- [x] ✗ Handles long-running commands
- [x] ✗ Supports command interruption (Ctrl+C)

**GET /api/interview/[id]/terminal/output**
- [x] ✓ Streams terminal output via SSE
- [x] ✓ Handles multiple concurrent readers
- [x] ✗ Closes connection on session end
- [x] ✗ Handles network interruptions

**GET /api/interview/[id]/chat?message={message}**
- [x] ✓ Streams AI responses via SSE
- [x] ✓ Records Claude interactions
- [x] ✓ Includes token usage and latency
- [x] ✗ Handles API rate limits
- [x] ✗ Validates message length
- [x] ✗ Prevents prompt injection

**POST /api/interview/[id]/run-tests**
- [x] ✓ Requires authentication
- [x] ✓ Writes code to volume before execution
- [x] ✓ Records test_run_start event
- [x] ✓ Executes tests in Modal sandbox
- [x] ✓ Records test results
- [x] ✓ Returns pass/fail summary
- [x] ✗ Handles test timeouts
- [x] ✗ Validates test case format

**POST /api/interview/[id]/submit**
- [x] ✓ Requires authentication
- [x] ✓ Runs final test execution
- [x] ✓ Calculates all scores and metrics
- [x] ✓ Generates hiring recommendation
- [x] ✓ Records session_submit event
- [x] ✓ Uploads session to S3
- [x] ✓ Marks candidate as COMPLETED
- [x] ✗ Prevents duplicate submissions
- [x] ✗ Handles S3 upload failures gracefully

### Session Replay API

**GET /api/sessions/[id]**
- [x] ✓ Requires authentication
- [x] ✓ Supports lookup by sessionId
- [x] ✓ Supports lookup by candidateId
- [x] ✓ Returns unified timeline
- [x] ✓ Calculates session metrics
- [x] ✓ Verifies user access (org membership)
- [x] ✗ Returns 404 for invalid ID
- [x] ✗ Returns 403 for unauthorized access

### Authentication APIs

**POST /api/auth/signin**
- [ ] Validates credentials
- [ ] Creates session token
- [ ] Returns user data
- [ ] Handles invalid credentials

**POST /api/auth/signup**
- [ ] Creates new user account
- [ ] Hashes password securely
- [ ] Sends verification email
- [ ] Prevents duplicate emails

## 3. Component Tests

### Interview Components

**CodeEditor** (`components/interview/CodeEditor.tsx`)
- [x] ✓ Renders with initial code
- [x] ✓ Handles language switching
- [x] ✓ Supports read-only mode
- [x] ✓ Calls onChange with debouncing
- [x] ✗ Handles large files (>10k lines)
- [x] ✗ Syntax highlighting works correctly

**Terminal** (`components/interview/Terminal.tsx`)
- [x] ✓ Renders terminal UI
- [x] ✓ Accepts user input
- [x] ✓ Displays output correctly
- [x] ✓ Handles ANSI escape codes
- [x] ✗ Scrolls to bottom on new output
- [x] ✗ Resizes with window

**AIChat** (`components/interview/AIChat.tsx`)
- [x] ✓ Displays message history
- [x] ✓ Sends user messages
- [x] ✓ Streams AI responses
- [x] ✓ Shows loading state
- [x] ✗ Supports markdown rendering
- [x] ✗ Handles code blocks

**FileTree** (`components/interview/FileTree.tsx`)
- [x] ✓ Renders file hierarchy
- [x] ✓ Handles file selection
- [x] ✓ Expands/collapses directories
- [x] ✗ Shows file icons by type

### Dashboard Components

**CandidateTable** (`components/analytics/CandidateTable.tsx`)
- [x] ✓ Displays candidate list
- [x] ✓ Filters by status
- [x] ✓ Sorts by date/score
- [x] ✓ Shows replay button for completed
- [x] ✓ Search functionality
- [x] ✗ Pagination for large datasets

### Session Replay Components

**SessionReplayPage** (`app/dashboard/sessions/[id]/page.tsx`)
- [x] ✓ Fetches session data
- [x] ✓ Renders timeline scrubber
- [x] ✓ Play/pause functionality
- [x] ✓ Speed control (0.5x-4x)
- [x] ✓ Seeking to specific time
- [x] ✓ Event application to state
- [x] ✗ Handles missing events gracefully
- [x] ✗ Shows loading states

## 4. End-to-End Tests

### Critical User Flows

**Complete Interview Flow**
1. [ ] User signs in
2. [ ] Opens interview session
3. [ ] Session initializes with question
4. [ ] Edits code in editor
5. [ ] Runs terminal commands
6. [ ] Asks Claude for help
7. [ ] Runs tests multiple times
8. [ ] Submits assessment
9. [ ] Receives score and feedback

**Session Replay Flow**
1. [ ] User signs in as interviewer
2. [ ] Opens dashboard
3. [ ] Clicks "Replay" on completed candidate
4. [ ] Session replay loads
5. [ ] Uses timeline scrubber
6. [ ] Plays/pauses replay
7. [ ] Changes playback speed
8. [ ] Views code/terminal/chat sync

**Authentication Flow**
1. [ ] User visits landing page
2. [ ] Clicks "Sign In"
3. [ ] Enters credentials
4. [ ] Redirects to dashboard
5. [ ] Signs out successfully

## 5. Performance Tests

### API Performance
- [ ] `/api/interview/[id]/initialize` < 2s response time
- [ ] `/api/interview/[id]/files` < 500ms for file read
- [ ] `/api/interview/[id]/run-tests` < 5s for test execution
- [ ] `/api/sessions/[id]` < 1s for session load
- [ ] SSE streams maintain <100ms latency

### Frontend Performance
- [ ] Interview page loads in < 3s
- [ ] Code editor typing latency < 50ms
- [ ] Terminal output renders in < 100ms
- [ ] Session replay seeking < 500ms
- [ ] Dashboard renders < 2s

### Resource Limits
- [ ] Modal sandbox memory < 512MB per session
- [ ] File storage < 100MB per session
- [ ] Session recording < 10MB compressed
- [ ] Concurrent sessions: 100+
- [ ] Database queries < 100ms (95th percentile)

## 6. Security Tests

### Authentication & Authorization
- [ ] Unauthenticated requests blocked
- [ ] Users can't access other org's data
- [ ] Session tokens expire correctly
- [ ] CSRF protection enabled
- [ ] SQL injection prevention

### Input Validation
- [ ] File paths validated (no ../.. attacks)
- [ ] Command injection prevented
- [ ] XSS prevention in chat
- [ ] File size limits enforced
- [ ] Rate limiting on APIs

## 7. Testing Tools & Setup

### Unit & Integration Tests
- **Framework**: Jest
- **React Testing**: React Testing Library
- **Mocking**: jest.mock() for services
- **Coverage Target**: 80% code coverage

### E2E Tests
- **Framework**: Playwright
- **Browsers**: Chrome, Firefox, Safari
- **Environments**: Local, Staging, Production
- **CI/CD**: GitHub Actions

### Performance Tests
- **Load Testing**: k6
- **Monitoring**: Vercel Analytics
- **APM**: (to be added)

## 8. Test Execution Plan

### Phase 1: Unit Tests (Day 1)
1. Write unit tests for all services
2. Write unit tests for scoring logic
3. Achieve 80% coverage on `lib/`

### Phase 2: Integration Tests (Day 2)
1. Write tests for all API routes
2. Test authentication flows
3. Test error handling

### Phase 3: Component Tests (Day 3)
1. Test critical interview components
2. Test dashboard components
3. Test session replay UI

### Phase 4: E2E Tests (Day 4)
1. Write complete interview flow test
2. Write session replay flow test
3. Write authentication flow test

### Phase 5: Performance & Security (Day 5)
1. Run performance benchmarks
2. Security audit with OWASP checklist
3. Load testing with k6

## 9. Success Criteria

✅ All unit tests pass (80%+ coverage)
✅ All integration tests pass
✅ All E2E tests pass
✅ Performance targets met
✅ No critical security vulnerabilities
✅ CI/CD pipeline green

## 10. Known Issues / Tech Debt

1. **Missing Features**:
   - File switch event recording (client-side)
   - Assessment creation UI
   - Candidate invitation flow
   - Real-time collaboration

2. **Testing Gaps**:
   - No tests for Modal service (mocked in tests)
   - Limited error scenario coverage
   - No load tests yet
   - No browser compatibility tests

3. **Performance Concerns**:
   - Large session replays may be slow
   - No pagination in file tree
   - No virtual scrolling in terminal
   - Session recording could be compressed

## 11. Next Steps After Testing

After completing comprehensive testing:

**Sprint 3: Assessment Management & Polish**
- Assessment creation UI
- Candidate invitation workflow
- Email notifications
- Results review and comparison
- Real data in dashboard analytics

**Sprint 4: Production Deployment**
- Set up production infrastructure
- Configure environment variables
- Database migrations
- S3 bucket setup
- Modal API integration
- Claude API setup
- Monitoring and alerting

**Sprint 5: Advanced Features**
- Real-time interview observation
- Video recording integration
- Custom question banks
- Team collaboration features
- Advanced analytics
