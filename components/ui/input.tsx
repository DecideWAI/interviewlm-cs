import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-border bg-background-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-colors",
          "hover:border-border-hover",
          "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-error focus:ring-error/40 focus:border-error",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
