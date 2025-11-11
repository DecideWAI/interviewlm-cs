"use client";

import { KPI } from "@/types/analytics";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  metric: KPI;
}

export function KPICard({ metric }: KPICardProps) {
  const getTrendIcon = () => {
    if (!metric.trend) return null;

    switch (metric.trend.direction) {
      case "up":
        return <TrendingUp className="h-4 w-4" />;
      case "down":
        return <TrendingDown className="h-4 w-4" />;
      default:
        return <Minus className="h-4 w-4" />;
    }
  };

  const getStatusColor = () => {
    switch (metric.status) {
      case "good":
        return "text-success";
      case "warning":
        return "text-warning";
      case "critical":
        return "text-error";
      default:
        return "text-text-primary";
    }
  };

  const getTrendColor = () => {
    if (!metric.trend) return "text-text-tertiary";

    switch (metric.trend.direction) {
      case "up":
        return "text-success";
      case "down":
        return "text-error";
      default:
        return "text-text-tertiary";
    }
  };

  return (
    <div className="bg-background-secondary border border-border rounded-lg p-6 hover:border-border-hover transition-all">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-text-tertiary">{metric.label}</p>
        {metric.trend && (
          <div className={cn("flex items-center gap-1 text-xs", getTrendColor())}>
            {getTrendIcon()}
            <span>{metric.trend.percentage}%</span>
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <p className={cn("text-3xl font-bold", getStatusColor())}>
          {metric.value}
        </p>
      </div>

      {metric.trend && (
        <p className="text-xs text-text-muted">
          {metric.trend.comparison}
        </p>
      )}
    </div>
  );
}
