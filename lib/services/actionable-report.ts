/**
 * Actionable Report Generator
 *
 * Transforms evaluation results into actionable insights for both
 * hiring managers and candidates. Includes:
 *
 * 1. Skills Gap Matrix - identifies specific skill deficiencies vs requirements
 * 2. Development Roadmap - concrete learning path to address gaps
 * 3. Interview Insights - what actually happened during the assessment
 * 4. Hiring Recommendations - evidence-based hire/no-hire decision
 */

import type { SeniorityLevel } from '@/types/assessment';

/**
 * Skill category with detailed breakdown
 */
export interface SkillCategory {
  name: string;
  weight: number; // 0-1, importance for role
  subcategories: SkillSubcategory[];
}

export interface SkillSubcategory {
  name: string;
  score: number; // 0-100
  required: number; // Required score for role
  gap: number; // required - score (negative = exceeds)
  evidence: string[];
  priority: 'critical' | 'important' | 'nice-to-have';
}

/**
 * Skills Gap Matrix result
 */
export interface SkillsGapMatrix {
  overallFit: number; // 0-100, how well candidate fits role
  categories: SkillCategory[];
  criticalGaps: SkillGap[];
  strengths: SkillStrength[];
  summary: string;
}

export interface SkillGap {
  skill: string;
  category: string;
  currentLevel: number;
  requiredLevel: number;
  gap: number;
  impact: 'high' | 'medium' | 'low';
  improvementSuggestion: string;
}

export interface SkillStrength {
  skill: string;
  category: string;
  score: number;
  exceeds: number; // How much above requirement
  evidence: string;
}

/**
 * Development Roadmap for candidates
 */
export interface DevelopmentRoadmap {
  candidateName?: string;
  currentLevel: string;
  targetLevel: string;
  estimatedTimeToTarget: string;
  phases: DevelopmentPhase[];
  resources: LearningResource[];
  milestones: Milestone[];
}

export interface DevelopmentPhase {
  order: number;
  name: string;
  duration: string;
  focus: string;
  skills: string[];
  objectives: string[];
  successCriteria: string[];
}

export interface LearningResource {
  type: 'course' | 'book' | 'project' | 'practice' | 'mentorship';
  name: string;
  url?: string;
  skill: string;
  priority: 'required' | 'recommended' | 'optional';
  estimatedTime: string;
}

export interface Milestone {
  name: string;
  skills: string[];
  criteria: string;
  checkpoint: string;
}

/**
 * Interview Insights for hiring managers
 */
export interface InterviewInsights {
  keyObservations: Observation[];
  redFlags: RedFlag[];
  greenFlags: GreenFlag[];
  comparativeAnalysis: ComparativeAnalysis;
  recommendedFollowUp: string[];
}

export interface Observation {
  category: 'technical' | 'behavioral' | 'communication' | 'problem-solving';
  observation: string;
  evidence: string;
  significance: 'positive' | 'neutral' | 'concerning';
}

export interface RedFlag {
  issue: string;
  evidence: string;
  severity: 'critical' | 'moderate' | 'minor';
  mitigationPossible: boolean;
  context: string;
}

export interface GreenFlag {
  strength: string;
  evidence: string;
  rarity: 'common' | 'uncommon' | 'exceptional';
}

export interface ComparativeAnalysis {
  percentile: number; // Where candidate ranks vs typical
  similarCandidatesCount: number;
  standoutAreas: string[];
  developmentAreas: string[];
}

/**
 * Complete Actionable Report
 */
export interface ActionableReport {
  candidateId: string;
  sessionId: string;
  role: string;
  seniority: SeniorityLevel;
  generatedAt: Date;

  // Core sections
  skillsGapMatrix: SkillsGapMatrix;
  developmentRoadmap: DevelopmentRoadmap;
  interviewInsights: InterviewInsights;

