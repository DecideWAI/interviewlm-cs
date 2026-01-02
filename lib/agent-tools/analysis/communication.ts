/**
 * Communication Analysis Tool
 *
 * Analyzes communication skills through prompts and code documentation.
 * Ported from Python LangGraph implementation.
 */

import { Evidence, DimensionScore } from "@/lib/types/session-evaluation";

interface AIInteraction {
  candidateMessage?: string;
  userMessage?: string;
  timestamp?: string;
}

interface CodeSnapshot {
  timestamp: string;
  files: Record<string, string>;
}

/**
 * Analyze communication skills through prompts and code documentation.
 *
 * Methods:
 * 1. Prompt clarity - from AI interactions
 * 2. Code documentation - comments and structure
 *
 * @param claudeInteractions - List of AI chat interactions
 * @param codeSnapshots - List of code snapshots
 * @returns DimensionScore with score, confidence, evidence, and breakdown
 */
export async function analyzeCommunication(
  claudeInteractions: AIInteraction[],
  codeSnapshots: CodeSnapshot[]
): Promise<DimensionScore> {
  const evidence: Evidence[] = [];

  // Prompt clarity analysis
  const clarityScores: number[] = [];

  for (const interaction of claudeInteractions || []) {
    const userMessage =
      interaction.candidateMessage || interaction.userMessage || "";
    if (!userMessage) continue;

    // Clear communication indicators
    const politeWords = ["please", "thank", "could you", "would you"];
    const hasGreeting = politeWords.some((g) =>
      userMessage.toLowerCase().includes(g)
    );
    const hasContext = userMessage.length > 50;
    const hasQuestion = userMessage.includes("?");

    let clarity = 50;
    if (hasGreeting) clarity += 15;
    if (hasContext) clarity += 20;
    if (hasQuestion) clarity += 15;
    clarityScores.push(Math.min(100, clarity));
  }

  const avgClarity =
    clarityScores.length > 0
      ? clarityScores.reduce((a, b) => a + b, 0) / clarityScores.length
      : 50;

  evidence.push({
    type: "metric",
    description: `Prompt clarity: ${Math.round(avgClarity)}/100`,
    value: avgClarity,
  });

  // Code documentation analysis
  let documentationScore = 50; // Default

  if (codeSnapshots && codeSnapshots.length > 0) {
    const finalSnapshot = codeSnapshots[codeSnapshots.length - 1];
    const files = finalSnapshot.files || {};

    let totalLines = 0;
    let docLines = 0;

    for (const content of Object.values(files)) {
      if (typeof content !== "string") continue;

      const lines = content.split("\n");
      totalLines += lines.length;

      for (const line of lines) {
        const stripped = line.trim();

        // Count documentation lines
        if (stripped.startsWith("//") || stripped.startsWith("#")) {
          docLines++;
        }
        if (
          stripped.startsWith("/*") ||
          stripped.startsWith("'''") ||
          stripped.startsWith('"""')
        ) {
          docLines++;
        }
        // JSDoc/docstring continuation
        if (stripped.startsWith("*") && !stripped.startsWith("*/")) {
          docLines++;
        }
      }
    }

    if (totalLines > 0) {
      const docRatio = docLines / totalLines;

      // Optimal documentation: 5-15%
      if (docRatio >= 0.05 && docRatio <= 0.15) {
        documentationScore = 85;
      } else if (docRatio >= 0.02 && docRatio < 0.05) {
        documentationScore = 70;
      } else if (docRatio > 0.15) {
        documentationScore = 75; // Too much can be verbose
      } else {
        documentationScore = 50;
      }

      evidence.push({
        type: "metric",
        description: `Documentation ratio: ${Math.round(docRatio * 100)}%`,
        value: docRatio,
      });
    }
  }

  evidence.push({
    type: "metric",
    description: `Documentation score: ${documentationScore}/100`,
    value: documentationScore,
  });

  // Combine scores
  const score = Math.round((avgClarity + documentationScore) / 2);
  const confidence =
    claudeInteractions && claudeInteractions.length >= 3 ? 0.75 : 0.5;

  return {
    score,
    confidence,
    evidence,
    breakdown: {
      promptClarity: Math.round(avgClarity),
      documentation: documentationScore,
    },
  };
}
