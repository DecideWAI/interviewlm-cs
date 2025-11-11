# Dynamic Question Flow - UX Analysis & Improvements

**Date**: November 11, 2025
**Status**: Analysis Complete - Ready for Implementation

---

## 🎯 Current State Analysis

### What Exists (Backend) ✅

The backend infrastructure is **fully implemented**:

```typescript
// API Endpoints:
GET  /api/interview/[id]/questions      // Get current question
POST /api/interview/[id]/questions      // Generate next question

// Features:
- Question status tracking (PENDING, IN_PROGRESS, COMPLETED)
- Adaptive difficulty based on performance
- LLM-powered question generation
- Performance-based progression
```

**Adaptive Difficulty Logic**:
- Strong performance (score ≥80, tests ≥80%, fast) → HARD
- Weak performance (score <60, tests <50%) → EASY
- Average performance → MEDIUM

### What's Missing (UX/Frontend) ❌

The **user-facing flow is not implemented**. Users have NO visibility into:

1. ❌ Current question progress
2. ❌ Completion status
3. ❌ How to advance to next question
4. ❌ Total questions count
5. ❌ Performance feedback
6. ❌ Next question loading state

---

## 🔴 Critical UX Problems

### Problem 1: **No Completion Indicator**

**Current State**:
```
┌────────────────────────────────────┐
│  Question: Binary Search           │
│  [Code Editor]                     │
│  [Terminal]                        │
│  Tests: 5/5 passing ✅            │
│                                    │
│  ... now what? 🤷                 │
└────────────────────────────────────┘
```

**User Confusion**:
- "Did I complete the question?"
- "How do I move to the next one?"
- "Is this the last question?"

---

### Problem 2: **No Progress Tracking**

**Current State**:
```
Header shows: "Binary Search - Medium"

Missing:
- Question 1 of 3
- Time spent on this question
- Overall progress bar
```

**Impact**: Users feel lost, no sense of progress.

---

### Problem 3: **No Advancement UI**

**Current State**:
- No "Next Question" button
- No "Complete Question" action
- No transition between questions

**What Happens**: Users are stuck on Question 1 forever!

---

### Problem 4: **AI Doesn't Guide Progression**

**Current Agent SDK Capabilities**:
- ✅ Read files
- ✅ Write code
- ✅ Run tests
- ❌ **Suggest advancing to next question**

**Missed Opportunity**: AI should say:
> "Excellent! All tests pass. You've completed this in 12 minutes. Ready for the next challenge?"

---

## ✨ Ideal Dynamic Question Flow

### **Step-by-Step User Journey**

#### 1. **Question Start**
```
┌─────────────────────────────────────────────────┐
│ Question 1 of 3 • Medium • Est. 30 min         │
│ ────────────────── 33% ──────────────────      │
│                                                 │
│ Binary Search Implementation                     │
│ Implement an efficient binary search...         │
└─────────────────────────────────────────────────┘
```

**Visual Elements**:
- Progress: "Question 1 of 3"
- Difficulty badge
- Estimated time
- Progress bar (33% = 1 of 3 complete)

---

#### 2. **Working on Question**
```
┌─────────────────────────────────────────────────┐
│ Question 1 of 3 • ⏱️ 12:34 elapsed              │
│                                                 │
│ [Code Editor with solution]                     │
│ [Terminal]                                      │
│                                                 │
│ Test Results: 3/5 passing ⚠️                    │
│ • Test 1: ✅ Basic case                         │
│ • Test 2: ✅ Empty array                        │
│ • Test 3: ✅ Single element                     │
│ • Test 4: ❌ Large array (timeout)              │
│ • Test 5: ❌ Not found case                     │
└─────────────────────────────────────────────────┘
```

**Real-time Feedback**:
- Timer shows elapsed time
- Test results prominently displayed
- Clear pass/fail indicators

---