  // Summary
  executiveSummary: string;
  hiringRecommendation: {
    decision: 'strong-hire' | 'hire' | 'no-hire' | 'strong-no-hire';
    confidence: number;
    reasoning: string[];
    conditions?: string[]; // Conditions for hire if applicable
  };
}

/**
 * Evaluation data input for report generation
 */
export interface EvaluationData {
  sessionId: string;
  candidateId: string;
  role: string;
  seniority: SeniorityLevel;
  techStack: string[];

  // 4-dimension scores
  codeQuality: { score: number; evidence: string[]; breakdown?: Record<string, number> };
  problemSolving: { score: number; evidence: string[]; breakdown?: Record<string, number> };
  aiCollaboration: { score: number; evidence: string[]; breakdown?: Record<string, number> };
  communication: { score: number; evidence: string[]; breakdown?: Record<string, number> };

  overallScore: number;
  expertiseLevel?: string;
  expertiseGrowthTrend?: string;

  // Question performance
  questionScores?: Array<{
    questionNumber: number;
    score: number;
    difficulty: string;
    topics: string[];
  }>;
}

/**
 * Role requirements configuration
 */
interface RoleRequirements {
  codeQuality: { junior: number; mid: number; senior: number; staff: number; principal: number };
  problemSolving: { junior: number; mid: number; senior: number; staff: number; principal: number };
  aiCollaboration: { junior: number; mid: number; senior: number; staff: number; principal: number };
  communication: { junior: number; mid: number; senior: number; staff: number; principal: number };
}

const BACKEND_REQUIREMENTS: RoleRequirements = {
  codeQuality: { junior: 50, mid: 65, senior: 75, staff: 85, principal: 90 },
  problemSolving: { junior: 45, mid: 60, senior: 75, staff: 85, principal: 90 },
  aiCollaboration: { junior: 40, mid: 55, senior: 65, staff: 75, principal: 80 },
  communication: { junior: 50, mid: 60, senior: 70, staff: 80, principal: 85 },
};

/**
 * Actionable Report Generator
 */
export class ActionableReportGenerator {
  /**
   * Generate complete actionable report from evaluation data
   */
  static generateReport(evaluation: EvaluationData): ActionableReport {
    const skillsGapMatrix = this.generateSkillsGapMatrix(evaluation);
    const developmentRoadmap = this.generateDevelopmentRoadmap(evaluation, skillsGapMatrix);
    const interviewInsights = this.generateInterviewInsights(evaluation);
    const hiringRecommendation = this.generateHiringRecommendation(evaluation, skillsGapMatrix);
    const executiveSummary = this.generateExecutiveSummary(
      evaluation,
      skillsGapMatrix,
      hiringRecommendation
    );

    return {
      candidateId: evaluation.candidateId,
      sessionId: evaluation.sessionId,
      role: evaluation.role,
      seniority: evaluation.seniority,
      generatedAt: new Date(),
      skillsGapMatrix,
      developmentRoadmap,
      interviewInsights,
      executiveSummary,
      hiringRecommendation,
    };
  }

