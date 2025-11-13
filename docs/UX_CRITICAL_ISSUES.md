# Critical UX & Implementation Issues

**Date**: 2025-11-11
**Status**: 🔴 **BLOCKING PRODUCTION LAUNCH**

This document outlines critical issues discovered during comprehensive UX review after implementing the 5 initial critical fixes. These issues **must be resolved** before production deployment.

---

## Executive Summary

- **Total Issues**: 60+
- **Critical (Blocking)**: 14 issues
- **High Priority**: 10 issues
- **Overall Grade**: C+ (functional but needs hardening)

**Main Risk Areas**:
1. **Data Loss** - No session recovery on refresh/crash
2. **Accessibility** - Major violations (screen readers, keyboard nav)
3. **Mobile** - Completely unusable on phones/tablets
4. **Edge Cases** - Network failures, race conditions, infinite loops

---

## 🔴 CRITICAL ISSUES (Must Fix Before Launch)

### 1. Session State Recovery ⚠️ HIGHEST PRIORITY

**Problem**: Browser refresh/crash loses all work
- Code changes not persisted to localStorage
- Test results lost
- Chat history may not reload
- Candidate loses 30+ minutes of work

**Impact**: **CATASTROPHIC** - Will cause support nightmares, negative reviews

**Location**: `app/interview/[id]/page.tsx:210-225`

**Current Code**:
```typescript
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = 'You have an interview in progress...';
    return 'You have an interview in progress...';
  };
  window.addEventListener('beforeunload', handleBeforeUnload);
  // ❌ WARNING SHOWS BUT STATE NOT SAVED!
}, [sessionData, isSubmitting]);
```

**Fix Required**:
```typescript
// Save to localStorage on every state change
useEffect(() => {
  if (!sessionData) return;

  const stateSnapshot = {
    code,
    selectedFile,
    testResults,
    timeRemaining,
    currentQuestionIndex,
    questionStartTime,
    lastSaved: Date.now(),
  };

  localStorage.setItem(
    `interview-state-${candidateId}`,
    JSON.stringify(stateSnapshot)
  );
}, [code, testResults, timeRemaining, selectedFile, currentQuestionIndex]);

// Restore on mount
useEffect(() => {
  const saved = localStorage.getItem(`interview-state-${candidateId}`);
  if (saved) {
    const state = JSON.parse(saved);
    if (Date.now() - state.lastSaved < 3600000) { // 1 hour
      // Show "Resume session?" dialog
      setCode(state.code);
      setTestResults(state.testResults);
      // ... restore other state
    }
  }
}, [candidateId]);
```

**Estimate**: 4 hours
**Priority**: 🔴 P0 - BLOCKING

---

### 2. File Save Race Condition 🐛

**Problem**: Changes lost when switching files before debounce fires

**Scenario**:
1. User edits `solution.js` for 1 second
2. Debounce timer starts (2s wait)
3. User switches to `test.js` after 1.5 seconds
4. `solution.js` changes **never save** (debounce cancelled)

**Location**: `app/interview/[id]/page.tsx:450-477`

**Fix Required**:
```typescript
const handleFileSelect = async (file: FileNode) => {
  // ✅ FLUSH PENDING SAVES FIRST
  if (debounceTimerRef.current) {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;

    // Save immediately
    if (sessionData && selectedFile) {
      await fetch(`/api/interview/${candidateId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: selectedFile.path,
          content: code,
          language: sessionData.question.language,
        }),
      });
    }
  }

  // Now load new file
  setSelectedFile(file);
  // ... rest of code
};
```

**Estimate**: 1 hour
**Priority**: 🔴 P0 - DATA LOSS RISK

---

### 3. Terminal Input UI Misleading ⚠️

**Problem**: Terminal looks interactive but commands don't actually execute in Modal sandbox

**Current State**:
- Welcome message says "Connected to Modal AI Sandbox" ✅
- Welcome message says "Claude Code CLI initialized" ✅
- User can type commands ✅
- Commands get sent to `/api/interview/[id]/terminal/input` ✅
- **But Modal sandbox execution is not actually wired up** ❌

**Location**: `components/interview/Terminal.tsx:94-102`

**Options**:
1. **Option A**: Fix backend integration (2-3 days)
2. **Option B**: Make terminal read-only with clear message (1 hour)

**Recommended**: Option B for MVP, then Option A post-launch

**Fix (Option B)**:
```typescript
// In Terminal.tsx welcome message
terminal.writeln("\x1b[1;34m╔═══════════════════════════╗\x1b[0m");
terminal.writeln("\x1b[1;34m║\x1b[0m  \x1b[1;36mInterviewLM Terminal\x1b[0m      \x1b[1;34m║\x1b[0m");
terminal.writeln("\x1b[1;34m╚═══════════════════════════╝\x1b[0m");
terminal.writeln("");
terminal.writeln("\x1b[90mTest output will appear here automatically.\x1b[0m");
terminal.writeln("\x1b[90mUse the AI assistant to run commands.\x1b[0m");
terminal.writeln("");

