/**
 * Question Fingerprinting Service
 *
 * Provides hash-based fingerprinting for question deduplication.
 * Used to detect near-duplicate questions and ensure uniqueness
 * across the question pool.
 */

import prisma from "@/lib/prisma";
import { createHash } from "crypto";
import type { GeneratedQuestion } from "@/lib/prisma-types";

/**
 * Fingerprint result with metadata
 */
export interface FingerprintResult {
  fingerprint: string;
  components: {
    titleHash: string;
    requirementsHash: string;
    conceptsHash: string;
  };
}

/**
 * Uniqueness check result
 */
export interface UniquenessResult {
  isUnique: boolean;
  similarQuestionIds: string[];
  similarityScore: number;
}

/**
 * Extract key concepts from question description
 */
function extractConcepts(description: string): string[] {
  // Common programming concepts to look for
  const conceptPatterns = [
    /\b(array|list|queue|stack|tree|graph|hash\s*map|set|linked\s*list)\b/gi,
    /\b(sort|search|filter|map|reduce|traverse|iterate)\b/gi,
    /\b(recursive|recursion|dynamic\s*programming|memoization)\b/gi,
    /\b(api|rest|graphql|websocket|http|endpoint)\b/gi,
    /\b(database|query|sql|nosql|mongodb|postgres|redis)\b/gi,
    /\b(async|await|promise|callback|concurrent|parallel)\b/gi,
    /\b(cache|caching|performance|optimization)\b/gi,
    /\b(validate|validation|error\s*handling|exception)\b/gi,
    /\b(authentication|authorization|security|jwt|oauth)\b/gi,
    /\b(test|testing|unit\s*test|integration)\b/gi,
  ];

  const concepts: Set<string> = new Set();

  for (const pattern of conceptPatterns) {
    const matches = description.match(pattern);
    if (matches) {
      matches.forEach(match => concepts.add(match.toLowerCase().replace(/\s+/g, '_')));
    }
  }

  return Array.from(concepts).sort();
}

/**
 * Normalize text for consistent hashing
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ')         // Normalize whitespace
    .trim();
}

/**
 * Generate a fingerprint for a question
 * The fingerprint is a hash of key structural elements
 */
export function generateFingerprint(question: GeneratedQuestion): string {
  // Normalize and hash the title
  const normalizedTitle = normalizeText(question.title);
  const titleHash = createHash('sha256')
    .update(normalizedTitle)
    .digest('hex')
    .substring(0, 16);

  // Hash requirements (sorted for consistency)
  const requirements = (question.requirements as string[]) || [];
  const sortedRequirements = [...requirements].sort().map(normalizeText);
  const requirementsHash = createHash('sha256')
    .update(sortedRequirements.join('|'))
    .digest('hex')
    .substring(0, 16);

  // Extract and hash concepts from description
  const concepts = extractConcepts(question.description || '');
  const conceptsHash = createHash('sha256')
    .update(concepts.join('|'))
    .digest('hex')
    .substring(0, 16);

  // Combine into final fingerprint
  // Format: difficulty-titleHash-requirementsHash-conceptsHash
  const fingerprint = `${question.difficulty}-${titleHash}-${requirementsHash}-${conceptsHash}`;

  return fingerprint;
}

/**
 * Generate fingerprint from partial question data
 * Useful when creating questions before full object exists
 */
export function generateQuestionFingerprint(data: {
  title: string;
  description: string;
  difficulty: string;
  testCases?: any;
  requirements?: string[];
}): string {
  // Normalize and hash the title
  const normalizedTitle = normalizeText(data.title);
  const titleHash = createHash('sha256')
    .update(normalizedTitle)
    .digest('hex')
    .substring(0, 16);

  // Hash requirements (sorted for consistency)
  const requirements = data.requirements || [];
  const sortedRequirements = [...requirements].sort().map(normalizeText);
  const requirementsHash = createHash('sha256')
    .update(sortedRequirements.join('|'))
    .digest('hex')
    .substring(0, 16);

  // Extract and hash concepts from description
  const concepts = extractConcepts(data.description || '');
  const conceptsHash = createHash('sha256')
    .update(concepts.join('|'))
    .digest('hex')
    .substring(0, 16);

  // Combine into final fingerprint
  // Format: difficulty-titleHash-requirementsHash-conceptsHash
  const fingerprint = `${data.difficulty}-${titleHash}-${requirementsHash}-${conceptsHash}`;

  return fingerprint;
}

/**
 * Generate fingerprint components for detailed comparison
 */
