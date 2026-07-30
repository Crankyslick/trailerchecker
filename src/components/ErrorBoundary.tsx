import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

/**
 * Top-level React error boundary. Catches render/lifecycle exceptions in any
 * page component so a single bad row or null field can't blank the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", this.props.label ?? "app", error, info?.componentStack);
    reportLovableError(error, { boundary: this.props.label ?? "app_error_boundary" });
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="kpi-card p-6 border !border-danger/40 bg-danger/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              {this.props.label ? `${this.props.label} hit an error` : "Something went wrong"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This section failed to render. The rest of the app is still running.
            </p>
            <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-surface-2/60 p-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words">
              {error?.message ?? "Unknown error"}
            </pre>
            <button
              onClick={this.reset}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
