"use client";

import { PipelineFunnel } from "@/types/analytics";
import { cn } from "@/lib/utils";

interface PipelineFunnelChartProps {
  data: PipelineFunnel;
}

export function PipelineFunnelChart({ data }: PipelineFunnelChartProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            Candidate Pipeline
          </h3>
          <p className="text-sm text-text-tertiary">
            Overall conversion: {(data.overallConversion * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Funnel Stages */}
      <div className="space-y-3">
        {data.stages.map((stage, index) => {
          const isLast = index === data.stages.length - 1;
          const maxCount = data.stages[0].count;
          const widthPercentage = (stage.count / maxCount) * 100;

          return (
            <div key={stage.name}>
              {/* Stage Bar */}
              <div className="relative">
                <div
                  className={cn(
                    "relative h-14 rounded-lg transition-all group hover:opacity-90",
                    "bg-gradient-to-r from-primary/20 to-primary/10",
                    "border border-primary/30"
                  )}
                  style={{ width: `${widthPercentage}%` }}
                >
                  <div className="absolute inset-0 flex items-center justify-between px-4">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {stage.name}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {stage.avgDaysInStage} {stage.avgDaysInStage === 1 ? "day" : "days"} avg
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-text-primary">
                        {stage.count}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {stage.percentage}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Conversion Rate Arrow */}
                {!isLast && stage.conversionToNext !== undefined && (
                  <div className="absolute -bottom-2 left-full ml-3 flex items-center gap-1">
                    <div className="text-xs text-text-muted">
                      {(stage.conversionToNext * 100).toFixed(0)}%
                    </div>
                    <svg
                      className="h-4 w-4 text-text-muted"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
