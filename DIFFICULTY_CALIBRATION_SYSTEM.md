# LLM-Based Difficulty Calibration System

## Problem Statement

With dynamically generated incremental questions, there's a fairness issue:
- **Hardcoded progressive weights** (1.0x, 1.2x, 1.5x, 2.0x, 2.5x) assume each question is harder
- **Reality**: Q2 might be easier than Q1, or Q4 might be trivial
- **Luck factor**: Candidates who get "easy" later questions get unfair advantage

## Solution: Dynamic Difficulty Calibration

### Overview

The system now uses **LLM-based difficulty assessment** combined with **baseline-relative scoring** to ensure consistent, fair evaluation across all dynamically generated questions.

### How It Works

#### 1. Baseline Establishment (Q1)

The first question establishes the difficulty baseline:
- **Baseline difficulty score**: 5.5/10 for substantial problems
- **Metadata generated**: Lines of code, concepts, tech complexity, time estimate
- **relativeToBaseline**: 1.0 (by definition)

```typescript
{
  difficultyScore: 5.5,
  complexityFactors: {
    linesOfCodeExpected: 75,  // ~3 lines/min × 25 min
    conceptsRequired: ["FastAPI fundamentals", "MongoDB operations", "error handling"],
    techStackComplexity: 3,    // 1-5 scale
    timeEstimate: 25,
    prerequisiteKnowledge: ["Python proficiency", "FastAPI basics"]
  },
  justification: "Baseline problem for senior developer...",
  relativeToBaseline: 1.0
}
```

#### 2. Subsequent Questions (Q2-Q5)

For each new question, the LLM provides:

**Difficulty Assessment** including:
- **difficultyScore** (1-10): Absolute difficulty rating
- **complexityFactors**: Objective metrics (LOC, concepts, time)
- **justification**: LLM explains the rating
- **relativeToBaseline**: Key metric - how hard vs Q1? (0.5 = half, 2.0 = twice)

**Example Q2 (Easier than Q1)**:
```json
{
  "difficultyScore": 4.0,
  "relativeToBaseline": 0.7,
  "justification": "This question simplifies the task by focusing on basic validation..."
}
```

**Example Q4 (Much harder than Q1)**:
```json
{
  "difficultyScore": 8.5,
  "relativeToBaseline": 1.8,
  "justification": "This requires advanced distributed caching, rate limiting, and fault tolerance..."
}
```

#### 3. Dynamic Weight Calculation

```typescript
// Base progressive weight
baseWeight = [1.0, 1.2, 1.5, 2.0, 2.5][questionNumber - 1]

// Difficulty multiplier from LLM assessment
difficultyMultiplier = relativeToBaseline  // e.g., 0.7 for easier, 1.8 for harder

// Final weight (clamped to 0.5x - 2.0x for safety)
finalWeight = baseWeight × difficultyMultiplier

// Example Q2 (easier):
// 1.2 × 0.7 = 0.84x  (less than Q1!)

// Example Q4 (much harder):
// 2.0 × 1.8 = 3.6x  (appropriately rewarded)
```

#### 4. Fair Scoring

```typescript
// Calculate total score
totalWeight = sum(finalWeight for all questions)
totalWeightedScore = sum(rawScore × finalWeight for all questions)
normalizedScore = (totalWeightedScore / totalWeight) × 100
```

## Architecture

### Database Schema

```prisma
model GeneratedQuestion {
  // ... existing fields
  difficultyAssessment  Json?  @map("difficulty_assessment")
}
```

Stores:
```typescript
{
  difficultyScore: number,           // 1-10
  complexityFactors: {
    linesOfCodeExpected: number,
    conceptsRequired: string[],
    techStackComplexity: number,     // 1-5
    timeEstimate: number,
    prerequisiteKnowledge: string[]
  },
  justification: string,
  relativeToBaseline: number         // 0.5 - 2.0
}
```

### Updated Services

#### `lib/services/incremental-questions.ts`

**generateFirstQuestion()**:
- Generates baseline difficulty assessment
- Sets relativeToBaseline = 1.0
- Estimates complexity from baseProblem metadata

**generateNextQuestion()**:
- LLM prompt requests difficulty assessment
- Stores assessment with question in DB

#### `lib/services/progressive-scoring.ts`

**calculateScore()**:
- Accepts optional `difficultyAssessment` per question
- Calculates dynamic `difficultyMultiplier`
- Computes `finalWeight = baseWeight × difficultyMultiplier`
- Returns detailed breakdown

**QuestionScore interface**:
```typescript
{
  questionNumber: number,
  rawScore: number,
  baseWeight: number,              // 1.0, 1.2, 1.5, 2.0, 2.5
  difficultyMultiplier: number,     // From LLM assessment
  finalWeight: number,              // baseWeight × multiplier
  weightedScore: number,
  difficultyScore?: number          // Optional: 1-10 from LLM
}
```

### Types

**types/seed.ts**:
- `DifficultyAssessment`: Interface for LLM assessment
- `QuestionGenerationResponse`: Extended response format

## Consistency Mechanisms

### 1. Reference Anchoring
- Q1 establishes baseline (always 1.0 relative)
- All questions compared to this baseline

### 2. Multi-Factor Analysis
LLM considers:
- Lines of code expected
- Number and complexity of concepts
- Tech stack complexity (1-5)
- Time estimate
- Prerequisites needed

