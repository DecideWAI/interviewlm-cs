/**
 * Problem Solving Analysis Tool
 *
 * Analyzes problem-solving approach through iteration patterns and debugging.
 * Ported from Python LangGraph implementation.
 */

import { Evidence, DimensionScore } from "@/lib/types/session-evaluation";

interface CodeSnapshot {
  timestamp: string;
  files: Record<string, string>;
}

interface TestResult {
  timestamp?: string;
  passed: number;
  failed: number;
  total: number;
}

interface TerminalCommand {
  command: string;
  output?: string;
  timestamp?: string;
}

/**
 * Analyze problem-solving approach through iteration patterns and debugging.
 *
 * Methods:
 * 1. Iteration patterns - code change frequency and patterns
 * 2. Debugging approach - test-driven improvement
 * 3. Terminal analysis - systematic debugging commands
 *
 * @param codeSnapshots - List of code snapshots with timestamps
 * @param testResults - List of test run results
 * @param terminalCommands - Optional list of terminal commands
 * @returns DimensionScore with score, confidence, evidence, and breakdown
 */
export async function analyzeProblemSolving(
  codeSnapshots: CodeSnapshot[],
  testResults: TestResult[],
  terminalCommands?: TerminalCommand[]
): Promise<DimensionScore> {
  const evidence: Evidence[] = [];

  // Method 1: Analyze iteration patterns
  const iterationCount = codeSnapshots?.length || 0;
  evidence.push({
    type: "metric",
    description: `${iterationCount} code iterations`,
    value: iterationCount,
  });

  // Optimal iteration count follows bell curve (peak at 7)
  const optimalCount = 7;
  const sigma = 3;
  const deviation = Math.abs(iterationCount - optimalCount);
  const normalizedScore = Math.exp(-Math.pow(deviation / sigma, 2) / 2);
  const iterationScore = 30 + normalizedScore * 70;

  // Method 2: Analyze debugging approach from test results
  let debuggingScore = 50; // Default neutral

  if (testResults && testResults.length > 0) {
    evidence.push({
      type: "metric",
      description: `${testResults.length} test runs`,
      value: testResults.length,
    });

    // Look for improvement over time
    const improvements: number[] = [];
    for (let i = 1; i < testResults.length; i++) {
      const prev = testResults[i - 1].passed || 0;
      const curr = testResults[i].passed || 0;
      improvements.push(curr - prev);
    }

    if (improvements.length > 0) {
      const positiveImprovements = improvements.filter((i) => i > 0).length;
      const improvementRate = positiveImprovements / improvements.length;
      debuggingScore = 50 + improvementRate * 50;
    }
  }

  // Method 3: Analyze terminal commands
  let terminalScore = 50; // Default

  if (terminalCommands && terminalCommands.length > 0) {
    let debuggingPatterns = 0;

    for (const cmd of terminalCommands) {
      const command = (cmd.command || "").toLowerCase();

      // Look for debugging patterns
      const debugKeywords = ["print", "console.log", "debug", "breakpoint"];
      if (debugKeywords.some((p) => command.includes(p))) {
        debuggingPatterns++;
      }

      // Git commands for understanding changes
      const gitKeywords = ["git diff", "git log", "git status"];
      if (gitKeywords.some((p) => command.includes(p))) {
        debuggingPatterns++;
      }

      // Test commands
      const testKeywords = ["npm test", "pytest", "jest", "cargo test", "go test"];
      if (testKeywords.some((p) => command.includes(p))) {
        debuggingPatterns++;
      }
    }

    if (debuggingPatterns > 0) {
      terminalScore = Math.min(100, 50 + debuggingPatterns * 10);
      evidence.push({
        type: "metric",
        description: `${debuggingPatterns} debugging-related commands`,
        value: debuggingPatterns,
      });
    }
  }

  // Combine scores (30% iteration, 30% debugging, 40% terminal)
  const score = Math.round(
    iterationScore * 0.3 + debuggingScore * 0.3 + terminalScore * 0.4
  );

  const confidence =
    iterationCount >= 3 && testResults && testResults.length >= 2 ? 0.85 : 0.6;

  return {
    score,
    confidence,
    evidence,
    breakdown: {
      iterationPatterns: Math.round(iterationScore),
      debuggingApproach: Math.round(debuggingScore),
      terminalAnalysis: Math.round(terminalScore),
    },
  };
}
