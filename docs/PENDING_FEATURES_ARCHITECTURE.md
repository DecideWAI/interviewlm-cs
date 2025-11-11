# Pending Features Architecture & Implementation Plan

**Document Version**: 1.0
**Date**: November 11, 2025
**Branch**: ux-design
**Status**: Ready for Implementation

---

## Executive Summary

### What's Complete ✅
- Assessment Management APIs (CRUD) with candidate invitation
- Email service integration (Resend)
- Dashboard statistics API
- Session recording infrastructure (events, snapshots, test results)
- Authentication (NextAuth with OAuth)
- Database schema (100% complete)
- Basic interview UI components

### What's Pending ⚠️
- **Core Interview Experience** (7 critical items blocking MVP)
- **Management & Analytics** (6 items needed for beta)
- **UX Polish** (9 items for production quality)
- **Performance Optimization** (5 items for scale)

### Implementation Timeline
- **Sprint 4** (1 week): Core interview experience fixes
- **Sprint 5** (1 week): Management & analytics integration
- **Sprint 6** (3 days): UX polish & performance optimization

**Total**: 17 days to production-ready

---

## Architecture Principles

### 1. Cost Efficiency
- ✅ Batch API calls (reduce 90% of event requests)
- ✅ Use SSE over WebSocket where appropriate (cheaper, simpler)
- ✅ Implement smart caching (reduce database queries by 70%)
- ✅ Tiered storage (Modal volumes → S3 archive → deletion)
- ✅ Optimize Claude API usage (selective context, token limits)

### 2. Simplicity First
- ✅ No Redux/Zustand (React Context sufficient for single-page state)
- ✅ No message queues (Postgres handles event storage)
- ✅ No GraphQL (REST API simpler for this use case)
- ✅ No microservices (monolith easier to maintain)

### 3. Quality Standards
- ✅ TypeScript strict mode everywhere
- ✅ Comprehensive error boundaries
- ✅ Loading states for all async operations
- ✅ Optimistic UI updates with rollback
- ✅ Real-time feedback (<100ms perceived latency)

---

## PRIORITY 1: Core Interview Experience (1 Week)

These features **block MVP launch**. Without them, interviews cannot function.

### 1.1 Session Initialization Flow ⚡ HIGH PRIORITY

**Problem**: Interview page loads hardcoded samples instead of real questions

**Current State**:
```typescript
// app/interview/[id]/page.tsx
const sampleFiles = [/* hardcoded */];
const sampleCode = "// hardcoded problem";
const [currentQuestionId] = useState("question-1"); // TODO: Get from API
```

**Solution**: Create initialization endpoint that prepares entire session

#### API Endpoint Design

**`POST /api/interview/[id]/initialize`**

```typescript
// Request: None (sessionId from params)
// Response:
{
  candidate: {
    id: string;
    name: string;
    assessment: { title, duration, enableAI, enableTerminal };
  };
  currentQuestion: {
    id: string;
    title: string;
    description: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    starterCode: Array<{ fileName: string; content: string }>;
    testCases: Array<{ name: string; hidden: boolean }>;
    timeLimit: number;
  };
  session: {
    startTime: DateTime;
    timeRemaining: number; // seconds
    status: "ACTIVE" | "PAUSED";
  };
  sandbox: {
    id: string;
    volumeId: string;
    status: "ready";
  };
  files: FileNode[]; // Current file structure
}
```

#### Implementation

**File**: `app/api/interview/[id]/initialize/route.ts`

