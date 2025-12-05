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
  name: "SuggestNextQuestion",
  description:
    "Suggest advancing to the next coding challenge. Use this when:\n" +
    "- All tests are passing\n" +
    "- The solution meets requirements\n" +
    "- The candidate is ready for a new challenge\n\n" +
    "This prompts the UI to show a 'Next Question' option to the candidate.\n" +
    "Only use after confirming tests pass - don't suggest advancement prematurely.",
  input_schema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Why the candidate should advance. Example: 'All tests passing with clean implementation'",
      },
      performance: {
        type: "string",
        description: "Brief performance feedback. Example: 'Great solution - efficient O(n) approach'",
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
