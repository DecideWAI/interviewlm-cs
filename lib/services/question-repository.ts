/**
 * Question Repository Service
 *
 * Provides a unified interface for working with questions that abstracts
 * the underlying storage (old GeneratedQuestion vs new QuestionTemplate + CandidateQuestion).
 *
 * This enables gradual migration from the old schema to the new schema.
 */

import prisma from "@/lib/prisma";
import type {
  Difficulty,
  QuestionStatus,
  GeneratedQuestion,
  QuestionTemplate,
  CandidateQuestion,
} from "@/lib/prisma-types";
import { generateQuestionFingerprint } from "./question-fingerprint";

// Feature flag - set to true to use new schema
const USE_NEW_SCHEMA = process.env.USE_NEW_QUESTION_SCHEMA === "true";

/**
 * Unified question data structure
 * Combines template and candidate-specific data
 */
export interface QuestionData {
  id: string;
  candidateId: string;
  templateId?: string; // Only present when using new schema
  questionSeedId: string | null;
  order: number;
  title: string;
  description: string;
  difficulty: Difficulty;
  language: string;
  requirements: string[];
  estimatedTime: number;
  starterCode: any;
  testCases: any;
  difficultyAssessment: any | null;
  status: QuestionStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  score: number | null;
  evaluationResult: any | null;
  createdAt: Date;
  fingerprint: string | null;
}

/**
 * Input for creating a new question
 */
export interface CreateQuestionInput {
  candidateId: string;
  questionSeedId?: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  language: string;
  requirements: string[];
  estimatedTime: number;
  starterCode: any;
  testCases: any;
  difficultyAssessment?: any;
}

/**
 * Convert GeneratedQuestion to unified QuestionData
 */
function fromGeneratedQuestion(gq: GeneratedQuestion): QuestionData {
  return {
    id: gq.id,
    candidateId: gq.candidateId,
    templateId: undefined,
    questionSeedId: gq.questionSeedId,
    order: gq.order,
    title: gq.title,
    description: gq.description,
    difficulty: gq.difficulty,
    language: gq.language,
    requirements: gq.requirements,
    estimatedTime: gq.estimatedTime,
    starterCode: gq.starterCode,
    testCases: gq.testCases,
    difficultyAssessment: gq.difficultyAssessment,
    status: gq.status,
    startedAt: gq.startedAt,
    completedAt: gq.completedAt,
    score: gq.score,
    evaluationResult: gq.evaluationResult,
    createdAt: gq.createdAt,
    fingerprint: gq.fingerprint,
  };
}

/**
 * Convert CandidateQuestion + QuestionTemplate to unified QuestionData
 */
function fromCandidateQuestion(
  cq: CandidateQuestion & { questionTemplate: QuestionTemplate }
): QuestionData {
  return {
    id: cq.id,
    candidateId: cq.candidateId,
    templateId: cq.questionTemplateId,
    questionSeedId: cq.questionTemplate.questionSeedId,
    order: cq.order,
    title: cq.questionTemplate.title,
    description: cq.questionTemplate.description,
    difficulty: cq.questionTemplate.difficulty,
    language: cq.questionTemplate.language,
    requirements: cq.questionTemplate.requirements,
    estimatedTime: cq.questionTemplate.estimatedTime,
    starterCode: cq.questionTemplate.starterCode,
    testCases: cq.questionTemplate.testCases,
    difficultyAssessment: cq.questionTemplate.difficultyAssessment,
    status: cq.status,
    startedAt: cq.startedAt,
    completedAt: cq.completedAt,
    score: cq.score,
    evaluationResult: cq.evaluationResult,
    createdAt: cq.createdAt,
    fingerprint: cq.questionTemplate.fingerprint,
  };
}

/**
 * Create a new question for a candidate
 */
