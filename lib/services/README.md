# InterviewLM Service Layer

Complete service layer for managing interview sessions, AI interactions, code execution, and data persistence.

## Overview

The service layer consists of 5 core services:

1. **Claude AI Service** (`claude.ts`) - AI-assisted coding with Claude API
2. **Modal Sandbox Service** (`modal.ts`) - Secure code execution environments
3. **S3 Storage Service** (`s3.ts`) - Session recording storage with compression
4. **Session Recording Service** (`sessions.ts`) - Real-time event capture and persistence
5. **Question Generation Service** (`questions.ts`) - Adaptive question generation

## Installation

All required dependencies are already installed in `package.json`:

```json
{
  "@anthropic-ai/sdk": "^0.30.0",
  "@aws-sdk/client-s3": "^3.654.0",
  "@aws-sdk/s3-request-presigner": "^3.654.0",
  "pako": "^2.1.0",
  "diff": "^7.0.0",
  "zod": "^3.23.8",
  "ws": "^8.18.0"
}
```

## Environment Variables

Configure the following in `.env`:

```bash
# Claude AI
ANTHROPIC_API_KEY=your-anthropic-api-key

# Modal Sandbox
MODAL_TOKEN_ID=your-modal-token-id
MODAL_TOKEN_SECRET=your-modal-token-secret
MODAL_WORKSPACE=your-workspace-name
MODAL_API_URL=https://modal.com/api/v1

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=interviewlm-sessions

# Database
DATABASE_URL=postgresql://...
```

## Usage Examples

### 1. Claude AI Service

```typescript
import { streamChatCompletion, getChatCompletion } from "@/lib/services";

// Streaming response (for UI)
const messages = [
  { role: "user", content: "How do I implement binary search?" }
];

const context = {
  problemTitle: "Binary Search",
  problemDescription: "Implement binary search algorithm",
  language: "typescript",
  currentCode: "function search(arr, target) { ... }"
};

for await (const chunk of streamChatCompletion(messages, context)) {
  if (chunk.done) {
    console.log("Total tokens:", chunk.usage?.totalTokens);
  } else {
    process.stdout.write(chunk.content);
  }
}

// Non-streaming response (for server-side processing)
const response = await getChatCompletion(messages, context);
console.log(response.content);
console.log(`Cost: $${response.usage.estimatedCost.toFixed(4)}`);
```

### 2. Modal Sandbox Service

```typescript
import { executeCode, createSandbox, destroySandbox } from "@/lib/services";

// Execute code with test cases
const result = await executeCode(
  "function add(a, b) { return a + b; }",
  "javascript",
  [
    { name: "test_add", input: [2, 3], expected: 5, hidden: false },
    { name: "test_zero", input: [0, 0], expected: 0, hidden: false }
  ]
);

console.log(`${result.passedTests}/${result.totalTests} tests passed`);

// Create persistent sandbox
const sandbox = await createSandbox("session_123", "typescript");
console.log("Sandbox ID:", sandbox.id);

// Clean up
await destroySandbox(sandbox.id);
```

### 3. S3 Storage Service

```typescript
import {
  uploadSessionRecording,
  downloadSessionRecording,
  generatePresignedUrl
} from "@/lib/services";

// Upload session events
const events = [
  { timestamp: new Date().toISOString(), type: "keystroke", data: { key: "a" } },
  { timestamp: new Date().toISOString(), type: "code_snapshot", data: { ... } }
];

const uploadResult = await uploadSessionRecording("session_123", events, {
  candidateId: "cand_123",
  duration: "1800"
});

console.log(`Compressed ${uploadResult.size} → ${uploadResult.compressedSize} bytes`);
console.log(`Compression ratio: ${uploadResult.compressionRatio.toFixed(2)}x`);

// Download and decompress
const { events: downloadedEvents } = await downloadSessionRecording("session_123");
console.log(`Retrieved ${downloadedEvents.length} events`);

// Generate temporary access URL
const url = await generatePresignedUrl("session_123", 3600);
// Share with client for download
```

