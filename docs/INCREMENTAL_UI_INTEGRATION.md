# Incremental Assessment UI Integration

## Overview

This document describes how the incremental question generation system integrates with the interview UI.

## Key Components

### 1. QuestionTransition Component

**Purpose**: Display transition screen between incremental questions with performance context

**Location**: `components/interview/QuestionTransition.tsx`

**Features**:
- Shows previous question performance (score, time, tests passed)
- Displays weighted score with difficulty calibration
- Shows progression trend (improving/declining/stable)
- Explains what's coming next based on performance
- Contextual messages ("extending complexity" vs "simplifying")
- Preview of what next question builds upon

**Props**:
```typescript
{
  previousPerformance: {
    questionNumber: number;
    title: string;
    rawScore: number;
    weightedScore?: number; // With difficulty calibration
    timeSpent: number;
    testsPassedRatio: number;
    difficultyScore?: number; // 1-10 from LLM
  },
  nextQuestionNumber: number,
  progressionContext?: {
    trend: "improving" | "declining" | "stable";
    action: "extend" | "maintain" | "simplify";
    averageScore: number;
  },
  estimatedDifficulty?: "easier" | "similar" | "harder",
  buildingOn?: string // What next question builds on
}
```

### 2. QuestionProgressHeader Component (Enhanced)

**Purpose**: Show question progress with incremental context

**Location**: `components/interview/QuestionProgressHeader.tsx`

**New Features**:
- "Adaptive" badge for incremental assessments
- "AI-Calibrated" badge when using difficulty calibration
- "Building on:" context showing what current question extends from previous work

**New Props**:
```typescript
{
  // ... existing props
  isIncremental?: boolean;
  buildingOn?: string;
  difficultyCalibrated?: boolean;
}
```

## Interview Page Integration

### State Management

**New State Variables**:
```typescript
// Track if assessment uses incremental questions
const [isIncrementalAssessment, setIsIncrementalAssessment] = useState(false);

// Store progression context for QuestionTransition
const [progressionContext, setProgressionContext] = useState<{
  trend: "improving" | "declining" | "stable";
  action: "extend" | "maintain" | "simplify";
  averageScore: number;
} | null>(null);

// Store what current question builds on
const [buildingOn, setBuildingOn] = useState<string>("");

// Enhanced performance tracking with difficulty metadata
const [previousQuestionPerformance, setPreviousQuestionPerformance] = useState<{
  questionNumber: number;
  title: string;
  rawScore: number;
  weightedScore?: number;
  timeSpent: number;
  testsPassedRatio: number;
  difficultyScore?: number;
} | null>(null);
```

### API Response Handling

**GET /api/interview/[id]/questions**:
- Returns current question and session data
- Should include `isIncremental` flag
- Should include `buildingOn` context if Q2+

**POST /api/interview/[id]/questions** (generate next):
- Returns new question
- Returns `isIncremental: boolean`
- Returns `progressionContext` for Q2+ (optional)
- Returns `buildingOn` context
- Question includes `difficultyAssessment` JSON if calibrated

### handleNextQuestion Updates

```typescript
const handleNextQuestion = async () => {
  // ... existing validation

  // Calculate performance with difficulty assessment
  const questionWithDifficulty = await fetch(`/api/interview/${candidateId}/questions/${sessionData.question.id}`);
  const questionData = await questionWithDifficulty.json();

  const performance = {
    questionNumber: currentQuestionIndex + 1,
    title: sessionData.question.title,
    rawScore: Math.round(testsPassedRatio * 100),
    timeSpent: questionTimeElapsed,
    testsPassedRatio,
    difficultyScore: questionData.difficultyAssessment?.difficultyScore,
    // weightedScore calculated if we have past questions
  };

  setPreviousQuestionPerformance(performance);

  // Call API to generate next question
  const response = await fetch(`/api/interview/${candidateId}/questions`, {
    method: "POST",
    body: JSON.stringify({ previousPerformance }),
  });

  const data = await response.json();

  // Store incremental context from response
  if (data.isIncremental) {
    setIsIncrementalAssessment(true);

    if (data.progressionContext) {
      setProgressionContext(data.progressionContext);
    }

    if (data.buildingOn) {
      setBuildingOn(data.buildingOn);
    }
  }

  // Update session with new question
  // ...
};
```

### Render Logic

