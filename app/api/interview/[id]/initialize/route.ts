import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { modal, questions } from "@/lib/services";
import { getSession } from "@/lib/auth-helpers";

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
        generatedQuestion: true,
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

    // Get or create session recording
    let sessionRecording = candidate.sessionRecording;
    if (!sessionRecording) {
      sessionRecording = await prisma.sessionRecording.create({
        data: {
          candidateId,
          status: "ACTIVE",
          startedAt: new Date(),
        },
      });
    }

    // Get or generate question
    let question = candidate.generatedQuestion;
    if (!question) {
      // Generate question based on assessment configuration
      const assessment = candidate.assessment;
      if (!assessment) {
        return NextResponse.json(
          { error: "Assessment not found for candidate" },
          { status: 400 }
        );
      }

      // Use questions service to generate appropriate question
      const generatedQuestionData = await questions.generateQuestion(
        assessment.role,
        assessment.seniority,
        assessment.techStack as string[]
      );

      // Store generated question in database
      question = await prisma.generatedQuestion.create({
        data: {
          candidateId,
          title: generatedQuestionData.title,
          description: generatedQuestionData.description,
          difficulty: generatedQuestionData.difficulty,
          language: generatedQuestionData.language,
          starterCode: generatedQuestionData.starterCode,
          solution: generatedQuestionData.solution || "",
          testCases: generatedQuestionData.testCases || [],
          hints: generatedQuestionData.hints || [],
        },
      });
    }

    // Create or get Modal volume for sandbox
    let volumeId = candidate.volumeId;
    if (!volumeId) {
      // Create Modal volume with starter files
      const volume = await modal.createVolume(candidateId);
      volumeId = volume.volumeId;

      // Write starter files to volume
      const starterFiles = [
        {
          path: `solution.${question.language === "python" ? "py" : "js"}`,
          content: question.starterCode,
        },
        {
          path: "README.md",
          content: `# ${question.title}\n\n${question.description}\n\n## Instructions\n\n1. Implement your solution in the solution file\n2. Run tests with \`npm test\` (or \`pytest\` for Python)\n3. Use Claude AI for help if needed\n\nGood luck!`,
        },
      ];

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

    // Calculate time remaining
    const timeLimit = candidate.assessment?.timeLimit || 3600; // Default 1 hour
    const startedAt = sessionRecording.startedAt || new Date();
    const elapsedSeconds = Math.floor(
      (Date.now() - startedAt.getTime()) / 1000
    );
    const timeRemaining = Math.max(0, timeLimit - elapsedSeconds);

    // Return initialization data
    return NextResponse.json({
      sessionId: sessionRecording.id,
      candidateId,
      question: {
        id: question.id,
        title: question.title,
        description: question.description,
        difficulty: question.difficulty,
        language: question.language,
        starterCode: question.starterCode,
        testCases: question.testCases,
        hints: question.hints,
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
