/**
 * Dynamic Question Generator Service
 *
 * Generates truly unique coding questions using complexity profiles stored in the database.
 * Instead of specific problem seeds, this uses complexity dimensions (entity count,
 * integration points, business logic depth) to guide the LLM to create varied problems.
 *
 * Each generation produces something different by:
 * 1. Randomly selecting a domain from a pool (e-commerce, healthcare, fintech, etc.)
 * 2. Randomly selecting optional skills to test
 * 3. Using complexity dimensions to set appropriate challenge level
 */

import prisma from "@/lib/prisma";
import { generateQuestionFast } from "./claude";
import type { AssessmentType, ComplexityProfile } from "@prisma/client";
import { logger } from "@/lib/utils/logger";

/**
 * Output format for generated questions
 */
export interface GeneratedQuestionContent {
  title: string;
  description: string;
  requirements: string[];
  estimatedTime: number;
  starterCode: string;
}

/**
 * Parameters for question generation
 */
export interface GenerationParams {
  role: string;
  seniority: string;
  assessmentType: AssessmentType;
  techStack: string[]; // From assessment config
  organizationId?: string; // For org-specific profile overrides
}

/**
 * Parsed complexity constraints from profile
 */
interface ParsedConstraints {
  mustInclude: string[];
  shouldConsider: string[];
  bonus: string[];
}

/**
 * Dynamic Question Generator
 *
 * Uses complexity profiles to generate truly unique questions each time.
 */
export class DynamicQuestionGenerator {
  /**
   * Generate a unique question based on complexity profile
   */
  async generate(params: GenerationParams): Promise<GeneratedQuestionContent> {
    const { role, seniority, assessmentType, techStack, organizationId } = params;

    // 1. Fetch complexity profile from DB
    const profile = await this.getProfile({
      role,
      seniority,
      assessmentType,
      organizationId,
    });

    if (!profile) {
      logger.warn('[DynamicQuestionGenerator] No profile found, using fallback', {
        role,
        seniority,
        assessmentType,
      });
      return this.generateFallbackQuestion(role, seniority, assessmentType, techStack);
    }

    // 2. Randomize domain and skills
    const domainPool = profile.domainPool as string[];
    const optionalSkillPool = profile.optionalSkillPool as string[];
    const requiredSkills = profile.requiredSkills as string[];
    const avoidSkills = profile.avoidSkills as string[];
    const constraints = profile.constraints as unknown as ParsedConstraints;

    const domain = this.pickRandom(domainPool);
    const selectedOptionalSkills = this.pickN(
      optionalSkillPool,
      profile.pickOptionalCount
    );
    const allSkills = [...requiredSkills, ...selectedOptionalSkills];

    // 3. Build the prompt with complexity dimensions
    const prompt = this.buildPrompt({
      role,
      seniority,
      assessmentType,
      techStack,
      domain,
      skills: allSkills,
      avoidSkills,
      complexity: {
        entityCountMin: profile.entityCountMin,
        entityCountMax: profile.entityCountMax,
        integrationPoints: profile.integrationPoints,
        businessLogic: profile.businessLogic,
        ambiguityLevel: profile.ambiguityLevel,
      },
      constraints,
      timeMinutes: profile.timeMinutes,
    });

    // 4. Call Claude to generate the question (using fast Haiku model)
    try {
      logger.info('[DynamicQuestionGenerator] Generating question', {
        role,
        seniority,
        assessmentType,
        domain,
        skills: allSkills,
      });

      // Use fast generation with Haiku (~13s vs ~50s with Sonnet)
      const response = await generateQuestionFast(prompt);

      // Parse JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as GeneratedQuestionContent;

      // Validate required fields
      if (!parsed.title || !parsed.description || !parsed.requirements) {
        throw new Error('Missing required fields in generated question');
      }

      logger.info('[DynamicQuestionGenerator] Successfully generated question', {
        title: parsed.title,
        domain,
        skills: allSkills,
      });

      return {
        title: parsed.title,
        description: parsed.description,
        requirements: parsed.requirements,
        estimatedTime: parsed.estimatedTime || profile.timeMinutes,
        starterCode: parsed.starterCode || this.generateDefaultStarterCode(
          techStack[0] || 'typescript',
          parsed.title
        ),
      };
    } catch (error) {
      logger.error('[DynamicQuestionGenerator] Generation failed', error as Error, {
        role,
        seniority,
        assessmentType,
        domain,
      });

      // Return fallback question
      return this.generateFallbackQuestion(role, seniority, assessmentType, techStack);
    }
  }

