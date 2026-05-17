import { useCallback, useState } from "react";

/**
 * Hook that propagates errors to the nearest {@link ErrorBoundary}.
 *
 * React error boundaries only catch errors thrown during render. Async errors
 * (failed mutations, websocket failures, etc.) need to be re-thrown in a
 * render pass — that is what `throwError` does.
 *
 * @example
 * const throwError = useErrorHandler();
 * useEffect(() => {
 *     stream.on("error", throwError);
 * }, []);
 */
export function useErrorHandler(): (error: unknown) => void {
    const [, setState] = useState<Error | null>(null);
    return useCallback((error: unknown) => {
        setState(() => {
            throw error instanceof Error ? error : new Error(String(error));
        });
    }, []);
}
