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

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

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
        system: PROMPT_ANALYZER_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: analysisPrompt,
          },
        ],
      });

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
 */
const PROMPT_ANALYZER_SYSTEM_PROMPT = `You are an expert evaluator of AI prompt quality in technical interviews.

Analyze each prompt a candidate sends to an AI coding assistant and score it on:

1. **Specificity (0-100)**: Does the prompt include:
   - Specific file names or line numbers?
   - Error messages or test failures?
   - Concrete examples or constraints?
   - Relevant context about what they've tried?

2. **Clarity (0-100)**: Is the request:
   - Clearly stated with unambiguous intent?
   - Well-structured and easy to understand?
   - Free from vague language like "make it work" or "fix this"?

3. **Technical Depth (0-100)**: Does the prompt show:
   - Understanding of the underlying problem?
   - Awareness of technical concepts (algorithms, data structures)?
   - Ability to articulate technical constraints?
   - Debugging reasoning or hypothesis?

For each prompt, provide:
- Analysis: 1-2 sentence explanation
- Strength: What was done well (optional)
- Weakness: What could be improved (optional)
- Category: excellent | good | needs_improvement | poor
- Scores for specificity, clarity, and technical depth (0-100)

Be objective and evidence-based. Compare prompts to best practices for AI collaboration.`;

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
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022', // Faster model for real-time
      max_tokens: 300,
      temperature: 0,
      system: 'Rate this AI prompt on a scale of 0-100 based on specificity, clarity, and technical depth. Return only: SCORE: <number>\nFEEDBACK: <brief feedback>',
      messages: [
        {
          role: 'user',
          content: `Rate this prompt from a technical interview:\n\n"${userMessage}"`,
        },
      ],
    });

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
