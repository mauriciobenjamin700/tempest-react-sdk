import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

export interface ErrorBoundaryRenderProps {
    error: Error;
    reset: () => void;
}

export interface ErrorBoundaryProps {
    children: ReactNode;
    /**
     * Element shown when a descendant throws. Receives the captured error and
     * a `reset` callback that clears the boundary state.
     */
    fallback: ReactNode | ((props: ErrorBoundaryRenderProps) => ReactNode);
    /** Forwarded to your error tracker (Sentry, Datadog, console, etc.). */
    onError?: (error: Error, info: ErrorInfo) => void;
    /**
     * When any value in this array changes, the boundary automatically resets.
     * Useful for clearing the error after a navigation.
     */
    resetKeys?: readonly unknown[];
}

interface ErrorBoundaryState {
    error: Error | null;
}

function keysChanged(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
        if (!Object.is(a[i], b[i])) return true;
    }
    return false;
}

/**
 * Class-based React error boundary with a render-prop or static fallback.
 * Auto-resets when any value in `resetKeys` changes.
 *
 * @example
 * <ErrorBoundary
 *     resetKeys={[location.pathname]}
 *     onError={(err) => reportError(err)}
 *     fallback={({ error, reset }) => (
 *         <ErrorState description={error.message} onRetry={reset} />
 *     )}
 * >
 *     <App />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    override state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    override componentDidCatch(error: Error, info: ErrorInfo): void {
        this.props.onError?.(error, info);
    }

    override componentDidUpdate(previousProps: ErrorBoundaryProps): void {
        if (
            this.state.error &&
            keysChanged(previousProps.resetKeys, this.props.resetKeys)
        ) {
            this.reset();
        }
    }

    reset = (): void => {
        this.setState({ error: null });
    };

    override render(): ReactNode {
        const { error } = this.state;
        if (!error) return this.props.children;

        const { fallback } = this.props;
        if (typeof fallback === "function") {
            return fallback({ error, reset: this.reset });
        }
        return fallback;
    }
}
