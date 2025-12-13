# Pilot Readiness Audit - Critical Blockers & Gaps

**Audit Date**: 2025-01-13
**Auditor**: Claude (Sonnet 4.5)
**Scope**: Full codebase review for production pilot readiness
**Focus**: Evidence-based evaluation, Claude Code CLI parity, critical features

---

## 🚨 CRITICAL BLOCKERS (Must Fix Before Pilot)

### 1. **Code Execution Environment is Mocked/Incomplete** ❌

**Location**: `lib/services/modal-simple.ts`

**Problem**:
- File persistence is **completely mocked** (`writeFile`, `readFile` return void/empty)
- File system operations return empty arrays
- Volumes are mock IDs (`mock-volume-${sessionId}`)
- **NO ACTUAL FILE PERSISTENCE** during interviews

**Impact**:
```typescript
// modal-simple.ts lines 136-162
export async function writeFile(...): Promise<void> {
  // For MVP, file persistence is not implemented
  console.log(`[Mock] writeFile: ${filePath}`);
}

export async function readFile(...): Promise<string> {
  // For MVP, reading files is not implemented
  return "";
}
```

**This means candidates CANNOT**:
- Edit files and have changes persist
- Work with multiple files in a project
- Use any file-based workflow
- See their code changes between sessions

**What's needed**: Full Modal volume integration or S3-backed file storage

---

### 2. **Interview Experience ≠ Claude Code CLI** ❌

**Problems**:

#### A. **No Terminal/Shell Access**
- `Terminal.tsx` exists but **backend is stubbed**
- Candidates cannot run `npm install`, `pip install`, etc.
- Cannot debug with print statements
- Cannot run custom commands

#### B. **AI Chat is NOT Claude Code**
- Uses basic Claude API messages endpoint
- NOT using Claude Agent SDK properly
- Missing key Claude Code features:
  - No `/read` command
  - No `/write` command
  - No proper file context
  - No workspace awareness
  - Limited tool use (only 5 basic tools vs full CLI)

**Location**: `app/api/interview/[id]/chat/agent/route.ts`
```typescript
// Lines 160-172: Using basic streaming API
const messageStream = await anthropic.messages.stream({
  model: "claude-sonnet-4-5-20250929",
  max_tokens: 4096,
  system: systemPrompt,
  messages: sanitizedMessages,
  tools: [
    readFileTool,      // Basic, not Claude Code level
    writeFileTool,
    runTestsTool,
    executeBashTool,   // NOT IMPLEMENTED
    suggestNextQuestionTool,
  ],
});
```

#### C. **File System is Fake**
- `FileTree` component shows files but **cannot actually browse**
- Files are hardcoded in initialization
- No real workspace directory structure

---

### 3. **Evaluation Logic Has Assumptions & Black Boxes** ⚠️

**Location**: `lib/scoring.ts`

#### A. **Hardcoded TODO - No Evidence**
```typescript
// Line 127
const independence = 75; // TODO: Calculate from session data
```
- 25% of AI Collaboration Score is **FAKE**
- Not evidence-based at all

#### B. **Code Quality Score is Guesswork**
```typescript
// app/api/interview/[id]/submit/route.ts lines 395-413
function calculateCodeQualityScore(sessionRecording: any): number {
  const snapshots = sessionRecording.codeSnapshots;
  if (snapshots.length === 0) return 50; // DEFAULT 50!

  // Simple heuristic based on code evolution
  const snapshotScore = Math.min(totalSnapshots / 10, 1) * 30;
  const testScore = Math.min(testsCount / 5, 1) * 40;
  const baseScore = 30;

  return Math.min(100, baseScore + snapshotScore + testScore);
}
```

**Problems**:
- No actual code quality analysis (no linting, no complexity metrics)
- Arbitrary weights (30, 40, 30)
- Snapshots count doesn't mean quality
- **FALSE POSITIVES**: Someone rapidly saving gets higher score

#### C. **Test Results May Not Be Real**
```typescript
// app/api/interview/[id]/submit/route.ts lines 118-165
// Run final test execution to ensure we have latest results
let finalTestResults: any = null;
try {
  const finalCodeContent = finalCode?.[fileName] ||
    await modal.readFile(candidate.volumeId, fileName);
  // But modal.readFile() returns "" (mocked!)
}
```