  /**
   * Fetch complexity profile from database
   * Tries org-specific override first, falls back to system default
   */
  private async getProfile(params: {
    role: string;
    seniority: string;
    assessmentType: AssessmentType;
    organizationId?: string;
  }): Promise<ComplexityProfile | null> {
    const { role, seniority, assessmentType, organizationId } = params;

    // Map seniority enum to lowercase string for profile lookup
    const seniorityLower = seniority.toLowerCase();

    // Try org-specific override first
    if (organizationId) {
      const orgProfile = await prisma.complexityProfile.findFirst({
        where: {
          role,
          seniority: seniorityLower,
          assessmentType,
          organizationId,
        },
      });

      if (orgProfile) {
        return orgProfile;
      }
    }

    // Fall back to system default
    const defaultProfile = await prisma.complexityProfile.findFirst({
      where: {
        role,
        seniority: seniorityLower,
        assessmentType,
        isDefault: true,
        organizationId: null,
      },
    });

    return defaultProfile;
  }

  /**
   * Build the LLM prompt using complexity dimensions
   */
  private buildPrompt(params: {
    role: string;
    seniority: string;
    assessmentType: AssessmentType;
    techStack: string[];
    domain: string;
    skills: string[];
    avoidSkills: string[];
    complexity: {
      entityCountMin: number;
      entityCountMax: number;
      integrationPoints: number;
      businessLogic: string;
      ambiguityLevel: string;
    };
    constraints: ParsedConstraints;
    timeMinutes: number;
  }): string {
    const {
      role,
      seniority,
      assessmentType,
      techStack,
      domain,
      skills,
      avoidSkills,
      complexity,
      constraints,
      timeMinutes,
    } = params;

    // Format tech stack
    const techStackStr = techStack.length > 0
      ? techStack.join(', ')
      : 'appropriate technologies';

    // Format skills with readable names
    const skillsReadable = skills.map(s => this.formatSkillName(s)).join(', ');
    const avoidSkillsReadable = avoidSkills.length > 0
      ? avoidSkills.map(s => this.formatSkillName(s)).join(', ')
      : 'none';

    // Ambiguity level descriptions
    const ambiguityDescriptions: Record<string, string> = {
      clear: 'All requirements are clearly specified. Candidate follows spec.',
      some_decisions: 'Most requirements are clear, but candidate makes 1-2 design decisions.',
      open_ended: 'Requirements define goals, candidate designs the approach. Multiple valid solutions exist.',
      strategic: 'High-level goals given, candidate must define scope, approach, and trade-offs.',
    };

    // Assessment type specific instructions
    const typeInstructions = assessmentType === 'SYSTEM_DESIGN'
      ? `This is a SYSTEM DESIGN assessment. The candidate should:
- Create a DESIGN.md documenting their architecture decisions
- Define API contracts, data models, and component interactions
- Analyze trade-offs explicitly (consistency vs availability, simplicity vs scalability, etc.)
- Implement CORE components (not everything - focus on demonstrating understanding)
- Consider scalability, reliability, and operational concerns

The problem should require architectural thinking, not just implementation.`
      : `This is a REAL WORLD PROBLEM assessment. The candidate should:
- Write production-ready, working code
- Implement complete features end-to-end
- Add proper validation and error handling
- Write clean, maintainable code
- Consider edge cases and failure modes

The problem should feel like a real task from a ${seniority}-level ${role}'s day-to-day work.`;

    return `You are an expert technical interviewer creating a coding challenge.

## Target Candidate
- **Role**: ${role}
- **Level**: ${seniority}
- **Tech Stack**: ${techStackStr}
- **Time Budget**: ${timeMinutes} minutes

## Assessment Type
${typeInstructions}

## Domain Context
Generate a problem in the **${this.formatDomainName(domain)}** domain.
- Pick a SPECIFIC, REALISTIC scenario (not generic)
- Create a UNIQUE problem that tests the skills below
- The scenario should feel like something this company actually needs built

## Complexity Requirements
These dimensions define the challenge level:

1. **Entities**: ${complexity.entityCountMin}-${complexity.entityCountMax} related business entities
   (e.g., for e-commerce: Order, OrderItem, Customer, Product, Inventory)

2. **Integration Points**: ${complexity.integrationPoints} external service(s) or system(s)
   (e.g., payment gateway, notification service, external API, cache layer)

3. **Business Logic**: ${complexity.businessLogic}
   ${this.getBusinessLogicDescription(complexity.businessLogic)}

4. **Specification Clarity**: ${complexity.ambiguityLevel}
   ${ambiguityDescriptions[complexity.ambiguityLevel] || ambiguityDescriptions.some_decisions}

## Skills to Test
The problem MUST require these skills: ${skillsReadable}

## Skills to AVOID
Do NOT include these advanced concepts: ${avoidSkillsReadable}

## Structural Constraints
- **Must Include**: ${constraints.mustInclude.join(', ') || 'standard best practices'}
- **Should Consider**: ${constraints.shouldConsider.join(', ') || 'code organization'}
- **Bonus (optional)**: ${constraints.bonus.join(', ') || 'none specified'}

## CRITICAL RULES
1. **NO LeetCode puzzles** - This must be a practical, real-world problem
2. **Be SPECIFIC** - Don't say "build an API". Say exactly what it does and why.
3. **Unique every time** - Don't generate generic "Todo API" or "Product CRUD" problems
4. **Appropriate scope** - Must be achievable in ${timeMinutes} minutes
5. **Clear success criteria** - Candidate knows when they're done

## Output Format
Return ONLY valid JSON (no markdown, no code blocks, no explanation):
{
  "title": "Brief, specific title (e.g., 'Patient Appointment Reminder Service')",
  "description": "Detailed problem with:\\n- Real-world context/story\\n- Specific requirements\\n- Input/output examples where helpful\\n- Success criteria\\n\\nUse markdown formatting.",
  "requirements": ["Specific requirement 1", "Specific requirement 2", "..."],
  "estimatedTime": ${timeMinutes},
  "starterCode": "// Appropriate starter code with structure hints\\n// Include imports, types/interfaces, and TODO comments"
}`;
  }

