# Component Reference Guide

Quick developer reference for all frontend components and their integration status.

## Interview Experience Components

### CodeEditor.tsx
**Location**: `/components/interview/CodeEditor.tsx`

**Props**:
```typescript
{
  sessionId: string;           // Interview session ID
  questionId: string;          // Problem/question ID
  value: string;              // Current code content
  onChange: (value: string) => void;
  language: "javascript" | "typescript" | "python" | "go";
  fileName?: string;          // Current file name
  readOnly?: boolean;         // Disable editing
  height?: string;            // CSS height
  showTestButton?: boolean;   // Show Run Tests button
}
```

**API Calls Made**:
- `POST /api/interview/${sessionId}/events` - Records code changes (debounced 3s)
- `POST /api/interview/${sessionId}/events` - Creates snapshots every 30s
- `POST /api/interview/${sessionId}/run-tests` - Runs tests on code

**Status**: 85% - Works well, needs test output parsing

**Example Usage**:
```typescript
<CodeEditor
  sessionId={sessionId}
  questionId="problem-123"
  value={code}
  onChange={setCode}
  language="typescript"
  fileName="solution.ts"
  showTestButton={true}
/>
```

---

### Terminal.tsx
**Location**: `/components/interview/Terminal.tsx`

**Props**:
```typescript
{
  sessionId: string;          // Interview session ID
  onCommand?: (command: string) => void;
  className?: string;
}
```

**API Calls Made**:
- `GET /api/interview/${sessionId}/terminal` - SSE stream for output
- `POST /api/interview/${sessionId}/terminal/input` - Send command
- `POST /api/interview/${sessionId}/events` - Log terminal commands

**Exposed Methods** (via ref):
```typescript
interface TerminalHandle {
  write: (data: string) => void;
  writeln: (data: string) => void;
  connectionStatus: "connected" | "disconnected" | "connecting";
}
```

**Status**: 95% - Feature complete, needs Modal sandbox backend

**Example Usage**:
```typescript
const terminalRef = useRef<TerminalHandle>(null);

<Terminal
  sessionId={sessionId}
  onCommand={(cmd) => console.log("Command:", cmd)}
  ref={terminalRef}
/>

// Later: terminalRef.current?.writeln("Hello");
```

**Note**: Dynamically imported with `{ ssr: false }`

---

### AIChat.tsx
**Location**: `/components/interview/AIChat.tsx`

**Props**:
```typescript
{
  sessionId: string;          // Interview session ID
  className?: string;
}
```

**API Calls Made**:
- `GET /api/interview/${sessionId}/chat/history` - Load previous messages
- `GET /api/interview/${sessionId}/chat?message=...` - Stream response via SSE
- `POST /api/interview/${sessionId}/events` - Log all messages

**Message Type**:
```typescript
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
```

**Status**: 90% - Feature complete, needs history endpoint

**Features**:
- Message history
- Real-time streaming
- Copy to clipboard
- Token usage tracking
- Connection status indicator
- Keyboard shortcuts (Enter, Shift+Enter)

---

### FileTree.tsx
**Location**: `/components/interview/FileTree.tsx`

**Props**:
```typescript
{
  sessionId: string;
  files: FileNode[];
  selectedFile?: string;              // Current file path
  onFileSelect: (file: FileNode) => void;
  onFileCreate?: (path: string, type: "file" | "folder") => void;
  onFileDelete?: (path: string) => void;
  className?: string;
}

interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  path: string;
}
```

**API Calls Made**:
- `POST /api/interview/${sessionId}/events` - Logs file opens/creates/deletes

**Status**: 80% - Works, needs real file system sync

**Example Usage**:
```typescript
const files: FileNode[] = [
  {
    id: "1",
    name: "src",
    type: "folder",
    path: "src",
    children: [
      { id: "2", name: "index.ts", type: "file", path: "src/index.ts" },
    ],
  },
];

<FileTree
  sessionId={sessionId}
  files={files}
  selectedFile={selectedFile?.path}
  onFileSelect={handleFileSelect}
/>
```

---

## Page Components

### app/interview/[id]/page.tsx
**Status**: 70% - Core functionality works, needs problem loading

**What's Implemented**:
- Three-panel layout (FileTree, Editor+Terminal, AIChat)
- All components render and communicate
- Event recording works

**What's Missing**:
```typescript
// Line 98: TODO - Get from API
const currentQuestionId = "question-1"; // HARDCODED

// Line 110: TODO - Load file content here
const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);

// Line 116: TODO - Send to backend/Modal sandbox
const handleTerminalCommand = (command: string) => {
  console.log("Command:", command); // JUST LOGS
};
```

**Needs**:
- [ ] `GET /api/interview/[id]/questions` - Fetch problem details
- [ ] Load actual test cases for problem
- [ ] Implement timer countdown
- [ ] Implement submit button

---

### app/interview/demo/page.tsx
**Status**: 70% - Demo mode, hardcoded data

**Purpose**: Show the interview experience without authentication

**Mock Data Included**:
- Demo problem (Longest Palindrome)
- Demo files (solution.ts, solution.test.ts, README.md)
- Demo code content

