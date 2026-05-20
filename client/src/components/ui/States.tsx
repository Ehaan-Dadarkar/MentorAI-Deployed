import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle, Info, XCircle } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className,
      )}
    >
      {icon && <div className="mb-4 text-text-muted">{icon}</div>}
      <h3 className="text-sm font-medium text-text-primary mb-1">{title}</h3>
      <p className="text-xs text-text-secondary mb-4 max-w-sm">{description}</p>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  message = "Something went wrong",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className,
      )}
    >
      <XCircle className="h-10 w-10 text-danger mb-4" />
      <h3 className="text-sm font-medium text-text-primary mb-1">Error</h3>
      <p className="text-xs text-text-secondary mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-accent hover:text-accent-hover transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export function LoadingSkeleton({ rows = 3, className }: LoadingSkeletonProps) {
  return (
    <div className={cn("space-y-3 p-4", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="h-4 bg-bg-elevated rounded w-3/4 mb-2" />
          <div className="h-3 bg-bg-elevated rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}
