# InterviewLM Architecture Analysis
## Comprehensive UX-to-Backend Integration Assessment

**Date:** November 10, 2025  
**Branch:** ux-design  
**Analysis Scope:** Full stack architecture, state management, real-time patterns

---

## Executive Summary

The InterviewLM codebase has **strong API foundations** with SSE-based real-time communication, Prisma database integration, and Modal sandbox service bindings. However, there are **critical disconnects** between the UX layer and backend APIs:

1. **AIChat component expects different SSE event format** than the API provides
2. **FileTree and CodeEditor** still receive mock data despite backend APIs existing
3. **State management** is fragmented (local useState + scattered API calls)
4. **Real-time file sync** between Modal sandbox and UI is not implemented
5. **Session initialization** is incomplete - no proper interview flow orchestration

**Current State:** ~40% of backend APIs are implemented; ~20% of UX fully integrated.

---

## 1. GAPS BETWEEN EXISTING UX AND BACKEND APIs

### 1.1 AIChat Component - Event Format Mismatch

**Issue:** Client-side code expects different SSE event structure than server sends

**Client Code (AIChat.tsx:92-117):**
```typescript
// Expects custom "content" and "usage" event types
eventSource.addEventListener("content", (event) => {
  const data = JSON.parse(event.data);
  fullContent += data.delta;
  setCurrentStreamingMessage(fullContent);
});

eventSource.addEventListener("usage", (event) => {
  const data = JSON.parse(event.data);
  tokenUsage = { inputTokens: data.inputTokens, outputTokens: data.outputTokens };
});

eventSource.addEventListener("done", async () => {
  // Handle completion
});
```

**Server Code (chat/route.ts:120-179):**
```typescript
// Sends generic "data:" with type field inside JSON
const data = JSON.stringify({ type: "chunk", text });
controller.enqueue(encoder.encode(`data: ${data}\n\n`));

// Token info sent as part of message_delta event, not custom event
```

**Impact:** 
- AI responses don't stream to the UI
- Token usage data never reaches the client
- Chat functionality is broken in production

**Fix Required:** Change API to send custom event types:
```typescript
// For streaming chunks
controller.enqueue(encoder.encode(`event: content\ndata: ${JSON.stringify({ delta: text })}\n\n`));

// For token usage
controller.enqueue(encoder.encode(`event: usage\ndata: ${JSON.stringify({ inputTokens, outputTokens })}\n\n`));

// For completion
controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
```

### 1.2 FileTree Component - Receives Mock Data

**Issue:** FileTree always gets hardcoded sample files; doesn't fetch from Modal sandbox

**Current Flow (interview/[id]/page.tsx:30-77):**
```typescript
const sampleFiles: FileNode[] = [
  { id: "1", name: "src", type: "folder", path: "src", children: [...] },
  // ... hardcoded files
];

// Passed to component
<FileTree files={sampleFiles} ... />
```

**What Should Happen:**
- Fetch file tree from Modal sandbox on session start
- Subscribe to file changes via SSE or WebSocket
- Update UI when files are created/deleted/renamed
- Real-time sync with Modal workspace

**Missing API Integration:**
- No `/api/interview/[id]/files` endpoint to list workspace files
- No `/api/interview/[id]/files/[path]` to read file contents
- No SSE stream for file system changes

### 1.3 CodeEditor - Static Content, No Real-Time Sync

**Current Implementation:**
- Receives code as `value` prop
- Sends changes to `/api/interview/[id]/events` for recording only
- Never syncs back to Modal sandbox in real-time
- No file read/write operations

**Missing Integration Points:**
1. Load file content from Modal: `readFile(sessionId, filePath)`
2. Save to Modal when user edits: `writeFile(sessionId, filePath, content)`
3. Debounce writes (currently debouncing events, not file writes)
4. Conflict resolution when multiple sources edit same file

### 1.4 Terminal Component - Partial Integration

**What Works:**
- SSE connection to `/api/interview/[id]/terminal` ✓
- Command input via `/api/interview/[id]/terminal/input` ✓
- Output streaming with 100ms polling ✓

**What's Missing:**
- No actual Modal sandbox connection (demo mode only)
- Terminal state is in-memory queue, should persist to Redis
- No environment variable or file system context in sandbox
- No terminal resize synchronization with Modal

---

## 2. COMPONENTS USING MOCK DATA WITH REAL APIS AVAILABLE

### Summary Table

| Component | Mock Data | Real API Available | Status |
|-----------|-----------|-------------------|--------|
| FileTree | ✓ (sampleFiles) | ✗ (not implemented) | Blocked |
| CodeEditor | ✓ (sampleCode) | ✗ (no read/write API) | Partial |
| Terminal | ✗ (demo commands) | ✓ (SSE endpoint) | Integrated* |
| AIChat | ✗ (real API) | ✓ (but broken) | Integration Gap |
| Test Results | ✗ (random 70%) | ✓ (mock execution) | Partial |
| Interview Session Init | ✓ (hardcoded Q1) | ✓ (/api/.../questions) | Not Used |

