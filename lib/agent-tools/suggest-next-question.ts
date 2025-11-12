/**
 * Suggest Next Question Tool for Claude Agent
 * Allows AI to suggest advancing to the next question when current one is complete
 */

import type { Anthropic } from "@anthropic-ai/sdk";

export interface SuggestNextQuestionToolInput {
  reason: string;
  performance: string;
}

export interface SuggestNextQuestionToolOutput {
  success: boolean;
  reason: string;
  performance: string;
  suggestion: string;
}

/**
 * Tool definition for Claude API
 */
export const suggestNextQuestionTool: Anthropic.Tool = {
  name: "suggest_next_question",
  description:
    "Suggest advancing to the next question when the candidate has successfully " +
    "completed the current one. Use this when all tests pass and the solution is " +
    "satisfactory. This will prompt the user to move to the next challenge.",
  input_schema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description:
          "Brief explanation of why they should advance (e.g., 'All tests passing with optimal time complexity')",
      },
      performance: {
        type: "string",
        description:
          "Short performance feedback (e.g., 'Excellent solution - completed in 12 minutes')",
      },
    },
    required: ["reason", "performance"],
  },
};

/**
 * Execute the suggest_next_question tool
 */
export async function executeSuggestNextQuestion(
  input: SuggestNextQuestionToolInput
): Promise<SuggestNextQuestionToolOutput> {
  // This tool doesn't need to do any backend work
  // It just returns the suggestion data that the frontend will display
  return {
    success: true,
    reason: input.reason,
    performance: input.performance,
    suggestion: "Ready for the next challenge?",
  };
}
