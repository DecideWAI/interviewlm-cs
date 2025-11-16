/**
 * Code Analysis Utilities
 *
 * Static analysis functions for code quality evaluation:
 * - Documentation/comment coverage
 * - Code complexity metrics
 * - Common anti-patterns
 * - Security vulnerabilities
 *
 * Language support: JavaScript, TypeScript, Python
 */

/**
 * Code file metadata
 */
export interface CodeFile {
  path: string;
  content: string;
  language: string;
}

/**
 * Static analysis result
 */
export interface StaticAnalysisResult {
  score: number; // 0-100
  metrics: {
    linesOfCode: number;
    commentLines: number;
    commentRatio: number;
    complexityScore: number;
    securityIssues: number;
    antiPatterns: number;
  };
  issues: Array<{
    type: "warning" | "error" | "info";
    message: string;
    line?: number;
  }>;
}

/**
 * Analyze documentation and comment coverage
 *
 * @param files - Code files to analyze
 * @returns Documentation score (0-100)
 */
export function analyzeDocumentation(files: CodeFile[]): {
  score: number;
  commentRatio: number;
  commentLines: number;
  totalLines: number;
} {
  let totalLines = 0;
  let commentLines = 0;

  for (const file of files) {
    const lines = file.content.split("\n");
    totalLines += lines.length;

    const commentCount = countComments(file.content, file.language);
    commentLines += commentCount;
  }

  // Calculate comment ratio
  const commentRatio = totalLines > 0 ? commentLines / totalLines : 0;

  // Score based on comment ratio (optimal: 10-30%)
  let score: number;
  if (commentRatio >= 0.1 && commentRatio <= 0.3) {
    score = 100; // Optimal documentation
  } else if (commentRatio >= 0.05 && commentRatio < 0.1) {
    score = 70 + (commentRatio - 0.05) / 0.05 * 30; // 70-100 scaling up
  } else if (commentRatio > 0.3 && commentRatio <= 0.5) {
    score = 100 - (commentRatio - 0.3) / 0.2 * 30; // 100-70 scaling down
  } else if (commentRatio < 0.05) {
    score = commentRatio / 0.05 * 70; // 0-70 scaling up
  } else {
    score = Math.max(0, 70 - (commentRatio - 0.5) * 100); // Over-commented
  }

  return {
    score: Math.round(score),
    commentRatio,
    commentLines,
    totalLines,
  };
}

/**
 * Count comment lines in code
 */
