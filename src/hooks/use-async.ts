import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncStatus = "idle" | "pending" | "success" | "error";

export interface UseAsyncResult<T> {
    status: AsyncStatus;
    data: T | undefined;
    error: unknown;
    isPending: boolean;
    isSuccess: boolean;
    isError: boolean;
    /** Trigger the async function. Resolves with the new data or rejects. */
    run: () => Promise<T>;
    /** Reset state back to idle. */
    reset: () => void;
}

/**
 * Run an async function and track its `idle/pending/success/error` state.
 *
 * - Discards results from stale runs (race-condition safe).
 * - `immediate` (default `false`) triggers the function on mount and when
 *   `deps` change. With `false`, call `run()` manually.
 * - Returns a stable object so callers can destructure or pass around safely.
 *
 * For server data with caching, prefer React Query — `useAsync` is the
 * minimal one-shot primitive without dependencies.
 */
export function useAsync<T>(
    asyncFn: () => Promise<T>,
    deps: ReadonlyArray<unknown> = [],
    options: { immediate?: boolean } = {},
): UseAsyncResult<T> {
    const { immediate = false } = options;
    const [state, setState] = useState<{
        status: AsyncStatus;
        data: T | undefined;
        error: unknown;
    }>({ status: "idle", data: undefined, error: undefined });

    const fnRef = useRef(asyncFn);
    fnRef.current = asyncFn;
    const callIdRef = useRef<number>(0);
    const mountedRef = useRef<boolean>(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const run = useCallback(async (): Promise<T> => {
        const callId = ++callIdRef.current;
        setState((current) => ({ ...current, status: "pending", error: undefined }));
        try {
            const data = await fnRef.current();
            if (mountedRef.current && callIdRef.current === callId) {
                setState({ status: "success", data, error: undefined });
            }
            return data;
        } catch (error) {
            if (mountedRef.current && callIdRef.current === callId) {
                setState({ status: "error", data: undefined, error });
            }
            throw error;
        }
    }, []);

    const reset = useCallback((): void => {
        callIdRef.current++;
        setState({ status: "idle", data: undefined, error: undefined });
    }, []);

    useEffect(() => {
        if (!immediate) return;
        run().catch(() => {
            /* error already captured in state */
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [immediate, ...deps]);

    return {
        status: state.status,
        data: state.data,
        error: state.error,
        isPending: state.status === "pending",
        isSuccess: state.status === "success",
        isError: state.status === "error",
        run,
        reset,
    };
}