```typescript
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  // 1. Authenticate and authorize
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Load candidate and assessment
  const candidate = await prisma.candidate.findUnique({
    where: { id: params.id },
    include: {
      assessment: { include: { questions: true } },
      sessionRecording: true,
      generatedQuestions: { orderBy: { order: 'asc' } }
    }
  });

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 3. Check if session already started (resume scenario)
  let sessionRecording = candidate.sessionRecording;
  if (sessionRecording?.status === 'ACTIVE') {
    // Resume existing session
    const timeElapsed = (Date.now() - sessionRecording.startTime.getTime()) / 1000;
    const timeRemaining = (candidate.assessment.duration * 60) - timeElapsed;

    return NextResponse.json({
      resumed: true,
      timeRemaining: Math.max(0, timeRemaining),
      // ... load existing state
    });
  }

  // 4. Get or generate current question
  let currentQuestion = candidate.generatedQuestions[0];
  if (!currentQuestion) {
    // Generate first question using assessment configuration
    currentQuestion = await generateQuestion(candidate.assessment);
  }

  // 5. Create Modal sandbox with starter files
  const sandbox = await createSandbox(params.id, {
    'solution.ts': currentQuestion.starterCode[0].content,
    'solution.test.ts': generateTestFile(currentQuestion.testCases),
    'package.json': DEFAULT_PACKAGE_JSON,
    'README.md': generateReadme(currentQuestion),
  });

  // 6. Create or update session recording
  sessionRecording = await prisma.sessionRecording.upsert({
    where: { candidateId: params.id },
    create: {
      candidateId: params.id,
      startTime: new Date(),
      status: 'ACTIVE',
    },
    update: {
      startTime: new Date(),
      status: 'ACTIVE',
    }
  });

  // 7. Update candidate status
  await prisma.candidate.update({
    where: { id: params.id },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      volumeId: sandbox.volumeId,
    }
  });

  // 8. Get file system structure
  const files = await getFileSystem(sandbox.volumeId);

  return NextResponse.json({
    candidate: {
      id: candidate.id,
      name: candidate.name,
      assessment: {
        title: candidate.assessment.title,
        duration: candidate.assessment.duration,
        enableAI: candidate.assessment.enableAI,
        enableTerminal: candidate.assessment.enableTerminal,
      },
    },
    currentQuestion: {
      id: currentQuestion.id,
      title: currentQuestion.title,
      description: currentQuestion.description,
      difficulty: currentQuestion.difficulty,
      starterCode: currentQuestion.starterCode,
      testCases: currentQuestion.testCases.map(tc => ({
        name: tc.name,
        hidden: tc.hidden,
      })),
      timeLimit: currentQuestion.estimatedTime,
    },
    session: {
      startTime: sessionRecording.startTime,
      timeRemaining: candidate.assessment.duration * 60,
      status: 'ACTIVE',
    },
    sandbox: {
      id: sandbox.id,
      volumeId: sandbox.volumeId,
      status: 'ready',
    },
    files,
  });
}
```

**Effort**: 4 hours
**Lines**: ~120 lines
**Cost Impact**: +1 Modal API call per session start (negligible)

---

### 1.2 File System Synchronization 🔄 HIGH PRIORITY

**Problem**: Files are hardcoded; no real-time sync with Modal sandbox

**Solution**: Create file CRUD APIs + optimistic UI updates with debouncing

#### API Endpoints

**`GET /api/interview/[id]/files`** - List all files
**`GET /api/interview/[id]/files/[...path]`** - Read file content
**`PUT /api/interview/[id]/files/[...path]`** - Write file content
**`POST /api/interview/[id]/files`** - Create new file
**`DELETE /api/interview/[id]/files/[...path]`** - Delete file

#### Implementation Strategy

**File**: `app/api/interview/[id]/files/route.ts`

```typescript
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: params.id },
    select: { volumeId: true }
  });

  if (!candidate?.volumeId) {
    return NextResponse.json({ error: "Session not initialized" }, { status: 400 });
  }

  // Get file structure from Modal volume
  const files = await getFileSystem(candidate.volumeId);

  return NextResponse.json({ files });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { path, content, type } = await request.json();

  // Validate path (security: must be within /workspace)
  if (!path.startsWith('/workspace/')) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: params.id },
    select: { volumeId: true }
  });

  // Create file in Modal volume
  if (type === 'file') {
    await writeFile(candidate.volumeId, path, content || '');
  } else {
    await createDirectory(candidate.volumeId, path);
  }

  // Record event
  await recordEvent(params.id, {
    type: 'file_created',
    data: { path, type }
  });

  return NextResponse.json({ success: true });
}
```

**File**: `app/api/interview/[id]/files/[...path]/route.ts`

```typescript
export async function GET(
  request: Request,
  { params }: { params: { id: string; path: string[] } }
) {
  const filePath = '/workspace/' + params.path.join('/');

  const candidate = await prisma.candidate.findUnique({
    where: { id: params.id },
    select: { volumeId: true }
  });

  const content = await readFile(candidate.volumeId, filePath);

  return new NextResponse(content, {
    headers: { 'Content-Type': 'text/plain' }
  });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string; path: string[] } }
) {
  const filePath = '/workspace/' + params.path.join('/');
  const content = await request.text();

  const candidate = await prisma.candidate.findUnique({
    where: { id: params.id },
    select: { volumeId: true }
  });

  await writeFile(candidate.volumeId, filePath, content);

  // Don't record every write (batched in client)

  return NextResponse.json({ success: true });
}
```

#### Client-Side Hook

