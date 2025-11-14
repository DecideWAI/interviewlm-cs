# Evaluation Agent Research Summary

**Date**: November 13, 2025
**Research Period**: November 2025
**Focus**: Evidence-based post-interview assessment using LLMs

---

## Executive Summary

This document summarizes comprehensive research on building an AI-powered Evaluation Agent for technical interview assessment. The research covered five key areas:

1. Evidence-based code quality assessment with LLMs
2. AI-powered interview evaluation best practices
3. Coding session analysis for skill assessment
4. Prompt quality analysis and AI collaboration scoring
5. Structured output generation with LLMs

### Key Findings

✅ **LLMs can reliably evaluate code quality** when using structured prompts and evidence-based frameworks
✅ **Multi-method validation reduces false positives** by 25.8% (Microsoft CORE study)
✅ **Structured interviews are 2x more predictive** than unstructured approaches
✅ **G-Eval framework** enables task-specific LLM evaluation with high accuracy
✅ **JSON Schema structured outputs** achieve 100% compliance vs 35% with prompting alone

---

## 1. Evidence-Based Code Quality Assessment

### Research Findings

#### White-Box vs Black-Box Assessment

**Openia Framework** (2024 research):
- Leverages internal LLM representations to assess code correctness
- **2X improvement** in standalone code generation
- **3X enhancement** in repository-specific scenarios
- More robust than traditional black-box methods

**Key Insight**: Internal model representations provide better signal than output-only analysis.

#### Automated Code Revision (CORE by Microsoft)

**Microsoft's CORE System**:
- Uses **pair of LLMs** (proposer + ranker)
- Proposer generates candidate code revisions
- Ranker validates and selects best revision
- **Results**: 59.2% of Python files passed both tool and human review
- **False positive reduction**: 25.8% via ranker LLM

**Architecture**:
```
Code → Static Analysis → LLM Proposer → Multiple Revisions → LLM Ranker → Best Revision
```

**Application to InterviewLM**:
- Use similar proposer-ranker pattern for evaluation
- Proposer: Identifies issues and scores dimensions
- Ranker: Validates scores and filters false positives

#### LLMs as Static Analysis Tools

**Research by GPT-3.5 Turbo evaluation**:
- Can evaluate code quality with correlation to SonarQube metrics
- However, measures different aspects than traditional static analysis
- **Recommendation**: Combine LLM evaluation with traditional static analysis

**Correlation Study**:
| Metric | LLM-SonarQube Correlation |
|--------|---------------------------|
| Complexity | 0.72 |
| Maintainability | 0.68 |
| Security | 0.54 |
| Bugs | 0.61 |

**Interpretation**: LLMs are good at high-level quality but need supplementation for security/bugs.

### Common Challenges Identified

❌ **Challenge 1**: LLM-generated code has more bugs than human code
- **Implication**: Don't assume code is correct just because it looks good
- **Solution**: Always validate with test results

❌ **Challenge 2**: LLMs fail to capture human intent
- **Implication**: Focus on what code *does*, not what developer *meant*
- **Solution**: Evidence-based scoring only

### Best Practices for Code Evaluation

1. **Multi-Method Validation**
   - Combine static analysis + LLM review + test results
   - Require agreement between methods for high scores

2. **Evidence Requirements**
   - Every score must cite specific line numbers or code snippets
   - No assumptions about intent

3. **Confidence Scoring**
   - Lower confidence when methods disagree
   - Higher confidence with more data points

4. **Human-in-the-Loop**
   - Use human evaluation as ground truth for tuning
   - Validate LLM scores against expert reviewers

---

## 2. AI-Powered Interview Evaluation Best Practices

### Industry Leaders

#### Criteria's Interview Intelligence

**Key Features**:
- AI scoring based on decades of I/O psychology research
- Scores **solely on transcripts** (not audio/video) to reduce bias
- Explains reasoning behind assessments (explainable AI)
- Trained on expert psychologist evaluations

**Results**:
- 75% reduction in hiring time
- 80% cost reduction
- 2X more predictive than unstructured interviews

**Application to InterviewLM**:
- Use transcript-only analysis (code + text, not video/audio)
- Provide detailed justifications for every score
- Train on expert developer evaluations

#### HireVue, Interviewer.AI, X0PA AI

