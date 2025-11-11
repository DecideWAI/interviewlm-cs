import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(
            "flex h-9 w-full appearance-none rounded-md border border-border bg-background-secondary px-3 py-2 text-sm text-text-primary transition-colors pr-8",
            "hover:border-border-hover",
            "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-error focus:ring-error/40 focus:border-error",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
