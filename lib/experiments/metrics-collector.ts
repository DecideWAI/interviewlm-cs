/**
 * Metrics Collector
 *
 * Collects and aggregates metrics for experiment analysis.
 * Supports real-time collection and batch analysis.
 */

import { Redis } from 'ioredis';
import type {
  ExperimentMetric,
  ExperimentResults,
  VariantResults,
  MetricSummary,
} from './types';

/**
 * Get Redis client (lazy initialization)
 */
let redisClient: Redis | null = null;
function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
}

/**
 * Metrics Collector
 */
export class MetricsCollector {
  private static instance: MetricsCollector;

  private constructor() {}

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Record a single metric
   */
  async recordMetric(metric: ExperimentMetric): Promise<void> {
    const redis = getRedis();
    const key = `metrics:${metric.experimentId}:${metric.variantId}:${metric.metricName}`;

    // Store as sorted set with timestamp as score
    await redis.zadd(key, metric.timestamp.getTime(), JSON.stringify({
      value: metric.value,
      timestamp: metric.timestamp.toISOString(),
      metadata: metric.metadata,
    }));

    // Also update rolling aggregates
    await this.updateRollingAggregate(metric);
  }

  /**
   * Record multiple metrics at once
   */
  async recordMetrics(metrics: ExperimentMetric[]): Promise<void> {
    await Promise.all(metrics.map((m) => this.recordMetric(m)));
  }

  /**
   * Update rolling aggregate for real-time stats
   */
  private async updateRollingAggregate(metric: ExperimentMetric): Promise<void> {
    const redis = getRedis();
    const aggregateKey = `aggregate:${metric.experimentId}:${metric.variantId}:${metric.metricName}`;

    // Get current aggregate
    const currentData = await redis.get(aggregateKey);
    const current = currentData
      ? JSON.parse(currentData)
      : { count: 0, sum: 0, sumSquares: 0, min: Infinity, max: -Infinity };

    // Update aggregate
    current.count += 1;
    current.sum += metric.value;
    current.sumSquares += metric.value * metric.value;
    current.min = Math.min(current.min, metric.value);
    current.max = Math.max(current.max, metric.value);

    await redis.set(aggregateKey, JSON.stringify(current));
  }

  /**
   * Get metrics for an experiment variant
   */
  async getMetrics(
    experimentId: string,
    variantId: string,
    metricName: string,
    options?: {
      startTime?: Date;
      endTime?: Date;
      limit?: number;
    },
  ): Promise<Array<{ value: number; timestamp: Date; metadata?: Record<string, unknown> }>> {
    const redis = getRedis();
    const key = `metrics:${experimentId}:${variantId}:${metricName}`;

    const start = options?.startTime?.getTime() || 0;
    const end = options?.endTime?.getTime() || Date.now();

    const data = await redis.zrangebyscore(
      key,
      start,
      end,
      'LIMIT',
      0,
      options?.limit || 10000,
    );

    return data.map((item) => {
      const parsed = JSON.parse(item);
      return {
        value: parsed.value,
        timestamp: new Date(parsed.timestamp),
        metadata: parsed.metadata,
      };
    });
  }