### 4. Session Recording Service

```typescript
import {
  createSession,
  recordEvent,
  recordClaudeInteraction,
  recordCodeSnapshot,
  recordTestResult,
  closeSession,
  getSessionStats
} from "@/lib/services";

// Start session
const session = await createSession("cand_123");

// Record various events
await recordEvent(session.id, {
  type: "file_created",
  fileId: "file_1",
  data: { fileName: "solution.ts" }
});

await recordClaudeInteraction(session.id, {
  role: "assistant",
  content: "Here's how to approach this problem...",
  model: "claude-sonnet-4-5-20250929",
  inputTokens: 150,
  outputTokens: 300,
  latency: 1200
});

await recordCodeSnapshot(
  session.id,
  {
    fileId: "file_1",
    fileName: "solution.ts",
    language: "typescript",
    content: "function solve() { return 42; }"
  }
);

await recordTestResult(session.id, {
  testName: "test_basic",
  passed: true,
  duration: 15
});

// Finalize session (uploads to S3)
await closeSession(session.id, "COMPLETED");

// Get statistics
const stats = await getSessionStats(session.id);
console.log(`Events: ${stats.eventCount}`);
console.log(`Tokens: ${stats.totalTokensUsed}`);
console.log(`Tests passed: ${stats.testsPassedCount}/${stats.testResultCount}`);
```

### 5. Question Generation Service

```typescript
import {
  generateQuestion,
  getNextQuestion,
  startQuestion,
  completeQuestion,
  calculatePerformance
} from "@/lib/services";

// Generate adaptive question
const result = await generateQuestion({
  candidateId: "cand_123",
  difficulty: "MEDIUM",
  language: "typescript",
  previousPerformance: 0.75 // 75% on previous questions
});

console.log("Generated:", result.question.title);
console.log("Adapted difficulty:", result.adaptedDifficulty);
console.log("Tokens used:", result.tokensUsed);

// Get next question (auto-generates if needed)
const nextQuestion = await getNextQuestion("cand_123", true);
if (nextQuestion) {
  // Start the question
  await startQuestion(nextQuestion.id);

  // ... candidate works on it ...

  // Complete with score
  await completeQuestion(nextQuestion.id, 0.85);
}

// Calculate overall performance
const performance = await calculatePerformance("cand_123");
console.log(`Completed: ${performance.completedQuestions}/${performance.totalQuestions}`);
console.log(`Average score: ${(performance.averageScore * 100).toFixed(0)}%`);
console.log(`Time spent: ${performance.timeSpent.toFixed(0)} minutes`);
```

## Architecture

### Service Dependencies

```
┌─────────────────────────────────────────────────┐
│              Application Layer                   │
│  (Next.js API Routes, Server Components)        │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│              Service Layer                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  Claude  │  │  Modal   │  │    S3    │      │
│  │ Service  │  │ Service  │  │ Service  │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│  ┌──────────┐  ┌──────────┐                    │
│  │ Session  │  │ Question │                    │
│  │ Service  │  │ Service  │                    │
│  └──────────┘  └──────────┘                    │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│          Infrastructure Layer                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  Prisma  │  │ Claude   │  │  Modal   │      │
│  │   ORM    │  │   API    │  │   API    │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│  ┌──────────┐                                   │
│  │  AWS S3  │                                   │
│  └──────────┘                                   │
└─────────────────────────────────────────────────┘
```

### Data Flow: Interview Session

```
1. Start Interview
   └─> createSession() → Prisma → SessionRecording

2. Candidate writes code
   └─> recordEvent() → Event buffer → Batch insert

3. Candidate asks Claude for help
   └─> streamChatCompletion() → Claude API
   └─> recordClaudeInteraction() → Prisma

4. Code changes saved
   └─> recordCodeSnapshot() → Calculate diff → Prisma

5. Run tests
   └─> executeCode() → Modal API → Test results
   └─> recordTestResult() → Prisma

6. End interview
   └─> closeSession()
       ├─> Flush event buffer
       ├─> Upload to S3 (compressed)
       └─> Update SessionRecording
```

