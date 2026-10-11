import { useEffect, useRef, useState } from "react";

export interface UseOAuthCallbackOptions<T> {
    /** Function that exchanges the provider response for an app session. Called once on mount. */
    exchange: () => Promise<T>;
    /** Fired with the result on success. Receives the value resolved by `exchange`. */
    onSuccess?: (result: T) => void | Promise<void>;
    /** Fired when `exchange` throws or rejects. */
    onError?: (error: unknown) => void;
}

export interface UseOAuthCallbackResult<T> {
    /** `true` while the exchange promise is pending. */
    loading: boolean;
    /** Last resolved value, when `status === "success"`. */
    data: T | null;
    /** Last rejection reason, when `status === "error"`. */
    error: unknown;
    /** Aggregated state — `"pending"`, `"success"`, or `"error"`. */
    status: "pending" | "success" | "error";
}

/**
 * Run an OAuth-callback "exchange" exactly once on mount. Designed for
 * `/callback` routes that receive provider redirects and need to swap a
 * code/token for an app session via the backend.
 *
 * Runs `exchange` once per logical mount and keeps its result. StrictMode's
 * simulated unmount/remount in dev and a parent re-render with inline
 * callbacks used to cancel the only exchange and skip the second, leaving the
 * hook `"pending"` forever with the single-use code already spent. Now the
 * options live in a latest-value ref, the effect has no dependencies, and the
 * result is dropped only when the component is still unmounted when it lands.
 * The newest `onSuccess`/`onError` are the ones called.
 *
 * For a provider redirect, the exchange must carry the `state` along with the
 * `code`, or no backend can tell a forged callback from a real one (login
 * CSRF). `exchangeOAuthCallback` does that against a
 * `tempest-fastapi-sdk` backend; `readOAuthCallbackParams` returns both
 * values (or throws) for any other backend.
 *
 * @example
 * function OAuthCallback() {
 *     const { loading, error } = useOAuthCallback<LoginResponse>({
 *         exchange: () => exchangeOAuthCallback<LoginResponse>(api, "google"),
 *         onSuccess: ({ user_id, access_token }) => {
 *             useAuthStore.getState().setSession({ user: { id: user_id }, token: access_token });
 *             navigate("/dashboard", { replace: true });
 *         },
 *         onError: () => navigate("/login?error=oauth", { replace: true }),
 *     });
 *
 *     if (loading) return <Spinner />;
 *     if (error) return <ErrorState description="OAuth falhou" />;
 *     return null;
 * }
 */
export function useOAuthCallback<T>(
    options: UseOAuthCallbackOptions<T>,
): UseOAuthCallbackResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
    const optionsRef = useRef<UseOAuthCallbackOptions<T>>(options);
    const ranRef = useRef<boolean>(false);
    const mountedRef = useRef<boolean>(false);

    useEffect(() => {
        optionsRef.current = options;
    });

    useEffect(() => {
        mountedRef.current = true;
        if (!ranRef.current) {
            ranRef.current = true;
            optionsRef.current
                .exchange()
                .then((result) => {
                    if (!mountedRef.current) return;
                    setData(result);
                    setStatus("success");
                    return optionsRef.current.onSuccess?.(result);
                })
                .catch((err: unknown) => {
                    if (!mountedRef.current) return;
                    setError(err);
                    setStatus("error");
                    optionsRef.current.onError?.(err);
                });
        }
        return () => {
            mountedRef.current = false;
        };
    }, []);

    return { loading: status === "pending", data, error, status };
}
