# Architecture Quick Reference Guide

## 🔴 Critical Issues (Fix Immediately)

### 1. AIChat SSE Event Format Mismatch
- **Status:** Chat is broken in production
- **Fix Time:** 15 minutes
- **File:** `app/api/interview/[id]/chat/route.ts`
- **Problem:** Client expects `event: content`, server sends `data: {...type: "chunk"}`
- **Impact:** No AI responses stream to UI

**Quick Fix:**
```typescript
// Change this (line 127-128):
controller.enqueue(encoder.encode(`data: ${data}\n\n`));

// To this:
controller.enqueue(encoder.encode(`event: content\ndata: ${JSON.stringify({delta: text})}\n\n`));
```

### 2. Auth Checks Commented Out
- **Status:** Demo mode bypasses security
- **Fix Time:** 5 minutes  
- **File:** Multiple `route.ts` files (terminal/route.ts line 19, etc.)
- **Problem:** `isDemoMode = id === "demo"` skips all auth
- **Impact:** Security vulnerability in production

**Quick Fix:** Uncomment auth checks and remove demo mode bypass

### 3. FileTree Still Using Mock Data
- **Status:** Shows hardcoded files, not real workspace
- **Fix Time:** 6 hours (high effort)
- **File:** `app/interview/[id]/page.tsx` line 30-77
- **Problem:** `const sampleFiles` never synced with Modal volume
- **Impact:** Users can't see/edit real files

---

## 🟡 Major Gaps (Affects MVP)

### 4. Session Initialization Flow Missing
- **Status:** No session setup; hardcoded data
- **Fix Time:** 4 hours
- **Missing:** `/api/interview/[id]/initialize` endpoint
- **Impact:** Can't start real interviews

### 5. Real-Time File Sync Missing
- **Status:** Code editor doesn't sync with Modal volume
- **Fix Time:** 6 hours
- **Missing:** `POST /api/interview/[id]/files` endpoint
- **Impact:** Edits lost; Modal volume not updated

### 6. Test Results Not Streaming
- **Status:** All tests run then return; no progress
- **Fix Time:** 3 hours
- **Current:** `run-tests` returns all results at once
- **Better:** Stream results as they complete via SSE

---

## 🟢 Working Well

| Component | Status | Notes |
|-----------|--------|-------|
| Terminal SSE | ✓ | Works with demo data |
| Database Events | ✓ | All events recorded |
| Authentication | ✓ | NextAuth configured (but bypassed) |
| Questions API | ✓ | Generates questions with LLM |
| Modal Service | ✓ | Service exists (not used) |
| CodeEditor | ✓ | Records changes (doesn't sync) |

---

## Architecture Flowchart

```
┌─────────────────────────────────────┐
│      Interview Page (UX Layer)      │
├─────────────────────────────────────┤
│ FileTree      │ CodeEditor │ AIChat  │
│ (mock data)   │ (static)   │ (broken)│
│ Terminal (SSE)                      │
└────────┬──────┬──────────┬──────────┘
         │      │          │
         │ HTTP/SSE        │
         ↓      ↓          ↓
┌─────────────────────────────────────┐
│    Backend API Routes (40% done)    │
├─────────────────────────────────────┤
│ /chat           ✗ Broken (event format)
│ /files          ✗ Missing
│ /terminal       ✓ Works (demo only)
│ /run-tests      ✓ Works (mock data)
│ /questions      ✓ Works (not called)
│ /events         ✓ Works (recording)
│ /initialize     ✗ Missing
│ /submit         ✗ Missing
└────────┬────────┬──────────┬────────┘
         │        │          │
         │ HTTP   │ Modal API│
         ↓        ↓          ↓
┌──────────────────────────────────────┐
│  External Services (SDK layer)       │
├──────────────────────────────────────┤
│ Modal Sandbox   ✗ Not connected      │
│ Claude API      ✓ Connected (broken) │
│ PostgreSQL DB   ✓ Connected          │
│ NextAuth        ✓ Connected (bypass) │
└──────────────────────────────────────┘
```

---

## Implementation Priority

### Week 1 (Critical Path)
1. Fix AIChat event format (15 min)
2. Uncomment auth checks (5 min)
3. Create `/api/interview/[id]/initialize` (4 hrs)
4. Add `/api/interview/[id]/files` endpoints (3 hrs)

### Week 2 (MVP Completeness)
1. Implement file sync hook (3 hrs)
2. Connect FileTree to real data (2 hrs)
3. Stream test results via SSE (3 hrs)
4. Wire up Modal sandbox to terminal (3 hrs)

### Week 3 (Polish)
1. Create InterviewContext for state management (4 hrs)
2. Add session persistence/resume (2 hrs)
3. Implement error boundaries & retry logic (3 hrs)
4. Add analytics & logging (2 hrs)

---

## Cost Optimization Quick Wins

### Reduce API Calls
- Batch events (5 second intervals) → 90% reduction
- Cache file reads (5 second TTL) → 50% reduction

### Reduce Modal Usage
- Archive old volumes to S3 → 5x storage savings
- Implement lazy sandbox init → 2x sandbox creation savings

### Reduce Claude Token Usage
- Selective context (only when code changed) → 30% reduction
- Cache prompt templates → 10% reduction

**Estimated Monthly Savings:** $500-1000 per 1000 assessments

---

## State Management Pattern Recommendation

**Don't:** Redux, Zustand (overkill for single page)
**Do:** Context + useReducer

```typescript
// Minimal but complete state management
const [state, dispatch] = useReducer(interviewReducer, initialState);

// Handles:
// - Session initialization
// - File updates
// - Test results
// - Timer countdown
// - Error states
// - Connectivity status
```

---

## Real-Time Communication Summary

| Use Case | Current | Recommended | Effort |
|----------|---------|-------------|--------|
| AI Chat | SSE (broken) | SSE (fixed) | 15 min |
| Terminal I/O | SSE + HTTP polling | WebSocket | 4 hrs |
| File Changes | None | SSE | 3 hrs |
| Test Results | HTTP batch | SSE streaming | 3 hrs |

**Overall Recommendation:** Stick with SSE for most things, only WebSocket for Terminal

---

## Files to Review

### Critical (Start Here)
- `/app/api/interview/[id]/chat/route.ts` - Fix event format
- `/app/interview/[id]/page.tsx` - Hardcoded data
- `/components/interview/AIChat.tsx` - Event listener setup

### Important (Next)
- `/lib/services/modal.ts` - Modal integration service (exists but unused)
- `/app/api/interview/[id]/terminal/route.ts` - SSE implementation
- `/app/api/interview/[id]/run-tests/route.ts` - Test execution

### Reference
- `/prisma/schema.prisma` - Database schema
- `/app/api/interview/[id]/events/route.ts` - Event recording
- `/components/interview/Terminal.tsx` - xterm integration

---

## Quick Wins (Easy Wins)

1. **Fix AIChat:** 15 min, high impact
2. **Enable auth:** 5 min, security critical
3. **Add FAQ to interview page:** 30 min, UX improvement
4. **Add loading states:** 1 hr, UX polish
5. **Add error boundaries:** 1 hr, stability

---

## Key Metrics to Track

- Session initialization time (target: <2s)
- Time to first test run (target: <5s)
- File sync latency (target: <100ms)
- AI response latency (target: <500ms for start)
- Test execution latency (target: <10s for typical test)

