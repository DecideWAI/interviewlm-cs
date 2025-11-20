/**
 * Claude Model Constants
 *
 * Centralized configuration for Claude AI models used across InterviewLM.
 * Includes pricing, token limits, and recommended use cases.
 */

import type { ClaudeModel } from '../types/agent';

/**
 * Model configuration
 */
export interface ModelConfig {
  id: ClaudeModel;
  name: string;
  inputPricePerMToken: number; // USD per million tokens
  outputPricePerMToken: number; // USD per million tokens
  maxTokens: number;
  contextWindow: number;
  description: string;
  useCase: string;
}

/**
 * Claude model configurations
 * Pricing as of November 2025
 */
export const CLAUDE_MODELS: Record<ClaudeModel, ModelConfig> = {
  'claude-sonnet-4-5-20250929': {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    inputPricePerMToken: 3.0,
    outputPricePerMToken: 15.0,
    maxTokens: 8192,
    contextWindow: 200000,
    description: 'Our smartest model for complex agents and coding',
    useCase: 'Coding Agent, Evaluation Agent',
  },

  'claude-haiku-4-5-20251001': {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    inputPricePerMToken: 1.0,
    outputPricePerMToken: 5.0,
    maxTokens: 8192,
    contextWindow: 200000,
    description: 'Our fastest model with near-frontier intelligence',
    useCase: 'Coding Agent (fast responses), Interview Agent',
  },

  'claude-opus-4-1-20250805': {
    id: 'claude-opus-4-1-20250805',
    name: 'Claude Opus 4.1',
    inputPricePerMToken: 15.0,
    outputPricePerMToken: 75.0,
    maxTokens: 8192,
    contextWindow: 200000,
    description: 'Exceptional model for specialized reasoning tasks',
    useCase: 'Complex orchestration (rarely needed for InterviewLM)',
  },
};

/**
 * Recommended models for each agent type
 */
export const AGENT_MODEL_RECOMMENDATIONS = {
  codingAgent: 'claude-haiku-4-5-20251001' as ClaudeModel,
  interviewAgent: 'claude-haiku-4-5-20251001' as ClaudeModel,
  evaluationAgent: 'claude-sonnet-4-5-20250929' as ClaudeModel,
} as const;

/**
 * Calculate estimated cost for a conversation
 */
export function estimateCost(
  model: ClaudeModel,
  inputTokens: number,
  outputTokens: number
): number {
  const config = CLAUDE_MODELS[model];
  const inputCost = (inputTokens / 1_000_000) * config.inputPricePerMToken;
  const outputCost = (outputTokens / 1_000_000) * config.outputPricePerMToken;
  return inputCost + outputCost;
}

/**
 * Get model configuration
 */
export function getModelConfig(model: ClaudeModel): ModelConfig {
  return CLAUDE_MODELS[model];
}

/**
 * Prompt caching cost multipliers
 * - Write to cache: 1.25x input price
 * - Read from cache: 0.10x input price (90% savings)
 */
export const CACHE_COST_MULTIPLIERS = {
  write: 1.25,
  read: 0.1,
} as const;

/**
 * Calculate cost with prompt caching
 */
export function estimateCostWithCaching(
  model: ClaudeModel,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  const config = CLAUDE_MODELS[model];

  // Uncached tokens
  const uncachedInputTokens = inputTokens - cachedTokens;
  const uncachedCost =
    (uncachedInputTokens / 1_000_000) * config.inputPricePerMToken;

  // Cached tokens (90% discount)
  const cachedCost =
    (cachedTokens / 1_000_000) *
    config.inputPricePerMToken *
    CACHE_COST_MULTIPLIERS.read;

  // Output tokens (no caching)
  const outputCost = (outputTokens / 1_000_000) * config.outputPricePerMToken;

  return uncachedCost + cachedCost + outputCost;
}
