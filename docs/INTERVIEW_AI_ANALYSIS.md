# InterviewLM - Complete Interview & AI System Analysis

## Executive Summary

InterviewLM is a **partially integrated AI interview platform**. The core infrastructure exists, but critical gaps prevent a true "AI-native interview experience." The system has:
- ✅ Working code editor, terminal, and file operations
- ✅ Claude API integration with tool use capability
- ✅ Modal sandbox for code execution
- ⚠️ Limited AI-candidate interaction
- ❌ No real-time AI feedback during coding
- ❌ AI cannot autonomously debug or improve code
- ❌ Terminal commands not fully routed through AI

---

## 1. CURRENT INTERVIEW FEATURES

### Editor & Code Management
**File:** `components/interview/CodeEditor.tsx`
- **Language Support:** JavaScript, TypeScript, Python, Go (via CodeMirror)
- **Features:**
  - Real-time syntax highlighting & bracket matching
  - Debounced auto-save (2s) to API
  - Code snapshot recording (every 30s)
  - Manual Ctrl+S save trigger
  - Event batching for cost optimization (90% reduction claimed)
- **Limitations:**
  - Single file editing (UI shows one tab)
  - No multi-file editing support
  - Read-only mode supported but rarely used
  - CodeMirror theme hard-coded to VSCode dark

### File Operations
**Files:** `components/interview/FileTree.tsx`, `app/api/interview/[id]/files/route.ts`
- **Capabilities:**
  - ✅ View file tree from Modal volume
  - ✅ Read file content from volume
  - ✅ Write file content to volume
  - ✅ Create new files
  - ✅ Track file modifications
  - ✅ Diff-based snapshots
- **Workflow:**
  1. File selected in FileTree → API fetches content
  2. Content displayed in CodeEditor
  3. Changes debounced-saved back to API
  4. API writes to Modal volume
  5. Every change recorded in SessionRecording

### Terminal Emulation
**File:** `components/interview/Terminal.tsx`
- **Technology:** xterm.js with FitAddon + WebLinksAddon
- **Features:**
  - ✅ SSE-based streaming output
  - ✅ Command input handling
  - ✅ Terminal resize handling
  - ✅ Connection status tracking
  - ✅ Auto-reconnect with exponential backoff (up to 5 attempts)
  - ✅ Cmd history recording
- **Current Behavior:**
  - Commands sent via `/api/interview/[id]/terminal/input` HTTP POST
  - Output streamed back via `/api/interview/[id]/terminal` SSE
  - Limited command support (pwd, ls, cat, clear)
  - **CRITICAL:** Terminal NOT connected to AI - commands are local-only
- **Missing:**
  - Real bash execution through Modal
  - Interactive terminal sessions
  - File system integration with Modal volume
  - Piping commands to AI for execution

### Test Running
**File:** `app/api/interview/[id]/run-tests/route.ts`
- **Capabilities:**
  - Takes code, language, test cases as input
  - Executes via Modal sandbox
  - Records test results to database
  - Shows pass/fail status inline
- **Flow:**
  1. User clicks "Run Tests" button
  2. Frontend sends code + test cases to API
  3. API validates authorization
  4. Modal executes code + tests (Python via pytest, JS via Jest)
  5. Results returned and stored in DB
  6. Completion card shows if all tests pass
- **Languages:** Python (pytest), JavaScript/TypeScript (Jest), Go
- **Current Limitation:** Only manual test runs via UI button

---

## 2. AI INTEGRATION CAPABILITIES

### Claude Model & Connection
**File:** `lib/services/claude.ts`
- **Model:** Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- **Settings:**
  - Max tokens: 4096
  - Temperature: 0.7
  - Two implementations:
    1. `streamChatCompletion()` - Server-sent event streaming
    2. `getChatCompletion()` - Non-streaming batch

### AI Chat Interface
**File:** `components/interview/AIChat.tsx`
- **User Experience:**
  - Text input with Shift+Enter for multiline
  - Real-time streaming of AI responses
  - Message history with timestamps
  - Copy-to-clipboard for responses
  - Connection status indicator
  - Retry logic with exponential backoff
- **Message Types:**
  - User messages
  - Assistant text responses
  - Tool use indicators (animated wrench icon)
  - Tool results (success/error)
  - Token usage display

### Coding Agent Architecture
**File:** `lib/agents/coding-agent.ts`

**Agent Capabilities:**
```
Tools Available (varies by helpfulness level):
├── Read: Read files from workspace
├── Write: Create/overwrite files
├── Edit: Edit file sections (old_string → new_string)
├── Grep: Search files by regex pattern
├── Glob: Find files by glob pattern
├── Bash: Execute commands (with security validation)
└── run_tests: NOT fully implemented (defers to UI button)
```

