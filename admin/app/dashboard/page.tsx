'use client';

import { useState, useEffect } from 'react';
import {
  FlaskConical,
  Users,
  Activity,
  AlertTriangle,
  TrendingUp,
  Clock,
  Loader2,
} from 'lucide-react';
import { fetchDashboardData } from '@/lib/api-client';
import type { DashboardStats, DashboardExperiment } from '@/lib/types';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [experiments, setExperiments] = useState<DashboardExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchDashboardData();
      setStats(data.stats);
      setExperiments(data.experiments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 text-error mx-auto mb-4" />
        <p className="text-text-primary font-medium">Failed to load dashboard</p>
        <p className="text-text-tertiary text-sm mt-1">{error}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Experiments"
          value={stats?.activeExperiments ?? 0}
          icon={FlaskConical}
          trend={`+${stats?.experimentsThisWeek ?? 0} this week`}
          trendUp
        />
        <StatCard
          title="Total Assignments"
          value={(stats?.totalAssignments ?? 0).toLocaleString()}
          icon={Users}
          trend={`+${(stats?.assignmentsToday ?? 0).toLocaleString()} today`}
          trendUp
        />
        <StatCard
          title="Avg Latency (LangGraph)"
          value={`${stats?.avgLatencyLangGraph ?? 0}ms`}
          icon={Clock}
          trend={stats?.avgLatencyClaudeSdk ? `${(stats.avgLatencyLangGraph ?? 0) - stats.avgLatencyClaudeSdk}ms vs Claude SDK` : '—'}
          trendUp={(stats?.avgLatencyLangGraph ?? 0) < (stats?.avgLatencyClaudeSdk ?? 0)}
        />
        <StatCard
          title="Security Alerts"
          value={stats?.alertsCount ?? 0}
          icon={AlertTriangle}
          trend={(stats?.alertsCount ?? 0) > 0 ? 'Action required' : 'All clear'}
          trendUp={(stats?.alertsCount ?? 0) === 0}
          alert={(stats?.alertsCount ?? 0) > 0}
        />
      </div>

      {/* Experiments Overview */}
      <div className="bg-background-secondary border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            Active Experiments
          </h2>
          <a
            href="/experiments"
            className="text-sm text-primary hover:text-primary-hover"
          >
            View all →
          </a>
        </div>
        <div className="divide-y divide-border">
          {experiments.length === 0 ? (
            <div className="px-6 py-8 text-center text-text-tertiary">
              No active experiments. <a href="/experiments/new" className="text-primary hover:text-primary-hover">Create one</a>
            </div>
          ) : (
            experiments.map((exp) => (
              <div key={exp.id} className="px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-text-primary">{exp.name}</h3>
                    <p className="text-sm text-text-tertiary">
                      {exp.trafficPercentage}% traffic allocation
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                    exp.status === 'running'
                      ? 'bg-success/10 text-success'
                      : exp.status === 'paused'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-text-tertiary/10 text-text-tertiary'
                  }`}>
                    {exp.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {exp.variants.map((variant, i) => (
                    <div
                      key={i}
                      className="bg-background-tertiary rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-text-primary">
                          {variant.name}
                        </span>
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
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-tertiary">
                          {variant.requests.toLocaleString()} requests
                        </span>
                        <span className="text-text-secondary">
                          {variant.avgLatency}ms avg
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickActionCard
          title="Create Experiment"
          description="Set up a new A/B test between agent backends"
          href="/experiments/new"
          icon={FlaskConical}
        />
        <QuickActionCard
          title="View Audit Logs"
          description="Review recent admin actions and security events"
          href="/security"
          icon={Activity}
        />
        <QuickActionCard
          title="Security Alerts"
          description="Review and acknowledge security alerts"
          href="/security"
          icon={AlertTriangle}
        />
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
  alert,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend: string;
  trendUp: boolean;
  alert?: boolean;
}) {
  return (
    <div className="bg-background-secondary border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-text-tertiary text-sm">{title}</span>
        <Icon className={`h-5 w-5 ${alert ? 'text-error' : 'text-text-tertiary'}`} />
      </div>
      <div className="text-2xl font-semibold text-text-primary mb-1">
        {value}
      </div>
      <div
        className={`text-xs flex items-center gap-1 ${
          alert
            ? 'text-error'
            : trendUp
            ? 'text-success'
            : 'text-text-tertiary'
        }`}
      >
        {trendUp && !alert && <TrendingUp className="h-3 w-3" />}
        {trend}
      </div>
    </div>
  );
}

function QuickActionCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
}) {
  return (
    <a
      href={href}
      className="bg-background-secondary border border-border rounded-lg p-4 hover:border-primary/40 transition-colors group"
    >
      <Icon className="h-8 w-8 text-primary mb-3" />
      <h3 className="font-medium text-text-primary group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-sm text-text-tertiary mt-1">{description}</p>
    </a>
  );
}