#### 3. **Tests Pass - AI Suggestion**
```
┌─────────────────────────────────────────────────┐
│ Test Results: 5/5 passing ✅                    │
│                                                 │
│ AI Chat:                                        │
│ ┌───────────────────────────────────────────┐  │
│ │ 🎉 Excellent! All tests pass.             │  │
│ │                                            │  │
│ │ Your solution runs in O(log n) time -     │  │
│ │ perfect! You completed this in 12 mins.   │  │
│ │                                            │  │
│ │ Ready for the next challenge?              │  │
│ │                                            │  │
│ │ [Next Question →]                          │  │
│ └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**AI Behavior**:
- Congratulates on completion
- Provides performance feedback
- Suggests advancing
- Shows "Next Question" button in chat

---

#### 4. **User Clicks "Next Question"**
```
┌─────────────────────────────────────────────────┐
│ Generating next question...                     │
│                                                 │
│ ┌───────────────────────────────────────────┐  │
│ │  📊 Question 1 Performance Summary         │  │
│ │                                            │  │
│ │  ✅ All 5 tests passed                     │  │
│ │  ⏱️  Completed in 12:34                    │  │
│ │  💯 Score: 95/100                          │  │
│ │                                            │  │
│ │  Next difficulty: HARD (based on your     │  │
│ │  strong performance)                       │  │
│ └───────────────────────────────────────────┘  │
│                                                 │
│ [Spinner animation]                             │
└─────────────────────────────────────────────────┘
```

**Transition Screen**:
- Shows performance summary
- Explains next difficulty
- Loading indicator for question generation
- Smooth, non-jarring transition

---

#### 5. **New Question Loaded**
```
┌─────────────────────────────────────────────────┐
│ Question 2 of 3 • Hard • Est. 45 min           │
│ ────────────────── 66% ──────────────────      │
│                                                 │
│ LRU Cache Implementation                        │
│ Design and implement a Least Recently Used...   │
│                                                 │
│ [New starter code loaded]                       │
│ [Terminal reset]                                │
│ [AI Chat cleared, ready for new context]        │
└─────────────────────────────────────────────────┘
```

**Fresh Start**:
- Progress updated (2 of 3)
- New question loaded
- Editor refreshed with new starter code
- Clean slate for new challenge

---

#### 6. **Final Question Complete**
```
┌─────────────────────────────────────────────────┐
│ Question 3 of 3 • Complete! ✅                  │
│ ───────────────── 100% ──────────────────      │
│                                                 │
│ AI Chat:                                        │
│ ┌───────────────────────────────────────────┐  │
│ │ 🎉 Congratulations! You've completed      │  │
│ │ all 3 questions.                           │  │
│ │                                            │  │
│ │ Performance Summary:                       │  │
│ │ • Question 1: 95/100 (Medium)              │  │
│ │ • Question 2: 88/100 (Hard)                │  │
│ │ • Question 3: 92/100 (Hard)                │  │
│ │                                            │  │
│ │ Overall: 91.7/100                          │  │
│ │                                            │  │
│ │ Ready to submit your assessment?           │  │
│ │                                            │  │
│ │ [Submit Assessment]                        │  │
│ └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Completion State**:
- All questions marked complete
- Summary of all performances
- Clear "Submit" CTA
- Sense of accomplishment

---

## 🎨 Required UI Components

### 1. **Question Progress Header**

```typescript
<QuestionProgressHeader
  currentQuestion={1}
  totalQuestions={3}
  difficulty="medium"
  timeElapsed="12:34"
  estimatedTime={30}
/>
```

**Renders**:
```
┌──────────────────────────────────────────────┐
│ Question 1 of 3 • Medium • ⏱️ 12:34 / 30min  │
│ ════════════════ 33% ════════════════        │
└──────────────────────────────────────────────┘
```

---

### 2. **Question Completion Card**

```typescript
<QuestionCompletionCard
  testsPassed={5}
  testsTotal={5}
  timeSpent="12:34"
  score={95}
  onNext={() => handleNextQuestion()}
/>
```

**Renders**:
```
┌────────────────────────────────────────┐
│ 🎉 Question Complete!                  │
│                                        │
│ ✅ All 5 tests passed                  │
│ ⏱️  Completed in 12:34                 │
│ 💯 Score: 95/100                       │
│                                        │
│ [Next Question →]                      │
└────────────────────────────────────────┘
```

---

### 3. **Next Question Loading**

```typescript
<NextQuestionLoading
  previousScore={95}
  nextDifficulty="hard"
/>
```

**Renders**:
```
┌────────────────────────────────────────┐
│ Generating next question...            │
│                                        │
│ Based on your strong performance,      │
│ the next question will be HARD.        │
│                                        │
│ [Spinner]                              │
└────────────────────────────────────────┘
```

