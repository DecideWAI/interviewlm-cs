/**
 * Proactive AI Assistance Service
 *
 * Detects when candidates are stuck during interviews and automatically
 * provides escalating levels of help:
 * - Level 1: Subtle encouragement
 * - Level 2: Specific hints
 * - Level 3: Code examples
 * - Level 4: Partial solution
 */

import { EventEmitter } from 'events';

export interface StuckIndicator {
  type:
    | 'no_progress' // No code changes for X minutes
    | 'repeated_failures' // Same test failing repeatedly
    | 'error_loop' // Same error multiple times
    | 'excessive_ai_queries' // Many AI questions without code changes
    | 'low_test_coverage' // Tests not being run
    | 'debugging_thrash'; // Random code changes without clear direction
  severity: 1 | 2 | 3 | 4; // 1=minor, 4=critical
  evidence: string;
  timestamp: Date;
}

export interface AssistanceLevel {
  level: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  shouldOffer: boolean;
}

export interface StuckDetectionResult {
  isStuck: boolean;
  indicators: StuckIndicator[];
  suggestedLevel: 1 | 2 | 3 | 4;
  confidence: number; // 0-1
  message?: string;
}

export interface CandidateActivity {
  sessionId: string;
  lastCodeChange?: Date;
  lastTestRun?: Date;
  lastAIQuery?: Date;
  testResults: Array<{
    timestamp: Date;
    passed: number;
    failed: number;
    total: number;
  }>;
  errors: Array<{
    timestamp: Date;
    message: string;
    count: number;
  }>;
  codeChanges: Array<{
    timestamp: Date;
    linesChanged: number;
  }>;
  aiQueries: Array<{
    timestamp: Date;
    message: string;
  }>;
}

/**
 * Stuck Detection Service
 * Monitors candidate activity and detects stuck patterns
 */
class ProactiveAssistanceManager extends EventEmitter {
  private static instance: ProactiveAssistanceManager;
  private activityTracking: Map<string, CandidateActivity> = new Map();

  // Configuration
  private readonly NO_PROGRESS_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  private readonly REPEATED_FAILURE_THRESHOLD = 3; // Same test failing 3+ times
  private readonly ERROR_LOOP_THRESHOLD = 3; // Same error 3+ times
  private readonly EXCESSIVE_AI_QUERIES = 5; // 5+ queries without code changes
  private readonly LOW_TEST_RUN_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes without tests

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  static getInstance(): ProactiveAssistanceManager {
    if (!ProactiveAssistanceManager.instance) {
      ProactiveAssistanceManager.instance = new ProactiveAssistanceManager();
    }
    return ProactiveAssistanceManager.instance;
  }

  /**
   * Initialize activity tracking for a session
   */
  initializeSession(sessionId: string): void {
    if (!this.activityTracking.has(sessionId)) {
      this.activityTracking.set(sessionId, {
        sessionId,
        testResults: [],
        errors: [],
        codeChanges: [],
        aiQueries: [],
      });
    }
  }

  /**
   * Record a code change
   */
  recordCodeChange(sessionId: string, linesChanged: number): void {
    this.initializeSession(sessionId);
    const activity = this.activityTracking.get(sessionId)!;

    activity.lastCodeChange = new Date();
    activity.codeChanges.push({
      timestamp: new Date(),
      linesChanged,
    });

    // Analyze after each change
    this.analyzeActivity(sessionId);
  }

  /**
   * Record a test run
   */
  recordTestRun(
    sessionId: string,
    passed: number,
    failed: number,
    total: number
  ): void {
    this.initializeSession(sessionId);
    const activity = this.activityTracking.get(sessionId)!;

    activity.lastTestRun = new Date();
    activity.testResults.push({
      timestamp: new Date(),
      passed,
      failed,
      total,
    });

    this.analyzeActivity(sessionId);
  }