  /**
   * Generate Skills Gap Matrix
   */
  static generateSkillsGapMatrix(evaluation: EvaluationData): SkillsGapMatrix {
    const requirements = this.getRequirementsForLevel(evaluation.seniority);
    const categories: SkillCategory[] = [];
    const criticalGaps: SkillGap[] = [];
    const strengths: SkillStrength[] = [];

    // Code Quality Category
    const codeQualityRequired = requirements.codeQuality;
    const codeQualityGap = codeQualityRequired - evaluation.codeQuality.score;
    const codeQualitySubcategories: SkillSubcategory[] = [
      {
        name: 'Clean Code Principles',
        score: evaluation.codeQuality.breakdown?.cleanCode || evaluation.codeQuality.score,
        required: codeQualityRequired,
        gap: codeQualityRequired - (evaluation.codeQuality.breakdown?.cleanCode || evaluation.codeQuality.score),
        evidence: evaluation.codeQuality.evidence.slice(0, 2),
        priority: 'critical',
      },
      {
        name: 'Error Handling',
        score: evaluation.codeQuality.breakdown?.errorHandling || evaluation.codeQuality.score * 0.9,
        required: codeQualityRequired - 5,
        gap: (codeQualityRequired - 5) - (evaluation.codeQuality.breakdown?.errorHandling || evaluation.codeQuality.score * 0.9),
        evidence: evaluation.codeQuality.evidence.slice(0, 1),
        priority: 'critical',
      },
      {
        name: 'Testing Practices',
        score: evaluation.codeQuality.breakdown?.testing || evaluation.codeQuality.score * 0.85,
        required: codeQualityRequired - 10,
        gap: (codeQualityRequired - 10) - (evaluation.codeQuality.breakdown?.testing || evaluation.codeQuality.score * 0.85),
        evidence: [],
        priority: 'important',
      },
    ];

    categories.push({
      name: 'Code Quality',
      weight: 0.35,
      subcategories: codeQualitySubcategories,
    });

    if (codeQualityGap > 10) {
      criticalGaps.push({
        skill: 'Code Quality',
        category: 'Technical',
        currentLevel: evaluation.codeQuality.score,
        requiredLevel: codeQualityRequired,
        gap: codeQualityGap,
        impact: codeQualityGap > 20 ? 'high' : 'medium',
        improvementSuggestion: 'Focus on clean code principles, SOLID, and testing practices',
      });
    } else if (codeQualityGap < -10) {
      strengths.push({
        skill: 'Code Quality',
        category: 'Technical',
        score: evaluation.codeQuality.score,
        exceeds: -codeQualityGap,
        evidence: evaluation.codeQuality.evidence[0] || 'Demonstrated strong code organization',
      });
    }

    // Problem Solving Category
    const problemSolvingRequired = requirements.problemSolving;
    const problemSolvingGap = problemSolvingRequired - evaluation.problemSolving.score;
    const problemSolvingSubcategories: SkillSubcategory[] = [
      {
        name: 'Algorithmic Thinking',
        score: evaluation.problemSolving.breakdown?.algorithmic || evaluation.problemSolving.score,
        required: problemSolvingRequired,
        gap: problemSolvingRequired - (evaluation.problemSolving.breakdown?.algorithmic || evaluation.problemSolving.score),
        evidence: evaluation.problemSolving.evidence.slice(0, 2),
        priority: 'critical',
      },
      {
        name: 'Debugging Approach',
        score: evaluation.problemSolving.breakdown?.debugging || evaluation.problemSolving.score * 0.95,
        required: problemSolvingRequired - 5,
        gap: (problemSolvingRequired - 5) - (evaluation.problemSolving.breakdown?.debugging || evaluation.problemSolving.score * 0.95),
        evidence: evaluation.problemSolving.evidence.slice(0, 1),
        priority: 'important',
      },
      {
        name: 'System Design',
        score: evaluation.problemSolving.breakdown?.systemDesign || evaluation.problemSolving.score * 0.8,
        required: evaluation.seniority === 'junior' ? 40 : problemSolvingRequired - 10,
        gap: (evaluation.seniority === 'junior' ? 40 : problemSolvingRequired - 10) -
          (evaluation.problemSolving.breakdown?.systemDesign || evaluation.problemSolving.score * 0.8),
        evidence: [],
        priority: evaluation.seniority === 'junior' ? 'nice-to-have' : 'important',
      },
    ];

    categories.push({
      name: 'Problem Solving',
      weight: 0.30,
      subcategories: problemSolvingSubcategories,
    });

    if (problemSolvingGap > 10) {
      criticalGaps.push({
        skill: 'Problem Solving',
        category: 'Technical',
        currentLevel: evaluation.problemSolving.score,
        requiredLevel: problemSolvingRequired,
        gap: problemSolvingGap,
        impact: problemSolvingGap > 20 ? 'high' : 'medium',
        improvementSuggestion: 'Practice algorithm problems, focus on systematic debugging',
      });
    } else if (problemSolvingGap < -10) {
      strengths.push({
        skill: 'Problem Solving',
        category: 'Technical',
        score: evaluation.problemSolving.score,
        exceeds: -problemSolvingGap,
        evidence: evaluation.problemSolving.evidence[0] || 'Demonstrated systematic approach',
      });
    }

    // AI Collaboration Category
    const aiRequired = requirements.aiCollaboration;
    const aiGap = aiRequired - evaluation.aiCollaboration.score;
    categories.push({
      name: 'AI Collaboration',
      weight: 0.20,
      subcategories: [
        {
          name: 'Prompt Engineering',
          score: evaluation.aiCollaboration.breakdown?.prompting || evaluation.aiCollaboration.score,
          required: aiRequired,
          gap: aiRequired - (evaluation.aiCollaboration.breakdown?.prompting || evaluation.aiCollaboration.score),
          evidence: evaluation.aiCollaboration.evidence.slice(0, 2),
          priority: 'important',
        },
        {
          name: 'Critical Evaluation',
          score: evaluation.aiCollaboration.breakdown?.criticalEval || evaluation.aiCollaboration.score * 0.9,
          required: aiRequired - 5,
          gap: (aiRequired - 5) - (evaluation.aiCollaboration.breakdown?.criticalEval || evaluation.aiCollaboration.score * 0.9),
          evidence: evaluation.aiCollaboration.evidence.slice(0, 1),
          priority: 'important',
        },
      ],
    });

    if (aiGap > 15) {
      criticalGaps.push({
        skill: 'AI Collaboration',
        category: 'Modern Skills',
        currentLevel: evaluation.aiCollaboration.score,
        requiredLevel: aiRequired,
        gap: aiGap,
        impact: 'medium',
        improvementSuggestion: 'Practice crafting specific prompts, learn to validate AI outputs',
      });
    }

    // Communication Category
    const commRequired = requirements.communication;
    categories.push({
      name: 'Communication',
      weight: 0.15,
      subcategories: [
        {
          name: 'Technical Writing',
          score: evaluation.communication.breakdown?.writing || evaluation.communication.score,
          required: commRequired,
          gap: commRequired - (evaluation.communication.breakdown?.writing || evaluation.communication.score),
          evidence: evaluation.communication.evidence.slice(0, 1),
          priority: evaluation.seniority === 'senior' || evaluation.seniority === 'staff' ? 'critical' : 'important',
        },
        {
          name: 'Problem Articulation',
          score: evaluation.communication.breakdown?.articulation || evaluation.communication.score * 0.95,
          required: commRequired - 5,
          gap: (commRequired - 5) - (evaluation.communication.breakdown?.articulation || evaluation.communication.score * 0.95),
          evidence: [],
          priority: 'important',
        },
      ],
    });

    // Calculate overall fit
    const weightedScore = (
      evaluation.codeQuality.score * 0.35 +
      evaluation.problemSolving.score * 0.30 +
      evaluation.aiCollaboration.score * 0.20 +
      evaluation.communication.score * 0.15
    );
    const weightedRequired = (
      requirements.codeQuality * 0.35 +
      requirements.problemSolving * 0.30 +
      requirements.aiCollaboration * 0.20 +
      requirements.communication * 0.15
    );
    const overallFit = Math.min(100, Math.round((weightedScore / weightedRequired) * 100));

    // Generate summary
    const summary = this.generateGapMatrixSummary(evaluation, criticalGaps, strengths, overallFit);

    return {
      overallFit,
      categories,
      criticalGaps,
      strengths,
      summary,
    };
  }

