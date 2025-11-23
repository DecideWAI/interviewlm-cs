'use client';

import { useState, useEffect } from 'react';
import {
  FlaskConical,
  Users,
  Activity,
  AlertTriangle,
  TrendingUp,
  Clock,
} from 'lucide-react';

// Mock data - would come from API
const mockStats = {
  activeExperiments: 3,
  totalAssignments: 12847,
  avgLatencyClaudeSdk: 1250,
  avgLatencyLangGraph: 980,
  errorRate: 0.02,
  alertsCount: 2,
};

const mockExperiments = [
  {
    id: 'exp_1',
    name: 'Agent Backend Comparison',
    status: 'running',
    trafficPercentage: 50,
    variants: [
      { name: 'Claude SDK', backend: 'claude-sdk', requests: 6423, avgLatency: 1250 },
      { name: 'LangGraph', backend: 'langgraph', requests: 6424, avgLatency: 980 },
    ],
  },
  {
    id: 'exp_2',
    name: 'Helpfulness Level Test',
    status: 'running',
    trafficPercentage: 20,
    variants: [
      { name: 'Pair Programming', backend: 'claude-sdk', requests: 1024, avgLatency: 1100 },
      { name: 'Full Copilot', backend: 'claude-sdk', requests: 1025, avgLatency: 1400 },
    ],
  },
];

export default function DashboardPage() {
  const [stats, setStats] = useState(mockStats);
  const [experiments, setExperiments] = useState(mockExperiments);

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Experiments"
          value={stats.activeExperiments}
          icon={FlaskConical}
          trend="+1 this week"
          trendUp
        />
        <StatCard
          title="Total Assignments"
          value={stats.totalAssignments.toLocaleString()}
          icon={Users}
          trend="+2,847 today"
          trendUp
        />
        <StatCard
          title="Avg Latency (LangGraph)"
          value={`${stats.avgLatencyLangGraph}ms`}
          icon={Clock}
          trend="-270ms vs Claude SDK"
          trendUp
        />
        <StatCard
          title="Security Alerts"
          value={stats.alertsCount}
          icon={AlertTriangle}
          trend={stats.alertsCount > 0 ? 'Action required' : 'All clear'}
          trendUp={stats.alertsCount === 0}
          alert={stats.alertsCount > 0}
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
          {experiments.map((exp) => (
            <div key={exp.id} className="px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-medium text-text-primary">{exp.name}</h3>
                  <p className="text-sm text-text-tertiary">
                    {exp.trafficPercentage}% traffic allocation
                  </p>
                </div>
                <span className="px-2 py-1 bg-success/10 text-success text-xs font-medium rounded">
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
          ))}
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
          href="/security/audit"
          icon={Activity}
        />
        <QuickActionCard
          title="Security Alerts"
          description="Review and acknowledge security alerts"
          href="/security/alerts"
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
