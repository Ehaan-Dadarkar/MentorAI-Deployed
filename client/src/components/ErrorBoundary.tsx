import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface ErrorBoundaryProps {
  children: ReactNode;
  // When this changes (e.g. the route), a caught error is cleared, so
  // navigating away from a broken screen recovers without a reload.
  resetKey?: string | number;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Class component on purpose: only class components can be error
// boundaries. A single render error used to whitescreen the whole app
// (Frontend M1); this catches it and shows a recoverable fallback
// instead. The error itself is logged, never rendered, so no stack
// trace or internal detail leaks into the UI.
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    // Log only; the fallback UI stays generic.
    console.error("ErrorBoundary caught a render error:", error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  private handleGoHome = () => {
    // Full reload to the home route: clears any bad in-memory state
    // that a plain retry would re-render into the same error.
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-screen items-center justify-center bg-bg px-4">
        <div className="max-w-sm text-center">
          <h3 className="mb-1 text-sm font-medium text-text-primary">
            SOMETHING WENT WRONG
          </h3>
          <p className="mb-4 text-xs text-text-secondary">
            This screen hit an unexpected error. Your saved data is
            untouched — try again, or go back home and come back to it.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={this.handleRetry}>TRY AGAIN</Button>
            <Button variant="outline" onClick={this.handleGoHome}>
              GO HOME
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