**Helpfulness Levels:**
1. **Consultant Mode** - Ask clarifying questions, provide hints
2. **Pair-Programming** - Code alongside, suggest improvements
3. **Full-Copilot** - Write complete solutions, fix errors

**Security Features:**
- Validates bash commands against allowlist
- Blocks file operations outside `/workspace`
- Sanitizes output for sensitive data
- Tracks rate limits per conversation
- Enforces tool availability per helpfulness level

### AI-Code Interaction
**File:** `app/api/interview/[id]/chat/agent/route.ts`

**Current Flow:**
1. User sends message to AIChat component
2. Message sent to `/api/interview/[id]/chat/agent` endpoint
3. Coding agent created with:
   - Session context (problem statement)
   - User helpfulness preference
   - Workspace root `/workspace`
4. Agent calls Claude API with tool definitions
5. Claude can use tools automatically
6. Tool results returned to Claude for refinement
7. Final response streamed back to UI

**Data Recorded:**
- Conversation turns (user, assistant, tool use)
- Tool usage (which tools, with what inputs)
- File modifications (what changed)
- Token usage (input/output costs)
- Latency metrics
- Prompt quality score (1-5 heuristic)

### What AI Can Currently Do
✅ **Read/Write Files**
- AI can read solution code, test files, README
- AI can create new files, modify existing ones
- Changes are real-time visible in editor

✅ **Search Code**
- Can grep for specific patterns
- Can glob for file lists
- Helps AI understand code structure

✅ **Execute Commands** (Limited)
- Can run safe bash commands (pwd, ls, cat, echo)
- Dangerous commands blocked (rm, chmod, etc.)
- Output sanitized for security

✅ **Run Tests** (Indirectly)
- Cannot directly invoke run_tests tool
- Would need to read test file, understand structure
- Workaround: Suggest user click Run Tests button

✅ **Problem Understanding**
- Gets problem statement in system prompt
- Can read current code
- Can see test cases

---

## 3. MODAL INTEGRATION (Sandbox & Execution)

### Modal Architecture
**Files:**
- `lib/services/modal-production.ts` - Main API wrapper
- `lib/services/modal.ts` - Legacy Redis-based version
- `modal_executor.py` - Deployed function

### Sandbox Lifecycle

**Initialization** (`/api/interview/[id]/initialize`)
1. Creates Modal volume for session: `interview-{sessionId}`
2. Stores volume ID in Candidate record
3. Initializes with starter code
4. Returns file tree to UI

**Code Execution** (via `modal-production.ts`)
- **executeCode():** Calls Modal HTTP endpoint with code + test cases
- **writeFile():** Persists files to Modal volume
- **readFile():** Loads files from Modal volume
- **getFileSystem():** Lists directory contents
- **runCommand():** Executes bash commands (limited, MVP)

### Modal Executor (Python)
**File:** `modal_executor.py`

**Deployed Functions:**
```
1. execute(code, testCases, language)
   ├── Python: pytest-based execution
   ├── JavaScript/TypeScript: Jest-based execution
   └── Go: (Defined but not fully tested)

2. write_file(sessionId, filePath, content)
   └── Writes to /data/{sessionId}/{filePath}

3. read_file(sessionId, filePath)
   └── Reads from /data/{sessionId}/{filePath}

4. list_files(sessionId, directory)
   └── Lists files in /data/{sessionId}/{directory}
```

**Execution Details:**
- **Timeout:** 30 seconds
- **Memory:** 512MB
- **Output Limit:** 1MB (truncated if exceeded)
- **Sandbox:** Completely isolated per session

### How Test Running Works

**Complete Flow:**
```
User clicks "Run Tests"
    ↓
/api/interview/[id]/run-tests
    ↓
Validates code, language, test cases
    ↓
Writes code to Modal volume
    ↓
Records test_run_start event
    ↓
Calls modal.executeCode()
    ↓
Modal HTTP endpoint → Python function
    ↓
Python: Creates temp dir, writes solution.py + test_solution.py
    ↓
Runs pytest with JSON report
    ↓
Returns {passed: N, failed: M, testResults: [...]}
    ↓
Stores results in DB (TestResult table)
    ↓
Shows UI completion card
    ↓
Candidate can click "Next Question"
```

**Currently Missing:**
- ❌ AI cannot trigger test runs directly
- ❌ No real-time test feedback during coding
- ❌ Terminal not connected to Modal sandbox
- ❌ No interactive REPL in terminal
- ❌ File system operations slow (Modal API calls)

