/**
 * Technology Detection Utilities
 * Client-side and server-side utilities for detecting technologies in code
 */

import {
  Technology,
  TechStackRequirements,
  DetectedTech,
  TechViolation,
  TechValidationResult,
  CodeLocation,
  TechPriority,
} from "@/types/assessment";
import { TECH_CATALOG } from "./tech-catalog";

/**
 * Detect language from file name and content
 */
export function detectLanguage(fileName: string, content: string): Technology | null {
  // Check by file extension first
  const ext = fileName.substring(fileName.lastIndexOf("."));

  for (const tech of Object.values(TECH_CATALOG)) {
    if (tech.category !== "language") continue;

    if (tech.detectionPatterns?.fileExtensions?.includes(ext)) {
      return tech;
    }
  }

  // Fallback: Check content patterns
  for (const tech of Object.values(TECH_CATALOG)) {
    if (tech.category !== "language") continue;

    const patterns = tech.detectionPatterns?.importPatterns || [];
    for (const pattern of patterns) {
      if (content.includes(pattern)) {
        return tech;
      }
    }
  }

  return null;
}

/**
 * Detect all technologies in a file
 */
export function detectTechnologiesInFile(
  fileName: string,
  content: string
): DetectedTech[] {
  const detected: DetectedTech[] = [];
  const locations: CodeLocation[] = [{ filePath: fileName }];

  // Detect language
  const language = detectLanguage(fileName, content);
  if (language) {
    detected.push({
      tech: language,
      priority: "critical",
      confidence: 1.0,
      locations,
    });
  }

  // Detect frameworks, databases, tools by import patterns
  for (const tech of Object.values(TECH_CATALOG)) {
    if (tech.category === "language") continue; // Already handled

    const patterns = tech.detectionPatterns?.importPatterns || [];
    let found = false;
    let matchCount = 0;

    for (const pattern of patterns) {
      if (content.includes(pattern)) {
        found = true;
        matchCount++;
      }
    }

    if (found) {
      // Calculate confidence based on number of patterns matched
      const confidence = Math.min(1.0, matchCount / patterns.length + 0.5);

      detected.push({
        tech,
        priority: "required", // Default, will be updated based on requirements
        confidence,
        locations,
      });
    }
  }

  // Check file extensions for tools (e.g., Dockerfile, docker-compose.yml)
  for (const tech of Object.values(TECH_CATALOG)) {
    if (tech.category !== "tool") continue;

    const extensions = tech.detectionPatterns?.fileExtensions || [];
    for (const ext of extensions) {
      if (fileName.includes(ext) || fileName.endsWith(ext)) {
        detected.push({
          tech,
          priority: "optional",
          confidence: 1.0,
          locations,
        });
      }
    }
  }

  return detected;
}

/**
 * Detect technologies across multiple files
 */
export function detectTechnologiesInProject(
  files: Array<{ name: string; content: string; path: string }>
): DetectedTech[] {
  const allDetected: Map<string, DetectedTech> = new Map();

  for (const file of files) {
    const detected = detectTechnologiesInFile(file.name, file.content);

    for (const tech of detected) {
      const existing = allDetected.get(tech.tech.id);

      if (existing) {
        // Merge locations and update confidence
        existing.locations.push(...tech.locations);
        existing.confidence = Math.max(existing.confidence, tech.confidence);
      } else {
        allDetected.set(tech.tech.id, {
          ...tech,
          locations: [{ filePath: file.path }],
        });
      }
    }
  }

  return Array.from(allDetected.values());
}

/**
 * Get priority of a technology in requirements
 */
function getTechnologyPriority(
  techId: string,
  requirements: TechStackRequirements
): TechPriority | null {
  if (requirements.critical.some((t) => t.id === techId)) return "critical";
  if (requirements.required.some((t) => t.id === techId)) return "required";
  if (requirements.recommended.some((t) => t.id === techId)) return "recommended";
  if (requirements.optional.some((t) => t.id === techId)) return "optional";
  return null;
}

/**
 * Validate tech stack against requirements
 */