### 3. Explicit Relative Comparison
- LLM explicitly states: "This is 1.8x harder than Q1 because..."
- Forces comparative reasoning vs absolute rating

### 4. Safety Clamps
- Multiplier clamped to 0.5x - 2.0x range
- Prevents extreme outliers

### 5. Justification Required
- LLM must explain difficulty rating
- Improves accuracy and provides audit trail

## Example Scoring Comparison

### Scenario: Senior Backend Engineer Assessment

**Without Calibration** (old system):
```
Q1 (baseline): 80% × 1.0 = 80 points
Q2 (trivial):  90% × 1.2 = 108 points  ❌ Unfair advantage
Q3 (moderate): 75% × 1.5 = 112.5 points
Q4 (very hard): 70% × 2.0 = 140 points
---
Total: 440.5 / 5.7 weights = 77.3% final score
```

**With Calibration** (new system):
```
Q1 (baseline): 80% × (1.0 × 1.0) = 80 points
Q2 (trivial):  90% × (1.2 × 0.6) = 64.8 points  ✅ Fair adjustment
Q3 (moderate): 75% × (1.5 × 1.1) = 123.75 points
Q4 (very hard): 70% × (2.0 × 1.9) = 266 points  ✅ Properly rewarded
---
Total: 534.55 / 7.02 weights = 76.1% final score
```

**Key differences**:
- Trivial Q2 no longer gives unfair boost
- Very hard Q4 properly rewarded despite lower raw score
- Final scores reflect actual expertise demonstrated

## LLM Prompt Instructions

The system includes detailed instructions in the generation prompt:

```
**CRITICAL: Difficulty Assessment Instructions:**
1. **difficultyScore**: Rate 1-10 where 1=trivial, 10=extremely complex
   - Consider: lines of code, concepts, time needed, prerequisites
   - Q1 (baseline) should typically be 5-6 for substantial problems

2. **relativeToBaseline**: How hard is this compared to Q1?
   - 0.5 = half as difficult, 1.0 = same, 2.0 = twice as hard
   - This MUST reflect actual complexity, not just question number
   - Example: If Q2 is simpler cleanup task, use 0.7 even though it's Q2

3. **justification**: Explain your difficulty rating with specific reasoning

4. Be HONEST about difficulty - don't inflate scores just because it's a later question
```

## Benefits

### 1. **Fairness**
- Candidates evaluated on actual complexity solved
- Eliminates luck factor from question difficulty variance

### 2. **Transparency**
- Each question has explicit difficulty justification
- Scoring breakdown shows base weight vs difficulty adjustment

### 3. **Adaptability**
- System works regardless of actual question difficulty
- LLM can generate any difficulty without breaking scoring

### 4. **Consistency**
- All questions normalized to baseline
- Comparable across different assessment sessions

### 5. **Auditability**
- Difficulty assessments stored in DB
- Can review and validate LLM's reasoning

## Migration Path

### Backward Compatibility
- Old questions without `difficultyAssessment`: Use hardcoded weights
- New questions: Use dynamic calibration
- No breaking changes to existing assessments

### Gradual Rollout
1. ✅ Phase 1: Add schema field (optional)
2. ✅ Phase 2: Generate assessments for new questions
3. Phase 3: Monitor calibration accuracy
4. Phase 4: Refine based on actual performance data

## Future Enhancements

### 1. Historical Calibration
- Track actual candidate performance vs estimated difficulty
- Build calibration dataset
- Refine LLM prompts based on accuracy

### 2. Peer Comparison
- Compare difficulty across different assessment sessions
- Normalize scores across different seed problems

### 3. Candidate Feedback Loop
- Ask candidates to rate difficulty after completion
- Cross-reference with LLM assessments
- Improve accuracy over time

### 4. Difficulty Prediction Model
- Train model on (question metadata → actual difficulty)
- Supplement LLM assessment with ML prediction
- Hybrid approach for maximum accuracy

## Validation

To validate the system is working:

```typescript
// Check question has difficulty assessment
const question = await prisma.generatedQuestion.findUnique({
  where: { id }
});
console.log(question.difficultyAssessment);

// Calculate scores with calibration
const result = ProgressiveScoringCalculator.calculateScore(
  questionScores,  // includes difficultyAssessment per question
);

// View breakdown
console.log(progressiveScoring.generateScoreSummary(result));
// Output:
// Q1: 80% (1.0x × 1.00 = 1.00x) [difficulty: 5.5/10] ████████
// Q2: 90% (1.2x × 0.70 = 0.84x) [difficulty: 4.0/10] █████████
// Q3: 75% (1.5x × 1.10 = 1.65x) [difficulty: 6.0/10] ███████
// Q4: 70% (2.0x × 1.90 = 3.80x) [difficulty: 8.5/10] ███████
```

## Testing Recommendations

### Unit Tests
- Test weight calculation with various difficulty multipliers
- Verify clamping to 0.5x - 2.0x range
- Test baseline establishment

### Integration Tests
- Generate questions with different performance patterns
- Verify difficulty assessments stored correctly
- Compare scores with/without calibration

### Manual Testing
- Create assessment with intentionally varied difficulties
- Review LLM justifications for accuracy
- Validate final scores reflect expertise

## Conclusion

The LLM-based difficulty calibration system ensures **fair, consistent, and transparent** scoring across dynamically generated questions. By eliminating the luck factor and properly weighting questions based on actual complexity, candidates are evaluated on their true demonstrated expertise rather than the random difficulty of questions they received.
