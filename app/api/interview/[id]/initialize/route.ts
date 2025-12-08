import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { modalService as modal, sessionService as sessions, dynamicQuestionGenerator } from "@/lib/services";
import { getSession } from "@/lib/auth-helpers";
import { withErrorHandling, AuthorizationError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { success } from "@/lib/utils/api-response";
import { logger } from "@/lib/utils/logger";
import { standardRateLimit } from "@/lib/middleware/rate-limit";
import type { AssessmentType } from "@prisma/client";

// GeneratedQuestionContent type is now imported from dynamic-question-generator service

/**
 * Generate default starter code template based on language
 */
function generateDefaultStarterCode(language: string, problemTitle: string): string {
  const templates: Record<string, string> = {
    javascript: `/**
 * ${problemTitle}
 */

export function solution(input) {
  // Implement your solution here
  return null;
}
`,
    typescript: `/**
 * ${problemTitle}
 */

export function solution(input: any): any {
  // Implement your solution here
  return null;
}
`,
    python: `"""
${problemTitle}
"""

def solution(input):
    """Implement your solution here"""
    pass
`,
    go: `package main

// ${problemTitle}

func solution(input interface{}) interface{} {
    // Implement your solution here
    return nil
}
`,
  };

  return templates[language] || templates.javascript;
}

/**
 * POST /api/interview/[id]/initialize
 * Initialize interview session with question, Modal sandbox, and file structure
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: candidateId } = await params;

  // Demo mode shortcut - return mock data (skip auth and rate limiting)
  if (candidateId === "demo") {
      return NextResponse.json({
        sessionId: "demo",
        candidateId: "demo",
        totalQuestions: 3, // Include total questions for progress tracking
        question: {
          id: "demo-question",
          title: "Longest Palindromic Substring",
          description: `Given a string \`s\`, return the longest palindromic substring in \`s\`.

A string is palindromic if it reads the same forward and backward.

## Examples

**Example 1:**
- Input: \`s = "babad"\`
- Output: \`"bab"\` (or \`"aba"\`)

**Example 2:**
- Input: \`s = "cbbd"\`
- Output: \`"bb"\`

## Constraints
- \`1 <= s.length <= 1000\`
- \`s\` consists of only digits and English letters`,
          difficulty: "MEDIUM" as const,
          language: "javascript" as const,
          starterCode: `function longestPalindrome(s) {
  // Implement your solution here

}

module.exports = longestPalindrome;`,
          testCases: [
            {
              name: "Example 1",
              input: "babad",
              expectedOutput: "bab",
              hidden: false,
            },
            {
              name: "Example 2",
              input: "cbbd",
              expectedOutput: "bb",
              hidden: false,
            },
            {
              name: "Single character",
              input: "a",
              expectedOutput: "a",
              hidden: true,
            },
          ],
        },
        sandbox: {
          volumeId: "demo-volume",
          workspaceDir: "/workspace",
          status: "ready",
        },
        files: [
          {
            id: "1",
            name: "solution.js",
            type: "file" as const,
            path: "/workspace/solution.js",
            language: "javascript",
          },
          {
            id: "2",
            name: "solution.test.js",
            type: "file" as const,
            path: "/workspace/solution.test.js",
            language: "javascript",
          },
          {
            id: "3",
            name: "README.md",
            type: "file" as const,
            path: "/workspace/README.md",
            language: "markdown",
          },
        ],
        timeLimit: 3600, // 1 hour in seconds
        startedAt: new Date().toISOString(),
      });
  }

  // Apply rate limiting (after demo check)
  const rateLimited = await standardRateLimit(request);
  if (rateLimited) return rateLimited;

  // Check authentication
  const session = await getSession();
  if (!session?.user) {
    throw new AuthorizationError();
  }

  // Get candidate and verify access with performance logging
  const candidate = await logger.time(
    'fetchCandidate',
    () => prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        organization: {
          include: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
        assessment: {
          include: {
            questions: true,
          },
        },
        sessionRecording: true,
        generatedQuestions: true,
      },
    }),
    { candidateId }
  );

  if (!candidate) {
    throw new NotFoundError("Interview session", candidateId);
  }

  // Check authorization (user must be member of candidate's organization)
  // OR candidate is interviewing themselves (candidate.email === session.user.email)
  const isOrgMember = candidate.organization.members.length > 0;
  const isSelfInterview = candidate.email === session.user.email;

  if (!isOrgMember && !isSelfInterview) {
    throw new AuthorizationError("Access denied to this interview session");
  }

  // Check if session is already active or completed
  if (candidate.status === "COMPLETED") {
    throw new ValidationError("Interview already completed");
  }

  // Get or create session recording using upsert to handle existing records
  const sessionRecording = await prisma.sessionRecording.upsert({
    where: {
      candidateId,
    },
    update: {
      // If record exists, ensure it's active
      status: "ACTIVE",
    },
    create: {
      candidateId,
      status: "ACTIVE",
    },
  });

  // Get assessment configuration (needed for question generation)
  const assessment = candidate.assessment;
  if (!assessment) {
    throw new NotFoundError("Assessment for candidate");
  }

  const assessmentType: AssessmentType = assessment.assessmentType || 'REAL_WORLD';
  const role = assessment.role || 'backend';
  const seniority = assessment.seniority?.toLowerCase() || 'mid';
  const language = assessment.techStack?.[0]?.toLowerCase() || 'typescript';

  // Check what work needs to be done
  let question = candidate.generatedQuestions?.[0];
  const needsQuestion = !question;
  const needsSandbox = !candidate.volumeId;
  let needsStarterFiles = false;
  let volumeId = candidate.volumeId;

  // OPTIMIZATION: Run question generation and sandbox creation in parallel
  // These are independent operations that together take 47-56s + 13s sequentially
  // Running in parallel saves ~13s (the sandbox creation time)
  if (needsQuestion && needsSandbox) {
    logger.info('[Initialize] Starting parallel question generation + sandbox creation', {
      candidateId,
      role,
      seniority,
      assessmentType,
    });

    const [generatedContent, volume] = await Promise.all([
      // Question generation (~47-56s)
      logger.time(
        'dynamicQuestionGenerator',
        () => dynamicQuestionGenerator.generate({
          role,
          seniority,
          assessmentType,
          techStack: assessment.techStack || [language],
          organizationId: candidate.organizationId,
        }),
        { candidateId, role, seniority, assessmentType }
      ),
      // Sandbox creation (~13s)
      logger.time(
        'createModalVolume',
        () => modal.createVolume(candidateId, language),
        { candidateId, language }
      ),
    ]);

    // Create question in database
    question = await prisma.generatedQuestion.create({
      data: {
        candidateId,
        questionSeedId: null,
        order: 1,
        title: generatedContent.title,
        description: generatedContent.description,
        difficulty: mapSeniorityToDifficulty(assessment.seniority),
        language,
        requirements: generatedContent.requirements,
        estimatedTime: generatedContent.estimatedTime,
        starterCode: generatedContent.starterCode,
        testCases: [],
        status: 'PENDING',
      },
    });

    volumeId = volume.id;
    needsStarterFiles = true;

    // Update candidate with volume ID
    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        volumeId,
        status: "IN_PROGRESS",
      },
    });

    logger.info('[Initialize] Parallel initialization complete', {
      candidateId,
      questionId: question.id,
      questionTitle: generatedContent.title,
      volumeId,
    });
  } else if (needsQuestion) {
    // Only need to generate question (sandbox already exists)
    logger.info('[Initialize] Generating question with DynamicQuestionGenerator', {
      candidateId,
      role,
      seniority,
      assessmentType,
      techStack: assessment.techStack,
    });

    const generatedContent = await logger.time(
      'dynamicQuestionGenerator',
      () => dynamicQuestionGenerator.generate({
        role,
        seniority,
        assessmentType,
        techStack: assessment.techStack || [language],
        organizationId: candidate.organizationId,
      }),
      { candidateId, role, seniority, assessmentType }
    );

    question = await prisma.generatedQuestion.create({
      data: {
        candidateId,
        questionSeedId: null,
        order: 1,
        title: generatedContent.title,
        description: generatedContent.description,
        difficulty: mapSeniorityToDifficulty(assessment.seniority),
        language,
        requirements: generatedContent.requirements,
        estimatedTime: generatedContent.estimatedTime,
        starterCode: generatedContent.starterCode,
        testCases: [],
        status: 'PENDING',
      },
    });

    logger.info('[Initialize] Generated question with DynamicQuestionGenerator', {
      candidateId,
      questionId: question.id,
      questionTitle: generatedContent.title,
      assessmentType,
    });

    // Check if workspace is empty (files may have been lost on reconnect)
    const existingFiles = await modal.getFileSystem(candidateId, "/workspace");
    if (existingFiles.length === 0) {
      console.log(`[Initialize] Workspace is empty, will write starter files`);
      needsStarterFiles = true;
    }
  } else if (needsSandbox) {
    // Only need to create sandbox (question already exists)
    const volume = await logger.time(
      'createModalVolume',
      () => modal.createVolume(candidateId, language),
      { candidateId, language }
    );
    volumeId = volume.id;
    needsStarterFiles = true;

    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        volumeId,
        status: "IN_PROGRESS",
      },
    });
  } else {
    // FAST PATH: Both question and sandbox exist
    // Skip Modal API calls entirely - use cached trackedFiles from DB
    const trackedFiles = (candidate.sessionRecording?.trackedFiles as string[]) || [];

    if (trackedFiles.length > 0) {
      // Build file tree from tracked paths (no Modal call needed!)
      const files = buildFileTreeFromTrackedPaths(trackedFiles);

      // Calculate time remaining
      const timeLimit = (candidate.assessment?.duration || 60) * 60;
      const startedAt = sessionRecording.startTime || new Date();
      const elapsedSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const timeRemaining = Math.max(0, timeLimit - elapsedSeconds);

      // Transform test cases
      const transformedTestCases = Array.isArray(question.testCases)
        ? question.testCases.map((tc: any) => {
            const expectedValue = tc.expectedOutput || tc.expected;
            return {
              name: tc.name || "",
              input: typeof tc.input === 'object' ? JSON.stringify(tc.input) : String(tc.input),
              expectedOutput: typeof expectedValue === 'object' ? JSON.stringify(expectedValue) : String(expectedValue),
              hidden: tc.hidden || false,
            };
          })
        : [];

      logger.info('[Initialize] FAST PATH - returning cached session data', {
        candidateId,
        sessionId: sessionRecording.id,
        trackedFilesCount: trackedFiles.length,
        timeRemaining,
      });

      // Return cached data immediately - no Modal API calls!
      return success({
        sessionId: sessionRecording.id,
        candidateId,
        totalQuestions: 3,
        question: {
          id: question.id,
          title: question.title,
          description: question.description,
          difficulty: question.difficulty,
          language: question.language.toLowerCase(),
          starterCode: question.starterCode,
          testCases: transformedTestCases,
        },
        sandbox: {
          volumeId,
          workspaceDir: "/workspace",
          status: "ready",
        },
        files,
        timeLimit,
        timeRemaining,
        startedAt: startedAt.toISOString(),
        _fastPath: true, // Flag for client debugging
      });
    }

    // Fallback: No tracked files - need to check Modal (first-time or recovery)
    const existingFiles = await modal.getFileSystem(candidateId, "/workspace");
    if (existingFiles.length === 0) {
      console.log(`[Initialize] Workspace is empty, will write starter files`);
      needsStarterFiles = true;
    }
  }

  // Write starter files if needed (new sandbox OR empty workspace)
  if (needsStarterFiles) {
    // Parse starterCode - supports both string and array of {fileName, content} formats
    let starterFiles: Array<{ path: string; content: string }> = [];

    if (question.starterCode) {
      try {
        // Try to parse as JSON array first
        const parsed = typeof question.starterCode === 'string'
          ? JSON.parse(question.starterCode)
          : question.starterCode;

        if (Array.isArray(parsed)) {
          // Format: [{fileName: 'solution.js', content: '...'}]
          starterFiles = parsed.map((file: any) => ({
            path: file.fileName || file.path || 'solution.js',
            content: file.content || '',
          }));
        } else if (typeof parsed === 'object' && parsed.content) {
          // Format: {fileName: 'solution.js', content: '...'}
          starterFiles = [{
            path: parsed.fileName || parsed.path || `solution.${question.language === 'python' ? 'py' : 'js'}`,
            content: parsed.content,
          }];
        } else {
          throw new Error('Invalid format');
        }
      } catch {
        // Fallback: treat as plain string content
        starterFiles = [{
          path: `solution.${question.language === 'python' ? 'py' : 'js'}`,
          content: String(question.starterCode),
        }];
      }
    } else {
      // No starter code provided - use default template
      starterFiles = [{
        path: `solution.${question.language === 'python' ? 'py' : 'js'}`,
        content: generateDefaultStarterCode(question.language, question.title),
      }];
    }

    // Always include README
    starterFiles.push({
      path: "README.md",
      content: `# ${question.title}\n\n${question.description}\n\n## Instructions\n\n1. Implement your solution in the starter file\n2. Run tests with \`npm test\` (or \`pytest\` for Python)\n3. Use Claude AI for help if needed\n\nGood luck!`,
    });

    // Track which files were created
    const createdFilePaths: string[] = [];

    for (const file of starterFiles) {
      // Ensure path starts with /workspace
      const fullPath = file.path.startsWith('/workspace') ? file.path : `/workspace/${file.path}`;
      const writeResult = await modal.writeFile(candidateId, file.path, file.content);
      if (!writeResult.success) {
        console.error(`[Initialize] Failed to write ${file.path}: ${writeResult.error}`);
      } else {
        console.log(`[Initialize] Wrote starter file: ${file.path}`);
        createdFilePaths.push(fullPath);
      }
    }

    // Track all created files in session recording
    if (createdFilePaths.length > 0) {
      try {
        await sessions.addTrackedFiles(sessionRecording.id, createdFilePaths);
        console.log(`[Initialize] Tracked ${createdFilePaths.length} starter files`);
      } catch (err) {
        console.error('[Initialize] Failed to track files:', err);
      }
    }
  }

  // Get file structure from Modal volume
  // IMPORTANT: List /workspace, not root "/" to avoid showing system directories
  const files = await modal.getFileSystem(candidateId, "/workspace");

    // Calculate time remaining (convert minutes to seconds)
    const timeLimit = (candidate.assessment?.duration || 60) * 60; // Default 1 hour
    const startedAt = sessionRecording.startTime || new Date();

    // Record session_start event (only if this is a new session)
    if (!sessionRecording.startTime) {
      await sessions.recordEvent(sessionRecording.id, {
        type: "session_start",
        data: {
          questionId: question.id,
          questionTitle: question.title,
          difficulty: question.difficulty,
          language: question.language,
          timeLimit,
          startTime: startedAt.toISOString(),
        },
        checkpoint: true, // Mark as checkpoint for replay seeking
      });
    }
    const elapsedSeconds = Math.floor(
      (Date.now() - startedAt.getTime()) / 1000
    );
    const timeRemaining = Math.max(0, timeLimit - elapsedSeconds);

    // Determine total questions for this assessment
    // Default to 3 questions for adaptive assessments
    const totalQuestions = 3;

    // Transform test cases to match ProblemPanel interface
    const transformedTestCases = Array.isArray(question.testCases)
      ? question.testCases.map((tc: any) => {
        // Handle both 'expected' and 'expectedOutput' field names for backwards compatibility
        const expectedValue = tc.expectedOutput || tc.expected;
        return {
          name: tc.name || "",
          input: typeof tc.input === 'object' ? JSON.stringify(tc.input) : String(tc.input),
          expectedOutput: typeof expectedValue === 'object' ? JSON.stringify(expectedValue) : String(expectedValue),
          hidden: tc.hidden || false,
        };
      })
      : [];

  // Log successful initialization
  logger.info('Interview initialized', {
    candidateId,
    sessionId: sessionRecording.id,
    questionId: question.id,
    volumeId,
    timeRemaining,
  });

  // Return initialization data
  return success({
    sessionId: sessionRecording.id,
    candidateId,
    totalQuestions, // Include total questions for progress tracking
    question: {
      id: question.id,
      title: question.title,
      description: question.description,
      difficulty: question.difficulty,
      language: question.language.toLowerCase(),
      starterCode: question.starterCode,
      testCases: transformedTestCases,
    },
    sandbox: {
      volumeId,
      workspaceDir: "/workspace",
      status: "ready",
    },
    files: (() => {
      fileIdCounter = 0; // Reset counter for each request
      return files.map(transformFileNode);
    })(),
    timeLimit,
    timeRemaining,
    startedAt: startedAt.toISOString(),
  });
});

/**
 * Helper to determine language from file extension
 */
function getLanguageFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    go: "go",
    md: "markdown",
    json: "json",
    txt: "text",
  };
  return languageMap[ext || ""] || "text";
}

