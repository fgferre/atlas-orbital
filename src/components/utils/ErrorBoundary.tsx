import { Component, type ErrorInfo, type ReactNode } from "react";
import { telemetry } from "../../lib/telemetry";

type FallbackRender = (props: { error: Error; reset: () => void }) => ReactNode;

interface Props {
  children: ReactNode;
  fallback: ReactNode | FallbackRender;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    telemetry.error("error", "Uncaught error in ErrorBoundary", {
      error,
      componentStack: errorInfo.componentStack,
    });
  }

  private reset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      if (typeof fallback === "function") {
        // Non-null assertion: when hasError is true, error is always set
        // by getDerivedStateFromError.
        return (fallback as FallbackRender)({
          error: this.state.error as Error,
          reset: this.reset,
        });
      }
      return fallback;
    }

    return this.props.children;
  }
}
