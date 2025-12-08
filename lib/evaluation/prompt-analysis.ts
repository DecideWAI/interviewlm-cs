/**
 * Prompt Analysis for AI Collaboration Scoring
 *
 * Analyzes the quality of prompts sent to the AI during interviews.
 * Provides evidence-based scoring for AI collaboration dimension.
 *
 * Evaluates:
 * - Specificity: Does the prompt include relevant context?
 * - Clarity: Is the request clear and unambiguous?
 * - Technical depth: Does it show understanding of the problem?
 * - Iteration quality: Do follow-up prompts refine effectively?
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  buildCachedSystemPrompt,
  createAgentClient,
  extractCacheMetrics,
  logCacheMetrics,
} from '@/lib/utils/agent-utils';

export interface PromptQuality {
  score: number; // 0-100
  specificity: number; // 0-100
  clarity: number; // 0-100
  technicalDepth: number; // 0-100
  iterationQuality: number; // 0-100
  evidence: PromptEvidence[];
}

export interface PromptEvidence {
  promptIndex: number;
  timestamp: Date;
  userMessage: string;
  analysis: string;
  strength?: string; // What was done well
  weakness?: string; // What could be improved
  category: 'excellent' | 'good' | 'needs_improvement' | 'poor';
}

export interface ClaudeInteraction {
  id: string;
  userMessage: string;
  assistantResponse: string;
  timestamp: Date;
  toolsUsed?: string[];
}

/**
 * Analyze all prompts from a candidate's session
 */
export async function analyzePrompts(
  interactions: ClaudeInteraction[]
): Promise<PromptQuality> {
  if (interactions.length === 0) {
    return {
      score: 0,
      specificity: 0,
      clarity: 0,
      technicalDepth: 0,
      iterationQuality: 0,
      evidence: [],
    };
  }

  // Use shared client with caching enabled
  const client = createAgentClient();

  const evidence: PromptEvidence[] = [];
  let totalSpecificity = 0;
  let totalClarity = 0;
  let totalTechnicalDepth = 0;
  let totalIterationQuality = 0;

  // Analyze prompts in batches of 5 for efficiency
  const batchSize = 5;
  for (let i = 0; i < interactions.length; i += batchSize) {
    const batch = interactions.slice(i, i + batchSize);

    // Build analysis prompt
    const analysisPrompt = buildPromptAnalysisRequest(batch, i);

    try {
      const response = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0, // Deterministic for consistency
        system: buildCachedSystemPrompt(PROMPT_ANALYZER_SYSTEM_PROMPT),
        messages: [
          {
            role: 'user',
            content: analysisPrompt,
          },
        ],
      });

      // Log cache metrics
      const cacheMetrics = extractCacheMetrics(response);
      logCacheMetrics(cacheMetrics, 'PromptAnalysis');

      const analysis = extractAnalysisFromResponse(response);

      // Add evidence for each prompt in batch
      for (let j = 0; j < batch.length; j++) {
        const promptAnalysis = analysis.prompts[j];
        if (promptAnalysis) {
          evidence.push({
            promptIndex: i + j,
            timestamp: batch[j].timestamp,
            userMessage: batch[j].userMessage,
            analysis: promptAnalysis.analysis,
            strength: promptAnalysis.strength,
            weakness: promptAnalysis.weakness,
            category: promptAnalysis.category,
          });

          totalSpecificity += promptAnalysis.specificity;
          totalClarity += promptAnalysis.clarity;
          totalTechnicalDepth += promptAnalysis.technicalDepth;
        }
      }
    } catch (error) {
      console.error('[Prompt Analysis] Error analyzing batch:', error);
      // Continue with next batch
    }
  }

  // Calculate iteration quality by comparing consecutive prompts
  totalIterationQuality = calculateIterationQuality(interactions, evidence);

  const promptCount = evidence.length;
  const avgSpecificity = promptCount > 0 ? totalSpecificity / promptCount : 0;
  const avgClarity = promptCount > 0 ? totalClarity / promptCount : 0;
  const avgTechnicalDepth = promptCount > 0 ? totalTechnicalDepth / promptCount : 0;
  const avgIterationQuality = totalIterationQuality;

  // Overall score: weighted average
  const score = Math.round(
    avgSpecificity * 0.3 +
    avgClarity * 0.25 +
    avgTechnicalDepth * 0.25 +
    avgIterationQuality * 0.2
  );

  return {
    score,
    specificity: Math.round(avgSpecificity),
    clarity: Math.round(avgClarity),
    technicalDepth: Math.round(avgTechnicalDepth),
    iterationQuality: Math.round(avgIterationQuality),
    evidence,
  };
}