---

### 4. **AI Suggestion Tool**

**New Tool for Agent SDK**:

```typescript
// lib/agent-tools/suggest-next-question.ts

export const suggestNextQuestionTool: Anthropic.Tool = {
  name: "suggest_next_question",
  description:
    "Suggest advancing to the next question when the candidate has " +
    "successfully completed the current one. Use this when all tests " +
    "pass and the solution is satisfactory.",
  input_schema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Explanation of why they should advance"
      },
      performance: {
        type: "string",
        description: "Brief performance feedback"
      }
    },
    required: ["reason", "performance"]
  }
};
```

**Usage**:
```typescript
// AI detects completion
🔧 suggest_next_question({
  reason: "All 5 tests passing with optimal time complexity",
  performance: "Excellent solution - completed in 12 minutes"
})

// Frontend shows special UI
<NextQuestionSuggestion
  reason={reason}
  performance={performance}
  onAccept={handleNextQuestion}
/>
```

---

## 🚀 Implementation Plan

### Phase 1: **Basic Question Progression** (2-3 hours)

**Goal**: Enable advancing between questions

1. **Create QuestionProgressHeader component**
   ```bash
   components/interview/QuestionProgressHeader.tsx
   ```

2. **Add question state to interview page**
   ```typescript
   const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
   const [totalQuestions, setTotalQuestions] = useState(3);
   const [questionCompleted, setQuestionCompleted] = useState(false);
   ```

3. **Add "Next Question" button**
   - Appears when all tests pass
   - Calls `/api/interview/[id]/questions` POST
   - Shows loading state during generation
   - Reloads editor with new question

4. **Update test results to show completion state**
   ```typescript
   {testResults.passed === testResults.total && testResults.total > 0 && (
     <QuestionCompletionCard
       testsPassed={testResults.passed}
       testsTotal={testResults.total}
       onNext={handleNextQuestion}
     />
   )}
   ```

---

### Phase 2: **AI-Powered Suggestions** (1-2 hours)

**Goal**: AI suggests when to advance

1. **Create `suggest_next_question` tool**
   ```bash
   lib/agent-tools/suggest-next-question.ts
   ```

2. **Update Agent SDK system prompt**
   ```typescript
   "When all tests pass and the solution is complete, use the
   suggest_next_question tool to recommend advancing."
   ```

3. **Handle suggestion in AIChat**
   ```typescript
   case "tool_result":
     if (data.toolName === "suggest_next_question") {
       // Show special "Next Question" UI in chat
       setShowNextQuestionSuggestion(data.output);
     }
   ```

---

### Phase 3: **Enhanced UX Polish** (2-3 hours)

**Goal**: Smooth, delightful transitions

1. **Add performance summary screen**
   - Shows between questions
   - Displays score, time, test results
   - Explains next difficulty

2. **Add progress bar animation**
   - Smooth transition from 33% → 66%
   - Celebratory animation on 100%

3. **Add question transition animation**
   - Fade out old question
   - Loading spinner for generation
   - Fade in new question

4. **Add final completion screen**
   - Summary of all questions
   - Overall performance
   - Clear "Submit Assessment" button

---

## 📊 User Flow Diagram

```
Interview Start
      ↓
┌─────────────────┐
│  Question 1     │
│  (Medium)       │
└─────────────────┘
      ↓
  [User codes]
      ↓
  Tests: 3/5 ❌
      ↓
  [User fixes]
      ↓
  Tests: 5/5 ✅
      ↓
┌─────────────────┐
│ AI: "Great!     │
│ Ready for next?"│
│ [Next Question] │
└─────────────────┘
      ↓
  [User clicks]
      ↓
┌─────────────────┐
│ Generating...   │
│ Performance:    │
│ Score: 95/100   │
│ [Spinner]       │
└─────────────────┘
      ↓
┌─────────────────┐
│  Question 2     │
│  (Hard)         │
└─────────────────┘
      ↓
  [Repeat cycle]
      ↓
┌─────────────────┐
│  Question 3     │
│  (Hard)         │
└─────────────────┘
      ↓
  Tests: 5/5 ✅
      ↓
┌─────────────────┐
│ All Complete!   │
│ Overall: 91.7   │
│ [Submit]        │
└─────────────────┘
      ↓
  Interview End
```