  /**
   * Generate Development Roadmap
   */
  static generateDevelopmentRoadmap(
    evaluation: EvaluationData,
    gapMatrix: SkillsGapMatrix
  ): DevelopmentRoadmap {
    const currentLevel = evaluation.expertiseLevel || 'intermediate';
    const targetLevel = this.getNextLevel(currentLevel);

    const phases: DevelopmentPhase[] = [];
    const resources: LearningResource[] = [];
    const milestones: Milestone[] = [];

    // Phase 1: Address Critical Gaps
    if (gapMatrix.criticalGaps.length > 0) {
      const criticalSkills = gapMatrix.criticalGaps.map(g => g.skill);
      phases.push({
        order: 1,
        name: 'Foundation Strengthening',
        duration: '4-6 weeks',
        focus: 'Address critical skill gaps that block advancement',
        skills: criticalSkills,
        objectives: gapMatrix.criticalGaps.map(g => g.improvementSuggestion),
        successCriteria: gapMatrix.criticalGaps.map(g =>
          `Improve ${g.skill} score from ${g.currentLevel} to ${g.requiredLevel}`
        ),
      });

      // Add resources for critical gaps
      for (const gap of gapMatrix.criticalGaps) {
        resources.push(...this.getResourcesForSkill(gap.skill, 'required'));
      }

      milestones.push({
        name: 'Foundation Complete',
        skills: criticalSkills,
        criteria: 'All critical gaps reduced to < 10 points',
        checkpoint: 'Week 6 assessment',
      });
    }

    // Phase 2: Skill Deepening
    phases.push({
      order: phases.length + 1,
      name: 'Skill Deepening',
      duration: '6-8 weeks',
      focus: 'Build depth in core competencies for the role',
      skills: ['Advanced ' + (evaluation.techStack[0] || 'Backend'), 'System Design', 'Performance Optimization'],
      objectives: [
        'Master advanced patterns in primary technology',
        'Design scalable system architectures',
        'Optimize code for performance and reliability',
      ],
      successCriteria: [
        'Complete a complex project using advanced patterns',
        'Design and document a scalable system',
        'Identify and resolve performance bottlenecks',
      ],
    });

    resources.push(
      {
        type: 'course',
        name: 'System Design Interview Preparation',
        skill: 'System Design',
        priority: 'recommended',
        estimatedTime: '20 hours',
      },
      {
        type: 'project',
        name: 'Build a distributed system component',
        skill: 'Problem Solving',
        priority: 'recommended',
        estimatedTime: '40 hours',
      }
    );

    milestones.push({
      name: 'Technical Depth Achieved',
      skills: ['System Design', 'Performance'],
      criteria: 'Can independently design and optimize systems',
      checkpoint: 'Week 14 review',
    });

    // Phase 3: Leadership/Advanced Skills (for senior+ roles)
    if (['senior', 'staff', 'principal'].includes(evaluation.seniority)) {
      phases.push({
        order: phases.length + 1,
        name: 'Technical Leadership',
        duration: '8-12 weeks',
        focus: 'Develop leadership and mentoring capabilities',
        skills: ['Code Review', 'Technical Mentoring', 'Architecture Decisions'],
        objectives: [
          'Lead code reviews with constructive feedback',
          'Mentor junior developers effectively',
          'Make and document architecture decisions',
        ],
        successCriteria: [
          'Lead 10+ code review sessions',
          'Successfully mentor a junior developer',
          'Author an ADR (Architecture Decision Record)',
        ],
      });

      resources.push({
        type: 'mentorship',
        name: 'Find a staff+ engineer mentor',
        skill: 'Technical Leadership',
        priority: 'required',
        estimatedTime: 'Ongoing',
      });

      milestones.push({
        name: 'Leadership Ready',
        skills: ['Leadership', 'Mentoring'],
        criteria: 'Demonstrates ability to guide technical decisions',
        checkpoint: 'Week 26 assessment',
      });
    }

    // Calculate estimated time
    const totalWeeks = phases.reduce((sum, p) => {
      const match = p.duration.match(/(\d+)/);
      return sum + (match ? parseInt(match[1]) : 6);
    }, 0);

    return {
      currentLevel: currentLevel.charAt(0).toUpperCase() + currentLevel.slice(1),
      targetLevel: targetLevel.charAt(0).toUpperCase() + targetLevel.slice(1),
      estimatedTimeToTarget: `${totalWeeks}-${totalWeeks + 8} weeks`,
      phases,
      resources,
      milestones,
    };
  }

