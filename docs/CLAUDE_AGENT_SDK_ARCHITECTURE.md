# Claude Agent SDK Integration Architecture

**Date**: November 11, 2025
**Objective**: Bring Cursor/Replit/Lovable-like experience while maintaining all existing functionalities
**Status**: Architecture Planning

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Claude Agent SDK Overview](#claude-agent-sdk-overview)
4. [Proposed Architecture](#proposed-architecture)
5. [Feature Comparison](#feature-comparison)
6. [Pros & Cons Analysis](#pros--cons-analysis)
7. [Impact on Existing Features](#impact-on-existing-features)
8. [Migration Strategy](#migration-strategy)
9. [Implementation Roadmap](#implementation-roadmap)
10. [Cost Analysis](#cost-analysis)
11. [Risk Assessment](#risk-assessment)
12. [Recommendations](#recommendations)

---

## Executive Summary

**Goal**: Transform the interview platform to match the interactive, agentic experience of Cursor, Replit, and Lovable while preserving critical features:
- ✅ Session replay
- ✅ Dynamic question generation based on progress
- ✅ Interactive session management
- ✅ Test execution and validation

**Approach**: Integrate Claude Agent SDK to enable autonomous AI capabilities with tool use, while maintaining the existing Modal sandbox infrastructure and session recording system.

**Key Benefits**:
- **Richer AI interactions**: Claude can autonomously read files, write code, run tests, and execute terminal commands
- **Better UX**: Mirrors Cursor/Replit where AI is a true pair programming partner
- **Structured tool use**: Formal tool definitions with validation and error handling
- **Reduced backend complexity**: Agent SDK handles many integration concerns

**Key Challenges**:
- Migrating from SSE-based chat to Agent SDK architecture
- Ensuring session replay captures tool use events
- Maintaining dynamic question generation logic
- Cost implications of more complex AI interactions

---

## Current Architecture Analysis

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ CodeEditor│  │ Terminal │  │ AIChat   │  │ FileTree │   │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘   │
└────────┼─────────────┼─────────────┼─────────────┼─────────┘
         │             │             │             │
         │             │             │             │
┌────────▼─────────────▼─────────────▼─────────────▼─────────┐
│                    Backend API Routes                        │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ /files (POST)    │  │ /chat (GET SSE)  │                │
│  │ /run-tests       │  │ /terminal (SSE)  │                │
│  │ /events          │  │ /events/batch    │                │
│  └────────┬─────────┘  └────────┬─────────┘                │
└───────────┼──────────────────────┼──────────────────────────┘
            │                      │
            ▼                      ▼
    ┌───────────────┐      ┌──────────────┐
    │ Modal Sandbox │      │ Claude API   │
    │ (Code Exec)   │      │ (SSE Stream) │
    └───────────────┘      └──────────────┘
            │
            ▼
    ┌───────────────┐
    │   PostgreSQL  │
    │ (Session Data)│
    └───────────────┘
```

### Current Flow: AI Chat Interaction

1. **User sends message** → AIChat component
2. **SSE connection** → `/api/interview/[id]/chat?message=...`
3. **Backend streams** → Claude API via `anthropic.messages.stream()`
4. **Frontend receives** → SSE events: `content`, `usage`, `done`
5. **Database records** → `ClaudeInteraction` table with full message history

**Key Files**:
- `components/interview/AIChat.tsx` - Frontend SSE consumer
- `app/api/interview/[id]/chat/route.ts` - Backend SSE producer

### Current Flow: Code Execution

1. **User edits code** → CodeEditor component
2. **Debounced save** → `/api/interview/[id]/files` (POST)
3. **Backend writes** → Modal volume via `modal.writeFile()`
4. **User clicks "Run Tests"** → `/api/interview/[id]/run-tests`
5. **Modal executes** → `modal.executeCode()` returns test results
6. **Frontend displays** → Test results in UI

**Limitations**:
- ❌ AI cannot autonomously read files
- ❌ AI cannot write/modify code directly
- ❌ AI cannot run tests itself
- ❌ AI cannot execute terminal commands
- ❌ No structured tool use
- ❌ Static, single-turn interactions

### Current Flow: Terminal

1. **Terminal connects** → SSE to `/api/interview/[id]/terminal`
2. **User types command** → POST to `/api/interview/[id]/terminal/input`
3. **Backend proxies** → Modal sandbox terminal
4. **Output streams back** → SSE events
5. **Frontend renders** → xterm.js display

**Limitations**:
- ❌ AI cannot see terminal output
- ❌ AI cannot execute commands
- ❌ Completely separate from AI chat

### Session Recording

**Current Implementation**:
- All events recorded to `SessionEvent` table via `/api/interview/[id]/events`
- Event types: `code_change`, `test_run`, `chat_message`, `terminal_command`, `file_open`
- Batching system reduces API calls by 90% (5s interval or 50 events)
- Replay can reconstruct entire session chronologically

**Event Recording** (`lib/eventBatcher.ts`):
```typescript
export interface EventData {
  type: string;
  data: any;
  timestamp?: number;
  fileId?: string;
  checkpoint?: boolean;
}

// Events are batched and sent to /events/batch endpoint
```

---

## Claude Agent SDK Overview

### What is Claude Agent SDK?

Claude Agent SDK (TypeScript) is an official framework from Anthropic for building agentic applications. It provides:

1. **Tool Use Architecture**: Define custom tools that Claude can invoke
2. **Autonomous Behavior**: Claude decides when to use tools based on context
3. **Structured Conversations**: Built-in session/context management
4. **Streaming Support**: Real-time response streaming
5. **Error Handling**: Automatic retry logic and validation

### Core Concepts

#### 1. Tools

Tools are functions that Claude can call to perform actions:

```typescript
import { Agent, Tool } from '@anthropic-ai/agent-sdk';

const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file in the workspace',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read'
      }
    },
    required: ['path']
  },
  execute: async (params) => {
    // Implementation
    const content = await modal.readFile(volumeId, params.path);
    return { content };
  }
};
```

#### 2. Agent

The Agent orchestrates tools and conversation:

```typescript
const agent = new Agent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5-20250929',
  tools: [readFileTool, writeFileTool, runTestsTool],
  systemPrompt: 'You are a helpful coding assistant...',
  streaming: true,
});

// Run agent
const response = await agent.run({
  messages: [{ role: 'user', content: 'Fix the bug in solution.js' }]
});
```

#### 3. Tool Loop

Claude can make multiple tool calls in sequence:

```
User: "Fix the bug in solution.js and run the tests"
  ↓
Claude: [Calls read_file tool for solution.js]
  ↓
Tool Result: { content: "function add(a, b) { return a - b; }" }
  ↓
Claude: "I found the bug. Using write_file to fix it..."
  ↓
Claude: [Calls write_file tool with corrected code]
  ↓
Tool Result: { success: true }
  ↓
Claude: [Calls run_tests tool]
  ↓
Tool Result: { passed: 2, failed: 0, total: 2 }
  ↓
Claude: "Fixed! Changed subtraction to addition. All tests pass."
```

### Built-in Tools

Agent SDK provides standard tools out of the box:

1. **bash** - Execute bash commands
2. **read** - Read file contents
3. **write** - Write/edit files
4. **list** - List directory contents
5. **search** - Search for patterns in files

---

## Proposed Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐             │
│  │CodeEditor│  │ Terminal │  │ AI Chat      │             │
│  │          │  │          │  │ (Enhanced)   │             │
│  └─────┬────┘  └─────┬────┘  └───────┬──────┘             │
└────────┼─────────────┼────────────────┼────────────────────┘
         │             │                │
         │             │                │ (SSE for streaming)
         │             │                │
┌────────▼─────────────▼────────────────▼────────────────────┐
│              Backend API Routes                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  /chat/agent (NEW)                                   │  │
│  │  - Claude Agent SDK integration                      │  │
│  │  - Custom tools for Modal sandbox                    │  │
│  │  - Tool use event recording                          │  │
│  │  - SSE streaming to frontend                         │  │
│  └─────────────────┬────────────────────────────────────┘  │
│                    │                                        │
│  ┌─────────────────▼────────────────────────────────────┐  │
│  │  Custom Tools Layer                                   │  │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │ReadFile │ │WriteFile│ │RunTests  │ │ExecBash  │  │  │
│  │  └────┬────┘ └────┬────┘ └────┬─────┘ └────┬─────┘  │  │
│  └───────┼───────────┼───────────┼────────────┼────────┘  │
└──────────┼───────────┼───────────┼────────────┼───────────┘
           │           │           │            │
           └───────────┴───────────┴────────────┘
                       │
                       ▼
               ┌───────────────┐
               │ Modal Sandbox │
               │ (Unchanged)   │
               └───────┬───────┘
                       │
                       ▼
               ┌───────────────┐
               │  PostgreSQL   │
               │ + Tool Events │
               └───────────────┘
```

### New Components

#### 1. Agent Chat API Route

**File**: `app/api/interview/[id]/chat/agent/route.ts`

```typescript
import { Agent } from '@anthropic-ai/agent-sdk';
import { createReadFileTool } from '@/lib/agent-tools/read-file';
import { createWriteFileTool } from '@/lib/agent-tools/write-file';
import { createRunTestsTool } from '@/lib/agent-tools/run-tests';
import { createBashTool } from '@/lib/agent-tools/bash';

export async function POST(request: NextRequest, { params }) {
  const { id: candidateId } = await params;
  const { messages } = await request.json();

  // Get candidate session
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { sessionRecording: true, generatedQuestions: true }
  });

  if (!candidate.volumeId) {
    return NextResponse.json({ error: 'Sandbox not initialized' }, { status: 400 });
  }

  // Create tools with session context
  const tools = [
    createReadFileTool(candidate.volumeId),
    createWriteFileTool(candidate.volumeId),
    createRunTestsTool(candidateId, candidate.sessionRecording.id),
    createBashTool(candidateId),
  ];

  // Initialize agent
  const agent = new Agent({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5-20250929',
    tools,
    systemPrompt: buildInterviewSystemPrompt(candidate),
    streaming: true,
    onToolUse: async (toolName, toolInput, toolOutput) => {
      // Record tool use event for session replay
      await recordToolUseEvent(candidate.sessionRecording.id, {
        toolName,
        input: toolInput,
        output: toolOutput,
        timestamp: new Date(),
      });
    },
  });

  // Stream response using SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Run agent with message history
        for await (const event of agent.stream({ messages })) {
          if (event.type === 'text_delta') {
            controller.enqueue(
              encoder.encode(`event: content\ndata: ${JSON.stringify({ delta: event.text })}\n\n`)
            );
          } else if (event.type === 'tool_use') {
            // Send tool use notification to frontend
            controller.enqueue(
              encoder.encode(`event: tool_use\ndata: ${JSON.stringify(event)}\n\n`)
            );
          } else if (event.type === 'tool_result') {
            // Send tool result to frontend (for UI feedback)
            controller.enqueue(
              encoder.encode(`event: tool_result\ndata: ${JSON.stringify(event)}\n\n`)
            );
          }
        }

        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      } catch (error) {
        console.error('Agent error:', error);
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`)
        );
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

#### 2. Custom Tools

**File**: `lib/agent-tools/read-file.ts`

```typescript
import { Tool } from '@anthropic-ai/agent-sdk';
import { modalService as modal } from '@/lib/services';

export function createReadFileTool(volumeId: string): Tool {
  return {
    name: 'read_file',
    description: 'Read the contents of a file in the candidate\'s workspace. Use this to examine code, understand the current implementation, or check file contents before making changes.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to workspace root (e.g., "solution.js", "tests/test.js")',
        },
      },
      required: ['path'],
    },
    execute: async (params: { path: string }) => {
      try {
        const content = await modal.readFile(volumeId, params.path);
        return {
          success: true,
          content,
          path: params.path,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read file',
          path: params.path,
        };
      }
    },
  };
}
```

**File**: `lib/agent-tools/write-file.ts`

```typescript
import { Tool } from '@anthropic-ai/agent-sdk';
import { modalService as modal } from '@/lib/services';

export function createWriteFileTool(volumeId: string): Tool {
  return {
    name: 'write_file',
    description: 'Write or overwrite a file in the candidate\'s workspace. Use this to create new files, fix bugs, or implement features.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to write',
        },
        content: {
          type: 'string',
          description: 'Full content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
    execute: async (params: { path: string; content: string }) => {
      try {
        await modal.writeFile(volumeId, params.path, params.content);
        return {
          success: true,
          path: params.path,
          bytesWritten: params.content.length,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to write file',
          path: params.path,
        };
      }
    },
  };
}
```

**File**: `lib/agent-tools/run-tests.ts`

```typescript
import { Tool } from '@anthropic-ai/agent-sdk';
import { modalService as modal } from '@/lib/services';
import prisma from '@/lib/prisma';

export function createRunTestsTool(candidateId: string, sessionId: string): Tool {
  return {
    name: 'run_tests',
    description: 'Execute the test suite for the current coding challenge. Returns pass/fail status and detailed results.',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: 'Optional: specific file to test (default: solution file)',
        },
      },
      required: [],
    },
    execute: async (params: { fileName?: string }) => {
      try {
        // Get candidate's question
        const candidate = await prisma.candidate.findUnique({
          where: { id: candidateId },
          include: { generatedQuestions: true },
        });

        if (!candidate || !candidate.generatedQuestions?.[0]) {
          return { success: false, error: 'No question found' };
        }

        const question = candidate.generatedQuestions[0];

        // Read current code
        const fileName = params.fileName || `solution.${question.language === 'python' ? 'py' : 'js'}`;
        const code = await modal.readFile(candidate.volumeId, fileName);

        // Execute tests
        const result = await modal.executeCode(
          candidateId,
          code,
          question.testCases.map(tc => ({
            name: tc.name,
            input: tc.input,
            expected: tc.expectedOutput,
            hidden: tc.hidden,
          }))
        );

        // Record results
        await Promise.all(
          result.testResults.map(tr =>
            prisma.testResult.create({
              data: {
                sessionId,
                testName: tr.name,
                passed: tr.passed,
                output: tr.output,
                error: tr.error,
                duration: tr.duration,
              },
            })
          )
        );

        return {
          success: true,
          passed: result.passedTests,
          failed: result.failedTests,
          total: result.totalTests,
          results: result.testResults,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to run tests',
        };
      }
    },
  };
}
```

**File**: `lib/agent-tools/bash.ts`

```typescript
import { Tool } from '@anthropic-ai/agent-sdk';
import { modalService as modal } from '@/lib/services';

export function createBashTool(candidateId: string): Tool {
  return {
    name: 'execute_bash',
    description: 'Execute a bash command in the candidate\'s sandbox terminal. Use for installing dependencies, running scripts, checking file structure, etc.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The bash command to execute (e.g., "npm install lodash", "ls -la", "cat package.json")',
        },
        timeout: {
          type: 'number',
          description: 'Optional timeout in milliseconds (default: 30000)',
        },
      },
      required: ['command'],
    },
    execute: async (params: { command: string; timeout?: number }) => {
      try {
        const result = await modal.executeCommand(
          candidateId,
          params.command,
          params.timeout || 30000
        );

        return {
          success: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          duration: result.duration,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Command execution failed',
        };
      }
    },
  };
}
```

#### 3. Enhanced AIChat Component

**File**: `components/interview/AIChat.tsx` (Updated)

```typescript
// Add new event handlers for tool use
eventSource.addEventListener('tool_use', (event) => {
  const toolData = JSON.parse(event.data);

  // Show tool use indicator in chat
  setMessages(prev => [...prev, {
    id: Date.now().toString(),
    role: 'system',
    content: `🔧 ${toolData.toolName}(${JSON.stringify(toolData.input)})`,
    timestamp: new Date(),
    type: 'tool_use',
  }]);
});

eventSource.addEventListener('tool_result', (event) => {
  const resultData = JSON.parse(event.data);

  // Show tool result (collapsed by default)
  setMessages(prev => [...prev, {
    id: Date.now().toString(),
    role: 'system',
    content: JSON.stringify(resultData.output, null, 2),
    timestamp: new Date(),
    type: 'tool_result',
  }]);

  // If file was written, refresh CodeEditor
  if (resultData.toolName === 'write_file') {
    onFileModified?.(resultData.output.path);
  }

  // If tests were run, update test results UI
  if (resultData.toolName === 'run_tests') {
    onTestResultsUpdated?.(resultData.output);
  }
});
```

---

## Feature Comparison

| Feature | Current (SSE) | Agent SDK | Notes |
|---------|---------------|-----------|-------|
| **AI Chat** | ✅ Basic Q&A | ✅ Agentic assistance | SDK enables autonomous actions |
| **File Reading** | ❌ Manual only | ✅ AI can read | Claude can examine code context |
| **File Writing** | ❌ Manual only | ✅ AI can write | Claude can fix bugs, implement features |
| **Test Execution** | ❌ Manual only | ✅ AI can run | Claude can test its own changes |
| **Terminal Access** | ❌ Separate system | ✅ AI can execute | Claude can install deps, run scripts |
| **Multi-step Tasks** | ❌ Not supported | ✅ Tool chaining | Claude can plan and execute sequences |
| **Streaming** | ✅ SSE | ✅ SSE | Both support real-time responses |
| **Session Recording** | ✅ Events | ✅ Events + Tools | Need to record tool use events |
| **Cost per Message** | $0.003 | $0.005-0.015 | Higher due to tool use overhead |
| **Error Handling** | ⚠️ Manual | ✅ Built-in | SDK includes retry logic |
| **Context Awareness** | ⚠️ Static prompt | ✅ Dynamic | Claude sees current state via tools |

---

## Pros & Cons Analysis

### Pros of Claude Agent SDK

#### 1. **Richer User Experience** 🎯
- **Cursor-like interaction**: AI becomes true pair programming partner
- **Autonomous workflows**: User can say "Fix this bug and run tests" - Claude handles it
- **Contextual awareness**: Claude reads files to understand full codebase
- **Real-time feedback**: Users see exactly what Claude is doing (tool use events)

#### 2. **Reduced Backend Complexity** 🛠️
- **Structured tool definitions**: Clear contracts, automatic validation
- **Built-in retry logic**: SDK handles transient failures
- **Conversation management**: Session handling built into SDK
- **Error boundaries**: Better error messages and recovery

#### 3. **Advanced Capabilities** 🚀
- **Multi-step reasoning**: Claude can plan complex tasks
- **Self-correction**: Can test changes and fix if tests fail
- **Dependency management**: Can install packages, run build scripts
- **Debugging assistance**: Can read error logs, examine stack traces

#### 4. **Better Session Replay** 📹
- Tool use events provide richer timeline
- See exactly what AI did (not just what it said)
- Reconstruct both manual edits AND AI-assisted changes
- Better evaluation of AI usage skills

#### 5. **Dynamic Question Adaptation** 🎓
- Claude can analyze progress and suggest next challenges
- Can provide hints by examining current code
- Personalized difficulty based on candidate's approach

### Cons of Claude Agent SDK

#### 1. **Increased Complexity** ⚠️
- **More moving parts**: Tools, event recording, error handling
- **Steeper learning curve**: Team needs to understand agentic patterns
- **Debugging difficulty**: Tool chains can be complex to trace
- **Migration effort**: Significant refactoring required

#### 2. **Higher Costs** 💰
- **More API calls**: Tool use adds overhead (thinking tokens)
- **Longer conversations**: Multi-turn interactions increase token usage
- **Tool result tokens**: File contents, test results count as input tokens
- **Estimate**: 2-5x cost increase per interaction

#### 3. **Latency Concerns** ⏱️
- **Tool execution time**: Reading files, running tests adds delay
- **Multi-step sequences**: Each tool use is a round trip
- **User perception**: "AI is thinking" needs good UX
- **Streaming helps**: But overall interaction time increases

#### 4. **Safety Considerations** 🔒
- **Sandbox boundaries**: Ensure AI can't escape Modal container
- **File system limits**: Prevent writing to restricted paths
- **Command injection**: Bash tool needs careful validation
- **Resource limits**: Prevent infinite loops, excessive tool use

#### 5. **Session Recording Complexity** 📊
- **More event types**: Tool use, tool results, multi-turn conversations
- **Larger data volume**: Full file contents, command outputs
- **Replay complexity**: Must handle async tool execution order
- **Storage costs**: PostgreSQL database size increases

---

## Impact on Existing Features

### 1. Session Replay ✅ **COMPATIBLE**

**Current Implementation**:
- Records events: `code_change`, `test_run`, `chat_message`, `terminal_command`
- Batched event recording (90% API reduction)
- Replay reconstructs session chronologically

**With Agent SDK**:
- ✅ **Add new event types**: `tool_use_start`, `tool_use_complete`, `tool_use_error`
- ✅ **Richer timeline**: See both manual actions AND AI autonomous actions
- ✅ **Better evaluation**: Understand how candidate leveraged AI

**Required Changes**:
1. Extend `SessionEvent` schema to include tool use data
```typescript
// Add to SessionEvent model
export interface ToolUseEvent {
  type: 'tool_use_start' | 'tool_use_complete' | 'tool_use_error';
  data: {
    toolName: string;
    input: Record<string, any>;
    output?: Record<string, any>;
    error?: string;
    duration?: number;
  };
}
```

2. Update event batching to handle tool events
3. Modify replay UI to visualize tool use

**Risk Level**: 🟢 **LOW** - Additive change, doesn't break existing replay

---

### 2. Dynamic Question Generation ✅ **ENHANCED**

**Current Implementation**:
- Questions generated based on assessment config (seniority, tech stack)
- Static difficulty: EASY/MEDIUM/HARD
- No adaptation during interview

**With Agent SDK**:
- ✅ **Progress analysis**: Claude can examine code to gauge skill level
- ✅ **Adaptive difficulty**: Suggest harder/easier questions mid-interview
- ✅ **Hint system**: Provide targeted hints by reading current code
- ✅ **Follow-up questions**: Generate related challenges based on solution approach

**New Tool**: `analyze_progress`
```typescript
export function createAnalyzeProgressTool(candidateId: string): Tool {
  return {
    name: 'analyze_progress',
    description: 'Analyze the candidate\'s current code to determine skill level and suggest appropriate next questions',
    execute: async () => {
      // Read all candidate files
      // Analyze code quality, patterns, complexity
      // Return skill assessment
      // Suggest next question difficulty
    }
  };
}
```

**Risk Level**: 🟢 **LOW** - New capability, doesn't affect existing flow

---

### 3. Interactive Session ✅ **IMPROVED**

**Current Implementation**:
- Timer countdown
- Manual saves (debounced 2s)
- Manual test execution
- Separate AI chat

**With Agent SDK**:
- ✅ **Integrated AI**: Chat, code, terminal all connected
- ✅ **Autonomous testing**: AI can run tests after changes
- ✅ **Proactive suggestions**: AI notices when code breaks tests
- ✅ **Better collaboration**: User and AI work on same codebase

**UI Changes**:
1. Show tool use activity in real-time
2. Display "Claude is writing to solution.js..." notifications
3. Highlight files/lines modified by AI
4. Confirm destructive AI actions (optional setting)

**Risk Level**: 🟢 **LOW** - Enhanced UX, backward compatible

---

### 4. Test Execution ✅ **COMPATIBLE**

**Current Implementation**:
- Manual "Run Tests" button
- POST to `/api/interview/[id]/run-tests`
- Results stored in `TestResult` table
- Modal executes tests in sandbox

**With Agent SDK**:
- ✅ **Dual access**: Manual button + AI tool both work
- ✅ **Same backend**: `run_tests` tool uses existing Modal service
- ✅ **Same recording**: Test results recorded identically
- ✅ **Richer context**: AI can explain test failures

**Integration**:
```typescript
// Shared function used by both API route and tool
export async function executeTests(candidateId: string, code: string, testCases: TestCase[]) {
  // Existing implementation
  const result = await modal.executeCode(candidateId, code, testCases);

  // Record to database
  await recordTestResults(sessionId, result);

  return result;
}

// API route calls it
export async function POST(request, { params }) {
  return executeTests(params.id, body.code, body.testCases);
}

// Tool calls it
const runTestsTool = {
  execute: async () => {
    return executeTests(candidateId, code, testCases);
  }
};
```

**Risk Level**: 🟢 **LOW** - Shared implementation, no conflicts

---

## Migration Strategy

### Phase 1: Parallel Implementation (Week 1-2)

**Goal**: Build Agent SDK integration alongside existing SSE system

1. **Create new API route**: `/api/interview/[id]/chat/agent`
2. **Implement custom tools**: `read_file`, `write_file`, `run_tests`, `bash`
3. **Add tool event recording**: Extend `SessionEvent` schema
4. **Feature flag**: `ENABLE_AGENT_SDK` environment variable

**Testing**:
- Unit tests for each tool
- Integration tests for tool chains
- Compare costs: SSE vs Agent SDK

**Deliverables**:
- ✅ Working Agent SDK endpoint
- ✅ All 4 custom tools implemented
- ✅ Tool use events recorded correctly
- ✅ Feature flag controls which system is used

---

### Phase 2: Frontend Integration (Week 3)

**Goal**: Update AIChat component to support Agent SDK

1. **Dual-mode chat**: Support both `/chat` (SSE) and `/chat/agent` (Agent SDK)
2. **Tool use UI**: Show tool activity in chat timeline
3. **File sync**: Refresh CodeEditor when AI writes files
4. **Test result sync**: Update test UI when AI runs tests

**Changes**:
```typescript
// AIChat.tsx
const chatEndpoint = process.env.NEXT_PUBLIC_ENABLE_AGENT_SDK
  ? `/api/interview/${sessionId}/chat/agent`
  : `/api/interview/${sessionId}/chat`;

// Handle new event types
eventSource.addEventListener('tool_use', handleToolUse);
eventSource.addEventListener('tool_result', handleToolResult);
```

**Deliverables**:
- ✅ Updated AIChat component
- ✅ Tool activity visualized
- ✅ File sync working
- ✅ Test sync working

---

### Phase 3: Testing & Refinement (Week 4)

**Goal**: Validate Agent SDK behavior, optimize costs

1. **User acceptance testing**: Internal team tests interview flow
2. **Cost analysis**: Measure actual token usage vs SSE baseline
3. **Performance optimization**: Reduce tool use overhead
4. **Error handling**: Improve retry logic, timeouts

**Metrics to Track**:
- Average tokens per interaction
- Tool success/failure rates
- User satisfaction (UX feedback)
- Session replay data quality

**Deliverables**:
- ✅ UAT completed
- ✅ Cost analysis report
- ✅ Performance benchmarks
- ✅ Error handling hardened

---

### Phase 4: Gradual Rollout (Week 5-6)

**Goal**: Deploy to production with controlled rollout

1. **10% rollout**: Enable for 10% of new interviews
2. **Monitor metrics**: Errors, costs, user feedback
3. **50% rollout**: If stable, increase to 50%
4. **100% rollout**: Full migration to Agent SDK
5. **Deprecate SSE chat**: Remove old `/chat` endpoint

**Rollback Plan**:
- Feature flag can instantly revert to SSE
- Database schema backward compatible
- No data loss if rollback needed

**Deliverables**:
- ✅ Production deployment
- ✅ Monitoring dashboard
- ✅ Full migration complete
- ✅ SSE endpoint deprecated

---

## Implementation Roadmap

### Week 1: Backend Foundation

| Task | Owner | Status |
|------|-------|--------|
| Create Agent SDK route | Backend | 🔲 Not Started |
| Implement `read_file` tool | Backend | 🔲 Not Started |
| Implement `write_file` tool | Backend | 🔲 Not Started |
| Implement `run_tests` tool | Backend | 🔲 Not Started |
| Implement `bash` tool | Backend | 🔲 Not Started |
| Add tool event schema | Backend | 🔲 Not Started |
| Unit tests for tools | Backend | 🔲 Not Started |

### Week 2: Tool Integration

| Task | Owner | Status |
|------|-------|--------|
| Integrate tools with Modal | Backend | 🔲 Not Started |
| Event recording for tool use | Backend | 🔲 Not Started |
| Error handling & retries | Backend | 🔲 Not Started |
| Feature flag setup | DevOps | 🔲 Not Started |
| Integration tests | QA | 🔲 Not Started |

### Week 3: Frontend Updates

| Task | Owner | Status |
|------|-------|--------|
| Update AIChat component | Frontend | 🔲 Not Started |
| Tool use UI components | Frontend | 🔲 Not Started |
| File sync on AI edits | Frontend | 🔲 Not Started |
| Test result sync | Frontend | 🔲 Not Started |
| Keyboard shortcuts for AI | Frontend | 🔲 Not Started |

### Week 4: Testing & Optimization

| Task | Owner | Status |
|------|-------|--------|
| Internal UAT | Team | 🔲 Not Started |
| Cost analysis | Product | 🔲 Not Started |
| Performance benchmarks | Backend | 🔲 Not Started |
| Error monitoring setup | DevOps | 🔲 Not Started |
| Documentation | All | 🔲 Not Started |

### Week 5-6: Rollout

| Task | Owner | Status |
|------|-------|--------|
| 10% production rollout | DevOps | 🔲 Not Started |
| Monitor metrics | All | 🔲 Not Started |
| 50% production rollout | DevOps | 🔲 Not Started |
| 100% production rollout | DevOps | 🔲 Not Started |
| Deprecate old chat endpoint | Backend | 🔲 Not Started |

---

## Cost Analysis

### Current Costs (SSE Chat)

**Per Interview**:
- **Chat interactions**: ~10 messages
- **Average tokens per message**: 500 input + 300 output
- **Total tokens**: 10 × (500 + 300) = 8,000 tokens
- **Cost per 1M tokens** (Claude Sonnet 4.5): $3 input + $15 output
- **Cost per interview**:
  - Input: (5,000 / 1,000,000) × $3 = $0.015
  - Output: (3,000 / 1,000,000) × $15 = $0.045
  - **Total: $0.06**

**At Scale (10k interviews/month)**:
- $0.06 × 10,000 = **$600/month**

---

### Projected Costs (Agent SDK)

**Per Interview with Tool Use**:
- **Chat interactions**: ~10 messages (same)
- **Tool use overhead**:
  - Claude thinks about which tool to use (+200 tokens per tool call)
  - Tool results as input tokens (+500 tokens average per result)
- **Estimated tool calls**: 5 per interview
- **Total additional tokens**:
  - Thinking: 5 × 200 = 1,000 tokens (output)
  - Tool results: 5 × 500 = 2,500 tokens (input)

**Updated Calculation**:
- **Input tokens**: 5,000 + 2,500 = 7,500
- **Output tokens**: 3,000 + 1,000 = 4,000
- **Cost per interview**:
  - Input: (7,500 / 1,000,000) × $3 = $0.0225
  - Output: (4,000 / 1,000,000) × $15 = $0.06
  - **Total: $0.0825**

**At Scale (10k interviews/month)**:
- $0.0825 × 10,000 = **$825/month**

**Increase**: $825 - $600 = **+$225/month (+37%)**

---

### Cost Optimization Strategies

1. **Limit tool calls**: Configure max 10 tool calls per conversation
2. **Cache tool results**: Don't re-read unchanged files
3. **Compress outputs**: Truncate large test results
4. **Smart prompting**: Guide Claude to minimize unnecessary tool use
5. **Streaming**: Send partial results to reduce latency perception

**Optimized Cost Estimate**: **$700-750/month** (17-25% increase)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Cost overruns** | Medium | High | Feature flag for instant rollback, monitoring alerts |
| **Tool use errors** | Medium | Medium | Comprehensive error handling, retry logic |
| **Session replay breaks** | Low | High | Backward compatible schema, extensive testing |
| **Latency issues** | Medium | Medium | Streaming, loading states, timeout limits |
| **Sandbox escape** | Low | Critical | Strict tool validation, Modal container isolation |
| **Data loss during migration** | Low | High | Parallel systems, phased rollout, backups |
| **User confusion** | Medium | Low | Clear tool use indicators, help documentation |
| **Claude hallucinations** | Medium | Medium | Tool result validation, user confirmations |

---

## Recommendations

### ✅ **PROCEED WITH MIGRATION**

**Rationale**:
1. **Strategic advantage**: Cursor/Replit/Lovable-like UX is competitive differentiator
2. **Manageable cost**: 37% increase is acceptable given value added
3. **Low risk**: Feature flag allows instant rollback if issues arise
4. **Enhanced evaluation**: Better understand candidate AI usage skills
5. **Future-proof**: Agent SDK is future of AI-powered coding tools

### 🎯 **Success Criteria**

Before 100% rollout:
- ✅ All 140 existing tests still pass
- ✅ Session replay includes tool use events correctly
- ✅ Cost increase stays below 50%
- ✅ No critical bugs in 50% rollout phase
- ✅ Positive user feedback (>80% satisfaction)
- ✅ Tool success rate >90%

### 🚀 **Key Priorities**

1. **Week 1-2**: Backend tools + event recording (foundation)
2. **Week 3**: Frontend integration (UX)
3. **Week 4**: Testing + cost optimization (validation)
4. **Week 5-6**: Gradual rollout (production)

### ⚠️ **Critical Decisions**

1. **Tool use limits**: Max 10 tool calls per conversation (prevent runaway costs)
2. **User confirmations**: Optional setting to confirm destructive AI actions
3. **Monitoring**: Real-time cost tracking, error alerts, rollback triggers
4. **Documentation**: Internal team training, candidate help docs

---

## Appendix: Example Interactions

### Example 1: Bug Fix with Agent SDK

**User**: "The tests are failing. Can you fix it?"

```
Claude: Let me check the current code and test results.

[Tool: read_file("solution.js")]
→ Result: function add(a, b) { return a - b; }

[Tool: run_tests()]
→ Result: 0/2 tests passing
  - Test "adds 2 + 3": expected 5, got -1
  - Test "adds 10 + 20": expected 30, got -10

I see the bug! The function is subtracting instead of adding.
Let me fix it:

[Tool: write_file("solution.js", "function add(a, b) { return a + b; }")]
→ Result: File written successfully

[Tool: run_tests()]
→ Result: 2/2 tests passing ✅

Fixed! All tests now pass. The issue was using subtraction (-) instead of addition (+).
```

**Session Replay Events**:
1. `chat_message` (user)
2. `tool_use_start` (read_file)
3. `tool_use_complete` (read_file, content: "...")
4. `tool_use_start` (run_tests)
5. `tool_use_complete` (run_tests, passed: 0/2)
6. `chat_message` (assistant, explaining bug)
7. `tool_use_start` (write_file)
8. `tool_use_complete` (write_file)
9. `tool_use_start` (run_tests)
10. `tool_use_complete` (run_tests, passed: 2/2)
11. `chat_message` (assistant, confirmation)

---

### Example 2: Complex Multi-Step Task

**User**: "Implement a binary search function and make sure it passes all tests"

```
Claude: I'll implement binary search for you. Let me start by checking
the existing code structure.

[Tool: read_file("solution.js")]
→ Result: function binarySearch(arr, target) { /* TODO */ }

[Tool: read_file("solution.test.js")]
→ Result: (test cases shown)

I'll implement an efficient binary search algorithm:

[Tool: write_file("solution.js", `
function binarySearch(arr, target) {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (arr[mid] === target) {
      return mid;
    } else if (arr[mid] < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return -1;
}
`)]
→ Result: File written

Now let's run the tests to verify:

[Tool: run_tests()]
→ Result: 5/5 tests passing ✅

Perfect! Binary search is implemented and all tests pass.
The algorithm runs in O(log n) time complexity.
```

---

## Conclusion

Integrating Claude Agent SDK will transform InterviewLM into a **Cursor/Replit/Lovable-class platform** with autonomous AI assistance. The migration is:

- ✅ **Technically feasible** - Parallel implementation, feature-flagged rollout
- ✅ **Financially viable** - 37% cost increase for significant UX improvement
- ✅ **Low risk** - Backward compatible, instant rollback capability
- ✅ **High value** - Competitive advantage, better candidate evaluation

**Recommendation: Proceed with 6-week migration plan.**

---

**Next Steps**:
1. Review this architecture document with team
2. Get approval on budget increase (+$225/month initially)
3. Assign owners to Week 1 tasks
4. Begin implementation on Monday

**Questions/Feedback**: Open for team discussion