## Error Handling

All services include comprehensive error handling:

```typescript
try {
  const result = await executeCode(code, language, testCases);
  // Handle success
} catch (error) {
  if (error.message.includes("timeout")) {
    // Handle timeout
  } else if (error.message.includes("API error")) {
    // Handle API error
  } else {
    // Handle unknown error
  }
}
```

## Performance Optimizations

### Session Recording
- **Event buffering**: Events are batched every 10 seconds or 100 events
- **Checkpoint events**: Fast seeking in replay with strategic checkpoints
- **Gzip compression**: 5-10x compression ratio on S3 storage

### S3 Storage
- **Presigned URLs**: Direct client uploads/downloads without server proxy
- **Path partitioning**: Organized by date for efficient queries
- **Metadata tags**: Fast filtering without decompression

### Question Generation
- **Adaptive difficulty**: Adjusts based on candidate performance
- **Template caching**: Reuses problem seeds when available
- **Token tracking**: Cost monitoring and optimization

## Testing

### Unit Tests

```bash
npm test lib/services
```

### Integration Tests

```bash
# Requires environment variables to be set
npm run test:integration
```

### Health Checks

```typescript
import { claudeService, modalService, s3Service } from "@/lib/services";

// Test connections
const claudeOk = await claudeService.testConnection();
const modalOk = await modalService.testConnection();
const s3Ok = await s3Service.testConnection();

console.log("Service health:", { claudeOk, modalOk, s3Ok });
```

## Cost Monitoring

### Claude API Costs

```typescript
// Tracked automatically in each response
const response = await getChatCompletion(messages, context);
console.log(`Cost: $${response.usage.estimatedCost.toFixed(4)}`);
console.log(`Input: ${response.usage.inputTokens} tokens`);
console.log(`Output: ${response.usage.outputTokens} tokens`);
```

### S3 Storage Costs

```typescript
const stats = await getStorageStats(sessionId);
console.log(`Compressed size: ${stats.compressedSize} bytes`);
// ~$0.023/GB/month for S3 Standard
```

### Modal Sandbox Costs

```typescript
// Track execution time for billing
const result = await executeCode(code, language, testCases);
console.log(`Execution time: ${result.executionTime}ms`);
```

## Security Considerations

1. **API Keys**: Never commit keys to git, use environment variables
2. **Sandbox Isolation**: Modal provides secure, isolated execution environments
3. **S3 Presigned URLs**: Time-limited access (default 1 hour)
4. **Input Validation**: All services use Zod for input validation
5. **Error Messages**: Sensitive info is logged server-side only

## Troubleshooting

### Claude API Issues

```typescript
// Check API key
console.log("API Key set:", !!process.env.ANTHROPIC_API_KEY);

// Test connection
const connected = await claudeService.testConnection();
console.log("Claude connected:", connected);
```

### Modal Sandbox Issues

```typescript
// Check credentials
console.log("Modal Token ID:", process.env.MODAL_TOKEN_ID);
console.log("Modal Token Secret:", process.env.MODAL_TOKEN_SECRET?.substring(0, 5) + "...");

// List active sandboxes
const sandboxes = await modalService.listActiveSandboxes();
console.log("Active sandboxes:", sandboxes.length);
```

### S3 Upload Issues

```typescript
// Check credentials and bucket
const stats = await s3Service.getStorageStats(sessionId);
console.log("Session exists in S3:", stats.exists);

// Test write permissions
const testOk = await s3Service.testConnection();
console.log("S3 write test:", testOk);
```

## Future Enhancements

- [ ] Redis caching for session events (reduce DB load)
- [ ] WebSocket support for real-time event streaming
- [ ] Batch question generation (parallel API calls)
- [ ] S3 Glacier archival for old sessions
- [ ] Rate limiting for API calls
- [ ] Retry logic with exponential backoff
- [ ] Circuit breaker pattern for external services

## License

Proprietary - InterviewLM Platform