  /**
   * Generate Interview Insights for hiring managers
   */
  static generateInterviewInsights(evaluation: EvaluationData): InterviewInsights {
    const keyObservations: Observation[] = [];
    const redFlags: RedFlag[] = [];
    const greenFlags: GreenFlag[] = [];

    // Analyze code quality
    if (evaluation.codeQuality.score >= 80) {
      greenFlags.push({
        strength: 'Exceptional code quality',
        evidence: evaluation.codeQuality.evidence[0] || 'Consistently clean, well-organized code',
        rarity: evaluation.codeQuality.score >= 90 ? 'exceptional' : 'uncommon',
      });
    } else if (evaluation.codeQuality.score < 50) {
      redFlags.push({
        issue: 'Below-standard code quality',
        evidence: evaluation.codeQuality.evidence[0] || 'Code organization and clarity issues',
        severity: evaluation.codeQuality.score < 35 ? 'critical' : 'moderate',
        mitigationPossible: true,
        context: 'May improve with mentorship and practice',
      });
    }

    // Analyze problem solving
    if (evaluation.problemSolving.score >= 75) {
      keyObservations.push({
        category: 'problem-solving',
        observation: 'Demonstrates systematic problem-solving approach',
        evidence: evaluation.problemSolving.evidence[0] || 'Used structured debugging methodology',
        significance: 'positive',
      });
      if (evaluation.problemSolving.score >= 85) {
        greenFlags.push({
          strength: 'Strong algorithmic thinking',
          evidence: 'Efficiently solved complex problems',
          rarity: 'uncommon',
        });
      }
    } else if (evaluation.problemSolving.score < 50) {
      redFlags.push({
        issue: 'Struggles with complex problem decomposition',
        evidence: evaluation.problemSolving.evidence[0] || 'Difficulty breaking down problems',
        severity: 'moderate',
        mitigationPossible: true,
        context: 'Core skill that requires significant development time',
      });
    }

    // Analyze AI collaboration
    if (evaluation.aiCollaboration.score >= 70) {
      keyObservations.push({
        category: 'technical',
        observation: 'Effective use of AI assistance',
        evidence: evaluation.aiCollaboration.evidence[0] || 'Strategic prompting and output validation',
        significance: 'positive',
      });
    }

    // Analyze expertise growth trend
    if (evaluation.expertiseGrowthTrend === 'improving') {
      greenFlags.push({
        strength: 'Shows learning agility',
        evidence: 'Performance improved across progressive questions',
        rarity: 'uncommon',
      });
    } else if (evaluation.expertiseGrowthTrend === 'declining') {
      keyObservations.push({
        category: 'behavioral',
        observation: 'Performance declined under increasing difficulty',
        evidence: 'Lower scores on later, harder questions',
        significance: 'concerning',
      });
    }

    // Calculate comparative analysis
    const percentile = this.calculatePercentile(evaluation.overallScore, evaluation.seniority);

    const comparativeAnalysis: ComparativeAnalysis = {
      percentile,
      similarCandidatesCount: 100, // Placeholder - would come from historical data
      standoutAreas: greenFlags.map(g => g.strength),
      developmentAreas: redFlags.map(r => r.issue),
    };

    // Recommend follow-up questions
    const recommendedFollowUp: string[] = [];
    if (evaluation.problemSolving.score < 60) {
      recommendedFollowUp.push('Ask about their approach to learning new problem-solving techniques');
    }
    if (evaluation.communication.score < 60) {
      recommendedFollowUp.push('Explore communication style in team settings');
    }
    if (greenFlags.some(g => g.rarity === 'exceptional')) {
      recommendedFollowUp.push('Discuss opportunities for technical leadership');
    }

    return {
      keyObservations,
      redFlags,
      greenFlags,
      comparativeAnalysis,
      recommendedFollowUp,
    };
  }

