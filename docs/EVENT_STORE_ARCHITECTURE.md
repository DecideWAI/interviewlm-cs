# Unified Event Store Architecture

## Overview

This document describes the unified event store architecture for InterviewLM. The event store provides a single source of truth for all session events, enabling perfect replay fidelity, comprehensive evaluation, and rich analytics.

## Design Principles

1. **Event Sourcing** - Events are immutable facts that describe what happened
2. **Chronological Order** - Events are stored and retrieved in timestamp order
3. **Single Source of Truth** - All session state derived from events
4. **Schema Evolution** - Event data is JSON, allowing backward-compatible changes
5. **Efficient Queries** - Indexed for common access patterns (by session, by type, by time range)
6. **Origin Tracking** - Every event tracks who/what triggered it (USER, AI, SYSTEM)

## Database Schema

### Prisma Schema

```prisma
enum EventOrigin {
  USER     // Candidate actions (typing, clicking, sending messages)
  AI       // AI agent actions (tool calls, responses)
  SYSTEM   // Platform actions (auto-save, timeouts, evaluations)
}

model SessionEventLog {
  id             String       @id @default(cuid())
  sessionId      String
  sequenceNumber BigInt
  timestamp      DateTime     @default(now())
  eventType      String       // e.g., "code.edit", "chat.user_message"
  category       String       // e.g., "code", "chat", "terminal"
  origin         EventOrigin  @default(SYSTEM)
  data           Json
  questionIndex  Int?
  filePath       String?
  checkpoint     Boolean      @default(false)

  session        SessionRecording @relation(fields: [sessionId], references: [id])

  @@unique([sessionId, sequenceNumber])
  @@index([sessionId, timestamp])
  @@index([sessionId, category])
  @@index([sessionId, checkpoint])
  @@index([sessionId, questionIndex])
  @@index([origin])
}
```

## Event Origins

Every event has an `origin` field indicating who/what triggered it:

| Origin | Description | Examples |
|--------|-------------|----------|
| `USER` | Candidate/user actions | Typing code, sending chat messages, running tests, file edits |
| `AI` | AI agent actions | Assistant responses, AI-generated code, tool calls |
| `SYSTEM` | Platform/system actions | Session start/end, test results, auto-saves, evaluations |

### Origin Guidelines

**USER origin** - Use for any action directly triggered by the candidate:
- Code edits in the editor
- Chat messages sent to the AI assistant
- Terminal commands entered
- File creation/deletion initiated by user
- Test runs triggered by user clicking "Run Tests"
- Question submissions

**AI origin** - Use for AI-generated content and actions:
- Assistant chat responses
- Code generated/modified by AI tools
- AI-initiated file changes
- Tool execution results from AI

**SYSTEM origin** - Use for platform-level events:
- Session lifecycle (start, end, pause, resume)
- Test execution results (the results themselves, not the trigger)
- Auto-save snapshots
- Evaluation scores and feedback
- Timeout events
- Error/exception events

## Event Types

Events use a dot-notation naming convention organized by category:

### Category: `session`

| Event Type | Description | Data Schema |
|------------|-------------|-------------|
| `session.start` | Interview session begins | `{ candidateId, assessmentId, sandboxId }` |
| `session.pause` | Session paused | `{ reason }` |
| `session.resume` | Session resumed | `{ pauseDuration }` |
| `session.end` | Session completed | `{ reason, finalStatus }` |

### Category: `question`

| Event Type | Description | Data Schema |
|------------|-------------|-------------|
| `question.start` | New question begins | `{ questionId, title, difficulty, order, starterCode }` |
| `question.submit` | Question submitted for evaluation | `{ code, testResults }` |
| `question.evaluated` | Evaluation complete | `{ score, passed, feedback }` |
| `question.skip` | Question skipped | `{ reason }` |

### Category: `file`

| Event Type | Description | Data Schema |
|------------|-------------|-------------|
| `file.create` | New file created | `{ path, content, size, language }` |
| `file.update` | File content changed | `{ path, content, contentHash, diff }` |
| `file.rename` | File renamed | `{ oldPath, newPath }` |
| `file.delete` | File deleted | `{ path }` |

### Category: `code`

| Event Type | Description | Data Schema |
|------------|-------------|-------------|
| `code.snapshot` | Periodic code snapshot | `{ path, content, contentHash, linesAdded, linesDeleted }` |
| `code.edit` | Granular edit (optional) | `{ path, changes: [{from, to, insert}] }` |
| `code.cursor` | Cursor position (optional) | `{ path, line, column }` |

### Category: `chat`