**File**: `hooks/useFileSync.ts`

```typescript
export function useFileSync(sessionId: string) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const writeQueue = useRef<Record<string, NodeJS.Timeout>>({});

  // Load initial file tree
  useEffect(() => {
    async function loadFiles() {
      const response = await fetch(`/api/interview/${sessionId}/files`);
      const data = await response.json();
      setFiles(data.files);
      setLoading(false);
    }
    loadFiles();
  }, [sessionId]);

  // Read file content
  const readFile = useCallback(async (path: string) => {
    // Check cache first
    if (content[path]) return content[path];

    const response = await fetch(`/api/interview/${sessionId}/files/${path}`);
    const text = await response.text();
    setContent(prev => ({ ...prev, [path]: text }));
    return text;
  }, [sessionId, content]);

  // Write file content (debounced)
  const writeFile = useCallback((path: string, newContent: string) => {
    // Optimistic update
    setContent(prev => ({ ...prev, [path]: newContent }));

    // Debounce API call (500ms)
    clearTimeout(writeQueue.current[path]);
    writeQueue.current[path] = setTimeout(async () => {
      try {
        await fetch(`/api/interview/${sessionId}/files/${path}`, {
          method: 'PUT',
          body: newContent,
        });
      } catch (error) {
        console.error('Failed to sync file:', error);
        // TODO: Show error toast, allow retry
      }
    }, 500);
  }, [sessionId]);

  // Create file
  const createFile = useCallback(async (path: string, type: 'file' | 'folder') => {
    await fetch(`/api/interview/${sessionId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type, content: '' }),
    });

    // Refresh file tree
    const response = await fetch(`/api/interview/${sessionId}/files`);
    const data = await response.json();
    setFiles(data.files);
  }, [sessionId]);

  return {
    files,
    content,
    loading,
    readFile,
    writeFile,
    createFile,
  };
}
```

**Effort**: 6 hours
**Lines**: ~250 lines (APIs + hook)
**Cost Impact**: Reduced by 90% vs per-keystroke sync (debouncing)

---

### 1.3 Fix AIChat SSE Event Format 🐛 CRITICAL BUG

**Problem**: Server sends generic SSE events; client expects custom event types

**Current Server Code** (BROKEN):
```typescript
const data = JSON.stringify({ type: "chunk", text });
controller.enqueue(encoder.encode(`data: ${data}\n\n`));
```

**Client Expects**:
```typescript
eventSource.addEventListener("content", (event) => {
  const { delta } = JSON.parse(event.data);
  // ...
});
```

**Fix**: Change server to send custom event types

**File**: `app/api/interview/[id]/chat/route.ts` (line ~120-180)

```typescript
// BEFORE (Generic SSE)
controller.enqueue(
  encoder.encode(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`)
);

// AFTER (Custom events)
controller.enqueue(
  encoder.encode(`event: content\ndata: ${JSON.stringify({ delta: text })}\n\n`)
);

// For token usage
controller.enqueue(
  encoder.encode(`event: usage\ndata: ${JSON.stringify({
    inputTokens: event.usage.input_tokens,
    outputTokens: event.usage.output_tokens
  })}\n\n`)
);

// For completion
controller.enqueue(
  encoder.encode(`event: done\ndata: {}\n\n`)
);
```

**Effort**: 15 minutes
**Lines**: 10 lines changed
**Cost Impact**: None (bug fix)

---

### 1.4 Interview Submission Flow 🏁 HIGH PRIORITY

**Problem**: No way to submit assessment; candidate can't finish

**Solution**: Create submit endpoint with final scoring

#### API Endpoint

**`POST /api/interview/[id]/submit`**

```typescript
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  // 1. Load candidate and session
  const candidate = await prisma.candidate.findUnique({
    where: { id: params.id },
    include: {
      sessionRecording: {
        include: {
          testResults: true,
          claudeInteractions: true,
          codeSnapshots: true,
        }
      },
      generatedQuestions: true,
    }
  });

  // 2. Take final code snapshot
  const { files } = await request.json();
  await Promise.all(
    files.map(file =>
      prisma.codeSnapshot.create({
        data: {
          sessionId: candidate.sessionRecording.id,
          fileId: file.path,
          fileName: file.name,
          language: file.language,
          contentHash: hashContent(file.content),
          fullContent: file.content,
          timestamp: new Date(),
        }
      })
    )
  );

  // 3. Run final test suite
  const testResults = await runFinalTests(candidate.volumeId, files);

  // 4. Calculate scores
  const scores = calculateScores({
    testResults: candidate.sessionRecording.testResults,
    claudeInteractions: candidate.sessionRecording.claudeInteractions,
    codeSnapshots: candidate.sessionRecording.codeSnapshots,
    timeSpent: Date.now() - candidate.startedAt.getTime(),
  });

  // 5. Archive Modal volume to S3 (async, non-blocking)
  snapshotVolume(candidate.volumeId, params.id).catch(console.error);

  // 6. Update candidate and session
  await prisma.$transaction([
    prisma.candidate.update({
      where: { id: params.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        overallScore: scores.overall,
        codingScore: scores.coding,
        communicationScore: scores.communication,
        problemSolvingScore: scores.problemSolving,
      }
    }),
    prisma.sessionRecording.update({
      where: { candidateId: params.id },
      data: {
        status: 'COMPLETED',
        endTime: new Date(),
        duration: Math.floor((Date.now() - candidate.startedAt.getTime()) / 1000),
      }
    })
  ]);

  // 7. Send completion email to candidate and interviewer
  await sendCompletionEmail(candidate);
  await sendInterviewerNotification(candidate.createdById, candidate);

  return NextResponse.json({
    success: true,
    scores,
    message: "Assessment submitted successfully"
  });
}
```

**Effort**: 3 hours
**Lines**: ~80 lines
**Cost Impact**: +1 S3 upload per submission (~$0.001)

---

### 1.5 Test Result Streaming 🧪 MEDIUM PRIORITY

**Problem**: Tests run silently; no progress feedback during execution

**Solution**: Stream test results as they complete (SSE)

**File**: `app/api/interview/[id]/run-tests/route.ts`

```typescript
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { code, questionId } = await request.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Get test cases
        const question = await prisma.generatedQuestion.findUnique({
          where: { id: questionId }
        });

        const testCases = question.testCases as any[];

        // Send start event
        controller.enqueue(
          encoder.encode(`event: start\ndata: ${JSON.stringify({
            total: testCases.length
          })}\n\n`)
        );

        // Execute each test and stream result
        const results = [];
        for (let i = 0; i < testCases.length; i++) {
          const testCase = testCases[i];

          // Execute test
          const result = await executeTest(code, testCase);
          results.push(result);

          // Stream result
          controller.enqueue(
            encoder.encode(`event: test_result\ndata: ${JSON.stringify({
              index: i,
              name: result.name,
              passed: result.passed,
              output: result.output,
              error: result.error,
              duration: result.duration,
            })}\n\n`)
          );
        }

        // Calculate summary
        const passed = results.filter(r => r.passed).length;
        const summary = {
          total: testCases.length,
          passed,
          failed: testCases.length - passed,
          passRate: (passed / testCases.length) * 100,
        };

        // Send done event
        controller.enqueue(
          encoder.encode(`event: done\ndata: ${JSON.stringify(summary)}\n\n`)
        );

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({
            message: error.message
          })}\n\n`)
        );
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