  /**
   * Generate hiring recommendation
   */
  static generateHiringRecommendation(
    evaluation: EvaluationData,
    gapMatrix: SkillsGapMatrix
  ): ActionableReport['hiringRecommendation'] {
    const hasCriticalGaps = gapMatrix.criticalGaps.some(g => g.impact === 'high');
    const hasMultipleModerateGaps = gapMatrix.criticalGaps.filter(g => g.impact === 'medium').length >= 2;
    const hasStrengths = gapMatrix.strengths.length >= 2;
    const overallFit = gapMatrix.overallFit;

    let decision: 'strong-hire' | 'hire' | 'no-hire' | 'strong-no-hire';
    let confidence: number;
    const reasoning: string[] = [];
    const conditions: string[] = [];

    if (overallFit >= 90 && !hasCriticalGaps && hasStrengths) {
      decision = 'strong-hire';
      confidence = 0.9;
      reasoning.push(`Exceeds requirements with ${overallFit}% role fit`);
      reasoning.push(`Demonstrated strengths: ${gapMatrix.strengths.map(s => s.skill).join(', ')}`);
    } else if (overallFit >= 75 && !hasCriticalGaps) {
      decision = 'hire';
      confidence = 0.75;
      reasoning.push(`Meets requirements with ${overallFit}% role fit`);
      if (gapMatrix.criticalGaps.length > 0) {
        conditions.push('Provide structured onboarding to address minor gaps');
        conditions.push(`Focus areas: ${gapMatrix.criticalGaps.map(g => g.skill).join(', ')}`);
      }
    } else if (overallFit >= 60 && !hasCriticalGaps && hasStrengths) {
      decision = 'hire';
      confidence = 0.6;
      reasoning.push(`Approaching requirements with ${overallFit}% role fit`);
      reasoning.push('Has compensating strengths');
      conditions.push('Requires dedicated mentorship');
      conditions.push('3-month performance checkpoint recommended');
    } else if (hasCriticalGaps || hasMultipleModerateGaps) {
      decision = 'no-hire';
      confidence = 0.7;
      reasoning.push(`Significant gaps identified: ${gapMatrix.criticalGaps.map(g => g.skill).join(', ')}`);
      reasoning.push(`Current fit: ${overallFit}%`);
      if (gapMatrix.strengths.length > 0) {
        reasoning.push(`Note: Shows promise in ${gapMatrix.strengths.map(s => s.skill).join(', ')}`);
      }
    } else {
      decision = 'strong-no-hire';
      confidence = 0.85;
      reasoning.push(`Does not meet minimum requirements (${overallFit}% fit)`);
      reasoning.push('Multiple critical skill gaps with high business impact');
    }

    return { decision, confidence, reasoning, conditions };
  }