/**
 * System prompt for the prompt analyzer
 *
 * NOTE: This prompt is intentionally detailed (~1200+ tokens) to enable
 * Anthropic's prompt caching. Minimum ~1024 tokens required for caching.
 */
const PROMPT_ANALYZER_SYSTEM_PROMPT = `You are an expert evaluator of AI prompt quality in technical interviews. Your role is to objectively assess how effectively candidates communicate with AI coding assistants during real-world programming tasks.

## Evaluation Framework

Analyze each prompt a candidate sends to an AI coding assistant and score it across four key dimensions:

### 1. Specificity (0-100)
Measures how precise and contextual the prompt is. High-scoring prompts include:
- **File references**: Specific file names, paths, or line numbers (e.g., "In src/utils/parser.ts at line 45...")
- **Error context**: Exact error messages, stack traces, or test failure outputs
- **Concrete examples**: Sample inputs, expected outputs, or edge cases
- **Prior attempts**: What the candidate has already tried and why it didn't work
- **Constraints**: Memory limits, time complexity requirements, API limitations

Score guide:
- 90-100: Includes multiple specific details, error messages, and clear constraints
- 70-89: Includes some specific context but missing key details
- 50-69: Generic with minimal context (e.g., "this function isn't working")
- 0-49: Extremely vague with no actionable context

### 2. Clarity (0-100)
Measures how well the request is communicated. High-scoring prompts are:
- **Unambiguous**: Single clear interpretation of what's being asked
- **Well-structured**: Organized thoughts, possibly using formatting or sections
- **Action-oriented**: Clear about what outcome is desired
- **Complete**: All necessary information in one message (not requiring clarification)

Red flags that reduce clarity scores:
- Vague language: "make it work", "fix this", "help me", "something is wrong"
- Multiple unrelated questions in one prompt
- Stream of consciousness without organization
- Missing crucial context that would require follow-up questions

Score guide:
- 90-100: Crystal clear, well-organized, single interpretation possible
- 70-89: Clear but could be better organized or more precise
- 50-69: Understandable but requires interpretation or has ambiguity
- 0-49: Confusing, disorganized, or incomprehensible

### 3. Technical Depth (0-100)
Measures the candidate's demonstrated technical understanding. High-scoring prompts show:
- **Problem understanding**: Articulates WHY something might not be working
- **Algorithm awareness**: Mentions relevant algorithms, data structures, patterns
- **Debugging reasoning**: Forms hypotheses about root causes
- **Trade-off awareness**: Considers performance, maintainability, edge cases
- **Technical vocabulary**: Uses correct terminology for the domain

Score guide:
- 90-100: Demonstrates deep understanding, forms hypotheses, discusses trade-offs
- 70-89: Shows good technical grasp with some reasoning
- 50-69: Basic technical awareness without deeper analysis
- 0-49: Minimal technical engagement, treats AI as magic

### 4. Iteration Quality
This is calculated separately by analyzing prompt sequences. Good iteration shows:
- Learning from previous AI responses
- Refining questions based on new information
- Progressive narrowing toward solution
- Not repeating the same vague question

## Output Requirements

For each prompt analyzed, provide:
- **Analysis**: 1-2 sentence explanation of the overall quality
- **Strength**: What was done well (optional, only if notable)
- **Weakness**: What could be improved (optional, only if notable)
- **Category**: One of: excellent | good | needs_improvement | poor
- **Scores**: Numeric scores (0-100) for specificity, clarity, and technicalDepth

## Evaluation Principles

1. **Be objective**: Base scores on evidence, not assumptions about intent
2. **Consider context**: A simple question for a simple task is appropriate
3. **Value precision**: Specific, actionable prompts are more valuable than verbose ones
4. **Reward debugging mindset**: Candidates who show reasoning process score higher
5. **Recognize good AI collaboration**: Effective prompts leverage AI strengths

## Examples of Each Category

**Excellent (90-100)**:
"I'm implementing a LRU cache in TypeScript. My get() method at line 34 of cache.ts returns undefined for keys that should exist. I've verified the key is being added in put() (logged at line 28). I suspect the issue is in my doubly-linked list node removal - specifically whether I'm updating the prev/next pointers correctly when moving a node to the front. Can you review my moveToFront() method?"

**Good (70-89)**:
"My binary search function returns -1 when searching for values that exist in the array. Here's the function: [code]. I think the issue might be in how I'm calculating the midpoint or updating the boundaries."

**Needs Improvement (50-69)**:
"Why isn't my search working? It keeps returning -1."

**Poor (0-49)**:
"Help me fix this"

Be thorough but fair in your evaluations. The goal is to provide actionable insights that help improve AI collaboration skills.`;

