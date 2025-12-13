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
  name: "RunTests",
  description:
    "Execute the test suite for the current coding challenge. Use this to:\n" +
    "- Validate code changes against test cases\n" +
    "- Check if the solution passes all requirements\n" +
    "- Get detailed feedback on failing tests\n\n" +
    "Returns pass/fail status, test count, and detailed results for each test.\n" +
    "Run tests after making code changes to verify correctness.",
  input_schema: {
    type: "object",
    properties: {
      fileName: {
        type: "string",
        description: "File to test. Default: 'solution.js' or 'solution.py' based on language. Example: 'utils.js'",
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
    // IMPORTANT: Use candidateId (not volumeId) for sandbox lookup - Modal caches by candidateId
    const readResult = await modal.readFile(candidateId, fileName);
    if (!readResult.success || !readResult.content) {
      return {
        success: false,
        passed: 0,
        failed: 0,
        total: 0,
        results: [],
        error: readResult.error || `Failed to read code file: ${fileName}`,
      };
    }
    const code = readResult.content;

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

    // Record results to event store
    const lastEvent = await prisma.sessionEventLog.findFirst({
      where: { sessionId },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });
    let nextSeq = (lastEvent?.sequenceNumber ?? BigInt(-1)) + BigInt(1);

    for (const tr of result.testResults) {
      await prisma.sessionEventLog.create({
        data: {
          sessionId,
          sequenceNumber: nextSeq++,
          timestamp: new Date(),
          eventType: "test.result",
          category: "test",
          data: {
            testName: tr.name,
            passed: tr.passed,
            output: tr.output || null,
            error: tr.error || null,
            duration: tr.duration || 0,
          },
          checkpoint: false,
        },
      });
    }

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
