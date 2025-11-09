import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import Anthropic from "@anthropic-ai/sdk";
import { GeneratedProblem } from "@/types/problem";

// Request validation schema for generating next question
const generateQuestionSchema = z.object({
  previousPerformance: z
    .object({
      questionId: z.string(),
      score: z.number(),
      timeSpent: z.number(),
      testsPassedRatio: z.number(),
    })
    .optional(),
});

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

/**
 * GET /api/interview/[id]/questions
 * Get current question for candidate
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify candidate exists and belongs to authorized organization
    const candidate = await prisma.candidate.findUnique({
      where: { id },
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
        generatedQuestions: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // Check authorization
    if (candidate.organization.members.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get current question (first non-completed question)
    const currentQuestion = candidate.generatedQuestions.find(
      (q) => q.status === "PENDING" || q.status === "IN_PROGRESS"
    );

    if (!currentQuestion) {
      // No more questions
      return NextResponse.json(
        {
          currentQuestion: null,
          completed: true,
          totalQuestions: candidate.generatedQuestions.length,
        },
        { status: 200 }
      );
    }

    // Mark question as in progress if pending
    if (currentQuestion.status === "PENDING") {
      await prisma.generatedQuestion.update({
        where: { id: currentQuestion.id },
        data: {
          status: "IN_PROGRESS",
          startedAt: new Date(),
        },
      });
    }

    return NextResponse.json(
      {
        currentQuestion: formatQuestion(currentQuestion),
        completed: false,
        totalQuestions: candidate.generatedQuestions.length,
        currentQuestionIndex:
          candidate.generatedQuestions.indexOf(currentQuestion) + 1,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Questions GET API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/interview/[id]/questions
 * Generate next question based on performance
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = generateQuestionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { previousPerformance } = validationResult.data;

    // Verify candidate exists and belongs to authorized organization
    const candidate = await prisma.candidate.findUnique({
      where: { id },
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
        generatedQuestions: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // Check authorization
    if (candidate.organization.members.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Mark previous question as completed if provided
    if (previousPerformance) {
      const previousQuestion = candidate.generatedQuestions.find(
        (q) => q.id === previousPerformance.questionId
      );

      if (previousQuestion) {
        await prisma.generatedQuestion.update({
          where: { id: previousQuestion.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            score: previousPerformance.score,
          },
        });
      }
    }

    // Generate next question using LLM
    const nextQuestionOrder = candidate.generatedQuestions.length;
    const difficulty = determineNextDifficulty(
      candidate.generatedQuestions,
      previousPerformance
    );

    const generatedProblem = await generateProblemWithLLM(
      candidate.assessment.role,
      candidate.assessment.seniority,
      difficulty,
      candidate.generatedQuestions
    );

    // Save generated question
    const newQuestion = await prisma.generatedQuestion.create({
      data: {
        candidateId: id,
        order: nextQuestionOrder,
        title: generatedProblem.title,
        description: generatedProblem.description,
        difficulty,
        language: generatedProblem.language,
        requirements: generatedProblem.requirements,
        estimatedTime: generatedProblem.estimatedTime,
        starterCode: generatedProblem.starterCode,
        testCases: generatedProblem.testCases,
        status: "PENDING",
      },
    });

    return NextResponse.json(
      {
        question: formatQuestion(newQuestion),
        questionNumber: nextQuestionOrder + 1,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Questions POST API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Format question for client response
 */
function formatQuestion(question: any): GeneratedProblem {
  return {
    id: question.id,
    seedId: question.questionSeedId || "",
    title: question.title,
    description: question.description,
    requirements: question.requirements,
    difficulty: question.difficulty.toLowerCase() as "easy" | "medium" | "hard",
    estimatedTime: question.estimatedTime,
    language: question.language as "typescript" | "javascript" | "python" | "go",
    starterCode: question.starterCode as any,
    testCases: question.testCases as any,
    generatedAt: question.createdAt.toISOString(),
    generatedBy: "llm",
    score: question.score || undefined,
  };
}

/**
 * Determine next question difficulty based on performance
 */
function determineNextDifficulty(
  previousQuestions: any[],
  previousPerformance?: {
    score: number;
    timeSpent: number;
    testsPassedRatio: number;
  }
): "EASY" | "MEDIUM" | "HARD" {
  // First question is always medium
  if (previousQuestions.length === 0) {
    return "MEDIUM";
  }

  if (!previousPerformance) {
    return "MEDIUM";
  }

  // Adaptive difficulty based on performance
  const score = previousPerformance.score;
  const timeRatio = previousPerformance.timeSpent / 30; // Assuming 30 min baseline
  const testsRatio = previousPerformance.testsPassedRatio;

  // Strong performance -> increase difficulty
  if (score >= 80 && testsRatio >= 0.8 && timeRatio < 1.2) {
    return "HARD";
  }

  // Weak performance -> decrease difficulty
  if (score < 60 || testsRatio < 0.5) {
    return "EASY";
  }

  // Average performance -> maintain medium
  return "MEDIUM";
}

/**
 * Generate problem using LLM
 */
async function generateProblemWithLLM(
  role: string,
  seniority: string,
  difficulty: "EASY" | "MEDIUM" | "HARD",
  previousQuestions: any[]
): Promise<Omit<GeneratedProblem, "id" | "generatedAt" | "generatedBy" | "seedId">> {
  const previousTitles = previousQuestions.map((q) => q.title).join(", ");

  const prompt = `Generate a coding problem for a ${seniority} ${role} developer.

Requirements:
- Difficulty: ${difficulty}
- Language: TypeScript
- Must be different from these previous questions: ${previousTitles || "none"}
- Include realistic test cases
- Provide starter code template

Return a JSON object with this structure:
{
  "title": "Problem title",
  "description": "Detailed problem description with examples",
  "requirements": ["Requirement 1", "Requirement 2"],
  "difficulty": "${difficulty.toLowerCase()}",
  "estimatedTime": 30,
  "language": "typescript",
  "starterCode": [
    {
      "fileName": "solution.ts",
      "content": "// Starter code here"
    }
  ],
  "testCases": [
    {
      "name": "Test case name",
      "input": "input data",
      "expectedOutput": "expected output",
      "hidden": false
    }
  ]
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = message.content[0];
    if (content.type === "text") {
      // Extract JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const problem = JSON.parse(jsonMatch[0]);
        return problem;
      }
    }

    throw new Error("Failed to parse LLM response");
  } catch (error) {
    console.error("LLM generation error:", error);

    // Fallback to a default problem
    return {
      title: `${role} Challenge - ${difficulty}`,
      description: `Solve this ${difficulty.toLowerCase()} ${role} programming challenge.`,
      requirements: [
        "Implement the required functionality",
        "Pass all test cases",
        "Write clean, maintainable code",
      ],
      difficulty: difficulty.toLowerCase() as "easy" | "medium" | "hard",
      estimatedTime: difficulty === "EASY" ? 20 : difficulty === "MEDIUM" ? 30 : 45,
      language: "typescript",
      starterCode: [
        {
          fileName: "solution.ts",
          content: `// TODO: Implement your solution here\n\nexport function solution() {\n  // Your code here\n}\n`,
        },
      ],
      testCases: [
        {
          name: "Test case 1",
          input: "test input",
          expectedOutput: "expected output",
          hidden: false,
        },
      ],
    };
  }
}
