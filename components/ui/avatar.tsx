import * as React from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
};

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, size = "md", ...props }, ref) => {
    const [imageError, setImageError] = React.useState(false);

    const initials = React.useMemo(() => {
      if (fallback) {
        return fallback
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);
      }
      return "?";
    }, [fallback]);

    return (
      <div
        ref={ref}
        className={cn(
          "relative inline-flex items-center justify-center rounded-full bg-background-tertiary border border-border overflow-hidden",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {src && !imageError ? (
          <img
            src={src}
            alt={alt || fallback}
            onError={() => setImageError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="font-medium text-text-secondary">{initials}</span>
        )}
      </div>
    );
  }
);
Avatar.displayName = "Avatar";

export { Avatar };