---

## 4. REAL-TIME FEATURES

### Session Recording & Events
**File:** `app/api/interview/[id]/events/route.ts`

**Events Recorded:**
- `code_change` - Every code edit (with debounce)
- `code_snapshot` - Every 30 seconds
- `file_write` - File modifications with diffs
- `test_run` - Test execution with results
- `terminal_command` - Terminal input
- `ai_interaction` - Chat turns + tool use

**Event Batching:**
- Frontend batches multiple events
- `/api/interview/[id]/events/batch` endpoint
- Reduces API calls by ~90%
- Flushes automatically on test run

### Session State Persistence
**Features:**
- Auto-saves interview state to localStorage
- Recovery dialog on refresh
- Prevents data loss during network issues
- Can restore:
  - Code content
  - Selected file
  - Test results
  - Time remaining
  - Question progress

### Offline Support
**Functionality:**
- Detects connection loss (useOnlineStatus hook)
- Shows offline banner
- Queues local changes
- Syncs when reconnected
- Toast notifications on restore

### Real-time AI Interaction
**Current Limitations:**
- ⚠️ Not truly real-time
- Chat is request/response only
- No streaming code suggestions
- No live debugging feedback
- AI doesn't proactively help

**What Would Make It Real-Time:**
- Streaming code into editor
- Live test result feedback
- AI monitoring code changes
- Triggering tests automatically
- Suggesting fixes without user asking

---

## 5. CRITICAL GAPS ANALYSIS

### GAP 1: AI Cannot Autonomously Run Tests
**Problem:**
- AI has `run_tests` tool but it's stubbed out
- Returns error: "Use the 'Run Tests' button instead"
- Breaks AI workflow for debugging

**Impact:**
- AI can't iterate: write → test → fix
- Must ask candidate to run tests
- Slows down problem-solving
- Reduces "AI interview" feel

**Solution Needed:**
```typescript
// Current (doesn't work):
async toolRunTests(): Promise<unknown> {
  return {
    success: false,
    error: 'Please use the "Run Tests" button in the interface...'
  };
}

// Should be:
async toolRunTests(): Promise<unknown> {
  const result = await executeCode(
    this.config.sessionId,
    this.getCurrentCode(),
    this.getTestCases()
  );
  return {
    success: result.success,
    passed: result.passedTests,
    total: result.totalTests,
    testResults: result.testResults
  };
}
```

### GAP 2: Terminal Not Connected to AI
**Problem:**
- Terminal commands processed locally
- Not integrated with Modal sandbox
- AI can't execute commands via terminal
- No interactive development loop

**Current State:**
```
User types "npm test" in terminal
    ↓
Sent to /api/interview/[id]/terminal/input
    ↓
Server executes locally (not in Modal)
    ↓
Output streamed back
    ⚠️ NOT what user expects
```

**What's Missing:**
1. Terminal should forward to Modal sandbox
2. AI should have terminal tool (not just bash)
3. Interactive shell session management
4. Persistent working directory

### GAP 3: No Streaming Code Edits
**Problem:**
- AI reads/writes files as discrete operations
- Cannot stream code into editor in real-time
- User doesn't see AI writing code progressively
- Feels disconnected from AI assistance

**Example Scenario (Current):**
```
User: "Can you refactor this function?"
AI: "I'll refactor it for you."
AI uses write_file() tool
AI: "Done! I've refactored the function."
User: Opens file to see changes (manual step)
```

**Should Be:**
```
User: "Can you refactor this function?"
AI: "I'll refactor it for you."
AI streams: "function newName() {"
        → CodeEditor gets live updates
        → User sees code appearing in real-time
        → AI completes with explanation
```

**Technical Need:**
- WebSocket connection for real-time edits
- CodeEditor diff-patch integration
- AI output routing to editor

### GAP 4: AI Doesn't Monitor Code Progress
**Problem:**
- AI responds only to explicit user queries
- No proactive suggestions or help
- Doesn't track what candidate is struggling with
- Can't suggest next steps automatically

**Missing Features:**
1. **Auto-trigger when tests fail repeatedly**
   ```
   Monitor: User failed test 3 times in 2 min
   Action: AI offers help unprompted
   ```

2. **Suggest optimizations after code runs**
   ```
   Monitor: Code works but inefficient
   Action: AI: "Your solution is O(n²), here's an O(n) approach..."
   ```

3. **Debug session tracking**
   ```
   Monitor: Lots of failed attempts
   Action: AI: "Let me help debug. What error are you seeing?"
   ```

### GAP 5: Security Concerns in AI Interaction
**Problem Areas:**
1. **Context Leakage:** AI sees test cases
   - Could memorize and propose solutions
   - System prompt warns but enforcement unclear

