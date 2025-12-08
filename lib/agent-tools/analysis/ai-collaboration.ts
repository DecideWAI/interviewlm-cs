/**
 * AI Collaboration Analysis Tool
 *
 * Analyzes AI collaboration quality (unique to InterviewLM).
 * Ported from Python LangGraph implementation.
 */

import { Evidence, DimensionScore } from "@/lib/types/session-evaluation";
import { InterviewMetrics } from "@/lib/types/interview-agent";

interface AIInteraction {
  candidateMessage?: string;
  userMessage?: string;
  timestamp?: string;
}

/**
 * Analyze AI collaboration quality (unique to InterviewLM).
 *
 * Methods:
 * 1. Prompt quality - specificity, clarity, technical depth
 * 2. AI usage effectiveness - appropriate dependency level
 *
 * @param claudeInteractions - List of AI chat interactions
 * @param metrics - Optional session metrics including AI dependency score
 * @returns DimensionScore with score, confidence, evidence, and breakdown
 */
export async function analyzeAICollaboration(
  claudeInteractions: AIInteraction[],
  metrics?: Partial<InterviewMetrics> | null
): Promise<DimensionScore> {
  const evidence: Evidence[] = [];

  if (!claudeInteractions || claudeInteractions.length === 0) {
    return {
      score: 0,
      confidence: 1.0,
      evidence: [
        { type: "metric", description: "No AI interactions", value: 0 },
      ],
      breakdown: {},
    };
  }

  // Analyze prompt quality
  const specificityScores: number[] = [];
  const clarityScores: number[] = [];
  const technicalDepthScores: number[] = [];

  for (const interaction of claudeInteractions) {
    const userMessage =
      interaction.candidateMessage || interaction.userMessage || "";
    if (!userMessage) continue;

    const words = userMessage.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    // Specificity: longer, detailed prompts score higher
    if (wordCount >= 20) {
      specificityScores.push(80);
    } else if (wordCount >= 10) {
      specificityScores.push(60);
    } else if (wordCount >= 5) {
      specificityScores.push(40);
    } else {
      specificityScores.push(20);
    }

    // Clarity: look for clear structure (questions, bullet points)
    const hasQuestion = userMessage.includes("?");
    const structureIndicators = ["1.", "2.", "-", "*", "first", "then", "finally"];
    const hasStructure = structureIndicators.some((p) =>
      userMessage.toLowerCase().includes(p)
    );

    let clarity = 50;
    if (hasQuestion) clarity += 20;
    if (hasStructure) clarity += 20;
    clarityScores.push(Math.min(100, clarity));

    // Technical depth: look for code references, technical terms
    const technicalTerms = [
      "function",
      "class",
      "error",
      "debug",
      "test",
      "api",
      "async",
      "await",
      "promise",
      "type",
      "interface",
      "component",
      "hook",
      "state",
      "props",
    ];
    const hasCode = userMessage.includes("```") || userMessage.includes("`");
    const termCount = technicalTerms.filter((term) =>
      userMessage.toLowerCase().includes(term)
    ).length;

    let depth = 40;
    if (hasCode) depth += 30;
    depth += Math.min(30, termCount * 10);
    technicalDepthScores.push(Math.min(100, depth));
  }

  // Calculate averages
  const specificity =
    specificityScores.length > 0
      ? specificityScores.reduce((a, b) => a + b, 0) / specificityScores.length
      : 50;

  const clarity =
    clarityScores.length > 0
      ? clarityScores.reduce((a, b) => a + b, 0) / clarityScores.length
      : 50;

  const technicalDepth =
    technicalDepthScores.length > 0
      ? technicalDepthScores.reduce((a, b) => a + b, 0) /
        technicalDepthScores.length
      : 50;

  const promptQualityScore = (specificity + clarity + technicalDepth) / 3;

  evidence.push(
    {
      type: "metric",
      description: `Prompt specificity: ${Math.round(specificity)}/100`,
      value: specificity,
    },
    {
      type: "metric",
      description: `Prompt clarity: ${Math.round(clarity)}/100`,
      value: clarity,
    },
    {
      type: "metric",
      description: `Technical depth: ${Math.round(technicalDepth)}/100`,
      value: technicalDepth,
    }
  );

  // AI usage effectiveness
  let aiDependency = 50; // Default moderate
  if (metrics?.aiDependencyScore !== undefined) {
    aiDependency = metrics.aiDependencyScore;
  }

  // Optimal: moderate AI usage (not too dependent, not ignoring it)
  const usageEffectivenessScore = 100 - Math.abs(50 - aiDependency);

  evidence.push({
    type: "metric",
    description: `AI dependency score: ${Math.round(aiDependency)}/100`,
    value: aiDependency,
  });

  // Combine scores (70% prompt quality, 30% usage effectiveness)
  const score = Math.round(
    promptQualityScore * 0.7 + usageEffectivenessScore * 0.3
  );

  const confidence = claudeInteractions.length >= 5 ? 0.9 : 0.6;

  return {
    score,
    confidence,
    evidence,
    breakdown: {
      specificity: Math.round(specificity),
      clarity: Math.round(clarity),
      technicalDepth: Math.round(technicalDepth),
      usageEffectiveness: Math.round(usageEffectivenessScore),
    },
  };
}