  /**
   * Record an error
   */
  recordError(sessionId: string, errorMessage: string): void {
    this.initializeSession(sessionId);
    const activity = this.activityTracking.get(sessionId)!;

    // Check if this error already exists (dedupe within 1 minute)
    const recentError = activity.errors.find(
      (e) =>
        e.message === errorMessage &&
        new Date().getTime() - e.timestamp.getTime() < 60000
    );

    if (recentError) {
      recentError.count++;
      recentError.timestamp = new Date();
    } else {
      activity.errors.push({
        timestamp: new Date(),
        message: errorMessage,
        count: 1,
      });
    }

    this.analyzeActivity(sessionId);
  }

  /**
   * Record an AI query
   */
  recordAIQuery(sessionId: string, message: string): void {
    this.initializeSession(sessionId);
    const activity = this.activityTracking.get(sessionId)!;

    activity.lastAIQuery = new Date();
    activity.aiQueries.push({
      timestamp: new Date(),
      message,
    });

    this.analyzeActivity(sessionId);
  }

  /**
   * Analyze activity and detect stuck patterns
   */
  private analyzeActivity(sessionId: string): void {
    const result = this.detectStuckState(sessionId);

    if (result.isStuck && result.suggestedLevel > 0) {
      // Emit event for proactive assistance
      this.emit('stuck_detected', {
        sessionId,
        result,
      });
    }
  }

  /**
   * Detect if candidate is stuck
   */
  detectStuckState(sessionId: string): StuckDetectionResult {
    const activity = this.activityTracking.get(sessionId);

    if (!activity) {
      return {
        isStuck: false,
        indicators: [],
        suggestedLevel: 1,
        confidence: 0,
      };
    }

    const indicators: StuckIndicator[] = [];
    const now = new Date();

    // 1. Check for no progress
    if (activity.lastCodeChange) {
      const timeSinceLastChange = now.getTime() - activity.lastCodeChange.getTime();
      if (timeSinceLastChange > this.NO_PROGRESS_THRESHOLD_MS) {
        indicators.push({
          type: 'no_progress',
          severity: 3,
          evidence: `No code changes for ${Math.round(timeSinceLastChange / 60000)} minutes`,
          timestamp: now,
        });
      }
    }

    // 2. Check for repeated test failures
    const recentTests = activity.testResults.slice(-5);
    if (recentTests.length >= this.REPEATED_FAILURE_THRESHOLD) {
      const allFailing = recentTests.every((t) => t.failed > 0);
      if (allFailing) {
        indicators.push({
          type: 'repeated_failures',
          severity: 3,
          evidence: `${recentTests.length} consecutive test runs with failures`,
          timestamp: now,
        });
      }
    }

    // 3. Check for error loops
    const recentErrors = activity.errors.filter(
      (e) => now.getTime() - e.timestamp.getTime() < 10 * 60 * 1000 // Last 10 minutes
    );
    const highCountErrors = recentErrors.filter(
      (e) => e.count >= this.ERROR_LOOP_THRESHOLD
    );
    if (highCountErrors.length > 0) {
      indicators.push({
        type: 'error_loop',
        severity: 4,
        evidence: `Same error occurred ${highCountErrors[0].count} times: "${highCountErrors[0].message.substring(0, 50)}"`,
        timestamp: now,
      });
    }

    // 4. Check for excessive AI queries without code changes
    const recentQueries = activity.aiQueries.filter(
      (q) => now.getTime() - q.timestamp.getTime() < 5 * 60 * 1000 // Last 5 minutes
    );
    const recentCodeChanges = activity.codeChanges.filter(
      (c) => now.getTime() - c.timestamp.getTime() < 5 * 60 * 1000
    );

    if (
      recentQueries.length >= this.EXCESSIVE_AI_QUERIES &&
      recentCodeChanges.length < 2
    ) {
      indicators.push({
        type: 'excessive_ai_queries',
        severity: 2,
        evidence: `${recentQueries.length} AI queries without meaningful code changes`,
        timestamp: now,
      });
    }

    // 5. Check for low test coverage
    if (activity.lastTestRun) {
      const timeSinceLastTest = now.getTime() - activity.lastTestRun.getTime();
      if (
        timeSinceLastTest > this.LOW_TEST_RUN_THRESHOLD_MS &&
        activity.codeChanges.length > 5
      ) {
        indicators.push({
          type: 'low_test_coverage',
          severity: 2,
          evidence: `No tests run for ${Math.round(timeSinceLastTest / 60000)} minutes despite code changes`,
          timestamp: now,
        });
      }
    }

    // 6. Check for debugging thrash (many small changes)
    const last10Changes = activity.codeChanges.slice(-10);
    if (last10Changes.length === 10) {
      const avgLinesChanged =
        last10Changes.reduce((sum, c) => sum + c.linesChanged, 0) / 10;
      if (avgLinesChanged < 3) {
        // Average less than 3 lines changed
        indicators.push({
          type: 'debugging_thrash',
          severity: 2,
          evidence: `${last10Changes.length} small code changes (avg ${avgLinesChanged.toFixed(1)} lines) - possible random trial-and-error`,
          timestamp: now,
        });
      }
    }

    // Calculate overall stuck state
    const isStuck = indicators.length > 0;
    const maxSeverity = Math.max(...indicators.map((i) => i.severity), 0);
    const suggestedLevel = Math.min(maxSeverity, 4) as 1 | 2 | 3 | 4;

    // Calculate confidence (0-1)
    const confidence = Math.min(indicators.length * 0.3, 1);

    return {
      isStuck,
      indicators,
      suggestedLevel,
      confidence,
      message: this.generateAssistanceMessage(indicators, suggestedLevel),
    };
  }