  /**
   * Generate executive summary
   */
  private static generateExecutiveSummary(
    evaluation: EvaluationData,
    gapMatrix: SkillsGapMatrix,
    recommendation: ActionableReport['hiringRecommendation']
  ): string {
    const seniorityLabel = evaluation.seniority.charAt(0).toUpperCase() + evaluation.seniority.slice(1);
    const decisionLabel = recommendation.decision.replace(/-/g, ' ');

    const lines = [
      `**Candidate Assessment Summary**`,
      ``,
      `Role: ${seniorityLabel} ${evaluation.role}`,
      `Overall Fit: ${gapMatrix.overallFit}%`,
      `Recommendation: ${decisionLabel.toUpperCase()} (${Math.round(recommendation.confidence * 100)}% confidence)`,
      ``,
    ];

    if (gapMatrix.strengths.length > 0) {
      lines.push(`**Strengths:** ${gapMatrix.strengths.map(s => s.skill).join(', ')}`);
    }

    if (gapMatrix.criticalGaps.length > 0) {
      lines.push(`**Development Areas:** ${gapMatrix.criticalGaps.map(g => g.skill).join(', ')}`);
    }

    lines.push('');
    lines.push('**Key Reasoning:**');
    recommendation.reasoning.slice(0, 3).forEach(r => lines.push(`- ${r}`));

    if (recommendation.conditions && recommendation.conditions.length > 0) {
      lines.push('');
      lines.push('**Conditions for Success:**');
      recommendation.conditions.forEach(c => lines.push(`- ${c}`));
    }

    return lines.join('\n');
  }

