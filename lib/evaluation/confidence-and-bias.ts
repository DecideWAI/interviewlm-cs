/**
 * Confidence Scoring and Bias Detection for Evaluations
 *
 * Provides confidence metrics and bias detection for AI-generated evaluations
 * to ensure fair and reliable candidate assessments.
 */

export interface ConfidenceMetrics {
  overall: number; // 0-1, overall confidence in evaluation
  dataQuality: number; // 0-1, quality of recorded data
  sampleSize: number; // 0-1, sufficiency of data points
  consistency: number; // 0-1, consistency across metrics
  explanation: string;
  warnings: string[];
}

export interface BiasDetectionResult {
  detected: boolean;
  biases: BiasIndicator[];
  overallRisk: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface BiasIndicator {
  type:
    | 'ai_over_reliance' // Penalizing legitimate AI usage
    | 'time_pressure' // Unfair time expectations
    | 'insufficient_data' // Too little data for judgment
    | 'single_dimension' // Over-weighting one dimension
    | 'inconsistent_scoring' // Scores don't match evidence
    | 'perfectionism' // Unrealistic expectations
    | 'experience_bias'; // Assuming certain experience level
  severity: 'low' | 'medium' | 'high';
  evidence: string;
  recommendation: string;
}

/**
 * Calculate confidence in evaluation based on data quality
 */
export function calculateConfidence(params: {
  codeChangesCount: number;
  testRunsCount: number;
  aiInteractionsCount: number;
  sessionDuration: number; // minutes
  promptSamples: number;
  terminalCommandsCount: number;
}): ConfidenceMetrics {
  const warnings: string[] = [];
  let dataQuality = 1.0;
  let sampleSize = 1.0;
  let consistency = 1.0;

  // Data Quality Checks
  if (params.codeChangesCount < 5) {
    dataQuality *= 0.7;
    warnings.push('Very few code changes recorded (< 5). Evaluation may be incomplete.');
  }

  if (params.testRunsCount === 0) {
    dataQuality *= 0.6;
    warnings.push('No test runs recorded. Cannot assess testing practices.');
  }

  if (params.sessionDuration < 10) {
    dataQuality *= 0.5;
    warnings.push('Session duration < 10 minutes. May not reflect typical performance.');
  }

  // Sample Size Checks
  if (params.promptSamples < 3) {
    sampleSize *= 0.6;
    warnings.push('Fewer than 3 AI prompts analyzed. Prompt quality score has low confidence.');
  }

  if (params.terminalCommandsCount < 5) {
    sampleSize *= 0.8;
    warnings.push('Fewer than 5 terminal commands. Debugging pattern analysis limited.');
  }

  // Consistency Checks
  const hasAI = params.aiInteractionsCount > 0;
  const hasCode = params.codeChangesCount > 0;
  const hasTests = params.testRunsCount > 0;

  if (hasCode && !hasTests) {
    consistency *= 0.9;
    warnings.push('Code changes detected but no tests run. May indicate incomplete workflow.');
  }

  if (hasAI && params.aiInteractionsCount > params.codeChangesCount * 3) {
    consistency *= 0.85;
    warnings.push('High AI interaction to code change ratio. Verify AI dependency scoring.');
  }

  const overall = (dataQuality * 0.4 + sampleSize * 0.3 + consistency * 0.3);

  let explanation = '';
  if (overall >= 0.9) {
    explanation = 'High confidence - Comprehensive data with consistent patterns.';
  } else if (overall >= 0.75) {
    explanation = 'Good confidence - Adequate data for reliable evaluation.';
  } else if (overall >= 0.6) {
    explanation = 'Moderate confidence - Some data limitations. Review warnings.';
  } else if (overall >= 0.4) {
    explanation = 'Low confidence - Significant data gaps. Evaluation may be unreliable.';
  } else {
    explanation = 'Very low confidence - Insufficient data. Manual review strongly recommended.';
  }

  return {
    overall,
    dataQuality,
    sampleSize,
    consistency,
    explanation,
    warnings,
  };
}

/**
 * Detect potential biases in evaluation
 */
export function detectBias(params: {
  scores: {
    codeQuality: number;
    problemSolving: number;
    aiCollaboration: number;
    testing: number;
  };
  evidence: {
    codeQuality: number; // Number of evidence points
    problemSolving: number;
    aiCollaboration: number;
    testing: number;
  };
  aiInteractionCount: number;
  sessionDuration: number; // minutes
  testsPassed: number;
  testsTotal: number;
}): BiasDetectionResult {
  const biases: BiasIndicator[] = [];

  // 1. AI Over-Reliance Bias
  // Penalizing candidates for using AI when it's encouraged
  if (
    params.scores.aiCollaboration < 60 &&
    params.aiInteractionCount >= 5 &&
    params.scores.codeQuality >= 70
  ) {
    biases.push({
      type: 'ai_over_reliance',
      severity: 'medium',
      evidence: `AI collaboration scored ${params.scores.aiCollaboration} despite ${params.aiInteractionCount} interactions and good code quality (${params.scores.codeQuality})`,
      recommendation:
        'Verify AI collaboration score. Using AI tools is expected in this assessment.',
    });
  }

  // 2. Time Pressure Bias
  // Unrealistic time expectations
  if (params.sessionDuration < 15 && params.scores.problemSolving < 70) {
    biases.push({
      type: 'time_pressure',
      severity: 'high',
      evidence: `Session lasted only ${Math.round(params.sessionDuration)} minutes before low problem-solving score (${params.scores.problemSolving})`,
      recommendation:
        'Session may have been too short for fair evaluation. Consider if candidate had technical issues.',
    });
  }

  // 3. Insufficient Data Bias
  // Making judgments without enough evidence
  const minEvidence = Math.min(...Object.values(params.evidence));
  if (minEvidence < 2) {
    const lowDimensions = Object.entries(params.evidence)
      .filter(([, count]) => count < 2)
      .map(([dim]) => dim);

    biases.push({
      type: 'insufficient_data',
      severity: 'high',
      evidence: `Dimensions with < 2 evidence points: ${lowDimensions.join(', ')}`,
      recommendation:
        'Cannot reliably score dimensions with < 2 evidence points. Mark as "Insufficient Data".',
    });
  }

  // 4. Single Dimension Bias
  // Over-weighting one dimension
  const scores = Object.values(params.scores);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);

