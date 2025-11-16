# InterviewLM UX & Implementation Review

## Executive Summary

This document provides a comprehensive review of the current implementation, identifying critical gaps, UX issues, and areas for improvement across all features.

## 🚨 Critical Issues (Must Fix)

### 1. **Conversation Reset UI Not Synchronized**
**Location**: `components/interview/AIChat.tsx`, `app/interview/[id]/page.tsx:349`

**Problem**:
- Backend calls `resetConversation()` when advancing to next question
- Frontend `messages` state still contains old conversation
- Users see confusing messages from previous question in the UI

**Impact**: 🔴 **HIGH** - Breaks conversation isolation, confuses candidates

**Fix**:
```typescript
// Add method to AIChat to expose reset
export interface AIChatHandle {
  resetConversation: () => void;
}

// In AIChat component
const resetConversation = () => {
  setMessages([]);
  conversationHistory.current = [];
  setError(null);
  // Show system message
  setMessages([{
    id: Date.now().toString(),
    role: "system",
    content: "Conversation reset for new question",
    timestamp: new Date(),
  }]);
};

// Expose via ref
useImperativeHandle(ref, () => ({ resetConversation }));

// In interview page
const aiChatRef = useRef<AIChatHandle>(null);
await resetConversation(candidateId, data.question.id);
aiChatRef.current?.resetConversation(); // Clear UI
```

---

### 2. **Retry Logic Not Integrated**
**Location**: `lib/chat-resilience.ts` created but unused in `components/interview/AIChat.tsx:115`

**Problem**:
- Created `fetchWithRetry()` utility
- AIChat still uses plain `fetch()`
- No resilience against network failures

**Impact**: 🔴 **HIGH** - Lost messages, poor experience on unstable networks

**Fix**:
```typescript
// In AIChat.tsx handleSend
import { fetchWithRetry } from "@/lib/chat-resilience";

const response = await fetchWithRetry(
  `/api/interview/${sessionId}/chat/agent`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: conversationHistory.current }),
  },
  {
    maxRetries: 3,
    onRetry: (attempt, delay) => {
      setIsReconnecting(true);
      setError(`Network issue. Retrying in ${delay/1000}s... (attempt ${attempt}/3)`);
    },
  }
);
setIsReconnecting(false);
```

---

### 3. **suggest_next_question Callback Not Connected**
**Location**: `app/interview/[id]/page.tsx:675` (AIChat usage)

**Problem**:
- AI tool `suggest_next_question` is implemented
- AIChat has `onSuggestNextQuestion` prop
- **But interview page doesn't pass the callback!**
- AI suggests advancing but nothing happens

**Impact**: 🔴 **HIGH** - Feature completely non-functional

**Fix**:
```typescript
// In app/interview/[id]/page.tsx
<AIChat
  sessionId={sessionData.sessionId}
  onFileModified={...}
  onTestResultsUpdated={...}
  onSuggestNextQuestion={(suggestion) => {
    // Show AI suggestion in QuestionCompletionCard
    setShowCompletionCard(true);
    // Or show modal: "AI suggests: ${suggestion.reason}. Ready to continue?"
  }}
/>
```

---

### 4. **Rate Limiting Bypassed (Security Hole)**
**Location**: `lib/agent-security.ts:113`, `components/interview/AIChat.tsx:55`

**Problem**:
- Rate limit check in backend uses `messages` from request body
- Frontend `conversationHistory.current` is client-side
- Malicious user can clear it and send fresh requests, bypassing limits

**Impact**: 🔴 **CRITICAL** - Security vulnerability

**Fix**:
```typescript
// Add server-side message counting
// In prisma schema
model SessionRecording {
  messageCount Int @default(0)
  lastMessageAt DateTime?
}

// In agent route
const sessionRecording = await prisma.sessionRecording.findUnique({
  where: { id: candidate.sessionRecordingId }
});

if (sessionRecording.messageCount > 50) {
  return NextResponse.json({ error: "Message limit exceeded" }, { status: 429 });
}

// Increment after processing
await prisma.sessionRecording.update({
  where: { id: sessionRecording.id },
  data: {
    messageCount: { increment: 1 },
    lastMessageAt: new Date()
  }
});

// Reset on new question
await prisma.sessionRecording.update({
  where: { id: sessionRecording.id },
  data: { messageCount: 0 }  // Reset count
});
```

---

### 5. **Terminal Completely Non-Functional**
**Location**: `components/interview/Terminal.tsx`, `lib/services/modal.ts:864`

**Problem**:
- Terminal component rendered but shows fake welcome message
- `getTerminalConnectionUrl()` exists but never called
- No WebSocket connection to Modal sandbox
- Users can't execute commands

**Impact**: 🔴 **HIGH** - Major advertised feature doesn't work