2. **File Access Limitations:** AI blocked by path validation
   - Can't read outside `/workspace`
   - What about symlinks, relative paths?

3. **Command Execution:** Allowlist-based but incomplete
   - `npm install` might pull large packages
   - `curl` could exfiltrate data
   - No actual Modal sandbox integration yet

4. **Output Sanitization:** Basic string replacement
   - Could miss security-sensitive patterns
   - No knowledge base of secrets to redact

### GAP 6: Agent Conversation Management
**Problem:**
- Conversation history stored in-memory only
- No persistence across page refreshes
- No multi-turn context management
- Conversation reset on new question but timing is fragile

**Current:**
```typescript
// From AIChat.tsx
conversationHistory.current = []; // Lost on refresh
resetConversation(); // Called when moving to next question
```

**Issue:** If network fails between resetting conversation and loading new question, context leaks between questions (security risk).

### GAP 7: Incomplete Multi-Language Support
**Current Support:**
- ✅ Python: Full pytest execution
- ✅ JavaScript: Jest-based execution
- ✅ TypeScript: Jest-based execution
- ❌ Go: Defined but untested
- ❌ No ability to switch languages mid-interview

**Missing:**
- Go executor implementation
- Language-specific debugging
- Multi-file language projects (imports, modules)

### GAP 8: No Real-Time Collaboration
**Problem:**
- Interview is 1v1 (candidate + system)
- No assessor/interviewer observations
- No live session review
- No ability to intervene mid-session

**Would Enable:**
- Interviewer sees candidate's screen
- Can pause and ask questions
- Real AI in the room, not just backend
- Better assessment of problem-solving

### GAP 9: Limited Helpfulness Personalization
**Current:**
```typescript
HELPFULNESS_CONFIGS = {
  consultant: { tools: [Read, Grep, Glob] },
  'pair-programming': { tools: [..., Write, Edit, Bash] },
  'full-copilot': { tools: [...all...] }
}
```

**Issues:**
1. Hardcoded per-question
2. No adaptation based on performance
3. No mid-assessment switch
4. System prompt doesn't reflect well

**Should Be:**
- Start at consultant, adapt to pair-programming if struggling
- Escalate to copilot only if very stuck
- Reset to lower level if being too assisted

### GAP 10: No Explicit AI Session Management
**Problem:**
- No `beginSession()`, `endSession()`, `pauseSession()`
- No way to:
  - Set interview context (company, role, expectations)
  - Configure AI behavior per candidate
  - Track AI-candidate interaction quality
  - Pause and resume assistance

---

## FEATURE INVENTORY: What Actually Works

### ✅ Fully Working
1. **Code Editor**
   - Edit JavaScript, TypeScript, Python, Go
   - Real-time syntax highlighting
   - Debounced auto-save

2. **File System**
   - Read/write files
   - View file tree
   - Track changes

3. **Test Running**
   - Execute pytest (Python)
   - Execute Jest (JavaScript/TypeScript)
   - Show pass/fail status

4. **AI Chat**
   - Send messages to Claude
   - Receive streaming responses
   - View tool usage

5. **Modal Sandbox**
   - Isolated execution environment
   - Code execution with tests
   - File persistence

6. **Event Recording**
   - Track all code changes
   - Record test results
   - Store conversation history

### ⚠️ Partially Working
1. **AI Tool Use**
   - Can read/write files: ✅
   - Can search code: ✅
   - Can execute commands: ⚠️ (limited)
   - Can run tests: ❌ (stubbed)

2. **Terminal**
   - Displays output: ✅
   - Handles input: ✅
   - Integrates with sandbox: ❌

3. **Session Persistence**
   - localStorage recovery: ✅
   - Database recording: ✅
   - Cross-refresh state: ⚠️

### ❌ Not Working
1. **AI Autonomously Running Tests**
2. **Real-Time Code Streaming**
3. **Proactive AI Assistance**
4. **Interactive Terminal in Sandbox**
5. **Live Debugging Sessions**
6. **Multi-Assessor Collaboration**

---

## RECOMMENDATIONS: Reaching "Full AI Interview" Status

### Priority 1: Enable AI Test Running
**Effort:** 2-4 hours
**Impact:** 🔥 Critical - Makes AI autonomous

```typescript
// Enable the stubbed tool:
private async toolRunTests(): Promise<unknown> {
  // Call Modal executeCode
  // Return parsed results
  // Allow AI to analyze and suggest fixes
}
```

### Priority 2: Connect Terminal to Modal
**Effort:** 4-6 hours
**Impact:** 🔥 Critical - Interactive development

