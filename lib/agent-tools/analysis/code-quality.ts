/**
 * Code Quality Analysis Tool
 *
 * Analyzes code quality using test results and static analysis.
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
  coverage?: number;
}

// Security patterns to detect (as strings to avoid false positives)
const SECURITY_PATTERNS = [
  "eval\\s*\\(",
  "exec\\s*\\(",
  "__import__",
  "subprocess\\.call.*shell=True",
  "innerHTML\\s*=",
  "document\\.write",
];

/**
 * Analyze code quality using test results and static analysis.
 *
 * Methods:
 * 1. Test results (objective) - pass/fail rates
 * 2. Static analysis - complexity, patterns, security issues
 *
 * @param codeSnapshots - List of code snapshots with files and timestamps
 * @param testResults - List of test run results
 * @returns DimensionScore with score, confidence, evidence, and breakdown
 */
export async function analyzeCodeQuality(
  codeSnapshots: CodeSnapshot[],
  testResults: TestResult[]
): Promise<DimensionScore> {
  const evidence: Evidence[] = [];
  let testScore = 0;
  let staticScore = 50; // Default neutral

  // Method 1: Analyze test results
  if (testResults && testResults.length > 0) {
    const lastTest = testResults[testResults.length - 1];
    const total = lastTest.total || 0;
    const passed = lastTest.passed || 0;

    if (total > 0) {
      testScore = (passed / total) * 100;
      evidence.push({
        type: "test_result",
        description: `${passed}/${total} tests passed`,
        timestamp: lastTest.timestamp,
        value: testScore,
      });

      if (lastTest.coverage !== undefined) {
        evidence.push({
          type: "metric",
          description: `Test coverage: ${lastTest.coverage}%`,
          value: lastTest.coverage,
        });
      }
    }
  }

  // Method 2: Static analysis on final code
  if (codeSnapshots && codeSnapshots.length > 0) {
    const finalSnapshot = codeSnapshots[codeSnapshots.length - 1];
    const files = finalSnapshot.files || {};

    let totalLines = 0;
    let commentLines = 0;
    let complexityIssues = 0;
    let securityIssues = 0;

    for (const [, content] of Object.entries(files)) {
      if (typeof content !== "string") continue;

      const lines = content.split("\n");
      totalLines += lines.length;

      // Count comments
      for (const line of lines) {
        const stripped = line.trim();
        if (
          stripped.startsWith("//") ||
          stripped.startsWith("#") ||
          stripped.startsWith("/*")
        ) {
          commentLines++;
        }
      }

      // Check for complexity issues
      const ifCount = (content.match(/if\s+/g) || []).length;
      const forCount = (content.match(/for\s+/g) || []).length;

      if (ifCount > 10) {
        complexityIssues++;
      }
      if (forCount > 5 && forCount * 2 > lines.length / 10) {
        complexityIssues++;
      }

      // Check for security issues using pattern strings
      for (const patternStr of SECURITY_PATTERNS) {
        const pattern = new RegExp(patternStr);
        if (pattern.test(content)) {
          securityIssues++;
        }
      }
    }

    // Calculate static score
    const commentRatio = commentLines / Math.max(totalLines, 1);
    staticScore = 70; // Base score

    // Adjust for comments (good: 5-20%)
    if (commentRatio >= 0.05 && commentRatio <= 0.2) {
      staticScore += 10;
    } else if (commentRatio < 0.02) {
      staticScore -= 10;
    }

    // Penalize complexity and security issues
    staticScore -= complexityIssues * 5;
    staticScore -= securityIssues * 15;

    staticScore = Math.max(0, Math.min(100, staticScore));

    evidence.push({
      type: "metric",
      description: `Static analysis: ${staticScore}/100`,
      value: staticScore,
    });

    if (securityIssues > 0) {
      evidence.push({
        type: "metric",
        description: `${securityIssues} security issue(s) detected`,
        value: securityIssues,
      });
    }
  }

  // Combine scores
  const scores = [testScore, staticScore].filter((s) => s > 0);

  if (scores.length === 0) {
    return {
      score: 0,
      confidence: 0.3,
      evidence,
      breakdown: { tests: 0, staticAnalysis: 0 },
    };
  }

  // Multi-method validation
  const maxDiff =
    scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0;
  const confidence = maxDiff < 20 ? 0.9 : 0.6;

  const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  return {
    score,
    confidence,
    evidence,
    breakdown: {
      tests: testScore,
      staticAnalysis: staticScore,
    },
  };
}