**Client Update** (`components/interview/CodeEditor.tsx`):

```typescript
const runTests = useCallback(async () => {
  setIsRunning(true);
  setTestResults([]);

  const eventSource = new EventSource(
    `/api/interview/${sessionId}/run-tests?code=${encodeURIComponent(code)}&questionId=${questionId}`
  );

  eventSource.addEventListener('start', (e) => {
    const { total } = JSON.parse(e.data);
    setTotalTests(total);
  });

  eventSource.addEventListener('test_result', (e) => {
    const result = JSON.parse(e.data);
    setTestResults(prev => [...prev, result]);
  });

  eventSource.addEventListener('done', (e) => {
    const summary = JSON.parse(e.data);
    setSummary(summary);
    setIsRunning(false);
    eventSource.close();
  });

  eventSource.addEventListener('error', (e) => {
    console.error('Test execution failed:', e);
    setIsRunning(false);
    eventSource.close();
  });
}, [sessionId, code, questionId]);
```

**Effort**: 3 hours
**Lines**: ~100 lines
**Cost Impact**: None (better UX, same execution)

---

### 1.6 Real-Time Timer Countdown ⏱️ MEDIUM PRIORITY

**Problem**: Timer shows static time; doesn't count down

**Solution**: Client-side countdown with server sync on reconnect

**File**: `app/interview/[id]/page.tsx`