export function validateTechStack(
  files: Array<{ name: string; content: string; path: string }>,
  requirements: TechStackRequirements
): TechValidationResult {
  const detected = detectTechnologiesInProject(files);
  const violations: TechViolation[] = [];
  const satisfied: Technology[] = [];

  // Update detected priorities based on requirements
  detected.forEach((d) => {
    const priority = getTechnologyPriority(d.tech.id, requirements);
    if (priority) {
      d.priority = priority;
    }
  });

  // Check critical technologies
  for (const criticalTech of requirements.critical) {
    const detectedTech = detected.find((d) => d.tech.id === criticalTech.id);

    if (!detectedTech || detectedTech.confidence < 0.5) {
      // Check if a different language was detected
      const detectedLanguages = detected.filter((d) => d.tech.category === "language");
      const alternativeLanguage = detectedLanguages[0];

      violations.push({
        tech: criticalTech,
        priority: "critical",
        message: `Critical technology ${criticalTech.name} is required but not detected.`,
        blocking: true,
        detectedAlternative: alternativeLanguage?.tech,
        suggestions: [
          `Delete files using ${alternativeLanguage?.tech.name || "other languages"}`,
          `Create files using ${criticalTech.name}`,
          `Use ${criticalTech.detectionPatterns?.fileExtensions?.[0] || ".txt"} file extension`,
        ],
      });
    } else {
      satisfied.push(criticalTech);
    }
  }

  // Check required technologies
  for (const requiredTech of requirements.required) {
    const detectedTech = detected.find((d) => d.tech.id === requiredTech.id);

    if (!detectedTech || detectedTech.confidence < 0.5) {
      violations.push({
        tech: requiredTech,
        priority: "required",
        message: `Required technology ${requiredTech.name} must be used in your solution.`,
        blocking: true,
        suggestions: [
          `Import ${requiredTech.name}: ${requiredTech.detectionPatterns?.importPatterns?.[0] || ""}`,
          `Use ${requiredTech.name} in your implementation`,
        ],
      });
    } else {
      satisfied.push(requiredTech);
    }
  }

  // Check recommended technologies (non-blocking)
  for (const recommendedTech of requirements.recommended) {
    const detectedTech = detected.find((d) => d.tech.id === recommendedTech.id);

    if (!detectedTech || detectedTech.confidence < 0.5) {
      violations.push({
        tech: recommendedTech,
        priority: "recommended",
        message: `Recommended technology ${recommendedTech.name} is not used. This may affect your score.`,
        blocking: false,
        suggestions: [
          `Consider using ${recommendedTech.name} for better evaluation`,
          `${recommendedTech.description}`,
        ],
      });
    } else {
      satisfied.push(recommendedTech);
    }
  }

  // Check for optional technologies (bonus points)
  for (const optionalTech of requirements.optional) {
    const detectedTech = detected.find((d) => d.tech.id === optionalTech.id);
    if (detectedTech && detectedTech.confidence >= 0.5) {
      satisfied.push(optionalTech);
    }
  }

  // Generate overall suggestions
  const suggestions: string[] = [];
  const blockingViolations = violations.filter((v) => v.blocking);

  if (blockingViolations.length > 0) {
    suggestions.push(
      `You must fix ${blockingViolations.length} blocking issue(s) before continuing.`
    );
  }

  const nonBlockingViolations = violations.filter((v) => !v.blocking);
  if (nonBlockingViolations.length > 0) {
    suggestions.push(
      `${nonBlockingViolations.length} recommended technology/technologies are missing.`
    );
  }

  return {
    valid: blockingViolations.length === 0,
    detected,
    violations,
    satisfied,
    suggestions,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if a specific file violates critical tech requirements
 * Used for real-time blocking
 */
export function checkCriticalTechViolation(
  fileName: string,
  content: string,
  requirements: TechStackRequirements
): TechViolation | null {
  const language = detectLanguage(fileName, content);

  // Check if a critical language is required
  if (requirements.critical.length === 0) return null;

  const criticalLanguage = requirements.critical.find((t) => t.category === "language");
  if (!criticalLanguage) return null;

  // If language detected doesn't match critical requirement
  if (language && language.id !== criticalLanguage.id) {
    return {
      tech: criticalLanguage,
      priority: "critical",
      message: `You created ${fileName} with ${language.name} code. This assessment requires ${criticalLanguage.name} as the primary language.`,
      blocking: true,
      detectedAlternative: language,
      suggestions: [
        `Delete ${fileName} and create a file with ${criticalLanguage.detectionPatterns?.fileExtensions?.[0] || ".txt"} extension`,
        `Rewrite your solution using ${criticalLanguage.name}`,
      ],
    };
  }

  return null;
}

/**
 * Code quality metrics from evaluation
 */
export interface CodeQualityMetrics {
  testCoverage?: number; // 0-100
  codeComplexity?: number; // Average cyclomatic complexity
  linesOfCode?: number;
  commentRatio?: number; // 0-1
  duplicateCodeRatio?: number; // 0-1
  maintainabilityIndex?: number; // 0-100
}

/**
 * Technology score breakdown
 */
export interface TechnologyScoreBreakdown {
  required: Record<string, number>; // Tech name -> score (0-100)
  recommended: Record<string, number>;
  optional: Record<string, number>;
  detected: string[]; // All detected technologies
  missing: string[]; // Required but not detected
  extra: string[]; // Detected but not required
}

/**
 * Technology score result
 */
export interface TechnologyScoreResult {
  overallScore: number; // 0-100
  breakdown: TechnologyScoreBreakdown;
  proficiencyLevel: "beginner" | "intermediate" | "advanced" | "expert";
}

/**
 * Calculate technology scores (for evaluation)
 */
export function calculateTechnologyScores(
  detectedTech: DetectedTech[],
  requirements: TechStackRequirements,
  codeQualityMetrics: CodeQualityMetrics
): TechnologyScoreResult {
  // This will be fully implemented in backend evaluation
  // For now, return a basic implementation

  const requiredScore: Record<string, number> = {};
  const recommendedScore: Record<string, number> = {};
  const optionalScore: Record<string, number> = {};

  const detectedNames = detectedTech.map(t => t.tech.name.toLowerCase());
  const missing: string[] = [];

  // Check required technologies
  requirements.required.forEach(tech => {
    const found = detectedNames.includes(tech.name.toLowerCase());
    requiredScore[tech.name] = found ? 100 : 0;
    if (!found) missing.push(tech.name);
  });

  // Check recommended technologies
  requirements.recommended.forEach(tech => {
    const found = detectedNames.includes(tech.name.toLowerCase());
    recommendedScore[tech.name] = found ? 100 : 0;
  });

  // Check optional technologies
  requirements.optional.forEach(tech => {
    const found = detectedNames.includes(tech.name.toLowerCase());
    optionalScore[tech.name] = found ? 100 : 0;
  });

  // Calculate overall score (weighted)
  const requiredAvg = Object.values(requiredScore).reduce((a, b) => a + b, 0) /
    Math.max(1, requirements.required.length);
  const recommendedAvg = Object.values(recommendedScore).reduce((a, b) => a + b, 0) /
    Math.max(1, requirements.recommended.length);

  const overallScore = requiredAvg * 0.7 + recommendedAvg * 0.3;

  return {
    overallScore: Math.round(overallScore),
    breakdown: {
      required: requiredScore,
      recommended: recommendedScore,
      optional: optionalScore,
      detected: detectedTech.map(t => t.tech.name),
      missing,
      extra: [],
    },
    proficiencyLevel: overallScore >= 90 ? "expert" :
                      overallScore >= 75 ? "advanced" :
                      overallScore >= 60 ? "intermediate" : "beginner",
  };
}

/**
 * Get friendly tech stack summary for display
 */
export function getTechStackSummary(requirements: TechStackRequirements): {
  critical: string[];
  required: string[];
  recommended: string[];
  optional: string[];
} {
  return {
    critical: requirements.critical.map((t) => t.name),
    required: requirements.required.map((t) => t.name),
    recommended: requirements.recommended.map((t) => t.name),
    optional: requirements.optional.map((t) => t.name),
  };
}