// Disable input
// terminal.onData(...) <- REMOVE THIS
```

**Estimate**: 1 hour (Option B) or 16 hours (Option A)
**Priority**: 🔴 P0 - MISLEADING UX

---

### 4. Conversation Reset Failure (Security Risk) 🔒

**Problem**: If conversation reset fails, AI retains context from previous question

**Security Impact**:
- Candidate could reference previous solutions
- Adaptive difficulty algorithm corrupted
- Assessment integrity compromised

**Location**: `app/interview/[id]/page.tsx:350-356`

**Current Code**:
```typescript
// CRITICAL: Reset AI conversation history for new question
await resetConversation(candidateId, data.question.id);
// ❌ If this fails, just logs error and continues!
```

**Fix Required**:
```typescript
// Retry logic with failure blocking
let resetSuccess = false;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    await resetConversation(candidateId, data.question.id);
    resetSuccess = true;
    break;
  } catch (error) {
    console.error(`Conversation reset attempt ${attempt + 1} failed:`, error);
    if (attempt === 2) {
      // Final attempt failed - BLOCK PROGRESSION
      throw new Error(
        "Failed to reset AI conversation. Please refresh and try again."
      );
    }
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
  }
}

if (!resetSuccess) {
  setIsLoadingNextQuestion(false);
  alert("Failed to load next question. Please refresh the page.");
  return;
}
```

**Estimate**: 2 hours
**Priority**: 🔴 P0 - SECURITY RISK

---

### 5. Screen Reader Support (Accessibility) ♿

**Problem**: Violates WCAG 2.1 Level AA - illegal in many jurisdictions

**Issues**:
- No ARIA labels on interactive elements
- CodeMirror not accessible
- Terminal output not announced
- File tree not keyboard navigable
- Resizable panels not screen reader friendly

**Legal Risk**: ADA lawsuits, government contract violations

**Locations**: All interactive components

**Fix Required** (Examples):
```typescript
// File Tree
<button
  onClick={() => handleFileSelect(file)}
  aria-label={`Open file ${file.name}`}
  role="treeitem"
  aria-selected={selectedFile?.path === file.path}
>

// Run Tests Button
<Button
  onClick={handleRunTests}
  aria-label="Run test suite"
  aria-busy={isRunningTests}
>

// AI Chat Input
<textarea
  aria-label="Chat with AI assistant"
  aria-describedby="chat-help-text"
  placeholder="Ask AI for help..."
/>
<span id="chat-help-text" className="sr-only">
  Type your message and press Enter to send. Shift+Enter for new line.
</span>
```

**Estimate**: 8 hours (full audit + fixes)
**Priority**: 🔴 P0 - LEGAL REQUIREMENT

---

### 6. Mobile Responsiveness 📱

**Problem**: Three-panel horizontal layout unusable on mobile

**Current Layout**:
- File Tree: 15% width
- Editor+Terminal: 55% width
- AI Chat: 30% width

**On iPhone 13 Pro (390px width)**:
- File Tree: 58px (can't read file names)
- Editor: 214px (1-2 words per line)
- AI Chat: 117px (unusable)

**Impact**: ~40% of candidates may try on mobile first (browsing job boards)

**Location**: `app/interview/[id]/page.tsx:583-717`

**Fix Required**:
```typescript
// Detect mobile
const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

