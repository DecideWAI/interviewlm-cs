import * as React from "react";
import { cn } from "@/lib/utils";

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

const sizeClasses = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-7xl",
  xl: "max-w-[1400px]",
  full: "max-w-full",
};

export function Container({
  className,
  size = "xl",
  children,
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full px-6 py-6", sizeClasses[size], className)}
      {...props}
    >
      {children}
    </div>
  );
}
