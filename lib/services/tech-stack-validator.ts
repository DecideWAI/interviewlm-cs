/**
 * Tech Stack Validator Service
 *
 * Validates that candidates are using the required technology stack
 * specified in incremental assessments. Detects languages, frameworks,
 * databases, and tools from code snapshots and file structures.
 */

import prisma from "@/lib/prisma";
import type { RequiredTechStack } from "@/types/seed";
import { TECH_CATALOG } from "@/lib/tech-catalog";

/**
 * Tech violation details
 */
export interface TechViolation {
  type: 'language' | 'framework' | 'database' | 'tool';
  expected: string;
  detected: boolean;
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Validation result
 */
export interface TechValidationResult {
  compliant: boolean;
  violations: TechViolation[];
  detectedTech: {
    languages: string[];
    frameworks: string[];
    databases: string[];
    tools: string[];
  };
  score: number; // 0-1, percentage of required tech detected
}

/**
 * Code snapshot for analysis
 */
interface CodeSnapshot {
  fileName: string;
  content: string;
  language: string;
}

/**
 * Tech Stack Validator
 */
export class TechStackValidator {
  /**
   * Validate candidate's tech stack usage
   */
  async validateCandidateSession(
    candidateId: string,
    requiredTech: RequiredTechStack
  ): Promise<TechValidationResult> {
    // Get recent code snapshots
    const codeSnapshots = await this.getRecentCodeSnapshots(candidateId);

    if (codeSnapshots.length === 0) {
      return {
        compliant: false,
        violations: [
          {
            type: 'language',
            expected: 'any',
            detected: false,
            severity: 'error',
            message: 'No code submitted yet',
          },
        ],
        detectedTech: {
          languages: [],
          frameworks: [],
          databases: [],
          tools: [],
        },
        score: 0,
      };
    }

    // Detect technologies in code
    const detectedTech = this.detectTechnologies(codeSnapshots);

    // Check compliance
    const violations: TechViolation[] = [];

    // Validate languages
    for (const langSpec of requiredTech.languages) {
      const detected = detectedTech.languages.includes(langSpec.name.toLowerCase());
      if (!detected) {
        // Only critical tech violations are errors, others are warnings
        const severity = langSpec.priority === 'critical' ? 'error' : 'warning';
        violations.push({
          type: 'language',
          expected: langSpec.name,
          detected: false,
          severity,
          message: `${langSpec.priority === 'critical' ? 'CRITICAL' : 'Expected'}: Use ${langSpec.name}${langSpec.version ? ` ${langSpec.version}` : ''}`,
        });
      }
    }

    // Validate frameworks
    for (const frameworkSpec of requiredTech.frameworks) {
      const detected = this.detectFramework(codeSnapshots, frameworkSpec.name);
      if (!detected) {
        const severity = frameworkSpec.priority === 'critical' ? 'error' : 'warning';
        violations.push({
          type: 'framework',
          expected: frameworkSpec.name,
          detected: false,
          severity,
          message: `${frameworkSpec.priority === 'critical' ? 'CRITICAL' : 'Expected'}: Use ${frameworkSpec.name} framework`,
        });
      }
    }

    // Validate databases
    for (const databaseSpec of requiredTech.databases) {
      const detected = this.detectDatabase(codeSnapshots, databaseSpec.name);
      if (!detected) {
        const severity = databaseSpec.priority === 'critical' ? 'error' : 'warning';
        violations.push({
          type: 'database',
          expected: databaseSpec.name,
          detected: false,
          severity,
          message: `${databaseSpec.priority === 'critical' ? 'CRITICAL' : 'Expected'}: Use ${databaseSpec.name} database`,
        });
      }
    }

    // Validate tools (optional)
    if (requiredTech.tools) {
      for (const toolSpec of requiredTech.tools) {
        const detected = this.detectTool(codeSnapshots, toolSpec.name);
        if (!detected) {
          const severity = toolSpec.priority === 'critical' ? 'error' : 'warning';
          violations.push({
            type: 'tool',
            expected: toolSpec.name,
            detected: false,
            severity,
            message: `${toolSpec.priority === 'recommended' ? 'Recommended' : 'Expected'}: Use ${toolSpec.name}`,
          });
        }
      }
    }

    // Calculate compliance score
    const totalRequired =
      requiredTech.languages.length +
      requiredTech.frameworks.length +
      requiredTech.databases.length +
      (requiredTech.tools?.length || 0);

    const errorViolations = violations.filter((v) => v.severity === 'error').length;
    const warningViolations = violations.filter((v) => v.severity === 'warning').length;

    const score = Math.max(
      0,
      1 - (errorViolations * 0.5 + warningViolations * 0.2) / totalRequired
    );

    return {
      compliant: violations.filter((v) => v.severity === 'error').length === 0,
      violations,
      detectedTech,
      score,
    };
  }