// Stack vertically on mobile
<PanelGroup direction={isMobile ? "vertical" : "horizontal"}>
  <Panel defaultSize={isMobile ? 60 : 15} minSize={isMobile ? 40 : 10}>
    {/* File Tree */}
  </Panel>
  <Panel defaultSize={isMobile ? 40 : 55}>
    {/* Editor + Terminal */}
  </Panel>
  {/* On mobile, AI Chat becomes modal overlay */}
  {!isMobile && isAIChatOpen && (
    <Panel defaultSize={30}>...</Panel>
  )}
</PanelGroup>

{/* Mobile AI Chat Button */}
{isMobile && (
  <button
    className="fixed bottom-4 right-4 h-14 w-14 rounded-full bg-primary"
    onClick={() => setShowChatModal(true)}
  >
    <MessageSquare />
  </button>
)}
```

**Alternative**: Block mobile with message "Please use desktop browser for best experience"

**Estimate**: 6 hours (responsive) or 30 minutes (block mobile)
**Priority**: 🔴 P0 - USER ACQUISITION

---

### 7. Network Failure Handling 🌐

**Problem**: No offline detection, poor error recovery

**Issues**:
- Doesn't check `navigator.onLine` before API calls
- No message queuing when offline
- Generic error messages ("Failed to send message")
- No retry buttons for transient failures

**Location**: Multiple (`AIChat.tsx`, `page.tsx`, etc.)

**Fix Required**:
```typescript
// Add offline detection hook
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// Use in components
const isOnline = useOnlineStatus();

{!isOnline && (
  <div className="bg-warning/10 border-warning px-4 py-2 text-center">
    ⚠️ You're offline. Changes will sync when reconnected.
  </div>
)}

// Queue messages when offline
const [messageQueue, setMessageQueue] = useState<Message[]>([]);

const handleSend = async () => {
  if (!isOnline) {
    // Add to queue
    setMessageQueue(prev => [...prev, newMessage]);
    return;
  }

  // Send message...
};

// Auto-flush queue when back online
useEffect(() => {
  if (isOnline && messageQueue.length > 0) {
    messageQueue.forEach(msg => sendMessage(msg));
    setMessageQueue([]);
  }
}, [isOnline, messageQueue]);
```

**Estimate**: 4 hours
**Priority**: 🔴 P0 - RELIABILITY

---

## 🟡 HIGH PRIORITY (Fix in Sprint 2)

### 8. No Save Confirmation Feedback

**Problem**: Files save silently - no user confidence

**Fix**: Add toast notifications
```typescript
// Install: npm install sonner
import { toast } from 'sonner';

// In handleCodeChange debounced callback
toast.success('Saved', { duration: 2000 });

// In handleManualSave (Ctrl+S)
toast.success('File saved manually', { icon: '💾' });
```

**Estimate**: 2 hours (includes library setup)
**Priority**: 🟡 P1

---

### 9. Submit Uses alert() Instead of Dialog

**Problem**: Native browser alerts break design system

**Location**: `app/interview/[id]/page.tsx:373-377, 401-406`

**Fix**: Create proper Dialog component
```typescript
<Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Submit Assessment?</DialogTitle>
      <DialogDescription>
        This action cannot be undone. Make sure you've completed all questions.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>
        Cancel
      </Button>
      <Button variant="danger" onClick={confirmSubmit} loading={isSubmitting}>
        Submit Final Answers
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Estimate**: 3 hours
**Priority**: 🟡 P1

---

### 10. AI Chat History Load Failure Not Handled

**Problem**: If history fetch fails on mount, candidate starts with empty chat

**Location**: `components/interview/AIChat.tsx:92-114`

**Fix**: Add retry with fallback
```typescript
const loadHistory = async () => {
  try {
    const response = await fetchWithRetry(`/api/interview/${sessionId}/chat/history`);
    // ... load history
  } catch (error) {
    console.error('Failed to load chat history:', error);

    // Show warning but don't block usage
    setMessages([{
      id: 'error-history',
      role: 'system',
      content: '⚠️ Could not load previous chat history. Starting fresh conversation.',
      timestamp: new Date(),
    }]);
  }
};
```

**Estimate**: 1 hour
**Priority**: 🟡 P1

---

### 11. Question Generation Timeout

**Problem**: No timeout on question generation - candidate waits indefinitely

