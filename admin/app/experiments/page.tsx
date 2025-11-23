'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Play,
  Pause,
  BarChart3,
  Settings,
  Trash2,
  Check,
  Clock,
  Users,
} from 'lucide-react';

// Mock data
const mockExperiments = [
  {
    id: 'exp_001',
    name: 'Agent Backend Comparison v1',
    description: 'Compare Claude SDK vs LangGraph for coding assistance',
    status: 'running',
    trafficPercentage: 50,
    primaryMetric: 'response_latency_ms',
    startedAt: '2025-11-20T10:00:00Z',
    variants: [
      {
        id: 'var_001',
        name: 'Control (Claude SDK)',
        backend: 'claude-sdk',
        weight: 50,
        metrics: { requests: 6423, avgLatency: 1250, errorRate: 0.018 },
      },
      {
        id: 'var_002',
        name: 'Treatment (LangGraph)',
        backend: 'langgraph',
        weight: 50,
        metrics: { requests: 6424, avgLatency: 980, errorRate: 0.012 },
      },
    ],
    results: {
      winner: 'var_002',
      confidence: 0.95,
      improvement: '-21.6%',
    },
  },
  {
    id: 'exp_002',
    name: 'Helpfulness Level Test',
    description: 'Test different helpfulness levels for candidate experience',
    status: 'running',
    trafficPercentage: 20,
    primaryMetric: 'completion_rate',
    startedAt: '2025-11-22T14:00:00Z',
    variants: [
      {
        id: 'var_003',
        name: 'Pair Programming',
        backend: 'claude-sdk',
        weight: 50,
        metrics: { requests: 1024, avgLatency: 1100, errorRate: 0.02 },
      },
      {
        id: 'var_004',
        name: 'Full Copilot',
        backend: 'claude-sdk',
        weight: 50,
        metrics: { requests: 1025, avgLatency: 1400, errorRate: 0.015 },
      },
    ],
    results: null,
  },
  {
    id: 'exp_003',
    name: 'Model Comparison Test',
    description: 'Compare different Claude models for evaluation quality',
    status: 'draft',
    trafficPercentage: 10,
    primaryMetric: 'evaluation_accuracy',
    startedAt: null,
    variants: [
      {
        id: 'var_005',
        name: 'Sonnet',
        backend: 'claude-sdk',
        weight: 50,
        metrics: { requests: 0, avgLatency: 0, errorRate: 0 },
      },
      {
        id: 'var_006',
        name: 'Haiku',
        backend: 'claude-sdk',
        weight: 50,
        metrics: { requests: 0, avgLatency: 0, errorRate: 0 },
      },
    ],
    results: null,
  },
];

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState(mockExperiments);
  const [filter, setFilter] = useState<'all' | 'running' | 'draft' | 'completed'>('all');

  const filteredExperiments = experiments.filter((exp) =>
    filter === 'all' ? true : exp.status === filter,
  );

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

      {/* Experiments List */}
      <div className="space-y-4">
        {filteredExperiments.map((exp) => (
          <ExperimentCard key={exp.id} experiment={exp} />
        ))}
      </div>

      {filteredExperiments.length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-tertiary">No experiments found</p>
        </div>
      )}
    </div>
  );
}

function ExperimentCard({ experiment }: { experiment: typeof mockExperiments[0] }) {
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
              <button className="p-2 text-text-tertiary hover:text-warning hover:bg-warning/10 rounded-lg transition-colors">
                <Pause className="h-4 w-4" />
              </button>
            )}
            {experiment.status === 'draft' && (
              <button className="p-2 text-text-tertiary hover:text-success hover:bg-success/10 rounded-lg transition-colors">
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
        {experiment.results && (
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