- If Modal readFile is mocked, **where do test results come from?**
- Might be using stale/cached results
- No evidence of actual code execution

#### D. **Prompt Quality is Subjective**
```typescript
// lib/scoring.ts lines 374-379
const avgPromptQuality =
  claudeInteractions.length > 0
    ? claudeInteractions.reduce(
        (sum: number, i: any) => sum + (i.promptQuality || 3),
        0
      ) / claudeInteractions.length
    : 3;
```

**Who assigns `promptQuality`?**
- Database schema doesn't show this field being set
- Default is 3 (middle score)
- No evidence of actual LLM-based prompt evaluation

---

### 4. **Session Recording is Incomplete** ⚠️

**What's Missing**:
- No video/screen recording (just events)
- Code snapshots may not capture all changes (depends on mocked writeFile)
- Claude interactions saved but not evaluated properly
- Terminal history **completely missing** (terminal is stubbed)

**Location**: Database schema shows these tables exist but:
```prisma
model ClaudeInteraction {
  promptQuality  Float?    // WHO SETS THIS? NOT IN CODE
}
```

---

### 5. **No Actual Sandbox Isolation** ❌

**Problem**:
- Modal integration is incomplete (using `modal-simple.ts`)
- No network isolation mentioned
- No resource limits enforced
- Candidates **cannot use tools** (git, npm, pip, curl, etc.)

**From modal-simple.ts**:
```typescript
// Only Python is supported for MVP
language: "python",
```
- But UI shows JavaScript/TypeScript options
- **Language mismatch** will cause failures

---

## ⚠️ MAJOR CONCERNS (High Priority)

### 6. **Dynamic Question Generation is Untested**

**Location**: `lib/services/questions.ts`

**Concerns**:
- Generates questions via Claude on-the-fly
- No human review/validation before candidate sees them
- Could generate ambiguous/broken questions
- Test cases might be wrong
- **Risk**: Candidate fails due to bad question, not their skill

**Recommendation**: Use curated question bank for pilot, NOT dynamic generation

---

### 7. **No Rate Limiting on LLM Calls** 💰

**Location**: `app/api/interview/[id]/chat/agent/route.ts`

```typescript
// Lines 120-140: Rate limit is 50 messages per question
const MAX_MESSAGES_PER_QUESTION = 50;
```

**But**:
- 50 messages × 4096 tokens = **204,800 tokens per question**
- 3 questions = **614,400 tokens per candidate**
- At Claude Sonnet 4.5 pricing (~$3/M input, $15/M output):
  - Input: ~$1.84 per candidate
  - Output: ~$9.21 per candidate
  - **Total: ~$11 per candidate in LLM costs alone**

**No global budget cap** - a malicious candidate could spam requests

---

### 8. **Authentication Flow Has Gaps**

**Issues**:
- Sign-in/sign-up UI exists but no email verification
- No password reset flow
- Invitation system exists but email sending is **not implemented**:

```typescript
// lib/services/email.ts
// This file exists but email service is placeholder
```

---

## 📊 EVIDENCE-BASED EVALUATION GAPS

### What's Currently Evidence-Based ✅
1. ✅ Test pass/fail counts (if code execution works)
2. ✅ Time tracking (start/end times)
3. ✅ Claude interaction count
4. ✅ Code snapshot frequency

### What's NOT Evidence-Based ❌
1. ❌ **AI Independence** (hardcoded 75)
2. ❌ **Code Quality** (arbitrary heuristics)
3. ❌ **Prompt Quality** (defaults to 3, no real analysis)
4. ❌ **Problem Solving** (just completion rate, no depth analysis)
5. ❌ **Tech Stack Compliance** (detection exists but not enforced/scored)

### What's Missing Entirely 🚫
1. 🚫 Code complexity analysis
2. 🚫 Security vulnerability scanning
3. 🚫 Performance profiling
4. 🚫 Code style/linting checks
5. 🚫 Plagiarism detection
6. 🚫 AI suggestion acceptance patterns (tracked but not analyzed)
7. 🚫 Debugging behavior analysis
8. 🚫 Research pattern analysis (terminal commands, file reads)