**Common Patterns**:
- Natural Language Processing for understanding responses
- Structured interview frameworks (consistent questions/criteria)
- Bias mitigation through objective scoring
- Real-time or post-interview evaluation

**Predictive Analytics**:
- Best platforms correlate scores with on-job performance
- Use historical hiring data to calibrate scoring models

### Evaluation Framework Components

1. **Structured Rubrics**
   - Predefined criteria with clear scoring guidelines
   - Observable behaviors for each score level
   - Consistent across all candidates

2. **Bias Mitigation**
   - Evaluate on job-relevant factors only
   - Remove demographic indicators from evaluation
   - Validate for fairness across groups

3. **Transparency**
   - Explain scoring methodology to candidates
   - Provide feedback on performance
   - Allow score appeals/review

---

## 3. Coding Session Analysis for Skill Assessment

### Top Tech Company Rubrics

Research on FAANG interview evaluation revealed **4 core dimensions**:

#### 1. Communication (Tech Interview Handbook)
- Asking clarifying questions
- Explaining approach before coding
- Discussing trade-offs
- Clear variable/function naming

#### 2. Problem Solving
- Understanding problem requirements
- Analyzing constraints and edge cases
- Choosing appropriate algorithms/data structures
- Optimizing solution

#### 3. Technical Competency
- Correct syntax and language features
- Clean, maintainable code structure
- Proper error handling
- Time/space complexity awareness

#### 4. Testing
- Identifying test cases (common + edge cases)
- Fixing bugs when tests fail
- Systematic debugging approach

### Scoring Systems

**1-5 Scale** (Industry Standard):
- **1**: Lacks required skill
- **2**: Below expectations
- **3**: Meets expectations
- **4**: Exceeds expectations
- **5**: Highly proficient

**Observable Behaviors** (Critical for fairness):
- Every score level defined by specific, observable actions
- Example (Problem Solving - Score 4):
  - "Identifies multiple solution approaches"
  - "Analyzes time/space complexity of each"
  - "Explains trade-offs before implementing"
  - "Optimizes solution without prompting"

### Session Analysis Tools

**Leading Platforms**:
- **CodeSignal**: Measures real-world skills through validated assessments
- **Codility**: Structured technical interviews as "cornerstone of skills evaluation"
- **Qualified**: Code playback feature to review thought process
- **HackerRank**: Role-based assessments with plagiarism detection

**Key Features**:
1. **Code Playback**: Review entire session timeline
2. **Automated Scoring**: Standardized test results
3. **Plagiarism Detection**: Ensure authentic work
4. **Pair Programming Mode**: Live review capability

**Application to InterviewLM**:
- Implement code playback (already planned in Session Recording Architecture)
- Use automated test scoring as objective baseline
- Add plagiarism detection for code similarity checks

---

## 4. Prompt Quality Analysis & AI Collaboration Scoring

### LLM Evaluation Methods

#### G-Eval Framework

**What**: Uses LLMs to evaluate LLM outputs with task-specific metrics

**Process**:
1. Define evaluation criteria (e.g., prompt quality)
2. Create detailed rubric (1-5 scale with descriptions)
3. Use LLM to score against rubric
4. Generate chain-of-thought reasoning for score

**Performance**: One of the best methods for task-specific evaluation

**Application to InterviewLM**:
```
Prompt: "Evaluate this developer's prompt quality:
[Developer prompt]

Criteria:
- Specificity (1-5): How clear and specific is the request?
- Context (1-5): Does it include relevant code/errors?
- Goal-orientation (1-5): Is the desired outcome clear?

Provide score and reasoning for each dimension."
```

#### LLM-as-a-Judge

**Method**: Use LLM to approximate human labeling

**Best Practices**:
- Use natural language rubrics (more reliable than numeric scores)
- Binary evaluations (Good/Bad) more consistent than scales
- Aggregate multiple evaluations for reliability
- Include self-consistency checks

**Reliability Study**:
- Multi-review aggregation reduces hallucinations to <0.5%
- Statistical validation achieves >95% confidence

**Application to InterviewLM**:
- Use Claude to evaluate prompt quality
- Aggregate scores from multiple prompt evaluations
- Use binary judgments ("Is this a high-quality prompt?") for consistency

### Human-AI Collaborative Evaluation