```typescript
function InterviewPage({ params }: { params: { id: string } }) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isTimerPaused, setIsTimerPaused] = useState(false);

  // Load initial time from initialization
  useEffect(() => {
    async function init() {
      const response = await fetch(`/api/interview/${params.id}/initialize`, {
        method: 'POST'
      });
      const data = await response.json();

      setTimeRemaining(data.session.timeRemaining);
      setIsTimerPaused(data.session.status === 'PAUSED');
    }
    init();
  }, [params.id]);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining === null || isTimerPaused) return;

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev === null || prev <= 0) {
          clearInterval(interval);
          handleTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining, isTimerPaused]);

  // Sync time on visibility change (tab switch, resume)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        // Sync time with server
        const response = await fetch(`/api/interview/${params.id}/status`);
        const data = await response.json();
        setTimeRemaining(data.timeRemaining);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [params.id]);

  const handleTimeExpired = async () => {
    // Auto-submit when time runs out
    await fetch(`/api/interview/${params.id}/submit`, { method: 'POST' });
    router.push(`/interview/${params.id}/expired`);
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      {/* Timer Display */}
      <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded">
        {timeRemaining !== null ? formatTime(timeRemaining) : '--:--:--'}
      </div>

      {/* Show warning at 10 minutes */}
      {timeRemaining !== null && timeRemaining <= 600 && timeRemaining > 0 && (
        <div className="fixed top-16 right-4 bg-yellow-500 text-black px-4 py-2 rounded">
          ⚠️ {Math.floor(timeRemaining / 60)} minutes remaining!
        </div>
      )}

      {/* Rest of interview UI */}
    </div>
  );
}
```

**Effort**: 2 hours
**Lines**: ~60 lines
**Cost Impact**: None

---

### 1.7 Modal Sandbox Real Integration 🖥️ HIGH PRIORITY

**Problem**: Terminal shows "connected" but commands don't execute

**Solution**: Use Modal's WebSocket terminal connection

**Current State**: Terminal uses SSE polling with in-memory queue (demo mode)

**Target State**: Direct WebSocket connection to Modal sandbox terminal

**Implementation**:

**File**: `lib/services/modal.ts` (Update existing service)

```typescript
export async function createTerminalConnection(volumeId: string): Promise<string> {
  const response = await modalClient.get(`/volumes/${volumeId}/terminal/ws`);
  return response.data.wsUrl; // wss://modal.com/terminal/abc123
}
```

**File**: `components/interview/Terminal.tsx` (Update)

```typescript
useEffect(() => {
  let ws: WebSocket | null = null;

  async function connectTerminal() {
    try {
      // Get WebSocket URL from backend
      const response = await fetch(`/api/interview/${sessionId}/terminal/ws`);
      const { wsUrl } = await response.json();

      // Connect to Modal WebSocket
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        terminal.write('\x1b[32m✓ Connected to Modal sandbox\x1b[0m\r\n');
        terminal.write('$ ');
      };

      ws.onmessage = (event) => {
        // Write output directly to terminal
        terminal.write(event.data);
      };

      ws.onerror = (error) => {
        terminal.write('\x1b[31m✗ Connection error\x1b[0m\r\n');
      };

      ws.onclose = () => {
        terminal.write('\x1b[33m○ Disconnected\x1b[0m\r\n');
        // Auto-reconnect after 2 seconds
        setTimeout(connectTerminal, 2000);
      };
    } catch (error) {
      console.error('Failed to connect terminal:', error);
    }
  }

  connectTerminal();

  // Send terminal input via WebSocket
  const disposable = terminal.onData((data) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));

      // Record command if it's Enter
      if (data === '\r') {
        recordEvent(sessionId, {
          type: 'terminal_command',
          data: { command: currentCommand }
        });
      }
    }
  });

  return () => {
    ws?.close();
    disposable.dispose();
  };
}, [sessionId]);
```

**Effort**: 4 hours
**Lines**: ~50 lines
**Cost Impact**: Modal WebSocket usage included in sandbox pricing

---

## PRIORITY 2: Management & Analytics (1 Week)

### 2.1 Connect Dashboard to Real Data

**Problem**: Dashboard shows mock KPIs and candidates

**Solution**: Replace mock data with API calls

**File**: `app/dashboard/page.tsx`

```typescript
// BEFORE
import { MOCK_DASHBOARD_KPIS, MOCK_CANDIDATES } from '@/lib/mock-analytics-data';
const kpis = MOCK_DASHBOARD_KPIS;

// AFTER
const [kpis, setKpis] = useState(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  async function loadDashboard() {
    const response = await fetch('/api/dashboard/stats');
    const data = await response.json();
    setKpis(data.kpis);
    setCandidates(data.recentCandidates);
    setPipeline(data.pipeline);
    setLoading(false);
  }
  loadDashboard();
}, []);

if (loading) return <DashboardSkeleton />;
```

