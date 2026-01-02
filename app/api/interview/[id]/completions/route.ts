/**
 * Inline Code Completions API
 * POST /api/interview/[id]/completions - Get AI-powered inline code completions
 *
 * Provides Cursor/Copilot-like inline suggestions for the candidate's code.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

// Request validation schema
const completionRequestSchema = z.object({
  filePath: z.string(),
  content: z.string(),
  cursor: z.object({
    line: z.number(),
    column: z.number(),
  }),
  prefix: z.string(), // Text before cursor on current line
  suffix: z.string(), // Text after cursor on current line
  language: z.string().optional(),
  maxSuggestions: z.number().optional().default(3),
});

// Response type
interface CompletionSuggestion {
  id: string;
  text: string;
  startPosition: { line: number; column: number };
  source: "ai" | "snippet";
  confidence: number;
  label?: string;
}

/**
 * POST /api/interview/[id]/completions
 * Get AI-powered inline code completions
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check authentication
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request
    const body = await request.json();
    const validationResult = completionRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { filePath, content, cursor, prefix, suffix, language, maxSuggestions } =
      validationResult.data;

    // Verify candidate exists and user has access
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
        generatedQuestions: {
          where: { status: "IN_PROGRESS" },
          take: 1,
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
    const isOrgMember = candidate.organization.members.length > 0;
    const isSelfInterview = candidate.email === session.user.email;

    if (!isOrgMember && !isSelfInterview) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get current question for context
    const currentQuestion = candidate.generatedQuestions[0];
    let problemContext = "";
    if (currentQuestion) {
      problemContext = `Problem: ${currentQuestion.title}\nDescription: ${currentQuestion.description?.slice(0, 500)}`;
    }

    // Generate completions using Claude
    const suggestions = await generateCompletions({
      filePath,
      content,
      cursor,
      prefix,
      suffix,
      language: language || detectLanguage(filePath),
      problemContext,
      maxSuggestions,
    });

    return NextResponse.json({
      suggestions,
      cursor,
    });
  } catch (error) {
    console.error("[Completions] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate completions" },
      { status: 500 }
    );
  }
}

/**
 * Generate completions using Claude API
 */
async function generateCompletions(params: {
  filePath: string;
  content: string;
  cursor: { line: number; column: number };
  prefix: string;
  suffix: string;
  language: string;
  problemContext: string;
  maxSuggestions: number;
}): Promise<CompletionSuggestion[]> {
  const {
    filePath,
    content,
    cursor,
    prefix,
    suffix,
    language,
    problemContext,
    maxSuggestions,
  } = params;

  // Skip completion if prefix is too short or whitespace only
  if (prefix.trim().length < 2) {
    return [];
  }

  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      defaultHeaders: {
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
    });

    // Build context - show surrounding lines
    const lines = content.split("\n");
    const startLine = Math.max(0, cursor.line - 10);
    const endLine = Math.min(lines.length, cursor.line + 5);
    const contextLines = lines.slice(startLine, endLine);

    // Mark cursor position
    const cursorLineIndex = cursor.line - 1 - startLine;
    if (cursorLineIndex >= 0 && cursorLineIndex < contextLines.length) {
      const cursorLine = contextLines[cursorLineIndex];
      contextLines[cursorLineIndex] =
        cursorLine.slice(0, cursor.column) + "█" + cursorLine.slice(cursor.column);
    }

    const prompt = `You are a code completion assistant. Generate ${maxSuggestions} code completion suggestions for the cursor position marked with █.

File: ${filePath}
Language: ${language}
${problemContext ? `\nContext:\n${problemContext}\n` : ""}

Code:
\`\`\`${language}
${contextLines.join("\n")}
\`\`\`

Current line prefix: "${prefix}"
Current line suffix: "${suffix}"

Provide completions that:
1. Complete the current statement/expression naturally
2. Follow ${language} best practices and idioms
3. Are contextually relevant to the surrounding code
4. Are concise (typically 1-5 lines unless a larger block is clearly needed)

Respond with a JSON array of suggestions:
[
  {
    "text": "completion text to insert at cursor",
    "label": "short description",
    "confidence": 0.0-1.0
  }
]

ONLY return the JSON array, no other text.`;

    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022", // Use fast model for completions
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Parse response
    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[Completions] Could not parse response as JSON");
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Transform to our format
    const suggestions: CompletionSuggestion[] = parsed.map(
      (item: { text: string; label?: string; confidence?: number }, index: number) => ({
        id: `completion_${Date.now()}_${index}`,
        text: item.text,
        startPosition: cursor,
        source: "ai" as const,
        confidence: item.confidence ?? 0.8,
        label: item.label,
      })
    );

    return suggestions.slice(0, maxSuggestions);
  } catch (error) {
    console.error("[Completions] Error generating:", error);
    return [];
  }
}

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    rb: "ruby",
    php: "php",
    c: "c",
    cpp: "cpp",
    cs: "csharp",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
  };

  return languageMap[ext || ""] || "text";
}