*Terminal works but only simulates commands, doesn't execute in Modal

### 2.1 Test Results - Mock Execution

**Code (run-tests/route.ts:233-273):**
```typescript
function mockExecution(...) {
  const results = testCases.map((testCase) => {
    const passed = Math.random() > 0.3; // 70% pass rate for demo
    return {
      name: testCase.name,
      passed,
      actualOutput: passed ? testCase.expectedOutput : "Mock output (different)",
      error: passed ? undefined : "Mock execution error",
      duration: Math.floor(Math.random() * 100) + 50,
    };
  });
  // ...
}
```

**Reality:**
- API tries to call Modal API if `MODAL_API_KEY` is set
- Falls back to mock for testing
- This is actually correct pattern, but mock is too simplistic
- Doesn't validate test cases properly

### 2.2 Interview Session Questions - Not Called

**API Available:** `/api/interview/[id]/questions` (GET/POST)

**Feature:**
- Generates adaptive difficulty questions using Claude
- Tracks performance and adjusts next question
- Stores in database with starter code and test cases

**Never Called From:**
- Interview page doesn't fetch current question
- No question state management
- Interview assumes hardcoded "question-1" (line 98: `const [currentQuestionId] = useState("question-1");`)

---

## 3. MISSING INTEGRATIONS

### 3.1 Authentication

**Status:** ✓ Implemented via NextAuth  
**But:** Demo mode bypasses auth checks (line 15-25 in terminal/route.ts)

```typescript
const isDemoMode = id === "demo";
if (!isDemoMode) {
  // const session = await auth();
  // if (!session?.user) { return 401; }
  // Commented out for demo
}
```

**Required Before Production:**
- Uncomment auth verification in all endpoints
- Verify user belongs to organization
- Check organization plan limits
- Audit token usage against plan

### 3.2 Real-Time File Synchronization

**Current State:** None  
**What's Needed:**

```
Modal Sandbox ← → InterviewLM Backend ← → Client UI
  Volume              File Queue/Redis       FileTree + Editor
  Changes             SSE Stream             Real-time Updates
```

**Missing Components:**
1. File watcher in Modal volume
2. File sync API endpoint
3. Redis queue for buffering (currently in-memory for Terminal)
4. Client-side subscription to file changes

### 3.3 Modal Sandbox Integration

**Status:** Service skeleton exists (lib/services/modal.ts)  
**Actual Usage:** None - Terminal just simulates commands

**Missing Implementations:**
1. `createSandbox()` - Not called on session start
2. `resumeSandbox()` - Not called on session resume
3. `executeCode()` - Not wired to `/api/interview/[id]/run-tests`
4. `getFileSystem()` - Not exposed via API
5. WebSocket for terminal: `getTerminalConnectionUrl()` built but not used

### 3.4 Database Recording

**Status:** ✓ Events recorded via `/api/interview/[id]/events`  
**But:** No dashboard to view data

**Tracked:**
- 13 event types defined (keystroke, code_snapshot, test_run, etc.)
- Claude interactions (prompt quality scoring)
- Code snapshots with diffs
- Test results
- Session metadata (duration, status)

**Not Tracked:**
- File system changes
- Terminal I/O in detail
- UI interaction patterns
- Performance metrics (page load, lag)

### 3.5 Session Recording Replay

**Status:** Events API can retrieve recorded events  
**But:** No replay viewer connected to Interview page

**SessionReplayViewer component exists** but:
- Not integrated into interview flow
- Not used in dashboard
- Requires manual connection

---

## 4. STATE MANAGEMENT APPROACH

### Current Patterns

**Local Component State (useState):**
```typescript
// interview/[id]/page.tsx
const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
const [code, setCode] = useState(sampleCode);
const [isAIChatOpen, setIsAIChatOpen] = useState(true);
const [timeRemaining, setTimeRemaining] = useState(5400);
const [currentQuestionId] = useState("question-1"); // TODO note!
```

**Issues:**
1. No centralized state for session context
2. Each component manages own API state
3. No error boundary for failed requests
4. No retry logic
5. No caching strategy

**Scattered API Calls:**
```typescript
// Terminal sends:
fetch(`/api/interview/${sessionId}/terminal/input`, {...})

// CodeEditor sends:
fetch(`/api/interview/${sessionId}/events`, {...})
fetch(`/api/interview/${sessionId}/run-tests`, {...})

// AIChat sends:
fetch(`/api/interview/${sessionId}/chat`, {...})
fetch(`/api/interview/${sessionId}/events`, {...})
```

### Assessment: Is useState Sufficient?

**Short Answer:** No.

**Why:**
- Session state (time, questions, scores) should be server-synced
- Sidebar collapse state can be local
- File tree selection should be persistent
- Interview progress needs to be resilient to page reload

