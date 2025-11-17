/**
 * Terminal Analysis for Problem-Solving Scoring
 *
 * Analyzes terminal commands to evaluate debugging patterns and problem-solving approach.
 * Provides evidence-based scoring for problem-solving dimension.
 *
 * Evaluates:
 * - Systematic debugging: Does the candidate follow a logical debugging process?
 * - Tool proficiency: Do they use appropriate debugging tools?
 * - Efficiency: Do they avoid trial-and-error in favor of targeted investigation?
 * - Learning: Do they adapt their approach based on findings?
 */

export interface TerminalAnalysisResult {
  score: number; // 0-100
  systematicDebugging: number; // 0-100
  toolProficiency: number; // 0-100
  efficiency: number; // 0-100
  learningAdaptation: number; // 0-100
  evidence: TerminalEvidence[];
  patterns: DebuggingPattern[];
}

export interface TerminalEvidence {
  command: string;
  timestamp: Date;
  category: CommandCategory;
  reasoning: string;
  isEffective: boolean;
}

export type CommandCategory =
  | 'print_debugging'
  | 'test_running'
  | 'code_inspection'
  | 'environment_check'
  | 'dependency_management'
  | 'file_operations'
  | 'systematic_testing'
  | 'random_trial_error';

export interface DebuggingPattern {
  pattern: string;
  occurrences: number;
  isGoodPractice: boolean;
  impact: 'positive' | 'neutral' | 'negative';
  description: string;
}

export interface TerminalCommand {
  command: string;
  output: string;
  exitCode: number;
  timestamp: Date;
}

/**
 * Analyze terminal commands to evaluate debugging approach
 */
export function analyzeTerminalCommands(
  commands: TerminalCommand[]
): TerminalAnalysisResult {
  if (commands.length === 0) {
    return {
      score: 50, // Neutral score for no terminal usage
      systematicDebugging: 50,
      toolProficiency: 50,
      efficiency: 50,
      learningAdaptation: 50,
      evidence: [],
      patterns: [],
    };
  }

  const evidence: TerminalEvidence[] = [];
  const patterns: Map<string, DebuggingPattern> = new Map();

  // Categorize each command
  for (const cmd of commands) {
    const category = categorizeCommand(cmd.command);
    const isEffective = evaluateCommandEffectiveness(cmd, category);
    const reasoning = explainCategorization(cmd.command, category);

    evidence.push({
      command: cmd.command,
      timestamp: cmd.timestamp,
      category,
      reasoning,
      isEffective,
    });

    // Track patterns
    const pattern = identifyPattern(cmd.command, category);
    if (pattern) {
      if (!patterns.has(pattern.pattern)) {
        patterns.set(pattern.pattern, {
          ...pattern,
          occurrences: 1,
        });
      } else {
        const existing = patterns.get(pattern.pattern)!;
        existing.occurrences++;
      }
    }
  }

  // Calculate scores
  const systematicDebugging = calculateSystematicDebugging(evidence);
  const toolProficiency = calculateToolProficiency(evidence);
  const efficiency = calculateEfficiency(evidence, commands);
  const learningAdaptation = calculateLearningAdaptation(evidence);

  const overallScore = Math.round(
    systematicDebugging * 0.35 +
    toolProficiency * 0.25 +
    efficiency * 0.25 +
    learningAdaptation * 0.15
  );

  return {
    score: overallScore,
    systematicDebugging: Math.round(systematicDebugging),
    toolProficiency: Math.round(toolProficiency),
    efficiency: Math.round(efficiency),
    learningAdaptation: Math.round(learningAdaptation),
    evidence,
    patterns: Array.from(patterns.values()),
  };
}

/**
 * Categorize a terminal command
 */