function countComments(code: string, language: string): number {
  let count = 0;

  if (language === "python" || language === "py") {
    // Python comments: # single line, """ docstrings """
    const singleLineComments = (code.match(/#.*/g) || []).length;
    const docstringBlocks = (code.match(/"""|'''/g) || []).length / 2; // Pairs of triple quotes
    count = singleLineComments + docstringBlocks * 3; // Estimate 3 lines per docstring
  } else if (
    language === "javascript" ||
    language === "typescript" ||
    language === "js" ||
    language === "ts"
  ) {
    // JS/TS comments: // single line, /* multi-line */
    const singleLineComments = (code.match(/\/\/.*/g) || []).length;
    const multiLineBlocks = code.match(/\/\*[\s\S]*?\*\//g) || [];
    const multiLineCount = multiLineBlocks.reduce(
      (sum, block) => sum + block.split("\n").length,
      0
    );
    count = singleLineComments + multiLineCount;
  } else if (language === "go") {
    // Go comments: // single line, /* multi-line */
    const singleLineComments = (code.match(/\/\/.*/g) || []).length;
    const multiLineBlocks = code.match(/\/\*[\s\S]*?\*\//g) || [];
    const multiLineCount = multiLineBlocks.reduce(
      (sum, block) => sum + block.split("\n").length,
      0
    );
    count = singleLineComments + multiLineCount;
  }

  return count;
}

/**
 * Perform comprehensive static analysis
 *
 * @param files - Code files to analyze
 * @returns Static analysis result with score and issues
 */
export function performStaticAnalysis(files: CodeFile[]): StaticAnalysisResult {
  const issues: StaticAnalysisResult["issues"] = [];
  let linesOfCode = 0;
  let complexityScore = 0;
  let securityIssues = 0;
  let antiPatterns = 0;

  for (const file of files) {
    const lines = file.content.split("\n").filter((l) => l.trim().length > 0);
    linesOfCode += lines.length;

    // Analyze based on language
    if (file.language === "python" || file.language === "py") {
      const pythonIssues = analyzePython(file.content);
      issues.push(...pythonIssues);
    } else if (
      file.language === "javascript" ||
      file.language === "typescript" ||
      file.language === "js" ||
      file.language === "ts"
    ) {
      const jsIssues = analyzeJavaScript(file.content);
      issues.push(...jsIssues);
    }
  }

  // Count issue types
  securityIssues = issues.filter((i) => i.message.toLowerCase().includes("security")).length;
  antiPatterns = issues.filter((i) => i.type === "warning").length;

  // Calculate complexity score (simple heuristic based on LOC and issues)
  const issuesPer100Lines = (issues.length / Math.max(linesOfCode, 1)) * 100;
  complexityScore = Math.max(0, 100 - issuesPer100Lines * 5);

  // Documentation metrics
  const docMetrics = analyzeDocumentation(files);

  // Calculate overall score
  // 40% documentation, 40% complexity, 20% security
  const score = Math.round(
    docMetrics.score * 0.4 +
    complexityScore * 0.4 +
    (securityIssues === 0 ? 100 : Math.max(0, 100 - securityIssues * 20)) * 0.2
  );

  return {
    score,
    metrics: {
      linesOfCode,
      commentLines: docMetrics.commentLines,
      commentRatio: docMetrics.commentRatio,
      complexityScore,
      securityIssues,
      antiPatterns,
    },
    issues,
  };
}

/**
 * Analyze Python code for common issues
 */
function analyzePython(code: string): StaticAnalysisResult["issues"] {
  const issues: StaticAnalysisResult["issues"] = [];

  // Check for common anti-patterns
  if (code.includes("eval(") || code.includes("exec(")) {
    issues.push({
      type: "error",
      message: "Security: Avoid using eval() or exec()",
    });
  }

  if (code.match(/except\s*:/)) {
    issues.push({
      type: "warning",
      message: "Anti-pattern: Bare except clause catches all exceptions",
    });
  }

  if (code.includes("import *")) {
    issues.push({
      type: "warning",
      message: "Anti-pattern: Avoid wildcard imports (import *)",
    });
  }

  // Check for long lines (PEP 8: 79 characters)
  const lines = code.split("\n");
  const longLines = lines.filter((l) => l.length > 100).length;
  if (longLines > lines.length * 0.2) {
    issues.push({
      type: "info",
      message: `Code style: ${longLines} lines exceed 100 characters`,
    });
  }

  // Check for missing docstrings on functions
  const functionDefs = code.match(/def\s+\w+\s*\([^)]*\):/g) || [];
  const docstrings = code.match(/"""|'''/g) || [];
  if (functionDefs.length > 2 && docstrings.length === 0) {
    issues.push({
      type: "info",
      message: "Documentation: Functions lack docstrings",
    });
  }

  return issues;
}

/**
 * Analyze JavaScript/TypeScript code for common issues
 */
function analyzeJavaScript(code: string): StaticAnalysisResult["issues"] {
  const issues: StaticAnalysisResult["issues"] = [];

  // Check for common anti-patterns
  if (code.includes("eval(")) {
    issues.push({
      type: "error",
      message: "Security: Avoid using eval()",
    });
  }

  if (code.match(/==(?!=)/g)) {
    issues.push({
      type: "warning",
      message: "Anti-pattern: Use === instead of == for equality checks",
    });
  }

  if (code.includes("var ")) {
    issues.push({
      type: "info",
      message: "Code style: Use let/const instead of var",
    });
  }

  // Check for console.log (should be removed in production)
  const consoleLogs = (code.match(/console\.log/g) || []).length;
  if (consoleLogs > 3) {
    issues.push({
      type: "info",
      message: `Code quality: ${consoleLogs} console.log statements found`,
    });
  }

  // Check for missing error handling in promises
  const promises = (code.match(/\.then\(/g) || []).length;
  const catches = (code.match(/\.catch\(/g) || []).length;
  if (promises > catches && promises > 2) {
    issues.push({
      type: "warning",
      message: "Error handling: Promises missing .catch() handlers",
    });
  }

  // Check for long lines
  const lines = code.split("\n");
  const longLines = lines.filter((l) => l.length > 120).length;
  if (longLines > lines.length * 0.2) {
    issues.push({
      type: "info",
      message: `Code style: ${longLines} lines exceed 120 characters`,
    });
  }

  return issues;
}

/**
 * Calculate code complexity based on cyclomatic complexity indicators
 *
 * @param code - Source code
 * @param language - Programming language
 * @returns Complexity score (0-100, lower is simpler)
 */
export function calculateComplexity(code: string, language: string): number {
  let complexityPoints = 0;

  // Count control flow structures (if, for, while, etc.)
  const controlFlowPatterns = [
    /\bif\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcatch\b/g,
    /\bswitch\b/g,
  ];

  for (const pattern of controlFlowPatterns) {
    const matches = code.match(pattern);
    complexityPoints += (matches || []).length;
  }

  // Count function definitions
  let functionCount = 0;
  if (language === "python" || language === "py") {
    functionCount = (code.match(/def\s+\w+/g) || []).length;
  } else {
    functionCount = (code.match(/function\s+\w+|=>\s*{|\bfunction\s*\(/g) || []).length;
  }

  complexityPoints += functionCount * 2;

  // Calculate complexity score (normalize to 0-100)
  // Assume 1 complexity point per 10 lines of code is "normal"
  const lines = code.split("\n").filter((l) => l.trim().length > 0).length;
  const expectedComplexity = lines / 10;
  const ratio = complexityPoints / Math.max(expectedComplexity, 1);

  // Convert to score: 1.0 ratio = 50, lower is better
  const score = Math.max(0, Math.min(100, 100 - ratio * 50));

  return Math.round(score);
}