  /**
   * Get aggregate statistics for a metric
   */
  async getAggregateStats(
    experimentId: string,
    variantId: string,
    metricName: string,
  ): Promise<MetricSummary | null> {
    const redis = getRedis();
    const aggregateKey = `aggregate:${experimentId}:${variantId}:${metricName}`;

    const data = await redis.get(aggregateKey);
    if (!data) return null;

    const aggregate = JSON.parse(data);
    if (aggregate.count === 0) return null;

    const mean = aggregate.sum / aggregate.count;
    const variance = (aggregate.sumSquares / aggregate.count) - (mean * mean);
    const stdDev = Math.sqrt(Math.max(0, variance));

    // Get percentiles from raw data
    const key = `metrics:${experimentId}:${variantId}:${metricName}`;
    const allData = await redis.zrange(key, 0, -1);
    const values = allData.map((d) => JSON.parse(d).value).sort((a, b) => a - b);

    const p50 = this.percentile(values, 50);
    const p95 = this.percentile(values, 95);
    const p99 = this.percentile(values, 99);

    return {
      mean,
      stdDev,
      min: aggregate.min,
      max: aggregate.max,
      p50,
      p95,
      p99,
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const index = Math.ceil((p / 100) * values.length) - 1;
    return values[Math.max(0, Math.min(index, values.length - 1))];
  }

  /**
   * Analyze experiment results
   */
  async analyzeExperiment(experimentId: string): Promise<ExperimentResults> {
    const redis = getRedis();

    // Get all variants for this experiment
    const experimentData = await redis.hget('experiments', experimentId);
    if (!experimentData) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    const experiment = JSON.parse(experimentData);
    const variants = experiment.variants;
    const primaryMetric = experiment.primaryMetric || 'response_latency_ms';

    const variantResults: VariantResults[] = [];
    let totalSampleSize = 0;

    for (const variant of variants) {
      const metrics: Record<string, MetricSummary> = {};

      // Get primary metric
      const primaryStats = await this.getAggregateStats(
        experimentId,
        variant.id,
        primaryMetric,
      );
      if (primaryStats) {
        metrics[primaryMetric] = primaryStats;
      }

      // Get secondary metrics
      for (const metricName of experiment.secondaryMetrics || []) {
        const stats = await this.getAggregateStats(experimentId, variant.id, metricName);
        if (stats) {
          metrics[metricName] = stats;
        }
      }

      // Get sample size from aggregate
      const aggregateKey = `aggregate:${experimentId}:${variant.id}:${primaryMetric}`;
      const aggregateData = await redis.get(aggregateKey);
      const sampleSize = aggregateData ? JSON.parse(aggregateData).count : 0;
      totalSampleSize += sampleSize;

      variantResults.push({
        variantId: variant.id,
        sampleSize,
        metrics,
      });
    }

    // Determine winner (simple: lowest latency or highest success rate)
    const winner = this.determineWinner(variantResults, primaryMetric);
    const confidence = this.calculateConfidence(variantResults, primaryMetric);

    return {
      experimentId,
      variants: variantResults,
      winner,
      confidence,
      sampleSize: totalSampleSize,
      analyzedAt: new Date(),
    };
  }

  /**
   * Determine winning variant
   */
  private determineWinner(
    results: VariantResults[],
    primaryMetric: string,
  ): string | undefined {
    if (results.length === 0) return undefined;

    // For latency metrics, lower is better
    // For success/score metrics, higher is better
    const isLowerBetter = primaryMetric.includes('latency') || primaryMetric.includes('error');

    let bestVariant: string | undefined;
    let bestValue = isLowerBetter ? Infinity : -Infinity;

    for (const result of results) {
      const metric = result.metrics[primaryMetric];
      if (!metric) continue;

      const value = metric.mean;
      if (isLowerBetter ? value < bestValue : value > bestValue) {
        bestValue = value;
        bestVariant = result.variantId;
      }
    }

    return bestVariant;
  }

  /**
   * Calculate statistical confidence
   * Uses simplified two-sample t-test approximation
   */
  private calculateConfidence(
    results: VariantResults[],
    primaryMetric: string,
  ): number {
    if (results.length < 2) return 0;

    // Get two largest variants by sample size
    const sorted = [...results].sort((a, b) => b.sampleSize - a.sampleSize);
    const control = sorted[0];
    const treatment = sorted[1];

    const controlMetric = control.metrics[primaryMetric];
    const treatmentMetric = treatment.metrics[primaryMetric];

    if (!controlMetric || !treatmentMetric) return 0;
    if (control.sampleSize < 30 || treatment.sampleSize < 30) return 0;

    // Calculate t-statistic
    const meanDiff = Math.abs(controlMetric.mean - treatmentMetric.mean);
    const pooledVariance = (
      ((controlMetric.stdDev ** 2) / control.sampleSize) +
      ((treatmentMetric.stdDev ** 2) / treatment.sampleSize)
    );
    const standardError = Math.sqrt(pooledVariance);

    if (standardError === 0) return 0;

    const tStatistic = meanDiff / standardError;

    // Convert to confidence (approximation)
    // t > 1.96 → 95% confidence
    // t > 2.58 → 99% confidence
    if (tStatistic > 2.58) return 0.99;
    if (tStatistic > 1.96) return 0.95;
    if (tStatistic > 1.65) return 0.90;
    if (tStatistic > 1.28) return 0.80;

    return Math.min(0.75, tStatistic / 2);
  }

  /**
   * Get real-time dashboard data
   */
  async getDashboardData(experimentId: string): Promise<{
    totalRequests: number;
    variantBreakdown: Array<{ variantId: string; requests: number; avgLatency: number }>;
    recentErrors: number;
    lastUpdated: Date;
  }> {
    const redis = getRedis();

    const experimentData = await redis.hget('experiments', experimentId);
    if (!experimentData) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    const experiment = JSON.parse(experimentData);
    const variants = experiment.variants;

    let totalRequests = 0;
    const variantBreakdown: Array<{ variantId: string; requests: number; avgLatency: number }> = [];

    for (const variant of variants) {
      const successKey = `aggregate:${experimentId}:${variant.id}:request_success`;
      const latencyKey = `aggregate:${experimentId}:${variant.id}:response_latency_ms`;

      const successData = await redis.get(successKey);
      const latencyData = await redis.get(latencyKey);

      const requests = successData ? JSON.parse(successData).count : 0;
      const avgLatency = latencyData
        ? JSON.parse(latencyData).sum / JSON.parse(latencyData).count
        : 0;

      totalRequests += requests;
      variantBreakdown.push({
        variantId: variant.id,
        requests,
        avgLatency: Math.round(avgLatency),
      });
    }

    // Count recent errors (last hour)
    let recentErrors = 0;
    for (const variant of variants) {
      const errorKey = `metrics:${experimentId}:${variant.id}:request_error`;
      const hourAgo = Date.now() - 60 * 60 * 1000;
      const errors = await redis.zcount(errorKey, hourAgo, Date.now());
      recentErrors += errors;
    }

    return {
      totalRequests,
      variantBreakdown,
      recentErrors,
      lastUpdated: new Date(),
    };
  }
}

// Export singleton instance
export const metricsCollector = MetricsCollector.getInstance();
