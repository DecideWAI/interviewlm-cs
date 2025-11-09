"use client";

import * as React from "react";
import { Search, Command } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface HeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ className, title, subtitle, actions, ...props }: HeaderProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6",
        className
      )}
      {...props}
    >
      <div className="flex-1">
        {title && (
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
            {subtitle && <p className="text-sm text-text-secondary">{subtitle}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Quick search */}
        <button className="flex items-center gap-2 rounded-md border border-border bg-background-secondary px-3 py-1.5 text-sm text-text-muted hover:border-border-hover hover:text-text-secondary transition-all">
          <Search className="h-4 w-4" />
          <span>Quick search...</span>
          <div className="ml-2 flex items-center gap-0.5">
            <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-text-muted">
              <Command className="h-3 w-3" />
            </kbd>
            <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-text-muted">
              K
            </kbd>
          </div>
        </button>

        {actions}
      </div>
    </div>
  );
}