```typescript
return (
  <div className="h-screen flex flex-col bg-background">
    {/* Loading Next Question Overlay */}
    {isLoadingNextQuestion && (
      <>
        {isIncrementalAssessment && previousQuestionPerformance ? (
          <QuestionTransition
            previousPerformance={previousQuestionPerformance}
            nextQuestionNumber={currentQuestionIndex + 2}
            progressionContext={progressionContext ?? undefined}
            estimatedDifficulty={
              progressionContext?.action === "extend" ? "harder" :
              progressionContext?.action === "simplify" ? "easier" :
              "similar"
            }
            buildingOn={buildingOn}
          />
        ) : (
          <NextQuestionLoading
            previousScore={previousQuestionPerformance?.rawScore}
            previousTime={previousQuestionPerformance?.timeSpent}
            nextDifficulty={sessionData.question.difficulty.toLowerCase() as any}
            nextQuestionNumber={currentQuestionIndex + 2}
          />
        )}
      </>
    )}

    {/* Question Header */}
    {sessionData && (
      <QuestionProgressHeader
        currentQuestion={currentQuestionIndex + 1}
        totalQuestions={totalQuestions}
        difficulty={sessionData.question.difficulty.toLowerCase() as any}
        timeElapsed={questionTimeElapsed}
        estimatedTime={sessionData.question.estimatedTime}
        title={sessionData.question.title}
        isIncremental={isIncrementalAssessment}
        buildingOn={buildingOn}
        difficultyCalibrated={!!sessionData.question.difficultyAssessment}
      />
    )}

    {/* ... rest of UI */}
  </div>
);
```

## API Enhancements Needed

### GET /api/interview/[id]/questions

**Current Response**:
```json
{
  "currentQuestion": { ... },
  "completed": false,
  "totalQuestions": 3,
  "currentQuestionIndex": 1
}
```

**Enhanced Response**:
```json
{
  "currentQuestion": {
    "id": "...",
    "title": "...",
    "difficultyAssessment": {
      "difficultyScore": 5.5,
      "relativeToBaseline": 1.0,
      "justification": "..."
    }
  },
  "completed": false,
  "totalQuestions": 3,
  "currentQuestionIndex": 1,
  "isIncremental": true,
  "buildingOn": "Product API implementation from Question 1",
  "progressionContext": {
    "trend": "improving",
    "averageScore": 78
  }
}
```

### POST /api/interview/[id]/questions

**Current Response**:
```json
{
  "question": { ... },
  "questionNumber": 2,
  "isIncremental": true
}
```

**Enhanced Response**:
```json
{
  "question": {
    "id": "...",
    "title": "Add caching layer to product API",
    "difficultyAssessment": {
      "difficultyScore": 6.5,
      "relativeToBaseline": 1.3,
      "justification": "Adds complexity with Redis caching..."
    }
  },
  "questionNumber": 2,
  "isIncremental": true,
  "progressionContext": {
    "trend": "stable",
    "action": "extend",
    "averageScore": 82
  },
  "buildingOn": "Product API from Question 1",
  "estimatedDifficulty": "harder"
}
```

## Data Flow

```
1. Initial Session Load (GET /questions)
   └─> Determine if incremental assessment
   └─> Load current question with context
   └─> Show "Building on" if Q2+

2. Complete Question & Request Next (POST /questions)
   └─> Submit performance data
   └─> Server analyzes progress (improving/declining/stable)
   └─> Server generates next question with LLM
   └─> Server provides difficulty assessment
   └─> Server determines progression action (extend/maintain/simplify)

3. Show Transition (QuestionTransition component)
   └─> Display previous performance
   └─> Show weighted score with difficulty calibration
   └─> Explain progression context
   └─> Preview what's coming next

4. Load New Question
   └─> Update QuestionProgressHeader with incremental context
   └─> Show "Building on" indicator
   └─> Display AI-Calibrated badge
```

## Progressive Score Display

For end-of-assessment summary, we should show:

```typescript
import { ProgressiveScoringCalculator } from "@/lib/services/progressive-scoring";

const allQuestions = await prisma.generatedQuestion.findMany({
  where: { candidateId },
  orderBy: { order: 'asc' },
});

const scoreResult = ProgressiveScoringCalculator.calculateScore(
  allQuestions.map(q => ({
    questionNumber: q.order,
    score: q.score || 0,
    difficultyAssessment: q.difficultyAssessment as any,
  }))
);

// scoreResult contains:
// - questionScores: Array with baseWeight, difficultyMultiplier, finalWeight
// - totalWeightedScore: 0-100
// - expertiseLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert'
```

## Backward Compatibility

**Legacy Assessments** (non-incremental):
- Continue using NextQuestionLoading component
- Standard QuestionProgressHeader (no incremental badges)
- No difficulty calibration
- No progression context

**Detection**:
```typescript
if (isIncrementalAssessment && previousQuestionPerformance) {
  // Show QuestionTransition with full context
} else {
  // Show standard NextQuestionLoading
}
```

## Visual Indicators

**Incremental Assessment Indicators**:
1. "Adaptive" badge on QuestionProgressHeader
2. "AI-Calibrated" badge when using difficulty calibration
3. "Building on:" context box showing previous work
4. Rich transition screen with performance trends

**Standard Assessment**:
1. Standard difficulty badges (Easy/Medium/Hard)
2. Simple loading screen
3. No progression context

## Testing Checklist

- [ ] Incremental assessment shows QuestionTransition
- [ ] Legacy assessment shows NextQuestionLoading
- [ ] "Building on" context displays correctly
- [ ] Difficulty calibration badges appear when applicable
- [ ] Progression trend (improving/declining) shown accurately
- [ ] Weighted scores displayed in transition
- [ ] API responses include all required incremental fields
- [ ] Backward compatibility maintained for non-incremental