**Research Findings** (LAK25 Study):
- LLM-based systems **significantly improve** both novice and expert evaluator performance
- Human-AI co-grading more efficient than either alone
- Effective for large-scale assessment

**Recommended Workflow**:
1. AI generates initial scores + evidence
2. Human reviewer validates scores
3. Disagreements flagged for deeper review
4. Feedback loop trains AI to align with human judgment

### Prompt Quality Metrics

**PromptLayer Best Practices**:
1. **Version Control**: Track prompt iterations
2. **Regression Testing**: Ensure prompts don't degrade over time
3. **A/B Testing**: Compare prompt variations
4. **Golden Datasets**: Score prompts against known-good examples

**Orq.ai Recommendations**:
- Collaborative annotation and issue tracking
- Human-in-the-loop workflows
- Golden dataset curation
- Team feedback capture

**Application to InterviewLM**:
- Maintain golden dataset of excellent vs poor prompts
- Score candidate prompts against this dataset
- Track prompt quality evolution during session

---

## 5. Structured Output Generation with LLMs

### JSON Schema for LLM Outputs

**Key Findings** (2024-2025 Research):

#### OpenAI Structured Outputs
- Introduced August 2024
- Guarantees valid JSON conforming to schema
- **100% compliance** with "strict mode" vs **35%** with prompting alone
- Major companies report **90%+ reduction** in API parsing errors

#### Implementation Approaches

**1. Pydantic Models** (Python):
```python
from pydantic import BaseModel

class CodeQualityScore(BaseModel):
    score: int  # 0-100
    evidence: list[Evidence]
    confidence: float  # 0-1
```

**2. Zod Schemas** (TypeScript):
```typescript
import { z } from 'zod';

const CodeQualitySchema = z.object({
  score: z.number().min(0).max(100),
  evidence: z.array(EvidenceSchema),
  confidence: z.number().min(0).max(1),
});
```

**3. JSON Schema** (Platform-agnostic):
```json
{
  "type": "object",
  "properties": {
    "score": { "type": "integer", "minimum": 0, "maximum": 100 },
    "evidence": { "type": "array", "items": { "$ref": "#/definitions/Evidence" } },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
  },
  "required": ["score", "evidence", "confidence"]
}
```

### Best Practices for Structured Output

1. **Use Native Structured Output APIs**
   - OpenAI: `response_format: { type: "json_object" }`
   - Anthropic: Will add native structured output support (use prompt engineering for now)
   - Cohere: Built-in JSON mode

2. **Schema Design Principles**
   - Simple, flat structures perform better than deeply nested
   - Use enums for constrained values
   - Include descriptions in schema (helps LLM understand intent)
   - Validate outputs even with structured mode

3. **Error Handling**
   - Retry with stricter prompts if validation fails
   - Provide example outputs in prompt
   - Use temperature=0 for consistent formatting

### Report Generation Strategy

**Multi-Stage Approach**:

```
Session Data → Analysis → Structured JSON → Template Rendering → HTML/PDF
```

**Stage 1**: LLM generates structured JSON with scores + evidence
**Stage 2**: Validate JSON against schema
**Stage 3**: Render human-readable report from JSON
**Stage 4**: Cache structured JSON for fast re-rendering

**Benefits**:
- Separate concerns (analysis vs presentation)
- Easy to version report templates
- Fast re-generation with different formats
- Queryable structured data for analytics

---

## 6. Avoiding False Positives & Assumptions

### Research on Bias & False Positives

#### MIT/Stanford Survey on LLM Bias

**Key Findings**:
- Standard evaluation methods create "false sense of fairness"
- Model refusal responses misinterpreted as fairness
- "Silenced biases" hidden in latent space
- Need comprehensive evaluation frameworks

#### False Positive Detection Methods

**1. Multi-Method Validation**
- Require agreement between multiple analysis methods
- Flag disagreements for human review
- Use ensemble approaches

**2. Confidence Intervals**
- Report scores as ranges (e.g., 75-85) not exact values
- Wider intervals for lower confidence
- Explicit uncertainty quantification

**3. Evidence Requirements**
- High scores require multiple pieces of strong evidence
- Each evidence must be specific and demonstrable
- No generic/template evidence

**4. Bias Audits**
- Test for known biases (code volume, AI usage, speed)
- Compare scores across demographic groups
- Use fairness metrics (false positive parity, equal opportunity)