**Better Approach:**

```typescript
// 1. Create interview context
const InterviewContext = createContext<{
  sessionId: string;
  currentQuestion: GeneratedQuestion | null;
  timeRemaining: number;
  selectedFile: FileNode | null;
  isConnected: boolean;
  errors: Error[];
}>(null);

// 2. Custom hook for API sync
function useInterviewSession(sessionId: string) {
  const [state, dispatch] = useReducer(interviewReducer, initialState);
  
  useEffect(() => {
    // Sync session state from server on mount
    // Subscribe to SSE updates
    // Handle reconnection
  }, [sessionId]);
}

// 3. Retry middleware for API calls
const apiClient = createClient({
  retry: { maxAttempts: 3, backoff: exponential },
  timeout: 10000,
  cache: { ttl: 5000 }, // Cache read operations briefly
});
```

---

## 5. REAL-TIME COMMUNICATION PATTERNS

### Current Architecture

```
┌─────────────────────────────────────────┐
│         Client (Next.js 15)             │
├─────────────────────────────────────────┤
│ AIChat (SSE)                            │
│ ├─ EventSource("api/.../chat")          │
│ ├─ Listens: data events (format wrong)  │
│ └─ Issue: type="chunk" vs type="content"│
│                                         │
│ Terminal (SSE)                          │
│ ├─ EventSource("api/.../terminal")      │
│ ├─ Polling: 100ms check queue           │
│ └─ Works: outputs stream correctly      │
│                                         │
│ CodeEditor (No real-time)               │
│ ├─ Debounced event recording            │
│ ├─ No file sync                         │
│ └─ Snapshot every 30 seconds            │
│                                         │
│ FileTree (Static)                       │
│ ├─ Receives mock data once              │
│ └─ No refresh mechanism                 │
└─────────────────────────────────────────┘
              ↓ HTTP/SSE ↓
┌─────────────────────────────────────────┐
│      Backend (Next.js API Routes)       │
├─────────────────────────────────────────┤
│ /chat → Claude API (streaming)          │
│ /terminal → Output queue (polled)       │
│ /events → Database (batched)            │
│ /questions → LLM generation             │
│ /run-tests → Modal sandbox (mocked)     │
└─────────────────────────────────────────┘
```

### SSE vs WebSocket Analysis

| Feature | SSE | WebSocket | Current Use |
|---------|-----|-----------|-------------|
| Bidirectional | ✗ (1-way) | ✓ | Terminal needs 2-way |
| Built-in reconnect | ✓ | ✗ (manual) | SSE (good) |
| Server push | ✓ | ✓ | Both |
| Client → Server | HTTP POST | WS frame | HTTP (extra call) |
| Proxy-friendly | ✓ | ⚠️ | SSE better |
| Per-message latency | ~50ms | <10ms | Terminal: 100ms |

**Verdict:**
- ✓ Use SSE for: Chat streaming (one-way from Claude)
- ✓ Use SSE for: File changes from sandbox
- ⚠️ Use WebSocket for: Terminal (currently HTTP + SSE polling)
- ✗ Avoid: Mixed SSE + HTTP for same data

**Current Issue in Terminal:**
- Uses SSE for output (good)
- Uses HTTP POST for input (extra round-trip)
- Polls every 100ms instead of true streaming

**Better:** Terminal could use WebSocket for true bidirectional communication with lower latency:
```typescript
// Better approach (not implemented)
const ws = new WebSocket(`wss://modal.com/terminal?session=${sessionId}`);
ws.onopen = () => ws.send('{"type":"init","language":"typescript"}');
ws.onmessage = (e) => terminal.write(e.data);
terminal.onData((data) => ws.send(data)); // Instant
```

---

## 6. INTERVIEW EXPERIENCE FLOW ANALYSIS

### Current Flow (What Happens Now)

```
1. User navigates to /interview/[id]
   ↓
2. Page loads with hardcoded sample data
   ├─ sampleFiles (mock file tree)
   ├─ sampleCode (hardcoded problem)
   ├─ currentQuestionId = "question-1" (never updated)
   └─ timeRemaining = 5400 (never decrements)
   ↓
3. Terminal connects to /api/interview/[id]/terminal
   ├─ SSE connection established
   ├─ Welcome message shows
   └─ Commands simulated (not executed in Modal)
   ↓
4. AIChat connects to /api/interview/[id]/chat
   ├─ API exists but event format broken
   └─ User messages never stream to UI
   ↓
5. CodeEditor shows static code
   ├─ Records changes every 30 seconds
   ├─ Records keystrokes (sampling 10%)
   └─ Run Tests calls /api/.../run-tests
       └─ Falls back to mock (70% random pass)
```

### Ideal Flow (What Should Happen)

```
SESSION INITIALIZATION
┌─────────────────────────────────────────────┐
│ 1. User accepts interview invite or starts  │
│    - Check session validity                 │
│    - Verify organization/permissions        │
│    - Initialize timer (start counting down) │
└──────────────────────────────────────────┬──┘
                                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Create Modal Sandbox with Persistent Volume                 │