**Fix**:
```typescript
// In app/interview/[id]/page.tsx
const [terminalUrl, setTerminalUrl] = useState<string | null>(null);

useEffect(() => {
  if (sessionData) {
    const wsUrl = getTerminalConnectionUrl(candidateId);
    setTerminalUrl(wsUrl);
  }
}, [sessionData]);

// Pass to Terminal
<Terminal
  connectionUrl={terminalUrl}
  onConnect={() => console.log("Terminal connected")}
  onDisconnect={() => console.log("Terminal disconnected")}
/>
```

---

## ⚠️ High Priority Issues

### 6. **No Connection Status Indicator**
**Problem**: Users don't know if they're offline or AI is slow

**Fix**: Add connection status badge in AIChat header
```typescript
<div className="flex items-center gap-2">
  {isReconnecting ? (
    <Badge variant="warning">Reconnecting...</Badge>
  ) : isConnected ? (
    <Badge variant="success">Connected</Badge>
  ) : (
    <Badge variant="error">Offline</Badge>
  )}
</div>
```

---

### 7. **File Tree Not Synced with Modal**
**Location**: `components/interview/FileTree.tsx`

**Problem**:
- Shows mock data
- When AI writes files, tree doesn't update
- Users see outdated file structure

**Fix**:
```typescript
// Add to interview page
const refreshFileTree = async () => {
  const tree = await modal.getFileSystem(candidateId);
  setFiles(tree);
};

// Call after AI file operations
onFileModified={async (path) => {
  await refreshFileTree();
  // Then reload file...
}}
```

---

### 8. **Test Results Too Minimal**
**Location**: `app/interview/[id]/page.tsx` (test results display)

**Problem**:
- Only shows "3/5 passed"
- Doesn't show which tests failed or error messages
- Hard to debug

**Fix**: Create `TestResultsPanel` component
```typescript
<TestResultsPanel results={testResults} onExpand={(testName) => {
  // Show detailed error for this test
}} />
```

---

### 9. **No Session Recovery**
**Problem**:
- Page refresh loses all state
- Modal has `resumeSandbox()` but we never use it

**Fix**:
```typescript
// In useEffect
const checkExistingSession = async () => {
  const response = await fetch(`/api/interview/${candidateId}/status`);
  if (response.ok) {
    const data = await response.json();
    if (data.status === "IN_PROGRESS") {
      // Resume from checkpoint
      setSessionData(data);
      setCurrentQuestionIndex(data.currentQuestionIndex);
    }
  }
};
```

---

### 10. **No Way to Cancel Long-Running Tools**
**Problem**: If AI runs a slow command, UI hangs with no cancel option

**Fix**: Add AbortController to tool execution
```typescript
const abortControllerRef = useRef<AbortController | null>(null);

const handleSend = async () => {
  abortControllerRef.current = new AbortController();

  const response = await fetch(url, {
    signal: abortControllerRef.current.signal,
    ...options
  });
};

// Show cancel button when tool running
{currentToolUse && (
  <Button onClick={() => abortControllerRef.current?.abort()}>
    Cancel
  </Button>
)}
```

---

## 📋 Medium Priority Issues

### 11. **QuestionCompletionCard Blocks View**
**Problem**: Card overlays editor when tests pass, blocking code refinement

**Fix**: Make it dismissible or smaller
```typescript
<QuestionCompletionCard
  onDismiss={() => setShowCompletionCard(false)}
  compact // Smaller version
/>
```

---

### 12. **No Skip Question Option**
**Problem**: Stuck candidates can't move forward

**Fix**: Add "Skip Question" button with confirmation
```typescript
<Button
  variant="ghost"
  onClick={() => {
    if (confirm("Skip to next question? You can't go back.")) {
      handleNextQuestion();
    }
  }}
>
  Skip Question
</Button>
```

---

### 13. **Tool Results Too Technical**
**Problem**: Raw stdout/stderr isn't user-friendly

**Fix**: Format tool output nicely
```typescript
function formatToolResult(toolName, output) {
  if (toolName === "execute_bash") {
    return (
      <div>
        <div className="font-mono text-success">{output.stdout}</div>
        {output.stderr && (
          <div className="font-mono text-error">{output.stderr}</div>
        )}
      </div>
    );
  }
}
```

---

### 14. **File Sync Race Conditions**
**Problem**: `onFileModified()` might reload before Modal finishes writing

**Fix**: Add delay or poll for changes
```typescript
onFileModified={async (path) => {
  // Wait a bit for Modal to finish writing
  await new Promise(resolve => setTimeout(resolve, 500));

  // Then reload
  const content = await modal.readFile(volumeId, path);
  setCode(content);
}}
```

---

### 15. **No Conversation History Limits**
**Problem**: `conversationHistory.current` grows unbounded