### Bias Mitigation Strategies

#### Google's Fairness Indicators

**Metrics**:
- False positive rate by group
- False negative rate by group
- Precision parity
- Recall parity

**Application**:
- Monitor evaluation scores by candidate demographics
- Flag systematic differences for review
- Adjust scoring models to ensure fairness

#### Robust Causal Reasoning

**Approach**:
- Compare outputs across similar contexts
- Control for confounding variables
- Test counterfactuals ("Would score differ if X changed?")

**Example**:
- If candidate uses AI extensively, score shouldn't penalize
- Test: Does AI usage correlate with lower scores? If yes, investigate bias

#### Dynamic Fairness Frameworks

**Real-time Bias Detection**:
- Compare candidate scores in same context
- Flag anomalies (e.g., women consistently scored lower)
- Trigger human review for flagged evaluations

### Anti-Pattern Detection

❌ **Don't Assume**:
- "Fast completion = good developer"
- "Many AI interactions = weak skills"
- "Verbose code = bad quality"
- "Few comments = poor communication"

✅ **Do Measure**:
- Correctness (test results)
- Code structure (static analysis + LLM review)
- Problem-solving approach (iteration patterns)
- AI collaboration effectiveness (prompt quality + utilization)

### Evidence Validation Framework

**Tier 1 Evidence** (Highest confidence):
- Test results (objective)
- Static analysis metrics (objective)
- Execution output (objective)

**Tier 2 Evidence** (Medium confidence):
- LLM code review (subjective but structured)
- Iteration patterns (observable but requires interpretation)
- Time-based metrics (observable but context-dependent)

**Tier 3 Evidence** (Lower confidence):
- Inferred intent (avoid when possible)
- Style preferences (only if measurably impacts readability)
- Comparison to "ideal" solution (depends on ideal quality)

**Scoring Rule**:
- Scores >80 require at least 2 Tier 1 or 3 Tier 2 evidence points
- Scores 60-80 require at least 1 Tier 1 or 2 Tier 2 evidence points
- Scores <60 can use any evidence but must explain

---

## 7. Integration with InterviewLM Architecture

### Existing Infrastructure (Available)

✅ **Session Recording**: Complete event capture system
✅ **Code Snapshots**: Git-like diffing with full content
✅ **Claude Interactions**: Full prompt/response logging
✅ **Terminal Events**: Command and output recording
✅ **Test Results**: Pass/fail with timing and errors
✅ **Timeline Events**: Indexed event stream

### Required New Components

**1. Evaluation Data Aggregator**
- Fetches all session data from database
- Computes code diffs between snapshots
- Extracts terminal activity timeline
- Prepares structured data for analysis

**2. Analysis Engine**
- Code Quality Analyzer (static + LLM)
- Problem Solving Analyzer (patterns)
- AI Collaboration Analyzer (prompt quality)
- Communication Analyzer (clarity)

**3. Scoring Framework**
- Evidence-based scoring
- Confidence calculation
- Multi-method validation
- Bias detection

**4. Report Generator**
- JSON report creation
- HTML/PDF rendering
- Evidence formatting
- Timeline visualization

### API Design

**Endpoint**: `POST /api/sessions/[id]/evaluate`
**Processing Time**: 20-30 seconds
**Cost**: ~$0.05 per evaluation
**Output**: Structured JSON + HTML report

### Integration Points

1. **Dashboard**: Display evaluation reports
2. **Candidate View**: Show scores with feedback
3. **Analytics**: Aggregate scores across candidates
4. **Comparison**: Side-by-side candidate evaluation
5. **Export**: PDF reports for sharing

---

## 8. Implementation Priorities

### Must-Have (MVP)
1. Code quality scoring (tests + static analysis)
2. Basic problem-solving analysis (iterations)
3. Evidence collection and formatting
4. JSON report generation
5. Confidence scoring

### Should-Have (Beta)
1. LLM-based code review
2. AI collaboration scoring
3. Bias detection
4. HTML report rendering
5. Multi-method validation

### Nice-to-Have (V2)
1. Real-time evaluation during session
2. Comparative analytics vs candidate pool
3. Skill trajectory over time
4. Team evaluation (group assessments)
5. Custom scoring models per role

---

## 9. Success Metrics

### Evaluation Quality