  /**
   * Get description for business logic complexity level
   */
  private getBusinessLogicDescription(level: string): string {
    const descriptions: Record<string, string> = {
      simple: 'Basic operations with straightforward rules (e.g., CRUD with validation)',
      moderate: 'Multi-step processes with some conditional logic (e.g., workflows, state transitions)',
      complex: 'Intricate rules with edge cases and error recovery (e.g., transactions, retry logic)',
      strategic: 'Cross-cutting concerns with architectural implications (e.g., multi-tenant, compliance)',
    };
    return descriptions[level] || descriptions.moderate;
  }

  /**
   * Format domain name for display
   */
  private formatDomainName(domain: string): string {
    return domain
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Format skill name for display
   */
  private formatSkillName(skill: string): string {
    return skill
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Pick a random element from array
   */
  private pickRandom<T>(arr: T[]): T {
    if (arr.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Pick N random elements from array without replacement
   */
  private pickN<T>(arr: T[], n: number): T[] {
    if (n >= arr.length) {
      return [...arr];
    }

    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  }

  /**
   * Generate default starter code based on language
   */
  private generateDefaultStarterCode(language: string, title: string): string {
    const templates: Record<string, string> = {
      javascript: `/**
 * ${title}
 */

// TODO: Implement your solution here

export function solution(input) {
  // Your implementation
  return null;
}
`,
      typescript: `/**
 * ${title}
 */

// TODO: Define types/interfaces

// TODO: Implement your solution

export function solution(input: unknown): unknown {
  // Your implementation
  return null;
}
`,
      python: `"""
${title}
"""

# TODO: Implement your solution

def solution(input):
    """
    Your implementation here
    """
    pass
`,
      go: `package main

// ${title}

// TODO: Implement your solution

func solution(input interface{}) interface{} {
    // Your implementation
    return nil
}
`,
    };

    return templates[language.toLowerCase()] || templates.typescript;
  }

  /**
   * Generate fallback question when profile not found or generation fails
   */
  private generateFallbackQuestion(
    role: string,
    seniority: string,
    assessmentType: AssessmentType,
    techStack: string[]
  ): GeneratedQuestionContent {
    const language = techStack[0] || 'typescript';
    const isSystemDesign = assessmentType === 'SYSTEM_DESIGN';

    return {
      title: isSystemDesign
        ? `${this.formatSkillName(role)} System Architecture Challenge`
        : `${this.formatSkillName(role)} Service Implementation`,
      description: isSystemDesign
        ? `Design and partially implement a backend system for a real-world application.

## Context
You're tasked with designing a new service that handles common ${role} operations. Focus on architectural decisions and core implementation.

## Requirements
- Create a DESIGN.md documenting your architecture
- Define API contracts and data models
- Implement core functionality
- Consider scalability and reliability

## Success Criteria
- Clear architecture with documented trade-offs
- Working core implementation
- Clean, well-organized code`
        : `Build a backend service for a real-world application.

## Context
You're joining a team that needs a new microservice implemented. The service should handle common ${role} operations with proper error handling, validation, and clean code practices.

## Requirements
- Implement RESTful API endpoints
- Add input validation with helpful error messages
- Handle errors gracefully with appropriate HTTP status codes
- Write clean, maintainable code
- Consider edge cases

## Success Criteria
- All endpoints work correctly
- Validation prevents invalid data
- Error responses are clear and actionable
- Code is well-organized and readable`,
      requirements: isSystemDesign
        ? [
          'Create architecture documentation (DESIGN.md)',
          'Define API contracts and data models',
          'Implement core service functionality',
          'Document trade-offs and decisions',
        ]
        : [
          'Implement RESTful API endpoints',
          'Add comprehensive input validation',
          'Handle errors with proper status codes',
          'Write clean, maintainable code',
        ],
      estimatedTime: seniority === 'junior' ? 45 : seniority === 'principal' ? 90 : 60,
      starterCode: this.generateDefaultStarterCode(language, 'Service Implementation'),
    };
  }
}

/**
 * Singleton instance for the dynamic question generator
 */
export const dynamicQuestionGenerator = new DynamicQuestionGenerator();