**API Already Exists**: `/api/dashboard/stats` ✅

**Effort**: 2 hours
**Lines**: ~30 lines changed

---

### 2.2 Candidate Comparison Page

**Problem**: No side-by-side candidate comparison

**Solution**: Create comparison page with radar charts

**File**: `app/candidates/compare/page.tsx`

```typescript
export default function CandidateComparePage({
  searchParams
}: {
  searchParams: { ids: string }
}) {
  const candidateIds = searchParams.ids.split(',');
  const [candidates, setCandidates] = useState([]);

  useEffect(() => {
    async function loadCandidates() {
      const response = await fetch(`/api/candidates/compare?ids=${candidateIds.join(',')}`);
      const data = await response.json();
      setCandidates(data.candidates);
    }
    loadCandidates();
  }, [candidateIds]);

  return (
    <div className="grid grid-cols-2 gap-8">
      {candidates.map(candidate => (
        <CandidateComparisonCard key={candidate.id} candidate={candidate} />
      ))}
    </div>
  );
}
```

**API Endpoint**: `GET /api/candidates/compare?ids=id1,id2,id3`

```typescript
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ids = url.searchParams.get('ids')?.split(',') || [];

  const candidates = await prisma.candidate.findMany({
    where: { id: { in: ids } },
    include: {
      sessionRecording: {
        include: {
          testResults: true,
          claudeInteractions: true,
          codeSnapshots: { orderBy: { timestamp: 'desc' }, take: 1 }
        }
      }
    }
  });

  // Calculate comparison metrics
  const comparison = candidates.map(c => ({
    id: c.id,
    name: c.name,
    overallScore: c.overallScore,
    scores: {
      coding: c.codingScore,
      communication: c.communicationScore,
      problemSolving: c.problemSolvingScore,
    },
    testPassRate: calculateTestPassRate(c.sessionRecording.testResults),
    aiUsage: calculateAIUsage(c.sessionRecording.claudeInteractions),
    codeQuality: analyzeCodeQuality(c.sessionRecording.codeSnapshots[0]),
  }));

  return NextResponse.json({ candidates: comparison });
}
```

**Effort**: 4 hours
**Lines**: ~150 lines

---

### 2.3 Session Replay Viewer Integration

**Problem**: SessionReplayViewer component exists but not connected

**Solution**: Create replay page and connect to events API

**File**: `app/dashboard/sessions/[id]/page.tsx` (already created in Sprint 3)

Just need to connect to existing API:

```typescript
// API already exists: GET /api/sessions/[id]
const [session, setSession] = useState(null);

useEffect(() => {
  async function loadSession() {
    const response = await fetch(`/api/sessions/${params.id}`);
    const data = await response.json();
    setSession(data);
  }
  loadSession();
}, [params.id]);
```

**Effort**: 1 hour
**Lines**: ~20 lines

---

### 2.4 Organization/Team Management UI

**Problem**: No UI for managing teams and members

**Solution**: Create organization settings page

**File**: `app/settings/organization/page.tsx`