| Event Type | Description | Data Schema |
|------------|-------------|-------------|
| `chat.user_message` | User sends message | `{ content, promptQuality }` |
| `chat.assistant_message` | AI responds | `{ content, model, inputTokens, outputTokens, latency }` |
| `chat.tool_start` | AI starts using tool | `{ toolName, toolId, input }` |
| `chat.tool_result` | Tool execution complete | `{ toolName, toolId, output, isError }` |
| `chat.reset` | Conversation reset | `{ reason, questionIndex }` |

### Category: `terminal`

| Event Type | Description | Data Schema |
|------------|-------------|-------------|
| `terminal.command` | Command executed | `{ command, cwd }` |
| `terminal.output` | Command output | `{ output, exitCode, duration }` |
| `terminal.clear` | Terminal cleared | `{}` |

### Category: `test`

| Event Type | Description | Data Schema |
|------------|-------------|-------------|
| `test.run_start` | Test run begins | `{ testFile, testCount }` |
| `test.result` | Individual test result | `{ testName, passed, output, error, duration }` |
| `test.run_complete` | Test run finished | `{ passed, failed, total, duration }` |

### Category: `evaluation`

| Event Type | Description | Data Schema |
|------------|-------------|-------------|
| `evaluation.start` | Evaluation begins | `{ questionIndex, evaluationType }` |
| `evaluation.complete` | Evaluation finished | `{ score, criteria, feedback, strengths, improvements }` |
| `evaluation.final` | Final session evaluation | `{ overallScore, recommendation, dimensions }` |

## Checkpoint Events

Checkpoint events are significant moments in the session that can be used for:
- Replay seeking (jump to specific points)
- Session summarization
- Progress tracking

The following event types are automatically marked as checkpoints:
- `session.start`, `session.end`
- `question.start`, `question.submit`
- `code.snapshot`
- `test.result`, `test.run_complete`
- `evaluation.complete`

## TypeScript Types

```typescript
// Event origin type
type EventOrigin = "USER" | "AI" | "SYSTEM";

// Base event interface
interface SessionEvent {
  id: string;
  sessionId: string;
  sequenceNumber: bigint;
  timestamp: Date;
  eventType: EventType;
  category: EventCategory;
  origin: EventOrigin;
  data: EventData;
  questionIndex?: number;
  filePath?: string;
  checkpoint: boolean;
}

// Event categories
type EventCategory =
  | 'session'
  | 'question'
  | 'file'
  | 'code'
  | 'chat'
  | 'terminal'
  | 'test'
  | 'evaluation';

// Event types (exhaustive union)
type EventType =
  // Session
  | 'session.start'
  | 'session.pause'
  | 'session.resume'
  | 'session.end'
  // Question
  | 'question.start'
  | 'question.submit'
  | 'question.evaluated'
  | 'question.skip'
  // File
  | 'file.create'
  | 'file.update'
  | 'file.rename'
  | 'file.delete'
  // Code
  | 'code.snapshot'
  | 'code.edit'
  // Chat
  | 'chat.user_message'
  | 'chat.assistant_message'
  | 'chat.tool_start'
  | 'chat.tool_result'
  | 'chat.reset'
  // Terminal
  | 'terminal.command'
  | 'terminal.output'
  // Test
  | 'test.run_start'
  | 'test.result'
  | 'test.run_complete'
  // Evaluation
  | 'evaluation.start'
  | 'evaluation.complete'
  | 'evaluation.final';
```

## API Usage

### Recording Events

Use the `recordEvent` function from `lib/services/sessions.ts`:

```typescript
import { recordEvent } from "@/lib/services/sessions";

// Record a user code edit
await recordEvent(
  sessionId,
  "code.edit",      // eventType
  "USER",           // origin
  {                 // data payload
    key: "a",
    position: { line: 10, column: 5 },
  },
  {                 // options
    filePath: "solution.ts",
    questionIndex: 0,
  }
);

// Record AI-generated code
await recordEvent(
  sessionId,
  "code.snapshot",
  "AI",
  {
    fileName: "solution.ts",
    content: "// AI generated code...",
    toolName: "write_file",
  },
  { filePath: "solution.ts", checkpoint: true }
);

// Record system event
await recordEvent(
  sessionId,
  "evaluation.complete",
  "SYSTEM",
  {
    score: 85,
    feedback: "Good solution with clean code.",
  },
  { checkpoint: true }
);
```

### Recording Chat Interactions