export async function createQuestion(
  input: CreateQuestionInput
): Promise<QuestionData> {
  // Get current question count for order
  const existingCount = USE_NEW_SCHEMA
    ? await prisma.candidateQuestion.count({
        where: { candidateId: input.candidateId },
      })
    : await prisma.generatedQuestion.count({
        where: { candidateId: input.candidateId },
      });

  const order = existingCount + 1;

  if (USE_NEW_SCHEMA) {
    // Generate fingerprint for template lookup/creation
    const fingerprint = generateQuestionFingerprint({
      title: input.title,
      description: input.description,
      difficulty: input.difficulty,
      testCases: input.testCases,
    });

    // Try to find existing template
    let template = await prisma.questionTemplate.findUnique({
      where: { fingerprint },
    });

    // Create template if not exists
    if (!template) {
      template = await prisma.questionTemplate.create({
        data: {
          questionSeedId: input.questionSeedId,
          fingerprint,
          title: input.title,
          description: input.description,
          difficulty: input.difficulty,
          language: input.language,
          requirements: input.requirements,
          estimatedTime: input.estimatedTime,
          starterCode: input.starterCode,
          testCases: input.testCases,
          difficultyAssessment: input.difficultyAssessment,
          usageCount: 1,
        },
      });
    } else {
      // Increment usage count
      await prisma.questionTemplate.update({
        where: { id: template.id },
        data: { usageCount: { increment: 1 } },
      });
    }

    // Create candidate question
    const candidateQuestion = await prisma.candidateQuestion.create({
      data: {
        candidateId: input.candidateId,
        questionTemplateId: template.id,
        order,
        status: "PENDING",
      },
      include: { questionTemplate: true },
    });

    return fromCandidateQuestion(candidateQuestion);
  } else {
    // Use old schema
    const fingerprint = generateQuestionFingerprint({
      title: input.title,
      description: input.description,
      difficulty: input.difficulty,
      testCases: input.testCases,
    });

    const question = await prisma.generatedQuestion.create({
      data: {
        candidateId: input.candidateId,
        questionSeedId: input.questionSeedId,
        order,
        title: input.title,
        description: input.description,
        difficulty: input.difficulty,
        language: input.language,
        requirements: input.requirements,
        estimatedTime: input.estimatedTime,
        starterCode: input.starterCode,
        testCases: input.testCases,
        difficultyAssessment: input.difficultyAssessment,
        status: "PENDING",
        fingerprint,
      },
    });

    return fromGeneratedQuestion(question);
  }
}

/**
 * Get a question by ID
 */
export async function getQuestionById(
  questionId: string
): Promise<QuestionData | null> {
  if (USE_NEW_SCHEMA) {
    const cq = await prisma.candidateQuestion.findUnique({
      where: { id: questionId },
      include: { questionTemplate: true },
    });
    return cq ? fromCandidateQuestion(cq) : null;
  } else {
    const gq = await prisma.generatedQuestion.findUnique({
      where: { id: questionId },
    });
    return gq ? fromGeneratedQuestion(gq) : null;
  }
}

/**
 * Get all questions for a candidate
 */
export async function getCandidateQuestions(
  candidateId: string
): Promise<QuestionData[]> {
  if (USE_NEW_SCHEMA) {
    const questions = await prisma.candidateQuestion.findMany({
      where: { candidateId },
      include: { questionTemplate: true },
      orderBy: { order: "asc" },
    });
    return questions.map(fromCandidateQuestion);
  } else {
    const questions = await prisma.generatedQuestion.findMany({
      where: { candidateId },
      orderBy: { order: "asc" },
    });
    return questions.map(fromGeneratedQuestion);
  }
}

/**
 * Get next pending question for a candidate
 */
export async function getNextPendingQuestion(
  candidateId: string
): Promise<QuestionData | null> {
  if (USE_NEW_SCHEMA) {
    const cq = await prisma.candidateQuestion.findFirst({
      where: { candidateId, status: "PENDING" },
      include: { questionTemplate: true },
      orderBy: { order: "asc" },
    });
    return cq ? fromCandidateQuestion(cq) : null;
  } else {
    const gq = await prisma.generatedQuestion.findFirst({
      where: { candidateId, status: "PENDING" },
      orderBy: { order: "asc" },
    });
    return gq ? fromGeneratedQuestion(gq) : null;
  }
}

/**
 * Start a question (mark as in progress)
 */
