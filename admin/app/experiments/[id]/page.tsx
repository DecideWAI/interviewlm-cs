'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  Users,
  Activity,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  fetchExperiment,
  startExperiment,
  pauseExperiment,
  completeExperiment,
} from '@/lib/api-client';
import type { ExperimentListItem, ExperimentVariantWithMetrics } from '@/lib/types';

export default function ExperimentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [experiment, setExperiment] = useState<ExperimentListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'metrics' | 'logs'>('overview');

  const loadExperiment = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchExperiment(params.id as string);
      setExperiment(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load experiment');
      console.error('Experiment error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) {
      loadExperiment();
    }
  }, [params.id]);

  const handleStart = async () => {
    if (!experiment) return;
    try {
      await startExperiment(experiment.id);
      loadExperiment();
    } catch (err) {
      console.error('Failed to start experiment:', err);
    }
  };

  const handlePause = async () => {
    if (!experiment) return;
    try {
      await pauseExperiment(experiment.id);
      loadExperiment();
    } catch (err) {
      console.error('Failed to pause experiment:', err);
    }
  };

  const handleStop = async () => {
    if (!experiment) return;
    try {
      await completeExperiment(experiment.id);
      loadExperiment();
    } catch (err) {
      console.error('Failed to stop experiment:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !experiment) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 text-error mx-auto mb-4" />
        <p className="text-text-primary font-medium">Failed to load experiment</p>
        <p className="text-text-tertiary text-sm mt-1">{error || 'Experiment not found'}</p>
        <button
          onClick={loadExperiment}
          className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  const controlVariant = experiment.variants[0];
  const treatmentVariant = experiment.variants[1];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/experiments"
            className="inline-flex items-center gap-2 text-text-tertiary hover:text-text-primary mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Experiments
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-text-primary">
              {experiment.name}
            </h1>
            <StatusBadge status={experiment.status} />
          </div>
          <p className="text-text-tertiary mt-1">{experiment.description}</p>
        </div>

        <div className="flex items-center gap-2">
          {experiment.status === 'running' && (
            <>
              <button
                onClick={handlePause}
                className="flex items-center gap-2 px-4 py-2 bg-warning/10 text-warning rounded-lg hover:bg-warning/20 transition-colors"
              >
                <Pause className="h-4 w-4" />
                Pause
              </button>
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            </>
          )}
          {experiment.status === 'draft' && (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
            >
              <Play className="h-4 w-4" />
              Start Experiment
            </button>
          )}
          {experiment.status === 'paused' && (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
            >
              <Play className="h-4 w-4" />
              Resume
            </button>
          )}
        </div>
      </div>

      {/* Meta Info */}
      <div className="flex flex-wrap gap-6 text-sm text-text-tertiary">
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          {experiment.trafficPercentage}% traffic allocation
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          {experiment.startedAt
            ? `Started ${new Date(experiment.startedAt).toLocaleDateString()}`
            : 'Not started'}
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="h-4 w-4" />
          {experiment.results?.sampleSize?.toLocaleString() || '0'} total sessions
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-6">
          {(['overview', 'metrics', 'logs'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Results Summary */}
          {experiment.results && experiment.results.winner && (
            <div className="bg-success/5 border border-success/20 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <h2 className="text-lg font-medium text-success">
                  Winner: {experiment.variants.find((v) => v.id === experiment.results?.winner)?.name}
                </h2>
              </div>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-text-tertiary">Improvement</div>
                  <div className="text-2xl font-semibold text-success">
                    {experiment.results.improvement}
                  </div>
                  <div className="text-xs text-text-muted">in {experiment.primaryMetric}</div>
                </div>
                <div>
                  <div className="text-sm text-text-tertiary">Confidence</div>
                  <div className="text-2xl font-semibold text-text-primary">
                    {(experiment.results.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-text-muted">statistical significance</div>
                </div>
                <div>
                  <div className="text-sm text-text-tertiary">Sample Size</div>
                  <div className="text-2xl font-semibold text-text-primary">
                    {experiment.results.sampleSize.toLocaleString()}
                  </div>
                  <div className="text-xs text-text-muted">total sessions</div>
                </div>
              </div>
            </div>
          )}

          {/* Variant Comparison */}
          <div className="grid grid-cols-2 gap-6">
            {experiment.variants.map((variant) => (
              <VariantCard
                key={variant.id}
                variant={variant}
                isWinner={experiment.results?.winner === variant.id}
              />
            ))}
          </div>

          {/* Metric Comparison Table */}
          {controlVariant && treatmentVariant && (
            <div className="bg-background-secondary border border-border rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h3 className="text-lg font-medium text-text-primary">Metric Comparison</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-background-tertiary">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase">
                        Metric
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-text-tertiary uppercase">
                        {controlVariant.name}
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-text-tertiary uppercase">
                        {treatmentVariant.name}
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-text-tertiary uppercase">
                        Change
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <MetricRow
                      label="Avg Latency"
                      control={controlVariant.metrics.avgLatency}
                      treatment={treatmentVariant.metrics.avgLatency}
                      unit="ms"
                      lowerIsBetter
                    />
                    <MetricRow
                      label="P95 Latency"
                      control={controlVariant.metrics.p95Latency}
                      treatment={treatmentVariant.metrics.p95Latency}
                      unit="ms"
                      lowerIsBetter
                    />
                    <MetricRow
                      label="Error Rate"
                      control={controlVariant.metrics.errorRate * 100}
                      treatment={treatmentVariant.metrics.errorRate * 100}
                      unit="%"
                      lowerIsBetter
                      decimals={2}
                    />
                    <MetricRow
                      label="Completion Rate"
                      control={controlVariant.metrics.completionRate * 100}
                      treatment={treatmentVariant.metrics.completionRate * 100}
                      unit="%"
                      decimals={1}
                    />
                    <MetricRow
                      label="Token Usage"
                      control={controlVariant.metrics.tokenUsage}
                      treatment={treatmentVariant.metrics.tokenUsage}
                      unit=""
                      lowerIsBetter
                    />
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="space-y-6">
          <div className="bg-background-secondary border border-border rounded-lg p-6">
            <h3 className="text-lg font-medium text-text-primary mb-4">
              Latency Over Time
            </h3>
            <div className="h-64 bg-background-tertiary rounded-lg flex items-center justify-center text-text-muted">
              Chart: Latency trends for both variants over time
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-background-secondary border border-border rounded-lg p-6">
              <h3 className="text-lg font-medium text-text-primary mb-4">
                Error Rate Distribution
              </h3>
              <div className="h-48 bg-background-tertiary rounded-lg flex items-center justify-center text-text-muted">
                Chart: Error rate histogram
              </div>
            </div>
            <div className="bg-background-secondary border border-border rounded-lg p-6">
              <h3 className="text-lg font-medium text-text-primary mb-4">
                Token Usage Distribution
              </h3>
              <div className="h-48 bg-background-tertiary rounded-lg flex items-center justify-center text-text-muted">
                Chart: Token usage histogram
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-background-secondary border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-medium text-text-primary">Experiment Activity</h3>
          </div>
          <div className="divide-y divide-border">
            <div className="px-6 py-8 text-center text-text-tertiary">
              Activity logs will appear here once the experiment is running
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    running: 'bg-success/10 text-success',
    draft: 'bg-warning/10 text-warning',
    completed: 'bg-info/10 text-info',
    paused: 'bg-text-tertiary/10 text-text-tertiary',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors[status as keyof typeof colors]}`}>
      {status}
    </span>
  );
}

function VariantCard({
  variant,
  isWinner,
}: {
  variant: ExperimentVariantWithMetrics;
  isWinner: boolean;
}) {
  return (
    <div
      className={`bg-background-secondary border rounded-lg p-6 ${
        isWinner ? 'border-success/40' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary">{variant.name}</span>
          {isWinner && (
            <span className="px-2 py-0.5 text-xs font-medium bg-success/10 text-success rounded">
              Winner
            </span>
          )}
        </div>
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            variant.backend === 'langgraph'
              ? 'bg-info/10 text-info'
              : 'bg-primary/10 text-primary'
          }`}
        >
          {variant.backend}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-text-tertiary">Total Requests</div>
          <div className="text-lg font-semibold text-text-primary">
            {variant.metrics.requests.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-tertiary">Avg Latency</div>
          <div className="text-lg font-semibold text-text-primary">
            {variant.metrics.avgLatency}ms
          </div>
        </div>
        <div>
          <div className="text-xs text-text-tertiary">Error Rate</div>
          <div className="text-lg font-semibold text-text-primary">
            {(variant.metrics.errorRate * 100).toFixed(2)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-text-tertiary">Weight</div>
          <div className="text-lg font-semibold text-text-primary">{variant.weight}%</div>
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  control,
  treatment,
  unit,
  lowerIsBetter = false,
  decimals = 0,
}: {
  label: string;
  control: number;
  treatment: number;
  unit: string;
  lowerIsBetter?: boolean;
  decimals?: number;
}) {
  const change = control > 0 ? ((treatment - control) / control) * 100 : 0;
  const isImprovement = lowerIsBetter ? change < 0 : change > 0;

  return (
    <tr>
      <td className="px-6 py-4 text-sm text-text-primary">{label}</td>
      <td className="px-6 py-4 text-sm text-text-secondary text-right">
        {control.toFixed(decimals)}{unit}
      </td>
      <td className="px-6 py-4 text-sm text-text-secondary text-right">
        {treatment.toFixed(decimals)}{unit}
      </td>
      <td className="px-6 py-4 text-right">
        <span
          className={`inline-flex items-center gap-1 text-sm ${
            isImprovement ? 'text-success' : 'text-error'
          }`}
        >
          {isImprovement ? (
            <TrendingDown className="h-3 w-3" />
          ) : (
            <TrendingUp className="h-3 w-3" />
          )}
          {Math.abs(change).toFixed(1)}%
        </span>
      </td>
    </tr>
  );
}