function categorizeCommand(command: string): CommandCategory {
  const cmd = command.toLowerCase().trim();

  // Print debugging (console.log, print statements)
  if (
    cmd.includes('console.log') ||
    cmd.includes('print(') ||
    cmd.includes('echo ') ||
    cmd.includes('console.error')
  ) {
    return 'print_debugging';
  }

  // Test running
  if (
    cmd.match(/^(npm|yarn|pnpm)\s+(test|run test)/) ||
    cmd.match(/^pytest/) ||
    cmd.match(/^jest/) ||
    cmd.match(/^python\s+-m\s+pytest/) ||
    cmd.match(/^node\s+.*test/)
  ) {
    return 'test_running';
  }

  // Code inspection (cat, grep, less, head, tail)
  if (
    cmd.match(/^(cat|less|head|tail|more)\s+/) ||
    cmd.match(/^grep\s+/) ||
    cmd.match(/^find\s+.*\.(py|js|ts|go)/)
  ) {
    return 'code_inspection';
  }

  // Environment checks (python --version, node --version, env)
  if (
    cmd.match(/^(python|node|npm|go|java)\s+(--version|-v)/) ||
    cmd.match(/^(env|printenv|echo\s+\$)/) ||
    cmd.match(/^which\s+/)
  ) {
    return 'environment_check';
  }

  // Dependency management
  if (
    cmd.match(/^(npm|yarn|pnpm|pip)\s+install/) ||
    cmd.match(/^(pip|npm)\s+list/) ||
    cmd.match(/^(npm|yarn)\s+add/)
  ) {
    return 'dependency_management';
  }

  // File operations (ls, mkdir, rm, mv, cp)
  if (
    cmd.match(/^(ls|pwd|cd|mkdir|rm|mv|cp|touch)\s*/) ||
    cmd === 'ls' ||
    cmd === 'pwd'
  ) {
    return 'file_operations';
  }

  // Systematic testing (specific test files, focused runs)
  if (
    cmd.match(/pytest.*::(test_|Test)/) ||
    cmd.match(/jest.*\.test\.(js|ts)/) ||
    cmd.match(/--grep|--testNamePattern/)
  ) {
    return 'systematic_testing';
  }

  // Default: might be trial-and-error
  return 'random_trial_error';
}

/**
 * Evaluate if a command was effective
 */
function evaluateCommandEffectiveness(
  cmd: TerminalCommand,
  category: CommandCategory
): boolean {
  // Test running is always good
  if (category === 'test_running' || category === 'systematic_testing') {
    return true;
  }

  // Code inspection is good
  if (category === 'code_inspection') {
    return true;
  }

  // Environment checks are good (but only if early in session)
  if (category === 'environment_check') {
    return true;
  }

  // Dependency management is good
  if (category === 'dependency_management') {
    return cmd.exitCode === 0; // Only if successful
  }

  // Print debugging is okay but not ideal
  if (category === 'print_debugging') {
    return true; // Neutral
  }

  // File operations are neutral
  if (category === 'file_operations') {
    return true;
  }

  // Random trial-and-error is bad
  if (category === 'random_trial_error') {
    return false;
  }

  return true;
}

/**
 * Explain why a command was categorized a certain way
 */
function explainCategorization(
  command: string,
  category: CommandCategory
): string {
  switch (category) {
    case 'print_debugging':
      return 'Using print statements for debugging';
    case 'test_running':
      return 'Running test suite to verify functionality';
    case 'code_inspection':
      return 'Inspecting code files to understand implementation';
    case 'environment_check':
      return 'Checking environment configuration';
    case 'dependency_management':
      return 'Managing project dependencies';
    case 'file_operations':
      return 'Navigating and organizing files';
    case 'systematic_testing':
      return 'Running specific tests in a targeted manner';
    case 'random_trial_error':
      return 'Potentially exploratory or trial-and-error approach';
    default:
      return 'General command execution';
  }
}

/**
 * Identify debugging patterns
 */