**What Works**:
- UI/UX renders perfectly
- All components display
- Events are still recorded

**What Doesn't Work**:
- Terminal doesn't execute
- Tests don't run
- No backend integration

---

### app/dashboard/page.tsx
**Status**: 30% - UI only, all mock data

**Mock Data Used**:
```typescript
import {
  MOCK_DASHBOARD_KPIS,      // Key metrics
  MOCK_PIPELINE_FUNNEL,     // Conversion funnel
  MOCK_PRIORITY_ACTIONS,    // Action items
  MOCK_CANDIDATES,          // Candidate list
} from "@/lib/mock-analytics-data";
```

**Components Rendered**:
- KPI cards (4x primary, 4x secondary)
- Quick insight cards (Pipeline Health, Active Candidates, Top Performers)
- Pipeline funnel chart
- Priority actions panel
- Recent candidates table

**Needs Backend**:
- [ ] `GET /api/dashboard/kpis`
- [ ] `GET /api/dashboard/pipeline`
- [ ] `GET /api/dashboard/actions`
- [ ] Real-time updates

---

### app/assessments/page.tsx
**Status**: 20% - Table UI only, hardcoded data

**Hardcoded Assessments** (lines 227-278):
```typescript
const assessments = [
  {
    id: "1",
    title: "Frontend Engineer - React",
    status: "active",
    problems: ["Build Todo App", "Fix React Bugs", "Optimize Performance"],
    candidates: { total: 8, completed: 5 },
    duration: 90,
    created: "Jan 15, 2025",
    completionRate: 65,
  },
  // 4 more...
];
```

**Features Needing Backend**:
- [ ] Search filtering
- [ ] Status filtering
- [ ] Tab switching
- [ ] View/Edit/Delete actions

**API Needed**:
- [ ] `GET /api/assessments` - List with filters
- [ ] `GET /api/assessments/[id]` - Detail view
- [ ] `PUT /api/assessments/[id]` - Edit
- [ ] `DELETE /api/assessments/[id]` - Delete

---

### app/assessments/new/page.tsx
**Status**: 50% - Form renders, save not implemented

**Current Save Logic**:
```typescript
const handleComplete = async (config: AssessmentConfig) => {
  setIsSaving(true);
  try {
    console.log("Saving assessment:", config);
    
    // FAKE - Simulates 1 second delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    router.push("/assessments");
  }
};
```

**Needs**:
```typescript
// Replace with actual API call:
const response = await fetch("/api/assessments", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(config),
});

if (!response.ok) {
  toast.error("Failed to create assessment");
  return;
}

const { id } = await response.json();
router.push(`/assessments/${id}`);
```

---

### app/candidates/page.tsx
**Status**: 30% - UI complete, data is mock

**Mock Data Used**:
```typescript
import { MOCK_CANDIDATES } from "@/lib/mock-analytics-data";
const candidates = MOCK_CANDIDATES; // Line 34: TODO: Fetch from API
```

**Smart Stats Calculated**:
- `needsAttentionCount` - Completed but not reviewed
- `highPerformersCount` - Score >= 80
- `stuckCandidatesCount` - Still in progress

**Needs Backend**:
- [ ] `GET /api/candidates` - List with filters
- [ ] Search backend
- [ ] Filter persistence
- [ ] CSV import/export

---

### app/auth/signin/page.tsx
**Status**: 85% - Functional with NextAuth

**Form Fields**:
- Email (required)
- Password (required)
- Remember me (optional)
- OAuth: GitHub, Google

**Backend Integration**:
- Uses NextAuth `signIn()` provider
- Credentials provider configured
- OAuth providers configured

**Missing**:
- [ ] Forgot password page
- [ ] Email verification
- [ ] 2FA setup

---

### app/auth/signup/page.tsx
**Status**: 90% - Functional with NextAuth

**Form Fields**:
- Name
- Email
- Company
- Role (dropdown)
- Password

**Backend Integration**:
- `POST /api/auth/register` - Create account
- NextAuth sign-in after registration
- Password hashing on backend

**Missing**:
- [ ] Email verification before activation
- [ ] Store company/role in user profile
- [ ] Welcome email

---

## API Route Reference

### Implemented Routes

#### POST /api/auth/register
**Request**:
```typescript
{
  name?: string;
  email: string;
  password: string;  // min 8 chars
}
```

**Response**:
```typescript
{
  user: {
    id: string;
    name: string;
    email: string;
  }
}
```

**Status**: Implemented & Working
- Hash password with bcryptjs
- Check duplicate email
- Create user in Prisma

---

#### POST /api/interview/[id]/chat
**Request**: Via SSE with query param
```
GET /api/interview/[sessionId]/chat?message=...
```

**SSE Events**:
- `content` - Streaming text chunks
- `usage` - Token counts
- `done` - Completion

**Status**: Implemented & Working
- Uses Claude Sonnet 4.5
- Calculates prompt quality score
- Records to database
- Proper auth checks

---

#### GET /api/interview/[id]/terminal
**Response**: SSE stream

