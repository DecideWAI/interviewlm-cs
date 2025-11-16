/**
 * Question Generation Caching
 *
 * Reduces API costs by caching generated questions
 * Questions are cached by difficulty, language, and topic
 *
 * Cache Strategy:
 * - Cache similar questions for reuse
 * - 7-day TTL to ensure freshness
 * - Key format: `question:{difficulty}:{language}:{topicHash}`
 */

import { Redis } from "ioredis";
import * as crypto from "crypto";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Generate cache key for a question
 */
function generateQuestionCacheKey(
  difficulty: string,
  language: string,
  topic?: string
): string {
  const topicHash = topic
    ? crypto.createHash("md5").update(topic).digest("hex").substring(0, 8)
    : "general";

  return `question:${difficulty.toLowerCase()}:${language.toLowerCase()}:${topicHash}`;
}

/**
 * Get cached question
 */
export async function getCachedQuestion(
  difficulty: string,
  language: string,
  topic?: string
): Promise<any | null> {
  const redis = new Redis(REDIS_URL);
  try {
    const cacheKey = generateQuestionCacheKey(difficulty, language, topic);

    // Get all cached questions for this key
    const cachedData = await redis.get(cacheKey);

    if (!cachedData) {
      console.log(`[Question Cache] Cache miss for key: ${cacheKey}`);
      return null;
    }

    const cachedQuestions = JSON.parse(cachedData);

    // Return a random question from cache (for variety)
    if (Array.isArray(cachedQuestions) && cachedQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * cachedQuestions.length);
      console.log(`[Question Cache] Cache hit for key: ${cacheKey} (${cachedQuestions.length} questions available)`);
      return cachedQuestions[randomIndex];
    }

    return null;
  } catch (error) {
    console.error("[Question Cache] Error getting cached question:", error);
    return null;
  } finally {
    redis.disconnect();
  }
}

/**
 * Cache a generated question
 */
export async function cacheQuestion(
  difficulty: string,
  language: string,
  questionData: any,
  topic?: string
): Promise<void> {
  const redis = new Redis(REDIS_URL);
  try {
    const cacheKey = generateQuestionCacheKey(difficulty, language, topic);

    // Get existing cached questions
    const existingData = await redis.get(cacheKey);
    let cachedQuestions: any[] = [];

    if (existingData) {
      cachedQuestions = JSON.parse(existingData);
    }

    // Add new question to cache (max 10 questions per key)
    cachedQuestions.push({
      ...questionData,
      cachedAt: new Date().toISOString(),
    });

    // Keep only the last 10 questions
    if (cachedQuestions.length > 10) {
      cachedQuestions = cachedQuestions.slice(-10);
    }

    // Store back in cache with TTL
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(cachedQuestions));

    console.log(`[Question Cache] Cached question for key: ${cacheKey} (total: ${cachedQuestions.length})`);
  } catch (error) {
    console.error("[Question Cache] Error caching question:", error);
    // Don't throw - caching failure shouldn't block question generation
  } finally {
    redis.disconnect();
  }
}

/**
 * Clear question cache (for testing or admin purposes)
 */
export async function clearQuestionCache(
  difficulty?: string,
  language?: string
): Promise<number> {
  const redis = new Redis(REDIS_URL);
  try {
    let pattern: string;
    if (difficulty && language) {
      pattern = `question:${difficulty.toLowerCase()}:${language.toLowerCase()}:*`;
    } else if (difficulty) {
      pattern = `question:${difficulty.toLowerCase()}:*`;
    } else {
      pattern = "question:*";
    }

    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    const deleted = await redis.del(...keys);

    console.log(`[Question Cache] Cleared ${deleted} cached questions matching pattern: ${pattern}`);

    return deleted;
  } catch (error) {
    console.error("[Question Cache] Error clearing cache:", error);
    return 0;
  } finally {
    redis.disconnect();
  }
}

/**
 * Get cache statistics
 */
export async function getQuestionCacheStats(): Promise<{
  totalKeys: number;
  totalQuestions: number;
  byDifficulty: Record<string, number>;
  byLanguage: Record<string, number>;
}> {
  const redis = new Redis(REDIS_URL);
  try {
    const keys = await redis.keys("question:*");

    const stats = {
      totalKeys: keys.length,
      totalQuestions: 0,
      byDifficulty: {} as Record<string, number>,
      byLanguage: {} as Record<string, number>,
    };

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const questions = JSON.parse(data);
        stats.totalQuestions += questions.length;

        // Parse key format: question:{difficulty}:{language}:{topicHash}
        const parts = key.split(":");
        if (parts.length >= 3) {
          const difficulty = parts[1];
          const language = parts[2];

          stats.byDifficulty[difficulty] = (stats.byDifficulty[difficulty] || 0) + questions.length;
          stats.byLanguage[language] = (stats.byLanguage[language] || 0) + questions.length;
        }
      }
    }

    return stats;
  } catch (error) {
    console.error("[Question Cache] Error getting stats:", error);
    return {
      totalKeys: 0,
      totalQuestions: 0,
      byDifficulty: {},
      byLanguage: {},
    };
  } finally {
    redis.disconnect();
  }
}