function identifyPattern(
  command: string,
  category: CommandCategory
): DebuggingPattern | null {
  if (category === 'systematic_testing') {
    return {
      pattern: 'Targeted test execution',
      occurrences: 0,
      isGoodPractice: true,
      impact: 'positive',
      description: 'Running specific tests to isolate issues efficiently',
    };
  }

  if (category === 'code_inspection') {
    return {
      pattern: 'Code review and analysis',
      occurrences: 0,
      isGoodPractice: true,
      impact: 'positive',
      description: 'Reading code to understand behavior before making changes',
    };
  }

  if (category === 'print_debugging' && command.match(/console\.log|print\(/)) {
    return {
      pattern: 'Print-based debugging',
      occurrences: 0,
      isGoodPractice: false,
      impact: 'neutral',
      description: 'Using print statements instead of debugger or tests',
    };
  }

  if (category === 'test_running') {
    return {
      pattern: 'Test-driven debugging',
      occurrences: 0,
      isGoodPractice: true,
      impact: 'positive',
      description: 'Using tests to verify fixes and prevent regressions',
    };
  }

  return null;
}

/**
 * Calculate systematic debugging score
 */
function calculateSystematicDebugging(evidence: TerminalEvidence[]): number {
  if (evidence.length === 0) return 50;

  // Check for systematic patterns:
  // 1. Read code before changing
  // 2. Run tests to identify failures
  // 3. Make targeted changes
  // 4. Re-run tests to verify

  const codeInspections = evidence.filter(
    (e) => e.category === 'code_inspection'
  ).length;
  const testRuns = evidence.filter(
    (e) => e.category === 'test_running' || e.category === 'systematic_testing'
  ).length;
  const randomCommands = evidence.filter(
    (e) => e.category === 'random_trial_error'
  ).length;

  // Good: Multiple test runs and code inspections
  // Bad: Lots of random commands

  const systematicRatio = (codeInspections + testRuns) / evidence.length;
  const randomRatio = randomCommands / evidence.length;

  const score = Math.max(
    0,
    Math.min(100, systematicRatio * 100 - randomRatio * 50)
  );

  return score;
}

/**
 * Calculate tool proficiency score
 */
function calculateToolProficiency(evidence: TerminalEvidence[]): number {
  if (evidence.length === 0) return 50;

  const categoryCount = new Set(evidence.map((e) => e.category)).size;
  const goodCategories = evidence.filter(
    (e) =>
      e.category === 'systematic_testing' ||
      e.category === 'code_inspection' ||
      e.category === 'test_running'
  ).length;

  // Diversity of tools used
  const diversityScore = Math.min(100, (categoryCount / 6) * 100);

  // Quality of tool usage
  const qualityScore = evidence.length > 0
    ? (goodCategories / evidence.length) * 100
    : 50;

  return (diversityScore * 0.4 + qualityScore * 0.6);
}

/**
 * Calculate efficiency score
 */
function calculateEfficiency(
  evidence: TerminalEvidence[],
  commands: TerminalCommand[]
): number {
  if (commands.length === 0) return 50;

  // Efficient debugging uses fewer commands to find issues
  const avgCommandsPerIssue = commands.length; // Simplified

  // Check for repeated similar commands (inefficiency indicator)
  const uniqueCommands = new Set(commands.map((c) => c.command.trim())).size;
  const repetitionRatio = uniqueCommands / commands.length;

  // Penalty for too many commands
  const commandPenalty = Math.max(0, (commands.length - 20) * 2);

  const efficiencyScore = Math.max(
    0,
    Math.min(100, repetitionRatio * 100 - commandPenalty)
  );

  return efficiencyScore;
}

/**
 * Calculate learning/adaptation score
 */
function calculateLearningAdaptation(evidence: TerminalEvidence[]): number {
  if (evidence.length < 3) return 50;

  // Check if command categories evolve (shows learning)
  const firstHalf = evidence.slice(0, Math.floor(evidence.length / 2));
  const secondHalf = evidence.slice(Math.floor(evidence.length / 2));

  const firstHalfCategories = new Set(firstHalf.map((e) => e.category));
  const secondHalfCategories = new Set(secondHalf.map((e) => e.category));

  // Learning indicator: More systematic commands in second half
  const secondHalfSystematic = secondHalf.filter(
    (e) =>
      e.category === 'systematic_testing' ||
      e.category === 'code_inspection' ||
      e.category === 'test_running'
  ).length;

  const improvementRatio = secondHalf.length > 0
    ? secondHalfSystematic / secondHalf.length
    : 0;

  return Math.min(100, improvementRatio * 120); // Bonus for high improvement
}