| Metric | Target | Measurement |
|--------|--------|-------------|
| Human agreement | >85% within 10 points | Compare AI vs expert scores |
| Consistency | <5% variance | Same candidate, re-evaluate |
| Speed | <30 seconds | Time from trigger to report |
| Cost | <$0.10 | Per evaluation |
| Transparency | 100% | All scores have evidence |

### Fairness & Bias

| Metric | Target | Measurement |
|--------|--------|-------------|
| Demographic parity | <5% difference | Compare scores across groups |
| False positive rate parity | <10% difference | By demographic group |
| Bias detection rate | >90% | Catch known biases in testing |

### User Satisfaction

| Metric | Target | Measurement |
|--------|--------|-------------|
| Hiring manager satisfaction | >4.0/5 | Post-evaluation survey |
| Candidate satisfaction | >3.5/5 | Feedback on fairness |
| Report usefulness | >4.0/5 | "Helped make hiring decision" |

---

## 10. Key Takeaways

### What We Learned

1. **LLMs are effective evaluators** when used with structured prompts and evidence requirements
2. **Multi-method validation is crucial** - no single method is perfect
3. **Bias mitigation must be proactive** - test for known biases systematically
4. **Transparency builds trust** - always show evidence for scores
5. **AI collaboration is a skill** - worth evaluating separately

### What to Avoid

1. ❌ Assuming LLM outputs are correct without validation
2. ❌ Giving high scores without specific evidence
3. ❌ Penalizing AI usage (it's a tool, not cheating)
4. ❌ Using single evaluation method
5. ❌ Ignoring data quality and confidence levels

### Unique Opportunities for InterviewLM

1. ✅ **AI Collaboration Scoring**: No competitors evaluate this (first-mover advantage)
2. ✅ **Real-time Session Recording**: Comprehensive data enables better evaluation
3. ✅ **Evidence-Based Reports**: Build trust with specific examples
4. ✅ **Bias Transparency**: Show how biases are detected and mitigated
5. ✅ **Modern Development Practices**: Evaluate skills relevant to AI-assisted development

---

## 11. Recommended Next Steps

1. **Implement MVP Evaluation Agent** (Week 1-2)
   - Basic scoring with code quality + tests
   - Simple evidence collection
   - JSON report generation

2. **Validate Against Human Evaluations** (Week 2-3)
   - Collect expert developer scores for 50-100 sessions
   - Compare AI vs human scores
   - Tune scoring weights based on agreement

3. **Add Advanced Features** (Week 3-4)
   - LLM-based code review
   - AI collaboration scoring
   - Full 4-dimension evaluation
   - HTML report rendering

4. **Launch Beta** (Week 4)
   - Release to select customers
   - Gather feedback on report quality
   - Monitor for biases or false positives

5. **Iterate Based on Feedback** (Ongoing)
   - Improve scoring algorithms
   - Add new evaluation dimensions
   - Optimize for speed and cost

---

## 12. References

### Research Papers & Studies

1. **Openia Framework**: "Correctness assessment of code generated by Large Language Models using internal representations" (2025)
2. **Microsoft CORE**: "Resolving Code Quality Issues using LLMs" (2024)
3. **G-Eval Framework**: "LLM-based evaluation methods" (2024)
4. **MIT/Stanford LLM Bias Survey**: "Bias and Fairness in Large Language Models" (2023-2024)
5. **OpenAI Structured Outputs**: "JSON Schema for reliable LLM outputs" (2024)

### Industry Platforms

1. **Criteria Interview Intelligence**: AI-powered interview scoring
2. **CodeSignal**: Skills-based technical assessments
3. **HireVue**: Video interview analysis platform
4. **PromptLayer**: LLM prompt management and evaluation
5. **Orq.ai**: LLM evaluation tools and frameworks

### Technical Resources

1. **Tech Interview Handbook**: FAANG interview rubrics
2. **Microsoft Research**: CORE system architecture
3. **Google Fairness Indicators**: Bias detection metrics
4. **OpenAI API Documentation**: Structured outputs guide
5. **Anthropic Claude Documentation**: Best practices for code evaluation

---

**Document Status**: ✅ Research Complete
**Confidence Level**: High (based on peer-reviewed research and industry practices)
**Last Updated**: November 13, 2025
**Next Review**: After MVP implementation