export async function startQuestion(
  questionId: string
): Promise<QuestionData> {
  if (USE_NEW_SCHEMA) {
    const cq = await prisma.candidateQuestion.update({
      where: { id: questionId },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
      include: { questionTemplate: true },
    });
    return fromCandidateQuestion(cq);
  } else {
    const gq = await prisma.generatedQuestion.update({
      where: { id: questionId },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
    return fromGeneratedQuestion(gq);
  }
}

/**
 * Complete a question with score
 */
export async function completeQuestion(
  questionId: string,
  score: number,
  evaluationResult?: any
): Promise<QuestionData> {
  if (USE_NEW_SCHEMA) {
    const cq = await prisma.candidateQuestion.update({
      where: { id: questionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        score,
        evaluationResult,
      },
      include: { questionTemplate: true },
    });
    return fromCandidateQuestion(cq);
  } else {
    const gq = await prisma.generatedQuestion.update({
      where: { id: questionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        score,
        evaluationResult,
      },
    });
    return fromGeneratedQuestion(gq);
  }
}

/**
 * Skip a question
 */
export async function skipQuestion(questionId: string): Promise<QuestionData> {
  if (USE_NEW_SCHEMA) {
    const cq = await prisma.candidateQuestion.update({
      where: { id: questionId },
      data: { status: "SKIPPED", completedAt: new Date() },
      include: { questionTemplate: true },
    });
    return fromCandidateQuestion(cq);
  } else {
    const gq = await prisma.generatedQuestion.update({
      where: { id: questionId },
      data: { status: "SKIPPED", completedAt: new Date() },
    });
    return fromGeneratedQuestion(gq);
  }
}

/**
 * Update evaluation result for a question
 */
export async function updateEvaluationResult(
  questionId: string,
  evaluationResult: any
): Promise<QuestionData> {
  if (USE_NEW_SCHEMA) {
    const cq = await prisma.candidateQuestion.update({
      where: { id: questionId },
      data: { evaluationResult },
      include: { questionTemplate: true },
    });
    return fromCandidateQuestion(cq);
  } else {
    const gq = await prisma.generatedQuestion.update({
      where: { id: questionId },
      data: { evaluationResult },
    });
    return fromGeneratedQuestion(gq);
  }
}

/**
 * Count questions for a candidate
 */
export async function countCandidateQuestions(
  candidateId: string
): Promise<number> {
  if (USE_NEW_SCHEMA) {
    return prisma.candidateQuestion.count({ where: { candidateId } });
  } else {
    return prisma.generatedQuestion.count({ where: { candidateId } });
  }
}

/**
 * Get completed questions for a candidate
 */
export async function getCompletedQuestions(
  candidateId: string
): Promise<QuestionData[]> {
  if (USE_NEW_SCHEMA) {
    const questions = await prisma.candidateQuestion.findMany({
      where: { candidateId, status: "COMPLETED" },
      include: { questionTemplate: true },
      orderBy: { order: "asc" },
    });
    return questions.map(fromCandidateQuestion);
  } else {
    const questions = await prisma.generatedQuestion.findMany({
      where: { candidateId, status: "COMPLETED" },
      orderBy: { order: "asc" },
    });
    return questions.map(fromGeneratedQuestion);
  }
}

/**
 * Delete a question
 */
export async function deleteQuestion(questionId: string): Promise<void> {
  if (USE_NEW_SCHEMA) {
    await prisma.candidateQuestion.delete({ where: { id: questionId } });
  } else {
    await prisma.generatedQuestion.delete({ where: { id: questionId } });
  }
}

/**
 * Find or create a question template
 * Only used with new schema
 */
export async function findOrCreateTemplate(data: {
  questionSeedId?: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  language: string;
  requirements: string[];
  estimatedTime: number;
  starterCode: any;
  testCases: any;
  difficultyAssessment?: any;
}): Promise<QuestionTemplate> {
  const fingerprint = generateQuestionFingerprint({
    title: data.title,
    description: data.description,
    difficulty: data.difficulty,
    testCases: data.testCases,
  });

  let template = await prisma.questionTemplate.findUnique({
    where: { fingerprint },
  });

  if (!template) {
    template = await prisma.questionTemplate.create({
      data: {
        ...data,
        fingerprint,
        usageCount: 0,
      },
    });
  }

  return template;
}

/**
 * Check if using new schema
 */
export function isUsingNewSchema(): boolean {
  return USE_NEW_SCHEMA;
}