│    - createSandbox(sessionId)                                  │
│    - Volume = interview-${sessionId}                           │
│    - Mount point: /workspace                                  │
│    - Initialize with starter files                            │
└──────────────────────────────────────────┬──────────────────────┘
                                           ↓
┌──────────────────────────────────────────────────────┐
│ 3. Load Current Question                            │
│    - GET /api/interview/[id]/questions              │
│    - Returns: GeneratedQuestion {                   │
│      title, description, difficulty,               │
│      starterCode: [{fileName, content}],           │
│      testCases: [{name, input, expected}]          │
│    }                                                │
└──────────────────────────┬───────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────┐
│ 4. Populate UI with Question Data                    │
│    - FileTree: Real file system from sandbox        │
│    - CodeEditor: Starter code from question        │
│    - Terminal: Ready to execute sandbox commands   │
│    - AIChat: Context includes current code         │
└──────────────────────────┬───────────────────────────┘
                           ↓
LIVE EDITING SESSION
┌──────────────────────────────────────────────────────┐
│ 5. Edit Loop                                         │
│    ┌─ Code changes                                  │
│    │  ├─ [Local] Update UI immediately             │
│    │  ├─ [Debounced] writeFile(path, content)      │
│    │  └─ [Recorded] POST /events code_change       │
│    │                                                │
│    ├─ File creates/deletes                          │
│    │  ├─ [Modal] Create/delete in sandbox          │
│    │  └─ [Record] POST /events file_created        │
│    │                                                │
│    ├─ Terminal commands                             │
│    │  ├─ [Send] WebSocket to Modal terminal        │
│    │  ├─ [Receive] Output streams via SSE           │
│    │  └─ [Record] POST /events terminal_input      │
│    │                                                │
│    └─ Run tests                                      │
│       ├─ [Execute] executeCode(code, testCases)    │
│       ├─ [Modal] Run in sandbox with timeout       │
│       ├─ [UI] Stream results as they complete      │
│       └─ [Record] POST /events test_run            │
└──────────────────────────┬───────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────┐
│ 6. AI Collaboration                                 │
│    - User asks question in chat                    │
│    - Request includes current code context         │
│    - Claude streams response via SSE               │
│    - Prompt quality scored automatically           │
│    - Response saved with interaction metadata      │
└──────────────────────────┬───────────────────────────┘
                           ↓
SUBMISSION & CLEANUP
┌──────────────────────────────────────────────────────┐
│ 7. Submit Assessment                                │
│    - POST /api/interview/[id]/submit               │
│    - Takes final code snapshot                     │
│    - Runs final test suite                         │
│    - Stops session timer                           │
│    - Archives Modal volume to S3                   │
│    - Updates candidate status: IN_PROGRESS → ...   │
└──────────────────────────────────────────────────────┘
```

---

## 7. HOW TERMINAL SHOULD CONNECT TO MODAL SANDBOX

### Current Implementation
- SSE endpoint returns mock command output
- Commands not executed in actual Modal sandbox
- Demo mode hardcodes responses

### Production Implementation Needed

**Step 1: Initialize Sandbox on Session Start**
```typescript
// api/interview/[id]/initialize (new endpoint)
export async function POST(request, { params: { id } }) {
  const candidate = await prisma.candidate.findUnique({ where: { id } });
  const question = await getQuestion(candidate.assessmentId);
  
  // Create Modal volume + sandbox
  const sandbox = await createSandbox(id, {
    'solution.ts': question.starterCode[0].content,
    'package.json': defaultPackageJson,
    'test.ts': generateTestFile(question.testCases),
  });
  
  // Store sandbox ID
  await prisma.sessionRecording.update({
    where: { candidateId: id },
    data: { 
      modalSandboxId: sandbox.id,
      modlaVolumeName: `interview-${id}`,
    },
  });
  
  return { sandbox };
}
```

**Step 2: Connect Terminal via WebSocket**
```typescript
// Current: SSE + HTTP polling
// Better: Direct WebSocket to Modal

const wsUrl = getTerminalConnectionUrl(sessionId);
const ws = new WebSocket(wsUrl);

ws.addEventListener('open', () => {
  terminal.write("✓ Connected to Modal sandbox");
});

ws.addEventListener('message', (event) => {
  // Direct output from Modal terminal
  const { output, error } = JSON.parse(event.data);
  if (output) terminal.write(output);
  if (error) terminal.write(`\x1b[31m${error}\x1b[0m`);
});