  if (maxScore - minScore > 40) {
    biases.push({
      type: 'single_dimension',
      severity: 'medium',
      evidence: `Large score spread (${minScore}-${maxScore}). One dimension may be over-weighted.`,
      recommendation:
        'Review if all dimensions are weighted appropriately. Extreme spreads may indicate bias.',
    });
  }

  // 5. Inconsistent Scoring Bias
  // Score doesn't match the evidence/reality
  const passRate = params.testsTotal > 0 ? params.testsPassed / params.testsTotal : 0;

  if (passRate === 1.0 && params.scores.codeQuality < 60) {
    biases.push({
      type: 'inconsistent_scoring',
      severity: 'high',
      evidence: `All tests passed (${params.testsPassed}/${params.testsTotal}) but code quality scored ${params.scores.codeQuality}`,
      recommendation:
        'Code quality score seems inconsistent with test results. Review scoring logic.',
    });
  }

  if (passRate < 0.3 && params.scores.codeQuality > 80) {
    biases.push({
      type: 'inconsistent_scoring',
      severity: 'high',
      evidence: `Low test pass rate (${Math.round(passRate * 100)}%) but high code quality (${params.scores.codeQuality})`,
      recommendation:
        'Code quality score seems inconsistent with test results. Review scoring logic.',
    });
  }

  // 6. Perfectionism Bias
  // Expecting perfection when "good enough" is appropriate
  const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const evidenceCount = Object.values(params.evidence).reduce((sum, e) => sum + e, 0);