**Fix**: Implement sliding window
```typescript
// Keep only last 20 messages
conversationHistory.current = conversationHistory.current.slice(-20);
```

---

### 16. **Sanitization Too Aggressive**
**Problem**: Hiding ALL execution time makes debugging hard

**Fix**: Show rounded time
```typescript
// In sanitizeToolOutput
if (toolName === "run_tests") {
  return {
    ...output,
    executionTime: Math.round(output.executionTime / 1000) + "s" // ~5s instead of 4837ms
  };
}
```

---

### 17. **No User Feedback on Security Blocks**
**Problem**: Technical error messages like "Security violation: Command contains potentially dangerous operations"

**Fix**: Friendly messages
```typescript
if (!validation.safe) {
  return {
    success: false,
    error: "⚠️ That command isn't allowed in the sandbox for security reasons. Try a different approach!"
  };
}
```

---

### 18. **No Abuse Detection**
**Problem**: Repeated rate limits just return 429, no flagging

**Fix**: Track suspicious behavior
```typescript
if (rateLimitExceeded) {
  await prisma.sessionEvent.create({
    data: {
      type: "rate_limit_exceeded",
      data: { messageCount, attemptedAt: new Date() }
    }
  });

  // Flag for review if repeated
  if (sessionRecording.rateLimitCount > 3) {
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { flaggedForReview: true }
    });
  }
}
```

---

### 19. **No Preview of What AI Sees**
**Problem**: Candidates don't know we hide metrics

**Fix**: Show transparency
```typescript
// In tool result display
if (toolName === "run_tests") {
  <div className="text-xs text-text-tertiary">
    ℹ️ Performance metrics hidden to prevent gaming
  </div>
}
```

---

## 💡 Low Priority (Nice to Have)

### 20. **No Onboarding/Tutorial**
- Quick tour: "This is Claude, it can help you code"
- Keyboard shortcuts overlay
- "First time? Here's how it works"

### 21. **AI Chat Takes Too Much Space on Small Screens**
- Make collapsible/floating
- Responsive breakpoints

### 22. **No Code Execution Preview**
- "Run this?" button on AI suggestions
- Preview before accepting changes

### 23. **No Hint System**
- Tiered hints beyond AI
- "Hint 1: Consider edge cases"

### 24. **No Code Formatting**
- Add Prettier integration
- Auto-format on save

### 25. **No Undo for AI Edits**
- Track AI changes
- Rollback button

---

## Architecture & Code Quality Issues

### Type Safety
- Too many `any` types in Agent SDK route
- Missing interfaces for tool results
- Should create strict types

### Error Handling
- Inconsistent: some `alert()`, some `console.error`
- Should standardize with toast notifications

### Loading States
- Missing spinners for file operations
- No feedback when reloading files

### Hardcoded Values
- Panel sizes (15%, 55%, 30%)
- Time limits (30min, 45min)
- Should be configurable per assessment

### No Testing
- Zero unit tests
- Zero integration tests
- Critical security features untested

### Performance Concerns
- Unbounded message history
- No pagination
- Potential memory leaks

---

## Implementation Roadmap

### Phase 1: Critical Fixes (1-2 days)
1. ✅ Fix conversation reset UI synchronization
2. ✅ Integrate retry logic with proper UI feedback
3. ✅ Connect suggest_next_question callback
4. ✅ Fix rate limiting security hole (server-side tracking)
5. ✅ Connect terminal to Modal WebSocket

### Phase 2: High Priority (2-3 days)
1. Add connection status indicator
2. Sync file tree with Modal
3. Expand test results display
4. Implement session recovery
5. Add tool execution cancellation

### Phase 3: Medium Priority (3-4 days)
1. Make completion card dismissible
2. Add skip question option
3. Improve tool result formatting
4. Add conversation history limits
5. Friendly security error messages

### Phase 4: Polish (ongoing)
1. Onboarding tutorial
2. Code formatting
3. Hint system
4. Undo/redo for AI edits
5. Unit & integration tests

---

## Metrics to Track

### User Experience
- Average time per question
- AI chat usage rate
- Tool execution success rate
- Connection retry frequency

### Security
- Rate limit violations
- Dangerous command attempts
- Prompt injection attempts
- Conversation reset failures

### Performance
- Message latency (p50, p95, p99)
- Tool execution time
- File sync lag
- Memory usage over time

---

## Conclusion

**Current State**: ✅ Core features implemented, 🔴 Critical gaps exist

**Priority**: Fix 5 critical issues immediately, then address high-priority UX problems

**Timeline**:
- Week 1: Critical fixes
- Week 2: High priority
- Week 3+: Medium/low priority + testing

The foundation is solid, but production readiness requires addressing the critical issues, especially conversation reset UI, retry logic, terminal connection, and rate limiting security.