// Send commands directly
terminal.onData((input) => {
  ws.send(JSON.stringify({ type: 'input', data: input }));
});
```

**Step 3: Persistent Storage**
- Every file write is persisted to Modal volume
- Commands modify files in `/workspace`
- Volume survives session pause/resume

---

## 8. HOW AI CHAT SHOULD CONNECT TO CLAUDE API

### Current Status
- API exists at `/api/interview/[id]/chat`
- Uses Claude Sonnet 4.5 model
- Attempts SSE streaming
- **Bug:** Event format mismatch

### Correct Implementation

**API Side (Already Done, Just Need Event Fix):**
```typescript
// app/api/interview/[id]/chat/route.ts
for await (const event of messageStream) {
  if (event.type === "content_block_delta") {
    const text = event.delta.text;
    fullResponse += text;
    
    // CORRECT: Send as custom event type
    controller.enqueue(
      encoder.encode(
        `event: content\ndata: ${JSON.stringify({ delta: text })}\n\n`
      )
    );
  }
  
  if (event.type === "message_delta") {
    // CORRECT: Send as custom event type
    controller.enqueue(
      encoder.encode(
        `event: usage\ndata: ${JSON.stringify({
          inputTokens: event.usage.input_tokens,
          outputTokens: event.usage.output_tokens
        })}\n\n`
      )
    );
  }
}

// Send completion signal
controller.enqueue(
  encoder.encode(`event: done\ndata: {}\n\n`)
);
```

**Client Side (What AIChat.tsx Currently Does):**
```typescript
const eventSource = new EventSource(
  `/api/interview/${sessionId}/chat?message=${encodeURIComponent(input)}`
);

// Listen for streamed content chunks
eventSource.addEventListener("content", (event) => {
  const { delta } = JSON.parse(event.data);
  fullContent += delta;
  setCurrentStreamingMessage(fullContent);
});

// Listen for token usage
eventSource.addEventListener("usage", (event) => {
  const { inputTokens, outputTokens } = JSON.parse(event.data);
  tokenUsage = { inputTokens, outputTokens };
});

// Listen for completion
eventSource.addEventListener("done", async () => {
  setMessages(prev => [...prev, {
    role: "assistant",
    content: fullContent,
    tokenUsage,
  }]);
  setCurrentStreamingMessage("");
  setIsLoading(false);
  eventSource.close();
});
```

### Context Passing
Currently, API builds system prompt from code context:
```typescript
const systemPrompt = buildSystemPrompt(codeContext);
// "You are Claude Code, an AI assistant helping a candidate..."
// + file content if provided
```

**Enhancement:** Include session context:
```typescript
const systemPrompt = `You are Claude Code, helping a ${seniority} ${role} developer.

Current Challenge: ${question.title}
Difficulty: ${question.difficulty}
Time Spent: ${timeSpent}s / ${estimatedTime * 60}s
Tests Passing: ${passedTests}/${totalTests}

${currentCode ? `Current Code:\n\`\`\`${language}\n${currentCode}\n\`\`\`` : ""}

Guidelines:
- Provide helpful guidance without complete solutions
- Suggest best practices and improvements
- Explain concepts clearly
- Help debug issues`;
```

---

## 9. HOW FILE CHANGES SHOULD SYNC

### Current State: No File Sync

### Proposed Architecture

```
┌────────────────────────────────────────────────┐
│          Client UI (FileTree + Editor)         │
├────────────────────────────────────────────────┤
│ Optimistic Updates + Debounced Writes         │
│ - User edits code → show immediately          │
│ - Send to Modal on 500ms debounce              │
│ - Sync from Modal on file changes              │
└────────┬─────────────────────────────┬─────────┘
         │ /api/.../files/read         │
         │ /api/.../files/write        │ /api/.../files/watch (SSE)
         ↓                             ↓
┌─────────────────────────────────────────────────────┐
│         Backend (Session Event Handler)            │
├─────────────────────────────────────────────────────┤
│ - Validates writes (not outside /workspace)        │
│ - Writes to volume                                 │
│ - Broadcasts changes to other clients              │
│ - Records in database                              │
└────────┬──────────────────────────────┬────────────┘
         │ writeFile()                  │ getFileSystem()
         ↓                              ↓
┌─────────────────────────────────────────────────────┐
│     Modal Volume (Persistent Storage)              │
├─────────────────────────────────────────────────────┤
│ /workspace/solution.ts   (editable code)           │
│ /workspace/solution.test.ts (tests, read-only)    │
│ /workspace/package.json  (dependencies)            │
│ /workspace/... (user files)                        │
└─────────────────────────────────────────────────────┘
```

### Implementation Strategy

**1. Add File System API Endpoints**
```typescript
// app/api/interview/[id]/files/route.ts
export async function GET(request, { params: { id } }) {
  // List all files in workspace
  const fileSystem = await getFileSystem(id, '/workspace');
  return NextResponse.json({ files: fileSystem });
}

// app/api/interview/[id]/files/[...path]/route.ts
export async function GET(request, { params: { id, path } }) {
  // Read specific file
  const content = await readFile(id, path.join('/'));
  return new NextResponse(content, { headers: { 'Content-Type': 'text/plain' } });
}

export async function PUT(request, { params: { id, path } }) {
  // Write file (validated path)
  const content = await request.text();
  await writeFile(id, path.join('/'), content);
  // Broadcast change
  broadcastFileChange(id, { type: 'write', path, content });
  return NextResponse.json({ success: true });
}
```