  if (
    avgScore < 60 &&
    evidenceCount >= 10 &&
    params.testsPassed >= params.testsTotal * 0.7
  ) {
    biases.push({
      type: 'perfectionism',
      severity: 'medium',
      evidence: `Average score ${Math.round(avgScore)} despite passing 70%+ tests and substantial evidence`,
      recommendation:
        'Review if expectations are realistic. Candidates are not expected to be perfect.',
    });
  }

  // 7. Experience Bias
  // Assuming specific experience level
  if (
    params.scores.problemSolving < 50 &&
    params.aiInteractionCount < 3 &&
    params.sessionDuration >= 45
  ) {
    biases.push({
      type: 'experience_bias',
      severity: 'low',
      evidence: `Low AI usage (${params.aiInteractionCount} interactions) and low problem-solving score may indicate unfamiliarity with AI tools`,
      recommendation:
        'Consider if candidate is familiar with AI coding tools. May need guidance rather than lower score.',
    });
  }

  // Determine overall risk
  const severityCounts = {
    low: biases.filter((b) => b.severity === 'low').length,
    medium: biases.filter((b) => b.severity === 'medium').length,
    high: biases.filter((b) => b.severity === 'high').length,
  };

  let overallRisk: 'low' | 'medium' | 'high' = 'low';
  if (severityCounts.high > 0) {
    overallRisk = 'high';
  } else if (severityCounts.medium >= 2) {
    overallRisk = 'high';
  } else if (severityCounts.medium > 0) {
    overallRisk = 'medium';
  }

  const recommendations: string[] = [];

  if (overallRisk === 'high') {
    recommendations.push(
      '⚠️ HIGH BIAS RISK: Manual review strongly recommended before finalizing evaluation.'
    );
  } else if (overallRisk === 'medium') {
    recommendations.push(
      '⚡ MODERATE BIAS RISK: Review flagged issues to ensure fair evaluation.'
    );
  }

  if (biases.length > 0) {
    recommendations.push(
      ...biases.map((b) => `${b.type}: ${b.recommendation}`)
    );
  }

  return {
    detected: biases.length > 0,
    biases,
    overallRisk,
    recommendations,
  };
}

/**
 * Generate fairness report for evaluation
 */
export function generateFairnessReport(
  confidence: ConfidenceMetrics,
  biasDetection: BiasDetectionResult
): string {
  let report = '# Evaluation Fairness Report\n\n';

  // Confidence Section
  report += `## Confidence Metrics\n\n`;
  report += `**Overall Confidence:** ${Math.round(confidence.overall * 100)}%\n`;
  report += `${confidence.explanation}\n\n`;

  report += `**Breakdown:**\n`;
  report += `- Data Quality: ${Math.round(confidence.dataQuality * 100)}%\n`;
  report += `- Sample Size: ${Math.round(confidence.sampleSize * 100)}%\n`;
  report += `- Consistency: ${Math.round(confidence.consistency * 100)}%\n\n`;

  if (confidence.warnings.length > 0) {
    report += `**Warnings:**\n`;
    confidence.warnings.forEach((w) => {
      report += `- ${w}\n`;
    });
    report += '\n';
  }

  // Bias Section
  report += `## Bias Detection\n\n`;
  report += `**Overall Risk:** ${biasDetection.overallRisk.toUpperCase()}\n`;
  report += `**Biases Detected:** ${biasDetection.biases.length}\n\n`;

  if (biasDetection.biases.length > 0) {
    report += `**Flagged Issues:**\n\n`;
    biasDetection.biases.forEach((bias, idx) => {
      report += `${idx + 1}. **${bias.type}** (${bias.severity})\n`;
      report += `   - Evidence: ${bias.evidence}\n`;
      report += `   - Recommendation: ${bias.recommendation}\n\n`;
    });
  } else {
    report += `✅ No bias indicators detected.\n\n`;
  }

  // Recommendations
  if (biasDetection.recommendations.length > 0) {
    report += `## Recommendations\n\n`;
    biasDetection.recommendations.forEach((r) => {
      report += `- ${r}\n`;
    });
  }

  return report;
}