```typescript
// In Terminal.tsx:
// Route commands to Modal sandbox instead of localhost
// Support interactive sessions
// Stream live output
```

### Priority 3: Implement Real-Time Code Edits
**Effort:** 6-8 hours
**Impact:** 🔥 Critical - Natural AI workflow

```typescript
// WebSocket-based editor updates:
// AI streams code → CodeEditor shows live typing
// Cursor position, syntax highlighting maintained
```

### Priority 4: Adaptive AI Helpfulness
**Effort:** 4-6 hours
**Impact:** ⚡ High - Better pedagogy

```typescript
// Monitor metrics:
// - Test pass rate
// - Time per question
// - Number of AI interactions
// Adjust helpfulness level automatically
```

### Priority 5: Session Integrity
**Effort:** 2-3 hours
**Impact:** ⚡ High - Security

```typescript
// Cryptographic verification:
// - Sign conversation history
// - Detect tampering
// - Prevent context leakage between questions
```

### Priority 6: Assessor Dashboard
**Effort:** 8-12 hours
**Impact:** 📊 Medium - Assessment value

```typescript
// Real-time monitoring:
// - See candidate's screen
// - View AI interactions
// - Intervene if needed
// - Rate assessment quality
```

---

## ARCHITECTURE RECOMMENDATIONS

### AI Chat Flow (Current vs. Recommended)

**Current:**
```
User Message
    ↓
AIChat Component
    ↓
/api/interview/[id]/chat/agent
    ↓
CodingAgent
    ↓
Claude API (request/response)
    ↓
Stream back to UI
```

**Recommended:**
```
User Message OR Auto-Trigger
    ↓
Interview Agent (new)
    ├─→ Claude API Call
    ├─→ Tool Execution Manager
    │   ├─ File operations → Modal
    │   ├─ Test execution → Modal
    │   ├─ Terminal → Modal shell
    │   └─ Code edits → WebSocket to Editor
    ├─→ Session monitor
    │   ├─ Track test results
    │   ├─ Detect struggles
    │   └─ Suggest escalation
    └─→ Assessment engine
        ├─ Rate prompt quality
        ├─ Grade code quality
        └─ Score AI helpfulness
```

### Database Schema Addition Needed
```sql
-- Track AI-specific session data
CREATE TABLE ai_session (
  id UUID PRIMARY KEY,
  sessionRecordingId UUID,
  initialHelpfulness VARCHAR(50),
  currentHelpfulness VARCHAR(50),
  autoEscalationTime TIMESTAMP,
  proactiveSuggestionsCount INT,
  autonomousTestRuns INT,
  fileModificationsCount INT,
  averageLatency FLOAT,
  totalTokensUsed INT,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);

-- Track quality metrics
CREATE TABLE ai_interaction_quality (
  id UUID PRIMARY KEY,
  aiSessionId UUID,
  metricType VARCHAR(100),
  score FLOAT,
  description TEXT,
  timestamp TIMESTAMP
);
```

---

## TECHNOLOGY DEBT

### High Priority
1. **Agent tool execution not fully implemented** - run_tests tool is stubbed
2. **No WebSocket infrastructure** - Needed for real-time features
3. **Modal integration incomplete** - runCommand not executing in sandbox
4. **Conversation state fragile** - Lost on refresh, vulnerable to leaks

### Medium Priority
1. **Hardcoded helpfulness levels** - Should be adaptive
2. **Limited language support** - Go untested
3. **Basic security validation** - Command blocklist incomplete
4. **No assessor tools** - Observers can't interact

### Low Priority
1. **CodeMirror theme hardcoded** - Should respect theme config
2. **Event recording inefficient** - Could batch more aggressively
3. **File tree pagination missing** - Won't scale to 1000+ files
4. **No code review features** - Would help assessment

---

## CONCLUSION

InterviewLM has built the **infrastructure** for AI interviews but not the **interaction patterns**. The platform can:
- Execute code in sandboxes ✅
- Store and edit files ✅
- Call Claude API ✅

But it cannot:
- Let AI autonomously improve code ❌
- Provide interactive development sessions ❌
- Adapt to candidate performance ❌
- Show AI actively helping in real-time ❌

**To reach production-ready "AI Interview" status:**
1. **Enable AI tool execution** (tests, terminal)
2. **Create real-time code editing** (WebSocket)
3. **Implement proactive assistance** (monitoring + auto-escalation)
4. **Secure conversation integrity** (cryptography)
5. **Add assessor features** (live observation, intervention)

These are not architectural changes—the foundation is solid. They're feature completions on top of existing infrastructure.