/**
 * Helper to transform Modal FileNode to frontend FileNode format
 * Recursively transforms children for directories
 */
let fileIdCounter = 0;
function transformFileNode(file: { name: string; path: string; type: string; children?: any[] }): {
  id: string;
  name: string;
  type: "file" | "folder";
  path: string;
  language: string;
  children?: any[];
} {
  const transformed: any = {
    id: `file-${fileIdCounter++}`,
    name: file.name,
    type: file.type === "directory" ? "folder" : "file",
    path: file.path,
    language: getLanguageFromExtension(file.name),
  };

  if (file.children && file.children.length > 0) {
    transformed.children = file.children.map(transformFileNode);
  }

  return transformed;
}

/**
 * Helper to build file tree from flat array of tracked file paths
 * Converts ["/workspace/solution.js", "/workspace/src/utils.js"] to nested FileNode tree
 * Note: FileNode type doesn't include 'language' - that's determined by CodeEditor based on extension
 */
function buildFileTreeFromTrackedPaths(paths: string[]): {
  id: string;
  name: string;
  type: "file" | "folder";
  path: string;
  children?: any[];
}[] {
  // Map to store directories
  const dirMap = new Map<string, { id: string; name: string; type: "folder"; path: string; children: any[] }>();
  const rootFiles: any[] = [];
  let idCounter = 0;

  // Sort paths to ensure parents are processed before children
  const sortedPaths = [...paths].sort();

  for (const fullPath of sortedPaths) {
    // Skip non-workspace paths
    if (!fullPath.startsWith('/workspace')) continue;

    const relativePath = fullPath.replace('/workspace/', '');
    const parts = relativePath.split('/');
    const fileName = parts[parts.length - 1];

    // Create the file node (without language - matches FileNode type)
    const fileNode = {
      id: `file-${idCounter++}`,
      name: fileName,
      type: "file" as const,
      path: fullPath,
    };

    if (parts.length === 1) {
      // File is directly in /workspace
      rootFiles.push(fileNode);
    } else {
      // File is in a subdirectory - create parent dirs if needed
      let currentPath = '/workspace';
      let parentChildren = rootFiles;

      for (let i = 0; i < parts.length - 1; i++) {
        const dirName = parts[i];
        currentPath = `${currentPath}/${dirName}`;

        let dir = dirMap.get(currentPath);
        if (!dir) {
          dir = {
            id: `dir-${idCounter++}`,
            name: dirName,
            type: "folder" as const,
            path: currentPath,
            children: [],
          };
          dirMap.set(currentPath, dir);
          parentChildren.push(dir);
        }
        parentChildren = dir.children;
      }

      // Add file to the deepest directory
      parentChildren.push(fileNode);
    }
  }

  return rootFiles;
}

/**
 * Helper to map seniority to difficulty level
 */
function mapSeniorityToDifficulty(seniority: string): "EASY" | "MEDIUM" | "HARD" {
  switch (seniority.toUpperCase()) {
    case "JUNIOR":
      return "EASY";
    case "MID":
      return "MEDIUM";
    case "SENIOR":
    case "LEAD":
    case "PRINCIPAL":
      return "HARD";
    default:
      return "MEDIUM";
  }
}