---

## 🎯 Key Decisions

### When to Show "Next Question" Button?

**Option A: Always Visible (Disabled Until Complete)**
```typescript
<Button
  disabled={testResults.passed !== testResults.total}
  onClick={handleNextQuestion}
>
  Next Question {currentQuestionIndex < totalQuestions ? '→' : '(Complete)'}
</Button>
```

**Pros**: Always visible, clear what's next
**Cons**: Visual clutter, may pressure users

---

**Option B: Appears When Tests Pass ✅ RECOMMENDED**
```typescript
{testResults.passed === testResults.total && testResults.total > 0 && (
  <Button onClick={handleNextQuestion} className="animate-slide-up">
    Next Question →
  </Button>
)}
```

**Pros**: Reward-based, clean UI, celebratory
**Cons**: May not be immediately obvious

---

**Option C: AI Suggests in Chat ✅ BEST**
```
AI: "🎉 All tests pass! Ready for the next challenge?"
[Next Question →]  [Stay Here]
```

**Pros**: Contextual, conversational, guided
**Cons**: Requires AI integration

**RECOMMENDATION**: Combine B + C
- Button appears in header when tests pass
- AI also suggests in chat with context

---

### Should AI Auto-Advance?

**NO**. Always require user confirmation.

**Reasons**:
1. User may want to refactor/improve
2. User may want to review solution
3. User control = better UX
4. Avoids surprises

---

### How to Handle "Back to Previous Question"?

**Option A: Not Allowed**
- Once you advance, no going back
- Simulates real interview pressure

**Option B: Allow Review Only**
- Can view previous questions
- Cannot edit or resubmit
- Read-only mode

**Option C: Full Edit Access**
- Can go back and improve
- Score updates with latest submission

**RECOMMENDATION**: Option A for initial launch
- Simpler to implement
- More realistic interview scenario
- Can add Option B in future

---

## 🎨 Mockups

### Header with Progress

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Interview                                    Question 2 of 3      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 66% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                      │
│  LRU Cache Implementation  │  Hard  │  ⏱️ 18:23 / 45min             │
│  Design and implement a data structure for a Least Recently Used... │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Completion Card (Inline)

```
┌─────────────────────────────────────────────────────────────────────┐
│ │ Tests: 5/5 passing ✅                                        │      │
│ │                                                              │      │
│ │ ┌────────────────────────────────────────────────────────┐ │      │
│ │ │  🎉 Question Complete!                                 │ │      │
│ │ │                                                        │ │      │
│ │ │  All tests passed • Completed in 12:34 • Score: 95    │ │      │
│ │ │                                                        │ │      │
│ │ │  [Next Question →]                                     │ │      │
│ │ └────────────────────────────────────────────────────────┘ │      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### AI Suggestion (In Chat)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Claude Code AI                                               [Tools] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Previous messages...]                                              │
│                                                                      │
│  🤖  Excellent! All 5 tests pass with O(log n) complexity.          │
│      You completed this in 12 minutes - well done!                  │
│                                                                      │
│      Ready for the next challenge?                                  │
│                                                                      │
│      ┌──────────────────┐  ┌──────────────────┐                    │
│      │ Next Question →  │  │ Stay Here        │                    │
│      └──────────────────┘  └──────────────────┘                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📝 Summary

### Current State:
- ✅ Backend fully functional
- ❌ No frontend UX for progression
- ❌ Users stuck on Question 1

### Required Changes:
1. **Add QuestionProgressHeader** - Show progress (1 of 3)
2. **Add Next Question button** - Appears when tests pass
3. **Add AI suggestion tool** - AI recommends advancing
4. **Add loading state** - During question generation
5. **Add transition animation** - Smooth question changes
6. **Add completion screen** - Final summary + submit

### Estimated Time:
- **Phase 1 (Basic)**: 2-3 hours
- **Phase 2 (AI)**: 1-2 hours
- **Phase 3 (Polish)**: 2-3 hours
- **Total**: 5-8 hours

### Priority:
🔴 **CRITICAL** - Without this, the dynamic question system is unusable.

---

## 🚀 Next Steps

1. Review this document
2. Approve design direction
3. Begin Phase 1 implementation
4. Test with real interview flow
5. Iterate based on feedback

**Ready to build?** Let me know and I'll start implementing! 🎯