export function generateFingerprintComponents(question: GeneratedQuestion): FingerprintResult {
  const normalizedTitle = normalizeText(question.title);
  const titleHash = createHash('sha256')
    .update(normalizedTitle)
    .digest('hex')
    .substring(0, 16);

  const requirements = (question.requirements as string[]) || [];
  const sortedRequirements = [...requirements].sort().map(normalizeText);
  const requirementsHash = createHash('sha256')
    .update(sortedRequirements.join('|'))
    .digest('hex')
    .substring(0, 16);

  const concepts = extractConcepts(question.description || '');
  const conceptsHash = createHash('sha256')
    .update(concepts.join('|'))
    .digest('hex')
    .substring(0, 16);

  return {
    fingerprint: `${question.difficulty}-${titleHash}-${requirementsHash}-${conceptsHash}`,
    components: {
      titleHash,
      requirementsHash,
      conceptsHash,
    },
  };
}

/**
 * Check if a fingerprint is unique within a seed's question pool
 */
export async function checkUniqueness(
  fingerprint: string,
  seedId: string
): Promise<boolean> {
  const existingQuestion = await prisma.generatedQuestion.findFirst({
    where: {
      questionSeedId: seedId,
      fingerprint,
    },
  });

  return !existingQuestion;
}

/**
 * Find similar questions based on fingerprint components
 */
export async function findSimilarQuestions(
  question: GeneratedQuestion,
  seedId: string,
  threshold: number = 0.5
): Promise<UniquenessResult> {
  const { components } = generateFingerprintComponents(question);

  // Find questions with matching components
  const allQuestionsInSeed = await prisma.generatedQuestion.findMany({
    where: {
      questionSeedId: seedId,
      id: { not: question.id }, // Exclude self
      fingerprint: { not: null },
    },
    select: {
      id: true,
      fingerprint: true,
    },
  });

  const similarQuestionIds: string[] = [];
  let maxSimilarity = 0;

  for (const existingQuestion of allQuestionsInSeed) {
    if (!existingQuestion.fingerprint) continue;

    // Parse existing fingerprint
    const parts = existingQuestion.fingerprint.split('-');
    if (parts.length < 4) continue;

    const [, existingTitle, existingReq, existingConcepts] = parts;

    // Calculate similarity score (0-1)
    let matchingComponents = 0;
    if (existingTitle === components.titleHash) matchingComponents++;
    if (existingReq === components.requirementsHash) matchingComponents++;
    if (existingConcepts === components.conceptsHash) matchingComponents++;

    const similarity = matchingComponents / 3;

    if (similarity >= threshold) {
      similarQuestionIds.push(existingQuestion.id);
    }

    maxSimilarity = Math.max(maxSimilarity, similarity);
  }

  return {
    isUnique: similarQuestionIds.length === 0,
    similarQuestionIds,
    similarityScore: maxSimilarity,
  };
}

/**
 * Batch update fingerprints for existing questions
 * Useful for backfilling fingerprints on legacy questions
 */
export async function backfillFingerprints(seedId?: string): Promise<{
  updated: number;
  skipped: number;
}> {
  const whereClause: any = {
    fingerprint: null,
  };

  if (seedId) {
    whereClause.questionSeedId = seedId;
  }

  const questionsWithoutFingerprints = await prisma.generatedQuestion.findMany({
    where: whereClause,
  });

  let updated = 0;
  let skipped = 0;

  for (const question of questionsWithoutFingerprints) {
    try {
      const fingerprint = generateFingerprint(question);
      await prisma.generatedQuestion.update({
        where: { id: question.id },
        data: { fingerprint },
      });
      updated++;
    } catch (error) {
      console.error(`Failed to update fingerprint for question ${question.id}:`, error);
      skipped++;
    }
  }

  console.log(`Backfill complete: ${updated} updated, ${skipped} skipped`);
  return { updated, skipped };
}

/**
 * Get fingerprint statistics for a seed
 */
export async function getFingerprintStats(seedId: string): Promise<{
  totalQuestions: number;
  withFingerprints: number;
  uniqueFingerprints: number;
  duplicateFingerprints: number;
}> {
  const totalQuestions = await prisma.generatedQuestion.count({
    where: { questionSeedId: seedId },
  });

  const withFingerprints = await prisma.generatedQuestion.count({
    where: {
      questionSeedId: seedId,
      fingerprint: { not: null },
    },
  });

  const uniqueFingerprints = await prisma.generatedQuestion.groupBy({
    by: ['fingerprint'],
    where: {
      questionSeedId: seedId,
      fingerprint: { not: null },
    },
  });

  return {
    totalQuestions,
    withFingerprints,
    uniqueFingerprints: uniqueFingerprints.length,
    duplicateFingerprints: withFingerprints - uniqueFingerprints.length,
  };
}