/**
 * Build the analysis request for a batch of prompts
 */
function buildPromptAnalysisRequest(
  batch: ClaudeInteraction[],
  startIndex: number
): string {
  const promptsText = batch
    .map((interaction, idx) => {
      return `
**Prompt ${startIndex + idx + 1}:**
Timestamp: ${interaction.timestamp.toISOString()}
User Message: "${interaction.userMessage}"
Tools Used: ${interaction.toolsUsed?.join(', ') || 'None'}
`;
    })
    .join('\n---\n');

  return `Analyze the following prompts from a technical interview candidate:

${promptsText}

For each prompt, return a JSON object with this structure:
{
  "prompts": [
    {
      "promptNumber": 1,
      "specificity": 85,
      "clarity": 90,
      "technicalDepth": 70,
      "analysis": "Clear request with specific error message included",
      "strength": "Provided exact error message and line number",
      "weakness": "Could have mentioned what debugging steps were already tried",
      "category": "good"
    }
  ]
}

Return ONLY the JSON object, no other text.`;
}

/**
 * Extract analysis from Claude's response
 */
function extractAnalysisFromResponse(response: Anthropic.Message): {
  prompts: Array<{
    promptNumber: number;
    specificity: number;
    clarity: number;
    technicalDepth: number;
    analysis: string;
    strength?: string;
    weakness?: string;
    category: 'excellent' | 'good' | 'needs_improvement' | 'poor';
  }>;
} {
  const content = response.content[0];
  if (content.type !== 'text') {
    return { prompts: [] };
  }

  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonText = content.text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\s*|\s*```/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\s*|\s*```/g, '');
    }

    const parsed = JSON.parse(jsonText);
    return parsed;
  } catch (error) {
    console.error('[Prompt Analysis] Failed to parse response:', error);
    return { prompts: [] };
  }
}

/**
 * Calculate iteration quality by analyzing how well the candidate refines prompts
 */
function calculateIterationQuality(
  interactions: ClaudeInteraction[],
  evidence: PromptEvidence[]
): number {
  if (interactions.length < 2) {
    return 50; // Neutral score for single-prompt sessions
  }

  let improvementCount = 0;
  let totalComparisons = 0;

  // Compare consecutive prompts
  for (let i = 1; i < evidence.length; i++) {
    const prev = evidence[i - 1];
    const curr = evidence[i];

    // Check if current prompt is more specific/clear than previous
    const avgPrev = (prev.analysis.length || 0); // Use analysis length as proxy
    const avgCurr = (curr.analysis.length || 0);

    // Check category improvement
    const categoryScore = {
      poor: 0,
      needs_improvement: 1,
      good: 2,
      excellent: 3,
    };

    if (categoryScore[curr.category] >= categoryScore[prev.category]) {
      improvementCount++;
    }

    totalComparisons++;
  }

  // Score based on improvement ratio
  const improvementRatio = totalComparisons > 0
    ? improvementCount / totalComparisons
    : 0.5;

  return Math.round(improvementRatio * 100);
}

/**
 * Quick analysis for a single prompt (used during interview for real-time feedback)
 */
export async function analyzeSinglePrompt(
  userMessage: string
): Promise<{
  score: number;
  feedback: string;
}> {
  // Use shared client with caching enabled
  const client = createAgentClient();

  const singlePromptSystemPrompt = 'Rate this AI prompt on a scale of 0-100 based on specificity, clarity, and technical depth. Return only: SCORE: <number>\nFEEDBACK: <brief feedback>';

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022', // Faster model for real-time
      max_tokens: 300,
      temperature: 0,
      system: buildCachedSystemPrompt(singlePromptSystemPrompt),
      messages: [
        {
          role: 'user',
          content: `Rate this prompt from a technical interview:\n\n"${userMessage}"`,
        },
      ],
    });

    // Log cache metrics
    const cacheMetrics = extractCacheMetrics(response);
    logCacheMetrics(cacheMetrics, 'SinglePromptAnalysis');

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const scoreMatch = text.match(/SCORE:\s*(\d+)/);
    const feedbackMatch = text.match(/FEEDBACK:\s*(.+)/);

    return {
      score: scoreMatch ? parseInt(scoreMatch[1], 10) : 50,
      feedback: feedbackMatch ? feedbackMatch[1].trim() : 'Prompt analyzed.',
    };
  } catch (error) {
    console.error('[Prompt Analysis] Single prompt analysis error:', error);
    return {
      score: 50,
      feedback: 'Unable to analyze prompt quality.',
    };
  }
}