```typescript
export default function OrganizationSettingsPage() {
  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);

  return (
    <div className="space-y-8">
      {/* Organization Details */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form>
            <Input label="Organization Name" value={org?.name} />
            <Input label="Slug" value={org?.slug} />
            <Select label="Plan" value={org?.plan} />
          </Form>
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <Button onClick={() => setShowInviteDialog(true)}>
            Invite Member
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map(member => (
                <TableRow key={member.id}>
                  <TableCell>{member.user.name}</TableCell>
                  <TableCell>{member.user.email}</TableCell>
                  <TableCell>
                    <Badge>{member.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

**API Endpoints**:
- `GET /api/organization/members`
- `POST /api/organization/members` (invite)
- `PATCH /api/organization/members/[id]` (update role)
- `DELETE /api/organization/members/[id]` (remove)

**Effort**: 6 hours
**Lines**: ~200 lines

---

### 2.5 Question Bank Management

**Problem**: No UI for creating and managing problem seeds

**Solution**: Create problem seeds page

**File**: `app/problems/page.tsx`

```typescript
export default function ProblemSeedsPage() {
  const [problems, setProblems] = useState([]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Problem Seeds</h1>
        <Button onClick={() => router.push('/problems/new')}>
          Create Problem
        </Button>
      </div>

      <div className="grid gap-4">
        {problems.map(problem => (
          <Card key={problem.id}>
            <CardHeader>
              <CardTitle>{problem.title}</CardTitle>
              <div className="flex gap-2">
                <Badge>{problem.difficulty}</Badge>
                <Badge variant="outline">{problem.category}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">{problem.description.slice(0, 150)}...</p>
              <div className="flex gap-2 mt-4">
                {problem.tags.map(tag => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="ghost" onClick={() => router.push(`/problems/${problem.id}/edit`)}>
                Edit
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**File**: `app/problems/new/page.tsx`

```typescript
export default function NewProblemPage() {
  return (
    <Form>
      <Input label="Title" required />
      <Textarea label="Description" required />
      <Select label="Difficulty" options={['EASY', 'MEDIUM', 'HARD']} />
      <Input label="Category" />
      <TagInput label="Tags" />
      <CodeEditor label="Starter Code" />
      <CodeEditor label="Test Code" />
      <Select label="Language" />
      <Button type="submit">Create Problem</Button>
    </Form>
  );
}
```

**API Endpoints**:
- `GET /api/problems` - List problems
- `POST /api/problems` - Create problem
- `GET /api/problems/[id]` - Get problem
- `PATCH /api/problems/[id]` - Update problem
- `DELETE /api/problems/[id]` - Delete problem

**Effort**: 8 hours
**Lines**: ~300 lines

---

## PRIORITY 3: UX Polish (3 Days)

### 3.1 Confirmation Before Leaving

**Implementation**:

```typescript
// app/interview/[id]/page.tsx
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = 'You have an interview in progress. Are you sure you want to leave?';
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, []);
```

**Effort**: 15 minutes

---

### 3.2 Keyboard Shortcuts

```typescript
// components/interview/KeyboardShortcuts.tsx
export function useKeyboardShortcuts(handlers: {
  onSave: () => void;
  onRunTests: () => void;
  onToggleChat: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S or Cmd+S - Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handlers.onSave();
      }

      // Ctrl+Enter - Run tests
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handlers.onRunTests();
      }

      // Ctrl+/ - Toggle AI chat
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        handlers.onToggleChat();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
```

**Effort**: 1 hour

---

### 3.3 Loading States & Skeletons

```typescript
// components/ui/Skeleton.tsx
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 bg-gray-200 animate-pulse rounded" />
        ))}
      </div>
      <div className="h-64 bg-gray-200 animate-pulse rounded" />
    </div>
  );
}
```

**Effort**: 2 hours for all pages

---

### 3.4 Error Boundaries

```typescript
// components/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Send to analytics/logging service
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
          <p className="text-gray-600 mb-4">{this.state.error?.message}</p>
          <Button onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Effort**: 1 hour

---

## PRIORITY 4: Performance Optimization

### 4.1 Event Batching

**Problem**: Every keystroke sends API request

**Solution**: Batch events every 5 seconds

```typescript
// lib/eventBatcher.ts
class EventBatcher {
  private queue: Event[] = [];
  private timer: NodeJS.Timeout | null = null;
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  add(event: Event) {
    this.queue.push(event);

    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 5000);
    }

    // Flush if queue gets too large
    if (this.queue.length >= 50) {
      this.flush();
    }
  }

  async flush() {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];
    this.timer = null;

    try {
      await fetch(`/api/interview/${this.sessionId}/events/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events })
      });
    } catch (error) {
      console.error('Failed to flush events:', error);
      // Re-queue failed events
      this.queue.unshift(...events);
    }
  }

  // Flush on unmount
  destroy() {
    this.flush();
  }
}
```

**API**: `POST /api/interview/[id]/events/batch`

```typescript
export async function POST(request: Request, { params }) {
  const { events } = await request.json();

  // Batch insert
  await prisma.sessionEvent.createMany({
    data: events.map(e => ({
      sessionId: params.id,
      type: e.type,
      timestamp: new Date(e.timestamp),
      data: e.data,
    }))
  });

  return NextResponse.json({ success: true });
}
```

**Cost Impact**: 90% reduction in API calls

**Effort**: 2 hours

---

### 4.2 Caching Strategy

```typescript
// lib/cache.ts
class SimpleCache<T> {
  private cache = new Map<string, { data: T; timestamp: number }>();
  private ttl: number;

  constructor(ttl: number = 5000) {
    this.ttl = ttl;
  }

  get(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  set(key: string, data: T) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear() {
    this.cache.clear();
  }
}

// Usage
const fileCache = new SimpleCache<string>(5000); // 5s TTL

async function readFile(path: string) {
  const cached = fileCache.get(path);
  if (cached) return cached;

  const content = await fetch(`/api/interview/${sessionId}/files/${path}`);
  const text = await content.text();
  fileCache.set(path, text);

  return text;
}
```

**Cost Impact**: 70% reduction in file read API calls

**Effort**: 1 hour

---

## Cost Analysis & Optimization

### Current Costs (Per Interview)

| Service | Usage | Cost |
|---------|-------|------|
| Modal Sandbox | 90 min average | $0.50 |
| Claude API | ~50 messages, 100K tokens | $0.30 |
| PostgreSQL | 1000 writes, 100 reads | $0.01 |
| S3 Storage | 5MB session archive | $0.001 |
| **Total per interview** | | **$0.81** |

### With Optimizations

| Optimization | Savings |
|--------------|---------|
| Event batching (90% fewer DB writes) | -$0.009 |
| File caching (70% fewer reads) | -$0.003 |
| Tiered storage (7-day volume → S3) | -$0.05 |
| Selective Claude context | -$0.09 |
| **Total per interview** | **$0.66** (-18%) |

### At Scale (1000 interviews/month)

- **Before optimizations**: $810/month
- **After optimizations**: $660/month
- **Savings**: $150/month ($1,800/year)

---

## Implementation Timeline

### Week 1: Core Interview Experience
- **Day 1**: Fix AIChat bug + Session initialization
- **Day 2**: File system sync APIs + hook
- **Day 3**: Connect FileTree + CodeEditor to APIs
- **Day 4**: Test streaming + Modal terminal integration
- **Day 5**: Interview submission + timer countdown

### Week 2: Management & Analytics
- **Day 1**: Connect dashboard to real data
- **Day 2**: Candidate comparison page
- **Day 3**: Organization/team management
- **Day 4-5**: Question bank management

### Week 3: Polish & Optimization
- **Day 1**: UX polish (keyboard shortcuts, loading states, error boundaries)
- **Day 2**: Performance optimization (batching, caching)
- **Day 3**: Testing and bug fixes

---

## Testing Strategy

### Unit Tests
- [ ] File sync hook
- [ ] Event batcher
- [ ] Cache implementation
- [ ] Scoring calculations

### Integration Tests
- [ ] Session initialization flow
- [ ] File CRUD operations
- [ ] Test streaming
- [ ] Chat streaming
- [ ] Submission flow

### E2E Tests (Playwright)
- [ ] Complete interview flow (start → code → test → submit)
- [ ] Session resume after disconnect
- [ ] Timer expiration
- [ ] File operations

### Load Testing
- [ ] 100 concurrent interview sessions
- [ ] Dashboard with 10,000 candidates
- [ ] File sync under load

---

## Success Metrics

### Performance Targets
- ✅ Session initialization: <2s
- ✅ File read latency: <100ms
- ✅ Test streaming: First result <3s
- ✅ Chat response: First token <500ms
- ✅ Event batching: 90% fewer API calls

### Quality Targets
- ✅ Zero critical bugs
- ✅ 80%+ test coverage
- ✅ Error rate <0.1%
- ✅ Uptime >99.9%

### User Experience
- ✅ All loading states implemented
- ✅ Error messages clear and actionable
- ✅ No data loss on disconnect
- ✅ Smooth animations (<16ms frame time)

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] No console errors
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Auth checks enabled
- [ ] Demo mode removed

### Staging
- [ ] Deploy to staging
- [ ] Full E2E test
- [ ] Load testing
- [ ] Monitor error logs

### Production
- [ ] Database backup
- [ ] Deploy during low traffic
- [ ] Monitor error rate
- [ ] Monitor performance metrics
- [ ] Rollback plan ready

---

## Next Steps

1. **Get approval** on this architecture
2. **Create feature branches** for each priority
3. **Start with Priority 1** (blocks MVP)
4. **Daily standups** to track progress
5. **Code reviews** before merging
6. **Deploy to staging** after each priority
7. **Production deploy** after Sprint 6

---

## Questions for Stakeholders

1. **Modal Integration**: Do we have Modal API credentials ready?
2. **Email Service**: Is Resend account configured in production?
3. **S3 Storage**: Which AWS account/bucket for session archives?
4. **Timeline**: Can we commit to 3 weeks or need faster?
5. **Testing**: Should we write E2E tests or rely on manual QA?

---

**Document Status**: ✅ Ready for Review
**Next Action**: Get approval and start implementation
**Owner**: Development Team
**Reviewed By**: [Pending]