  /**
   * Helper: Get requirements for seniority level
   */
  private static getRequirementsForLevel(seniority: SeniorityLevel): {
    codeQuality: number;
    problemSolving: number;
    aiCollaboration: number;
    communication: number;
  } {
    const level = seniority as keyof typeof BACKEND_REQUIREMENTS.codeQuality;
    return {
      codeQuality: BACKEND_REQUIREMENTS.codeQuality[level] || 65,
      problemSolving: BACKEND_REQUIREMENTS.problemSolving[level] || 60,
      aiCollaboration: BACKEND_REQUIREMENTS.aiCollaboration[level] || 55,
      communication: BACKEND_REQUIREMENTS.communication[level] || 60,
    };
  }

  /**
   * Helper: Get next career level
   */
  private static getNextLevel(current: string): string {
    const levels = ['beginner', 'junior', 'mid', 'senior', 'staff', 'principal'];
    const idx = levels.indexOf(current.toLowerCase());
    return idx >= 0 && idx < levels.length - 1 ? levels[idx + 1] : levels[levels.length - 1];
  }

  /**
   * Helper: Generate gap matrix summary
   */
  private static generateGapMatrixSummary(
    evaluation: EvaluationData,
    criticalGaps: SkillGap[],
    strengths: SkillStrength[],
    overallFit: number
  ): string {
    let summary = `Candidate shows ${overallFit}% alignment with ${evaluation.seniority} ${evaluation.role} requirements. `;

    if (strengths.length > 0) {
      summary += `Notable strengths in ${strengths.map(s => s.skill).join(' and ')}. `;
    }

    if (criticalGaps.length > 0) {
      const highImpact = criticalGaps.filter(g => g.impact === 'high');
      if (highImpact.length > 0) {
        summary += `Critical gaps in ${highImpact.map(g => g.skill).join(' and ')} require immediate attention. `;
      } else {
        summary += `Development needed in ${criticalGaps.map(g => g.skill).join(' and ')}. `;
      }
    }

    return summary.trim();
  }

  /**
   * Helper: Calculate percentile
   */
  private static calculatePercentile(score: number, seniority: SeniorityLevel): number {
    // Simplified percentile calculation - would use historical data in production
    const basePercentile = Math.min(99, Math.round((score / 100) * 100));
    return basePercentile;
  }

  /**
   * Helper: Get learning resources for a skill
   */
  private static getResourcesForSkill(
    skill: string,
    priority: 'required' | 'recommended' | 'optional'
  ): LearningResource[] {
    const resourceMap: Record<string, LearningResource[]> = {
      'Code Quality': [
        { type: 'book', name: 'Clean Code by Robert Martin', skill: 'Code Quality', priority, estimatedTime: '15 hours' },
        { type: 'practice', name: 'Code review exercises', skill: 'Code Quality', priority, estimatedTime: '10 hours' },
      ],
      'Problem Solving': [
        { type: 'practice', name: 'LeetCode medium/hard problems', skill: 'Problem Solving', priority, estimatedTime: '40 hours' },
        { type: 'course', name: 'Algorithms specialization', skill: 'Problem Solving', priority, estimatedTime: '30 hours' },
      ],
      'AI Collaboration': [
        { type: 'course', name: 'Prompt Engineering fundamentals', skill: 'AI Collaboration', priority, estimatedTime: '8 hours' },
        { type: 'practice', name: 'AI-assisted coding projects', skill: 'AI Collaboration', priority, estimatedTime: '20 hours' },
      ],
    };

    return resourceMap[skill] || [];
  }
}

// Export singleton
export const reportGenerator = ActionableReportGenerator;