**Location**: `app/interview/[id]/page.tsx:299-310`

**Fix**:
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s

try {
  const response = await fetch(`/api/interview/${candidateId}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ previousPerformance: { ... } }),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);
  // ... handle response

} catch (error) {
  if (error.name === 'AbortError') {
    // Show retry option
    setError('Question generation timed out. Please try again.');
  }
}
```

**Estimate**: 1 hour
**Priority**: 🟡 P1

---

### 12. SSE Infinite Reconnect Loop

**Problem**: Terminal reconnects forever on persistent errors

**Location**: `components/interview/Terminal.tsx:132-143`

**Fix**:
```typescript
const MAX_RECONNECT_ATTEMPTS = 5;
const reconnectAttempts = useRef(0);

eventSource.onerror = (error) => {
  console.error("SSE error:", error);
  updateConnectionStatus("disconnected");
  eventSource.close();

  reconnectAttempts.current++;

  if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
    terminal.writeln(`\r\n\x1b[31m✗ Connection lost. Retrying (${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})...\x1b[0m`);

    reconnectTimeoutRef.current = setTimeout(() => {
      connectSSE();
    }, Math.min(3000 * reconnectAttempts.current, 15000)); // Exponential backoff
  } else {
    terminal.writeln(`\r\n\x1b[31m✗ Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts.\x1b[0m`);
    terminal.writeln(`\x1b[33mClick here to reconnect manually: [Reconnect]\x1b[0m`);
  }
};
```

**Estimate**: 1 hour
**Priority**: 🟡 P1

---

### 13. Total Questions Not Synced

**Problem**: Progress bar shows wrong percentage (hardcoded to 3 questions)

**Location**: `app/interview/[id]/page.tsx:85`

**Fix**:
```typescript
// In initialization response
const data: SessionData = await response.json();
setTotalQuestions(data.assessment.totalQuestions || 3); // ✅ From API

// In next question response
const data = await response.json();
if (data.totalQuestions) {
  setTotalQuestions(data.totalQuestions); // Update if changed
}
```

**Estimate**: 30 minutes
**Priority**: 🟡 P1

---

### 14. Error Messages Not Actionable

**Problem**: Generic "Failed to send message" - no context or actions

**Location**: `components/interview/AIChat.tsx:354-359`

**Fix**:
```typescript
const getErrorMessage = (error: Error, status?: number) => {
  if (!navigator.onLine) {
    return {
      title: 'No Internet Connection',
      message: 'Please check your connection and try again.',
      action: 'Retry',
    };
  }

  if (status === 429) {
    return {
      title: 'Message Limit Reached',
      message: 'You\'ve sent the maximum messages for this question. Try solving independently or move to the next question.',
      action: 'Continue',
    };
  }

  if (status === 500 || status === 503) {
    return {
      title: 'Server Error',
      message: 'Our servers are experiencing issues. Please wait a moment and try again.',
      action: 'Retry',
    };
  }

  return {
    title: 'Message Failed',
    message: error.message || 'An unexpected error occurred.',
    action: 'Retry',
  };
};

// In error handling
const errorInfo = getErrorMessage(err, response?.status);
setError(
  <div>
    <strong>{errorInfo.title}</strong>
    <p>{errorInfo.message}</p>
    <Button onClick={handleRetry}>{errorInfo.action}</Button>
  </div>
);
```

**Estimate**: 2 hours
**Priority**: 🟡 P1

---

## 🟢 MEDIUM PRIORITY (UX Polish - Sprint 3)

- Tool use display too technical - simplify formatting
- No diff visualization when AI modifies code
- Redundant test button in CodeEditor and header
- Loading screen shows fake progress bar
- Time warning states (yellow/red at < 30 min / < 10 min)
- Font sizes too small (increase to 16px minimum)

---

## 🔵 LOW PRIORITY (Post-Launch Improvements)

- Message editing/retry in AI chat
- Command history (Up/Down arrows) in terminal
- Skip question option for stuck candidates
- Code formatting integration (Prettier)
- Keyboard shortcuts in header dropdown
- Empty state prompts
- Skeleton loaders

---

## Implementation Roadmap

### **Sprint 1: Critical Fixes (1 week)**
- [ ] Session state recovery (4h)
- [ ] File save race condition (1h)
- [ ] Terminal UI fix (1h Option B)
- [ ] Conversation reset retry (2h)
- [ ] Screen reader ARIA labels (8h)
- [ ] Mobile responsive layout OR block mobile (6h or 30m)
- [ ] Network failure handling (4h)

**Total**: ~26 hours = 3-4 days

### **Sprint 2: High Priority (1 week)**
- [ ] Toast notifications (2h)
- [ ] Dialog for submit (3h)
- [ ] Chat history error handling (1h)
- [ ] Question generation timeout (1h)
- [ ] SSE max reconnect attempts (1h)
- [ ] Total questions sync (30m)
- [ ] Actionable error messages (2h)

**Total**: ~10.5 hours = 1.5 days

### **Sprint 3: UX Polish (1 week)**
- [ ] Simplify tool use display (2h)
- [ ] Diff visualization (4h)
- [ ] Remove redundant test button (30m)
- [ ] Real loading indicators (1h)
- [ ] Time warning states (1h)
- [ ] Font size audit (2h)

**Total**: ~10.5 hours = 1.5 days

---

## Testing Checklist

### Critical Path Testing

- [ ] Browser refresh during interview (session recovery)
- [ ] Switch files rapidly while typing (save race condition)
- [ ] Try terminal commands (clear expectations)
- [ ] Move to next question (conversation reset works)
- [ ] Test with screen reader (NVDA/JAWS)
- [ ] Open on iPhone/Android (mobile experience)
- [ ] Disconnect wifi during coding (offline handling)

### Edge Cases

- [ ] Close browser tab accidentally
- [ ] Multiple tabs of same interview
- [ ] Hit back button during interview
- [ ] Submit with network failure
- [ ] Modal API timeout during initialization
- [ ] Rate limit exceeded (50 messages)
- [ ] Time expires during code edit

### Accessibility

- [ ] Tab through all interactive elements
- [ ] Use keyboard only (no mouse)
- [ ] Test with screen reader
- [ ] Test with 200% zoom
- [ ] Test with high contrast mode
- [ ] Test color blind simulation

---

## Metrics to Track Post-Launch

1. **Session Abandonment Rate** (target: < 5%)
   - Refresh without resume = sign of poor recovery UX

2. **Error Rate** (target: < 1% of API calls)
   - Track 4xx/5xx responses

3. **Mobile Bounce Rate** (target: < 20%)
   - Users leaving immediately on mobile

4. **Accessibility Complaints** (target: 0)
   - Legal liability if non-zero

5. **Average Time to Complete** (baseline)
   - If > 45 min, indicates UI friction

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Data loss on refresh | 🔴 Critical | High | Sprint 1: Session recovery |
| ADA lawsuit | 🔴 Critical | Medium | Sprint 1: ARIA labels |
| Mobile users blocked | 🟡 High | High | Sprint 1: Block mobile with message |
| AI context leakage | 🔴 Critical | Low | Sprint 1: Retry conversation reset |
| Network failure frustration | 🟡 High | Medium | Sprint 1: Offline detection |
| Infinite API loop costs | 🟡 High | Low | Sprint 2: Max reconnect attempts |

---

## Stakeholder Communication

**To Engineering**: Focus Sprint 1 on the 7 critical issues above. These are **hard blockers** for production.

**To Product**: UX is functional but needs significant polish. Set expectations that MVP will have rough edges (Sprint 2/3 fixes).

**To Legal**: Accessibility work (ARIA labels) is scheduled for Sprint 1. All changes will be documented for compliance audit.

**To Marketing**: Do NOT launch public marketing until Sprint 1 complete. Risk of viral negative reviews is too high.

---

## Questions for Product/Design

1. **Mobile Strategy**: Block mobile entirely, or invest in responsive redesign?
2. **Terminal**: Fix backend (2-3 days) or disable input for MVP?
3. **Accessibility**: Target WCAG 2.1 AA or AAA?
4. **Session Recovery**: Auto-resume or show "Resume session?" dialog?
5. **Error Handling**: How much technical detail to show candidates?

---

*This document should be reviewed with Product, Design, and Engineering leads before Sprint 1 planning.*