---

## 🔧 MISSING CRITICAL FEATURES

### For Candidates:
1. ❌ No way to actually code in a real environment
2. ❌ No package installation (npm, pip)
3. ❌ No debugging tools
4. ❌ No git access
5. ❌ No file creation/deletion
6. ❌ No multi-file editing
7. ❌ No terminal access
8. ❌ Can't test their own code interactively

### For Interviewers:
1. ❌ Can't replay sessions properly (data is incomplete)
2. ❌ Can't see terminal history
3. ❌ Can't see file changes over time (no snapshots saved)
4. ❌ Can't validate scoring accuracy
5. ❌ No calibration data (what's a good score?)
6. ❌ No benchmark comparisons

---

## 🎯 MINIMUM VIABLE FOR PILOT

### Must Have (Blockers):
1. **Real code execution environment**
   - Modal volumes working
   - File persistence
   - Multi-file support
   - Language: Python AND JavaScript/TypeScript

2. **Terminal access**
   - Basic shell commands
   - Package installation
   - Test running

3. **Evidence-based scoring**
   - Remove hardcoded values
   - Actual code analysis (lint, complexity)
   - Real AI independence calculation
   - Clear scoring rubric documentation

4. **Session recording completeness**
   - All file changes tracked
   - All terminal commands logged
   - All AI interactions with context
   - Snapshot on every significant change

5. **Email service**
   - Candidate invitations
   - Assessment completion notifications
   - Password reset

### Should Have:
1. Question bank (pre-validated, not dynamic)
2. Calibration interviews (test with known candidates)
3. Admin dashboard for monitoring
4. Cost tracking per candidate
5. Session replay viewer

### Nice to Have:
1. Video recording
2. Advanced analytics
3. AI-powered code review
4. Plagiarism detection

---

## 💰 COST ANALYSIS

### Current State:
- ~$11/candidate in LLM costs (Claude API)
- Modal costs unknown (not configured)
- S3 storage costs (session recordings)

### Optimization Needed:
1. Add budget caps per candidate
2. Use cheaper models for code execution
3. Cache common responses
4. Limit streaming token counts

---

## 🚀 RECOMMENDED PILOT APPROACH

### Phase 0: Internal Testing (1-2 weeks)
1. **Fix Modal integration** - Make file persistence work
2. **Fix terminal** - Basic shell access
3. **Remove dynamic questions** - Use curated set
4. **Fix scoring** - Remove assumptions, add evidence
5. **Test with team** - Run 10 mock interviews internally

### Phase 1: Closed Beta (2-3 weeks)
1. **5-10 friendly companies**
2. **Manual onboarding**
3. **Curated questions only**
4. **Heavy monitoring** - Watch every session
5. **Daily check-ins** - Get feedback

### Phase 2: Limited Pilot (4-6 weeks)
1. **20-30 companies**
2. **Self-serve onboarding**
3. **Scoring calibration** - Compare with human interviewers
4. **Iterate rapidly**

---

## 📋 DETAILED ACTION ITEMS

### P0 - Critical (Must fix before ANY pilot):
- [ ] Implement Modal volume file persistence
- [ ] Implement terminal backend
- [ ] Remove `independence = 75` hardcode, calculate from data
- [ ] Implement real code quality analysis (lint + complexity)
- [ ] Verify test execution is real (not mocked)
- [ ] Set up email service (SendGrid/Resend)
- [ ] Create curated question bank (20-30 questions)
- [ ] Document scoring rubric clearly
- [ ] Add cost tracking and budget caps

### P1 - High (Fix in first week of pilot):
- [ ] Implement prompt quality evaluation (LLM-based)
- [ ] Add code snapshot on every file save
- [ ] Implement session replay viewer
- [ ] Add admin monitoring dashboard
- [ ] Set up error tracking (Sentry)
- [ ] Add performance monitoring
- [ ] Create interviewer training docs

### P2 - Medium (Fix in first month):
- [ ] Implement tech stack compliance scoring
- [ ] Add security scanning
- [ ] Implement plagiarism detection
- [ ] Add video recording option
- [ ] Create calibration framework
- [ ] Build candidate feedback system

---

## 🎓 SCORING RUBRIC RECOMMENDATIONS

### Technical Score (Evidence-Based):
1. **Test Pass Rate** (40%)
   - Hidden tests weighted 2x
   - Edge cases weighted 1.5x

2. **Code Quality** (30%)
   - Cyclomatic complexity
   - Code duplication
   - Linter violations
   - Documentation

3. **Performance** (20%)
   - Time complexity
   - Space complexity
   - Actual runtime metrics

4. **Correctness** (10%)
   - Handles all input types
   - No off-by-one errors
   - Proper error handling

### AI Collaboration Score (Evidence-Based):
1. **Effectiveness** (40%)
   - Problems solved per interaction
   - Code quality improvement after AI use
   - Bugs fixed vs introduced

2. **Independence** (30%)
   - Decreasing interaction frequency over time
   - Ability to implement without AI
   - Self-correction rate

3. **Prompt Quality** (20%)
   - Specificity (measured by token count + context)
   - Includes code snippets
   - Clear success criteria

4. **Critical Thinking** (10%)
   - Modification rate of AI suggestions
   - Validation before acceptance
   - Asks clarifying questions

### Problem Solving Score (Evidence-Based):
1. **Approach** (40%)
   - Breaking down problem
   - Considering edge cases
   - Algorithmic thinking

2. **Progress** (30%)
   - Steady advancement
   - Dealing with blockers
   - Backtracking when needed

3. **Completion** (20%)
   - Full implementation
   - All requirements met
   - Clean code

4. **Efficiency** (10%)
   - Time management
   - Optimal solution
   - No unnecessary complexity

---

## ⚖️ COMPARISON: Current vs Needed

| Feature | Current State | Needed for Pilot | Gap Size |
|---------|---------------|------------------|----------|
| Code Execution | Mocked | Real Modal/Sandbox | 🔴 Large |
| File Persistence | Mocked | Working volumes | 🔴 Large |
| Terminal | Stubbed | Working shell | 🔴 Large |
| AI Chat | Basic streaming | Claude Code-like | 🟡 Medium |
| Scoring | 60% assumptions | 100% evidence | 🟡 Medium |
| Questions | Dynamic (risky) | Curated bank | 🟡 Medium |
| Session Recording | Incomplete | Full capture | 🟡 Medium |
| Email | Not working | Production ready | 🟢 Small |
| Analytics | Has infrastructure | Working with real data | 🟢 Small |
| Replay | Built but broken | Working | 🟡 Medium |

---

## 🎯 SUCCESS CRITERIA FOR PILOT

### Technical:
- [ ] Zero failed sessions due to infrastructure
- [ ] 100% of code executions successful
- [ ] All file operations persist correctly
- [ ] Terminal works for basic commands
- [ ] Scoring is reproducible and explainable

### Business:
- [ ] 80%+ interviewer satisfaction
- [ ] 90%+ candidate completion rate
- [ ] Scores correlate with human evaluations (r > 0.7)
- [ ] <5% false positives/negatives
- [ ] Average time saved: 50%+ vs manual screening

### Operational:
- [ ] <2 hour response time for support
- [ ] <1% session data loss
- [ ] <$15 cost per candidate
- [ ] Can handle 50 concurrent sessions
- [ ] All critical paths monitored

---

## 📝 CONCLUSION

**Current State**: **NOT READY FOR PILOT**

**Primary Blockers**:
1. Code execution is mocked
2. File system doesn't work
3. Terminal is stubbed
4. Scoring has too many assumptions
5. Session recording incomplete

**Estimated Work to Pilot-Ready**: **2-3 weeks of focused development**

**Priority Order**:
1. Modal integration (1 week)
2. Terminal backend (3 days)
3. Evidence-based scoring (1 week)
4. Email service (2 days)
5. Question curation (2 days)
6. Internal testing (1 week)

**Total**: 3-4 weeks to safe internal testing, 4-6 weeks to external pilot

---

**Audit Completed**: 2025-01-13
**Next Review**: After P0 items completed
