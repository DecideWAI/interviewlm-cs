'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Plus,
  Play,
  Pause,
  BarChart3,
  Settings,
  Check,
  Clock,
  Users,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { fetchExperiments, startExperiment, pauseExperiment } from '@/lib/api-client';
import type { ExperimentListItem } from '@/lib/types';

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<ExperimentListItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'running' | 'draft' | 'completed'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadExperiments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchExperiments(filter);
      setExperiments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load experiments');
      console.error('Experiments error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExperiments();
  }, [filter]);

  const handleStart = async (id: string) => {
    try {
      await startExperiment(id);
      loadExperiments();
    } catch (err) {
      console.error('Failed to start experiment:', err);
    }
  };

  const handlePause = async (id: string) => {
    try {
      await pauseExperiment(id);
      loadExperiments();
    } catch (err) {
      console.error('Failed to pause experiment:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Experiments</h1>
          <p className="text-text-tertiary mt-1">
            Manage A/B tests between agent backends
          </p>
        </div>
        <Link
          href="/experiments/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Experiment
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'running', 'draft', 'completed'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              filter === status
                ? 'bg-primary/10 text-primary'
                : 'text-text-tertiary hover:text-text-primary hover:bg-background-hover'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-error mx-auto mb-4" />
          <p className="text-text-primary font-medium">Failed to load experiments</p>
          <p className="text-text-tertiary text-sm mt-1">{error}</p>
          <button
            onClick={loadExperiments}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
          >
            Retry
          </button>
        </div>
      )}

      {/* Experiments List */}
      {!loading && !error && (
        <div className="space-y-4">
          {experiments.map((exp) => (
            <ExperimentCard
              key={exp.id}
              experiment={exp}
              onStart={() => handleStart(exp.id)}
              onPause={() => handlePause(exp.id)}
            />
          ))}
        </div>
      )}

      {!loading && !error && experiments.length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-tertiary">No experiments found</p>
          <Link
            href="/experiments/new"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            Create your first experiment
          </Link>
        </div>
      )}
    </div>
  );
}

function ExperimentCard({
  experiment,
  onStart,
  onPause,
}: {
  experiment: ExperimentListItem;
  onStart: () => void;
  onPause: () => void;
}) {
  const statusColors = {
    running: 'bg-success/10 text-success',
    draft: 'bg-warning/10 text-warning',
    completed: 'bg-info/10 text-info',
    paused: 'bg-text-tertiary/10 text-text-tertiary',
  };

  return (
    <div className="bg-background-secondary border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-medium text-text-primary">
                {experiment.name}
              </h3>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded ${
                  statusColors[experiment.status as keyof typeof statusColors]
                }`}
              >
                {experiment.status}
              </span>
            </div>
            <p className="text-sm text-text-tertiary mt-1">
              {experiment.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {experiment.status === 'running' && (
              <button
                onClick={onPause}
                className="p-2 text-text-tertiary hover:text-warning hover:bg-warning/10 rounded-lg transition-colors"
              >
                <Pause className="h-4 w-4" />
              </button>
            )}
            {experiment.status === 'draft' && (
              <button
                onClick={onStart}
                className="p-2 text-text-tertiary hover:text-success hover:bg-success/10 rounded-lg transition-colors"
              >
                <Play className="h-4 w-4" />
              </button>
            )}
            <Link
              href={`/experiments/${experiment.id}`}
              className="p-2 text-text-tertiary hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
            </Link>
            <Link
              href={`/experiments/${experiment.id}/settings`}
              className="p-2 text-text-tertiary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-6 mt-4 text-sm text-text-tertiary">
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {experiment.trafficPercentage}% traffic
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {experiment.startedAt
              ? `Started ${new Date(experiment.startedAt).toLocaleDateString()}`
              : 'Not started'}
          </div>
          <div>
            Primary: <span className="text-text-secondary">{experiment.primaryMetric}</span>
          </div>
        </div>
      </div>

      {/* Variants */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-2 gap-4">
          {experiment.variants.map((variant) => (
            <div
              key={variant.id}
              className="bg-background-tertiary rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-text-primary">{variant.name}</span>
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
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Requests</span>
                  <span className="text-text-secondary">
                    {variant.metrics.requests.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Avg Latency</span>
                  <span className="text-text-secondary">
                    {variant.metrics.avgLatency}ms
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Error Rate</span>
                  <span className="text-text-secondary">
                    {(variant.metrics.errorRate * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Results */}
        {experiment.results && experiment.results.winner && (
          <div className="mt-4 p-4 bg-success/5 border border-success/20 rounded-lg">
            <div className="flex items-center gap-2 text-success">
              <Check className="h-4 w-4" />
              <span className="font-medium">
                Winner: {experiment.variants.find((v) => v.id === experiment.results?.winner)?.name}
              </span>
            </div>
            <div className="mt-2 text-sm text-text-secondary">
              {experiment.results.improvement} improvement with {(experiment.results.confidence * 100).toFixed(0)}% confidence
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