**2. Client-Side File Sync Hook**
```typescript
function useFileSync(sessionId: string) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [content, setContent] = useState<Record<string, string>>({});
  const writeDebounce = useRef<Record<string, NodeJS.Timeout>>({});

  // Load initial files
  useEffect(() => {
    fetch(`/api/interview/${sessionId}/files`)
      .then(r => r.json())
      .then(data => setFiles(data.files));
  }, [sessionId]);

  // Subscribe to file changes
  useEffect(() => {
    const sse = new EventSource(`/api/interview/${sessionId}/files/watch`);
    sse.onmessage = (e) => {
      const { type, path, content: fileContent } = JSON.parse(e.data);
      if (type === 'write') {
        setContent(prev => ({ ...prev, [path]: fileContent }));
      } else if (type === 'create' || type === 'delete') {
        // Refresh file list
        fetch(`/api/interview/${sessionId}/files`)
          .then(r => r.json())
          .then(data => setFiles(data.files));
      }
    };
    return () => sse.close();
  }, [sessionId]);

  const writeFile = useCallback((path: string, content: string) => {
    // Optimistic update
    setContent(prev => ({ ...prev, [path]: content }));

    // Debounced sync
    clearTimeout(writeDebounce.current[path]);
    writeDebounce.current[path] = setTimeout(() => {
      fetch(`/api/interview/${sessionId}/files/${path}`, {
        method: 'PUT',
        body: content,
      }).catch(err => {
        console.error('File sync failed:', err);
        // Rollback if needed
      });
    }, 500);
  }, [sessionId]);

  return { files, content, writeFile };
}
```

---

## 10. HOW TEST EXECUTION SHOULD WORK

### Current Implementation (run-tests/route.ts)

```typescript
// 1. Validate input
const { code, language, testCases } = validationResult.data;

// 2. Call Modal sandbox
const executionResult = await executeInModalSandbox(code, language, testCases);

// 3. Record results
await Promise.all(testResults.map(result =>
  prisma.testResult.create({
    data: {
      sessionId: sessionRecording.id,
      testName: result.name,
      passed: result.passed,
      output: result.actualOutput,
      error: result.error,
      duration: result.duration,
    },
  })
));

// 4. Return to client
return NextResponse.json(response);
```

### Issues with Current Approach

1. **No Streaming:** Tests all run, then return. No progress updates.
2. **No Timeout Feedback:** If test hangs, user sees nothing for 30s.
3. **No Intermediate Results:** Can't see 5/10 tests passed yet.
4. **No Logs:** Only pass/fail, not stdout/stderr.

### Better Approach: SSE Streaming Test Results

**API:**
```typescript
// app/api/interview/[id]/run-tests/route.ts
export async function POST(request, { params: { id } }) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send test start
        controller.enqueue(
          encoder.encode(`event: start\ndata: ${JSON.stringify({
            totalTests: testCases.length,
          })}\n\n`)
        );

        // Execute each test and stream results
        for (const testCase of testCases) {
          const result = await executeTest(testCase);
          
          controller.enqueue(
            encoder.encode(`event: test_result\ndata: ${JSON.stringify({
              name: result.name,
              passed: result.passed,
              output: result.output,
              error: result.error,
              duration: result.duration,
            })}\n\n`)
          );
        }

        // Send completion
        const summary = calculateSummary(results);
        controller.enqueue(
          encoder.encode(`event: done\ndata: ${JSON.stringify(summary)}\n\n`)
        );

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({
            message: error.message,
          })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**Client:**
```typescript
function useRunTests(sessionId: string) {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [summary, setSummary] = useState(null);

  const runTests = useCallback(async (code: string, testCases: any[]) => {
    setIsRunning(true);
    setResults([]);

    try {
      const sse = new EventSource(
        `/api/interview/${sessionId}/run-tests?code=${encodeURIComponent(code)}`
      );

      sse.addEventListener('test_result', (e) => {
        const result = JSON.parse(e.data);
        setResults(prev => [...prev, result]);
      });

      sse.addEventListener('done', (e) => {
        const summary = JSON.parse(e.data);
        setSummary(summary);
        setIsRunning(false);
        sse.close();
      });

      sse.addEventListener('error', (e) => {
        const error = JSON.parse(e.data);
        setIsRunning(false);
        sse.close();
      });
    } catch (error) {
      setIsRunning(false);
    }
  }, [sessionId]);

  return { runTests, isRunning, results, summary };
}
```

**UI Updates Progressively:**
```
Running Tests... (0/5)
  ✓ Test: sum of two numbers (2ms)
  ✓ Test: negative numbers (1ms)
  ⏳ Test: large numbers (running...)

