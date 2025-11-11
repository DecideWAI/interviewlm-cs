/**
 * Run Tests Tool for Claude Agent
 * Allows AI to execute the test suite and get results
 */

import { modalService as modal } from "@/lib/services";
import prisma from "@/lib/prisma";
import type { Anthropic } from "@anthropic-ai/sdk";

export interface RunTestsToolInput {
  fileName?: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  output?: string;
  error?: string;
  duration?: number;
}

export interface RunTestsToolOutput {
  success: boolean;
  passed: number;
  failed: number;
  total: number;
  results: TestResult[];
  error?: string;
}

/**
 * Tool definition for Claude API
 */
export const runTestsTool: Anthropic.Tool = {
  name: "run_tests",
  description:
    "Execute the test suite for the current coding challenge. Returns pass/fail status and detailed results for each test case. Use this to validate your code changes and ensure all tests pass.",
  input_schema: {
    type: "object",
    properties: {
      fileName: {
        type: "string",
        description:
          "Optional: specific file to test (default: solution file for the current language)",
      },
    },
    required: [],
  },
};

/**
 * Execute the run_tests tool
 */
export async function executeRunTests(
  candidateId: string,
  sessionId: string,
  input: RunTestsToolInput
): Promise<RunTestsToolOutput> {
  try {
    // Get candidate's question and volume
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { generatedQuestions: true },
    });

    if (!candidate || !candidate.generatedQuestions?.[0]) {
      return {
        success: false,
        error: "No question found for this interview",
        passed: 0,
        failed: 0,
        total: 0,
        results: [],
      };
    }

    if (!candidate.volumeId) {
      return {
        success: false,
        error: "Sandbox not initialized",
        passed: 0,
        failed: 0,
        total: 0,
        results: [],
      };
    }

    const question = candidate.generatedQuestions[0];

    // Determine file to test
    const fileName =
      input.fileName ||
      `solution.${question.language === "python" ? "py" : "js"}`;

    // Read current code
    const code = await modal.readFile(candidate.volumeId, fileName);

    // Parse test cases
    const testCases =
      typeof question.testCases === "string"
        ? JSON.parse(question.testCases as string)
        : question.testCases;

    // Execute tests in Modal sandbox
    const result = await modal.executeCode(
      candidateId,
      code,
      testCases.map((tc: any) => ({
        name: tc.name,
        input: tc.input,
        expected: tc.expectedOutput,
        hidden: tc.hidden || false,
      }))
    );

    // Record results to database
    await Promise.all(
      result.testResults.map((tr: any) =>
        prisma.testResult.create({
          data: {
            sessionId,
            testName: tr.name,
            passed: tr.passed,
            output: tr.output || null,
            error: tr.error || null,
            duration: tr.duration || 0,
          },
        })
      )
    );

    return {
      success: true,
      passed: result.passedTests,
      failed: result.failedTests,
      total: result.totalTests,
      results: result.testResults.map((tr: any) => ({
        name: tr.name,
        passed: tr.passed,
        output: tr.output,
        error: tr.error,
        duration: tr.duration,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to run tests",
      passed: 0,
      failed: 0,
      total: 0,
      results: [],
    };
  }
}
