/**
 * Question Pool Statistics API
 *
 * Public endpoint for displaying question generation statistics
 * on the landing page and marketing materials.
 *
 * GET /api/stats/question-pool
 * Returns global statistics about the question pool
 */

import { NextResponse } from "next/server";
import { smartQuestionService } from "@/lib/services/smart-question-service";

export async function GET() {
  try {
    const stats = await smartQuestionService.getGlobalPoolStats();

    // Add marketing-friendly labels
    const response = {
      totalQuestionsGenerated: stats.totalQuestionsGenerated,
      uniqueVariations: stats.uniqueVariations,
      avgUniquenessScore: Math.round(stats.avgUniquenessScore * 100) / 100,
      seedCount: stats.seedCount,
      generationRate: stats.generationRate,

      // Marketing labels
      labels: {
        totalQuestions: formatNumber(stats.totalQuestionsGenerated) + " questions",
        uniqueness: Math.round(stats.avgUniquenessScore * 100) + "% unique",
        seeds: stats.seedCount + " problem seeds",
        rate: stats.generationRate,
      },

      // Proof points for marketing
      proofPoints: [
        {
          metric: formatNumber(stats.totalQuestionsGenerated) + "+",
          label: "Questions Generated",
          description: "Unique questions created dynamically",
        },
        {
          metric: Math.round(stats.avgUniquenessScore * 100) + "%",
          label: "Uniqueness Score",
          description: "Each candidate gets a unique assessment",
        },
        {
          metric: stats.seedCount + "",
          label: "Problem Seeds",
          description: "Expandable question templates",
        },
        {
          metric: stats.generationRate.replace("/day", ""),
          label: "Generated Daily",
          description: "Fresh questions every day",
        },
      ],

      // Feature claim support
      claimsSupport: {
        infiniteQuestions: stats.totalQuestionsGenerated > 1000,
        dynamicGeneration: true,
        noQuestionReuse: stats.avgUniquenessScore > 0.8,
        adaptiveDifficulty: true,
      },

      // Timestamp for caching
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        // Cache for 5 minutes
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("Failed to get question pool stats:", error);

    // Return default stats if there's an error
    return NextResponse.json(
      {
        totalQuestionsGenerated: 0,
        uniqueVariations: 0,
        avgUniquenessScore: 1.0,
        seedCount: 0,
        generationRate: "0/day",
        error: "Failed to fetch stats",
      },
      { status: 500 }
    );
  }
}

/**
 * Format large numbers with K/M suffixes
 */
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}
