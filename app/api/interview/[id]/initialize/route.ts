import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { modalService as modal, questionService as questions, sessionService as sessions } from "@/lib/services";
import { getSession } from "@/lib/auth-helpers";

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
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;

    // Demo mode shortcut - return mock data
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

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get candidate and verify access
    const candidate = await prisma.candidate.findUnique({
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
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // Check authorization (user must be member of candidate's organization)
    // OR candidate is interviewing themselves (candidate.email === session.user.email)
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if session is already active or completed
    if (candidate.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Interview already completed" },
        { status: 400 }
      );
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

    // Get or generate question
    let question = candidate.generatedQuestions?.[0];
    if (!question) {
      // Generate question based on assessment configuration
      const assessment = candidate.assessment;
      if (!assessment) {
        return NextResponse.json(
          { error: "Assessment not found for candidate" },
          { status: 400 }
        );
      }

      // Use questions service to generate appropriate question (creates it in DB)
      const generatedQuestionData = await questions.generateQuestion({
        candidateId,
        difficulty: mapSeniorityToDifficulty(assessment.seniority),
        language: assessment.techStack?.[0]?.toLowerCase() || "typescript",
      });

      // Question is already created in the database by generateQuestion
      question = generatedQuestionData.question as any;
    }

    // Create or get Modal volume for sandbox
    let volumeId = candidate.volumeId;
    if (!volumeId) {
      // Create Modal volume with starter files
      const volume = await modal.createVolume(candidateId);
      volumeId = volume.id;

      // Write starter files to volume
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
            content: question.starterCode,
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

      for (const file of starterFiles) {
        await modal.writeFile(volumeId, file.path, file.content);
      }

      // Update candidate with volume ID
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          volumeId,
          status: "IN_PROGRESS",
        },
      });
    }

    // Get file structure from Modal volume
    const files = await modal.getFileSystem(candidateId, "/");

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

    // Return initialization data
    return NextResponse.json({
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
      files: files.map((file, index) => ({
        id: `file-${index}`,
        name: file.name,
        type: file.type,
        path: file.path,
        language: getLanguageFromExtension(file.name),
      })),
      timeLimit,
      timeRemaining,
      startedAt: startedAt.toISOString(),
    });
  } catch (error) {
    console.error("Initialize interview error:", error);
    return NextResponse.json(
      {
        error: "Failed to initialize interview",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

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