**Events**:
```json
{
  "output": "terminal output text"
}
```

**Status**: Implemented
- Connects via EventSource
- Queues output messages
- Heartbeat every 15 seconds
- Auto-reconnect support

---

#### POST /api/interview/[id]/terminal/input
**Request**:
```typescript
{
  type: "input" | "interrupt";
  data?: string;  // command if type=input
}
```

**Status**: Implemented
- Records to events
- Should forward to sandbox (not implemented)

---

#### POST /api/interview/[id]/run-tests
**Request**:
```typescript
{
  questionId: string;
  code: string;
  language: "javascript" | "typescript" | "python" | "go";
}
```

**Response**:
```typescript
{
  passed: number;
  failed: number;
  total: number;
  results: TestCaseResult[];
  executionTime: number;
}
```

**Status**: Partial (Mock Fallback)
- Falls back to mock execution if no Modal API key
- Mock has 70% pass rate
- Should connect to actual Modal sandbox

---

#### POST /api/interview/[id]/events
**Request** (Single or Batch):
```typescript
// Single
{
  type: "keystroke" | "code_snapshot" | "test_run" | ...;
  data: any;
  timestamp?: string;
  fileId?: string;
  checkpoint?: boolean;
}

// Batch
{
  events: EventRequestSchema[];
}
```

**Status**: Implemented & Working
- Supports batch operations
- Optimizes keystroke events
- Marks checkpoints
- Stores in Prisma

---

#### GET /api/interview/[id]/events
**Query Parameters**:
- `from?: string` - ISO date
- `to?: string` - ISO date
- `type?: string` - Event type filter
- `checkpoints?: boolean` - Only checkpoints
- `limit?: number` - Default 1000
- `offset?: number` - Default 0

**Response**:
```typescript
{
  events: SessionEvent[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  sessionInfo: {
    id: string;
    startTime: Date;
    endTime: Date | null;
    status: string;
  };
}
```

**Status**: Implemented & Working

---

## Missing Critical Routes

### GET /api/interview/[id]/questions
**Purpose**: Load problem statement for interview

**Expected Request**: `GET /api/interview/[sessionId]/questions`

**Expected Response**:
```typescript
{
  id: string;
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  examples: Array<{ input: string; output: string }>;
  constraints: string[];
  testCases: Array<{
    name: string;
    input: string;
    expectedOutput: string;
    hidden?: boolean;
  }>;
  timeLimit?: number;  // seconds
  memoryLimit?: number;  // MB
}
```

**Priority**: 🔴 CRITICAL

---

### POST /api/interview/[id]/submit
**Purpose**: Submit completed assessment

**Expected Request**:
```typescript
{
  code: string;
  language: string;
  questionId: string;
}
```

**Expected Response**:
```typescript
{
  submissionId: string;
  status: "submitted";
  score?: number;
  feedback?: string;
}
```

**Priority**: 🔴 CRITICAL

---

### POST /api/assessments
**Purpose**: Create new assessment

**Expected Request**:
```typescript
{
  title: string;
  description: string;
  duration: number;  // minutes
  role: string;
  seniority: string;
  problems: string[];  // problem IDs
  tier: string;
  aiAssistanceEnabled: boolean;
  aiMonitoringEnabled: boolean;
}
```

**Priority**: 🔴 CRITICAL

---

### GET /api/assessments
**Purpose**: List user's assessments

**Query Parameters**:
- `status?: "draft" | "active" | "completed" | "archived"`
- `search?: string`
- `skip?: number`
- `take?: number`

**Expected Response**:
```typescript
{
  assessments: Assessment[];
  total: number;
}
```

**Priority**: 🔴 CRITICAL

---

## Mock Data Files

### /lib/mock-analytics-data.ts

**Exports**:
- `MOCK_DASHBOARD_KPIS` - KPI metrics
- `MOCK_PIPELINE_FUNNEL` - Conversion data
- `MOCK_PRIORITY_ACTIONS` - Action items
- `MOCK_CANDIDATES` - Candidate list

**Used In**:
- `app/dashboard/page.tsx`
- `app/candidates/page.tsx`

---

## Quick Integration Checklist

### To Connect Interview to Real Data:
- [ ] Implement `/api/interview/[id]/questions` endpoint
- [ ] Load question in interview page on mount
- [ ] Load test cases from problem
- [ ] Implement submit button with `/api/interview/[id]/submit`
- [ ] Connect Modal sandbox to terminal

### To Enable Assessment Creation:
- [ ] Implement `/api/assessments` POST endpoint
- [ ] Wire up assessment save in new/page.tsx
- [ ] Add form validation
- [ ] Show success/error toast

### To Show Real Dashboard:
- [ ] Implement `/api/dashboard/kpis` endpoint
- [ ] Implement `/api/dashboard/pipeline` endpoint
- [ ] Replace mock data with API calls
- [ ] Add loading states

### To Enable Candidate Management:
- [ ] Implement `/api/candidates` endpoint
- [ ] Add search/filter backend
- [ ] Implement candidate detail page
- [ ] Add candidate invite system