Results: 2/5 passed
```

---

## 11. ARCHITECTURE RECOMMENDATIONS

### Priority 1: Fix Critical Bugs (Do First)

#### 1.1 Fix AIChat SSE Event Format
**Impact:** High - chat is broken  
**Effort:** 15 min
**File:** `app/api/interview/[id]/chat/route.ts`

```diff
// Send content chunks
- controller.enqueue(encoder.encode(`data: ${JSON.stringify({...})}\n\n`));
+ controller.enqueue(encoder.encode(
+   `event: content\ndata: ${JSON.stringify({ delta: text })}\n\n`
+ ));

// Send token usage
+ controller.enqueue(encoder.encode(
+   `event: usage\ndata: ${JSON.stringify({...})}\n\n`
+ ));

// Send completion
+ controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
```

#### 1.2 Uncomment Production Auth Checks
**Impact:** High - security  
**Effort:** 5 min
**Files:** Multiple `route.ts` files

```diff
  const isDemoMode = id === "demo";
- if (!isDemoMode) {
+ if (!isDemoMode) { // Remove demo bypass for production
    const session = await getSession();
    if (!session?.user) {
```

### Priority 2: Core Integrations (MVP)

#### 2.1 Create Session Initialization Flow
**Impact:** High - enables real interview  
**Effort:** 4 hours
**Components:**
1. `/api/interview/[id]/init` - Create sandbox, load question
2. `useInterviewSession` hook - Manage session state
3. Update interview page to fetch real data

**Implementation:**
```typescript
// app/api/interview/[id]/init/route.ts
export async function POST(request, { params: { id } }) {
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: { assessment: { include: { questions: true } } },
  });

  // Create Modal sandbox
  const question = await getOrCreateCurrentQuestion(candidate);
  const sandbox = await createSandbox(id, {
    'solution.ts': question.starterCode,
    'test.ts': generateTestCode(question.testCases),
  });

  // Store sandbox reference
  await prisma.sessionRecording.update({
    where: { candidateId: id },
    data: {
      modalSandboxId: sandbox.id,
      status: 'ACTIVE',
      startTime: new Date(),
    },
  });

  // Return session data
  return NextResponse.json({
    question,
    fileSystem: await getFileSystem(id),
    sandbox: { id: sandbox.id },
  });
}
```

#### 2.2 Implement File Sync System
**Impact:** High - essential for real coding  
**Effort:** 6 hours
**Stages:**
1. Add `/api/interview/[id]/files` endpoints
2. Create `useFileSync` hook
3. Connect FileTree and CodeEditor to real files
4. Implement file change SSE

#### 2.3 Stream Test Results
**Impact:** Medium - UX improvement  
**Effort:** 3 hours
**Files:** `run-tests/route.ts`, `CodeEditor.tsx`

### Priority 3: Optimization & Polish

#### 3.1 Implement Proper State Management
**Effort:** 8 hours
**Approach:**
1. Create InterviewContext for session-wide state
2. Add useReducer for complex state transitions
3. Implement error boundaries
4. Add retry logic for failed API calls

**Don't:** Use external library yet (Redux/Zustand overkill for single page app)

#### 3.2 Optimize Real-Time Communication
**Effort:** 4 hours
**Changes:**
1. Replace Terminal HTTP polling with true SSE
2. Add WebSocket option for Terminal if low-latency needed
3. Batch events before sending to DB
4. Add message deduplication

#### 3.3 Session Persistence & Resume
**Effort:** 2 hours
**Features:**
1. Save current state to localStorage
2. Load on refresh
3. Sync with server on connection restore
4. Show "Session resumed" notification

### Priority 4: Analytics & Observability

#### 4.1 Add Structured Logging
```typescript
// lib/logger.ts
type InterviewEvent = 'session_start' | 'question_load' | 'test_run' | 'chat_message' | 'file_write';

function logInterviewEvent(sessionId: string, event: InterviewEvent, data: any) {
  console.log(`[${sessionId}] ${event}`, data);
  // Send to analytics backend in production
}
```

#### 4.2 Monitor API Health
```typescript
// app/api/health/route.ts - Expand with dependencies
export async function GET() {
  const checks = {
    database: await checkDatabase(),
    modal: await checkModalAPI(),
    claude: await checkClaudeAPI(),
  };
  
  return NextResponse.json({
    status: allPassed(checks) ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date(),
  });
}
```

---

## 12. COST EFFICIENCY RECOMMENDATIONS

### Minimize API Calls

**Current Waste:**
- Every keystroke recorded (sampling 10%, still excessive)
- Every file operation recorded immediately
- No batching of events

**Better:**
```typescript
// Batch events in 5-second intervals
const eventBatcher = {
  queue: [] as Event[],
  timer: null,

  add(event: Event) {
    this.queue.push(event);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 5000);
    }
  },

  async flush() {
    if (this.queue.length === 0) return;
    
    await fetch(`/api/interview/${sessionId}/events`, {
      method: 'POST',
      body: JSON.stringify({ events: this.queue }),
    });
    
    this.queue = [];
    this.timer = null;
  }
};