  /**
   * Get recent code snapshots for a candidate
   */
  private async getRecentCodeSnapshots(candidateId: string): Promise<CodeSnapshot[]> {
    const sessionRecording = await prisma.sessionRecording.findFirst({
      where: { candidateId },
      include: {
        codeSnapshots: {
          orderBy: { timestamp: 'desc' },
          take: 10, // Get last 10 snapshots
        },
      },
    });

    if (!sessionRecording) {
      return [];
    }

    return sessionRecording.codeSnapshots.map((snapshot) => ({
      fileName: snapshot.fileName,
      content: snapshot.fullContent || '',
      language: snapshot.language,
    }));
  }

  /**
   * Detect technologies from code snapshots
   */
  private detectTechnologies(codeSnapshots: CodeSnapshot[]): {
    languages: string[];
    frameworks: string[];
    databases: string[];
    tools: string[];
  } {
    const languages = new Set<string>();
    const frameworks = new Set<string>();
    const databases = new Set<string>();
    const tools = new Set<string>();

    for (const snapshot of codeSnapshots) {
      // Detect language from file extension and content
      const lang = this.detectLanguage(snapshot);
      if (lang) languages.add(lang);

      // Detect frameworks from imports/usage
      const detectedFrameworks = this.detectFrameworks(snapshot);
      detectedFrameworks.forEach((fw) => frameworks.add(fw));

      // Detect databases
      const detectedDatabases = this.detectDatabases(snapshot);
      detectedDatabases.forEach((db) => databases.add(db));

      // Detect tools
      const detectedTools = this.detectTools(snapshot);
      detectedTools.forEach((tool) => tools.add(tool));
    }

    return {
      languages: Array.from(languages),
      frameworks: Array.from(frameworks),
      databases: Array.from(databases),
      tools: Array.from(tools),
    };
  }

  /**
   * Detect programming language
   */
  private detectLanguage(snapshot: CodeSnapshot): string | null {
    const ext = snapshot.fileName.split('.').pop()?.toLowerCase();

    const extensionMap: Record<string, string> = {
      py: 'python',
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      go: 'go',
      java: 'java',
      rs: 'rust',
      rb: 'ruby',
      php: 'php',
    };

    return extensionMap[ext || ''] || snapshot.language.toLowerCase();
  }