  /**
   * Generate assistance message based on indicators and level
   */
  private generateAssistanceMessage(
    indicators: StuckIndicator[],
    level: 1 | 2 | 3 | 4
  ): string {
    if (indicators.length === 0) return '';

    const primaryIndicator = indicators.sort((a, b) => b.severity - a.severity)[0];

    switch (level) {
      case 1:
        return `💡 **Quick Tip**: ${primaryIndicator.evidence}. Would you like some guidance?`;

      case 2:
        if (primaryIndicator.type === 'error_loop') {
          return `🤔 **I noticed**: ${primaryIndicator.evidence}. Try using \`console.log()\` to debug the value before the error occurs, or ask me to help analyze the issue.`;
        } else if (primaryIndicator.type === 'repeated_failures') {
          return `🔍 **Suggestion**: Tests are failing consistently. Would you like me to analyze the test output and suggest fixes?`;
        } else if (primaryIndicator.type === 'no_progress') {
          return `⏰ **Heads up**: ${primaryIndicator.evidence}. Sometimes stepping back helps - would you like me to suggest a different approach?`;
        } else {
          return `💭 **Hint**: ${primaryIndicator.evidence}. Let me know if you'd like specific guidance.`;
        }

      case 3:
        if (primaryIndicator.type === 'error_loop') {
          return `🆘 **Strong Suggestion**: You're encountering the same error repeatedly. Let me help you debug this systematically. Would you like me to:\n1. Analyze the error message\n2. Suggest debugging steps\n3. Provide a code example to fix it`;
        } else if (primaryIndicator.type === 'repeated_failures') {
          return `🎯 **Targeted Help**: Your tests keep failing. I can:\n1. Explain why the tests are failing\n2. Show you example code that passes similar tests\n3. Walk you through the solution step-by-step\n\nWhich would help most?`;
        } else {
          return `🚀 **Assistance Offered**: ${primaryIndicator.evidence}. I'm here to help - would you like me to provide a concrete code example or walk through the solution together?`;
        }

      case 4:
        return `🔥 **Intervention Recommended**: You've been stuck for a while. Let's work through this together. I'll provide:\n1. A clear explanation of the problem\n2. A step-by-step approach\n3. Working code examples\n\nReady to move forward?`;

      default:
        return '';
    }
  }

  /**
   * Clear activity tracking for a session
   */
  clearSession(sessionId: string): void {
    this.activityTracking.delete(sessionId);
  }

  /**
   * Get current activity for a session
   */
  getActivity(sessionId: string): CandidateActivity | undefined {
    return this.activityTracking.get(sessionId);
  }
}

export const proactiveAssistance = ProactiveAssistanceManager.getInstance();