// Usage
codeEditor.onChange = (code) => {
  eventBatcher.add({ type: 'code_change', data: { code } });
};
```

**Savings:** 90% reduction in event API calls

### Optimize Modal Sandbox Usage

**Current:** Volumes kept forever (7-day retention)  
**Better:** Tiered storage

```typescript
// Daily: Keep live volume
// Weekly: Archive to S3 ($0.023/GB/month)
// Monthly: Delete unless needed

const RETENTION_POLICY = {
  LIVE: 7,      // days in Modal volume
  ARCHIVED: 90, // days in S3
  DELETED: 365, // days before purging
};

async function archiveOldSessions() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sessions = await prisma.sessionRecording.findMany({
    where: { endTime: { lt: cutoff } },
  });

  for (const session of sessions) {
    await snapshotVolume(session.candidateId);
    await deleteVolume(session.candidateId); // Free Modal quota
  }
}
```

**Savings:** 5x reduction in Modal storage costs

### Claude API Token Optimization

**Current:** Full context sent for every message  
**Better:** Selective context

```typescript
// Only send code if it changed since last message
const hasCodeChanged = hash(currentCode) !== lastMessageCodeHash;

const messages = [
  {
    role: 'user',
    content: userInput + (hasCodeChanged ? `\n\nCurrent code:\n${currentCode}` : ''),
  },
];

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-5',
  max_tokens: 2048,
  messages,
});
```

**Savings:** 30% reduction in input tokens

### Database Query Optimization

**Current Issues:**
- N+1 queries in event retrieval
- No pagination on large sessions
- No query caching

**Better:**
```typescript
// Use Prisma select to fetch only needed fields
const events = await prisma.sessionEvent.findMany({
  where: { sessionId },
  select: {
    id: true,
    type: true,
    timestamp: true,
    data: true,
  },
  take: 100,
  skip: offset,
  orderBy: { timestamp: 'desc' },
});

// Cache recent sessions (5 min TTL)
const cache = new Map<string, any>();
function getCachedSession(id: string) {
  const cached = cache.get(id);
  if (cached && Date.now() - cached.time < 5 * 60 * 1000) {
    return cached.data;
  }
  return null;
}
```

---

## 13. SIMPLICITY & MAINTAINABILITY

### Avoid Premature Complexity

**Don't Do:**
- Redux/Zustand state management (overkill for single page)
- Message queues (Redis/RabbitMQ) for event storage (Postgres sufficient)
- GraphQL (REST API simpler for this use case)
- Micro-services (keep monolith, split later if needed)

**Do Do:**
- Simple hooks for data fetching
- TypeScript for type safety
- Consistent error handling patterns
- Clear API contracts (OpenAPI schema optional)

### Naming & Structure Consistency

```
// ✓ Good
/api/interview/[id]/questions         GET (current question)
/api/interview/[id]/questions         POST (advance to next)
/api/interview/[id]/files             GET (list files)
/api/interview/[id]/files/[...path]   GET (read file)
/api/interview/[id]/files/[...path]   PUT (write file)
/api/interview/[id]/chat              POST (send message)
/api/interview/[id]/terminal          GET (SSE output stream)
/api/interview/[id]/terminal/input    POST (send input)
/api/interview/[id]/run-tests         POST (execute tests)
/api/interview/[id]/events            POST (record events)
/api/interview/[id]/events            GET (retrieve events)

// ✗ Avoid
/api/startInterview           (vague)
/api/getQuestion              (redundant in REST)
/api/submitCode               (HTTP verb implicit)
/api/v1/interviews/.../q...   (multiple versions)
```

---

## Summary & Next Steps

| Gap | Current | Fix | Effort | Impact |
|-----|---------|-----|--------|--------|
| AIChat SSE format | ✗ Broken | Change event types | 15 min | 🔴 High |
| FileTree sync | Static mock | Fetch from Modal | 6 hrs | 🔴 High |
| Test streaming | Batch return | SSE progress | 3 hrs | 🟡 Medium |
| Session init | Hardcoded | Create /init endpoint | 4 hrs | 🔴 High |
| Auth in prod | Disabled | Enable checks | 5 min | 🔴 High |
| State mgmt | Scattered | Context + hook | 8 hrs | 🟡 Medium |
| WebSocket for Terminal | SSE polling | Pure WS/SSE | 4 hrs | 🟡 Medium |
| Event batching | Per-keystroke | 5s batches | 2 hrs | 🟢 Low |

**Recommended Implementation Order:**
1. **Week 1:** Fix AIChat + uncomment auth + create session init
2. **Week 2:** Implement file sync + streaming tests
3. **Week 3:** State management + optimization
4. **Week 4:** Polish + analytics