```typescript
import { recordClaudeInteraction } from "@/lib/services/sessions";

// User message (automatically gets USER origin)
await recordClaudeInteraction(sessionId, {
  role: "user",
  content: "How do I solve this problem?",
});

// Assistant message (automatically gets AI origin)
await recordClaudeInteraction(sessionId, {
  role: "assistant",
  content: "Here's how to approach this...",
  model: "claude-sonnet-4-5-20250929",
  inputTokens: 150,
  outputTokens: 300,
});
```

### Recording Code Snapshots

```typescript
import { recordCodeSnapshot } from "@/lib/services/sessions";

// User-edited code
await recordCodeSnapshot(
  sessionId,
  {
    fileId: "file-1",
    fileName: "solution.ts",
    language: "typescript",
    content: "function solve() { ... }",
  },
  "USER",           // origin
  previousContent   // for diff calculation
);

// AI-generated code
await recordCodeSnapshot(
  sessionId,
  { ... },
  "AI"
);
```

### Querying Events

```typescript
import { eventStore } from "@/lib/services/event-store";

// Get all events for a session
const events = await eventStore.getEvents(sessionId);

// Get events by category
const chatEvents = await eventStore.getEvents(sessionId, {
  categories: ["chat"],
});

// Get checkpoint events only
const checkpoints = await eventStore.getEvents(sessionId, {
  checkpointsOnly: true,
});

// Get events for a specific question
const q1Events = await eventStore.getEvents(sessionId, {
  questionIndex: 0,
});
```

## Event Batching

For high-frequency events (like keystrokes), use batched emission to reduce database writes:

```typescript
// Batched emission (writes are buffered and flushed periodically)
await recordEvent(
  sessionId,
  "code.edit",
  "USER",
  { key: "a" },
  { useBatch: true }
);

// Force flush all batched events
await eventStore.flushBatch();
```

## Analytics & Reporting

The unified event store enables rich analytics:

```typescript
import { getSessionStats } from "@/lib/services/sessions";

const stats = await getSessionStats(sessionId);
// Returns:
// - eventCount, duration
// - fileChanges: { totalSnapshots, linesAdded, linesDeleted, ... }
// - claudeInteractions: { totalInteractions, tokensUsed, ... }
// - terminalActivity: { totalCommands, commandCategories, ... }
// - testExecution: { totalTests, passedTests, failedTests, passRate, ... }
// - activityTimeline: { firstEventTime, lastEventTime, totalActiveTime }
```

### Origin-Based Analytics

```typescript
// Analyze candidate vs AI contributions
const allEvents = await eventStore.getEvents(sessionId);

const userCodeEvents = allEvents.filter(
  e => e.category === "code" && e.origin === "USER"
);
const aiCodeEvents = allEvents.filter(
  e => e.category === "code" && e.origin === "AI"
);

const userCodePercentage = userCodeEvents.length / (userCodeEvents.length + aiCodeEvents.length);
```

## Session Replay

Events can be replayed for session review:

```typescript
// Get all events ordered by sequence number
const events = await eventStore.getEvents(sessionId);

// Jump to checkpoint
const checkpoints = events.filter(e => e.checkpoint);
const targetCheckpoint = checkpoints.find(c => c.eventType === "question.start");

// Replay from checkpoint
const eventsFromCheckpoint = events.filter(
  e => e.sequenceNumber >= targetCheckpoint.sequenceNumber
);
```

## Performance Considerations

1. **Batch Writes** - High-frequency events (code edits) are batched
2. **Checkpoints** - Quick seeking without replaying all events
3. **Indexes** - Optimized for common query patterns (session, category, origin, checkpoint)
4. **Pagination** - Large sessions can be loaded in chunks
5. **Compression** - JSON data can be compressed for storage

## Best Practices

1. **Always specify origin**: Every event must have an appropriate origin (USER, AI, or SYSTEM)

2. **Use specific event types**: Prefer specific types like `file.create` over generic ones

3. **Include relevant data**: Event payloads should contain enough context for replay and analysis

4. **Mark checkpoints appropriately**: Important events should be marked as checkpoints for efficient replay

5. **Use batching for high-frequency events**: Code edits and cursor movements should use batched emission

6. **Include file paths**: File-related events should always include the `filePath` option

7. **Track question context**: Events during question-solving should include `questionIndex`

## Migration Notes

The previous system used separate tables:
- `SessionEvent` - General events
- `ClaudeInteraction` - Chat messages
- `CodeSnapshot` - Code versions
- `TestResult` - Test executions

All data is now unified in `SessionEventLog`. The legacy `mapLegacyEventType()` function has been removed. All code should use the new event types directly with proper origin specification.