  /**
   * Detect frameworks from code
   */
  private detectFrameworks(snapshot: CodeSnapshot): string[] {
    const frameworks: string[] = [];
    const content = snapshot.content.toLowerCase();

    // Framework detection patterns
    const frameworkPatterns: Record<string, RegExp[]> = {
      fastapi: [/from fastapi import/, /import fastapi/, /@app\.get/, /@app\.post/],
      django: [/from django/, /import django/, /django\./, /models\.Model/],
      flask: [/from flask import/, /Flask\(__name__\)/],
      react: [/from ['"]react['"]/, /import react/, /useState/, /useEffect/],
      nextjs: [/from ['"]next\//, /import.*next/, /getServerSideProps/, /getStaticProps/],
      express: [/from ['"]express['"]/, /require\(['"]express['"]\)/, /express\(\)/],
      gin: [/github\.com\/gin-gonic\/gin/, /"gin"/, /gin\.Default\(\)/],
      spring: [/import org\.springframework/, /@SpringBootApplication/, /@RestController/],
    };

    for (const [framework, patterns] of Object.entries(frameworkPatterns)) {
      if (patterns.some((pattern) => pattern.test(content))) {
        frameworks.push(framework);
      }
    }

    return frameworks;
  }

  /**
   * Detect specific framework
   */
  private detectFramework(codeSnapshots: CodeSnapshot[], framework: string): boolean {
    return codeSnapshots.some((snapshot) => {
      const detectedFrameworks = this.detectFrameworks(snapshot);
      return detectedFrameworks.includes(framework.toLowerCase());
    });
  }

  /**
   * Detect databases from code
   */
  private detectDatabases(snapshot: CodeSnapshot): string[] {
    const databases: string[] = [];
    const content = snapshot.content.toLowerCase();

    // Database detection patterns
    const databasePatterns: Record<string, RegExp[]> = {
      mongodb: [/from pymongo/, /MongoClient/, /mongoose/, /mongodb:\/\//],
      postgresql: [
        /import psycopg2/,
        /from sqlalchemy/,
        /postgres/,
        /pg\./,
        /postgresql:\/\//,
      ],
      redis: [/import redis/, /Redis\(/, /createClient/, /redis:\/\//],
      mysql: [/import mysql/, /mysql\.connector/, /mysql2/, /mysql:\/\//],
      sqlite: [/import sqlite3/, /sqlite/, /\.db/],
    };

    for (const [database, patterns] of Object.entries(databasePatterns)) {
      if (patterns.some((pattern) => pattern.test(content))) {
        databases.push(database);
      }
    }

    return databases;
  }

  /**
   * Detect specific database
   */
  private detectDatabase(codeSnapshots: CodeSnapshot[], database: string): boolean {
    return codeSnapshots.some((snapshot) => {
      const detectedDatabases = this.detectDatabases(snapshot);
      return detectedDatabases.includes(database.toLowerCase());
    });
  }

  /**
   * Detect tools from code
   */
  private detectTools(snapshot: CodeSnapshot): string[] {
    const tools: string[] = [];
    const content = snapshot.content.toLowerCase();
    const fileName = snapshot.fileName.toLowerCase();

    // Tool detection patterns
    if (fileName === 'dockerfile' || /from.*dockerfile/.test(content)) {
      tools.push('docker');
    }

    if (fileName.includes('test') || /import pytest|import unittest|import jest/.test(content)) {
      tools.push('testing');
    }

    if (/git/.test(content) || fileName === '.gitignore') {
      tools.push('git');
    }

    return tools;
  }

  /**
   * Detect specific tool
   */
  private detectTool(codeSnapshots: CodeSnapshot[], tool: string): boolean {
    return codeSnapshots.some((snapshot) => {
      const detectedTools = this.detectTools(snapshot);
      return detectedTools.includes(tool.toLowerCase());
    });
  }

  /**
   * Get compliance summary for display
   */
  getComplianceSummary(result: TechValidationResult): string {
    if (result.compliant) {
      return `✓ Using required tech stack (${(result.score * 100).toFixed(0)}% compliant)`;
    }

    const errors = result.violations.filter((v) => v.severity === 'error');
    const warnings = result.violations.filter((v) => v.severity === 'warning');

    let summary = '';
    if (errors.length > 0) {
      summary += `✗ ${errors.length} critical issue${errors.length > 1 ? 's' : ''}: ${errors.map((e) => e.expected).join(', ')}`;
    }
    if (warnings.length > 0) {
      if (summary) summary += ' | ';
      summary += `⚠ ${warnings.length} recommendation${warnings.length > 1 ? 's' : ''}: ${warnings.map((w) => w.expected).join(', ')}`;
    }

    return summary;
  }
}

// Export singleton instance
export const techStackValidator = new TechStackValidator();
