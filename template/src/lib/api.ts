import { createApiClient, createQueryKeys } from "tempest-react-sdk";

/** Reads the current bearer token, or null when there is no session. */
export type TokenProvider = () => string | null;

let readToken: TokenProvider = () => null;
let handleUnauthorized: () => void = () => {};

/**
 * Tell the client where the session lives.
 *
 * The client ships knowing nothing about auth so a project without accounts
 * can delete `@/stores/auth` and touch nothing here: with no call to this
 * function every request goes out unauthenticated and a 401 is just an error.
 * `@/stores/auth` calls it at module load to wire the store in.
 *
 * @param options - Where to read the token and what to do on a 401.
 */
export function configureApiAuth(options: {
    getToken: TokenProvider;
    onUnauthorized?: () => void;
}): void {
    readToken = options.getToken;
    handleUnauthorized = options.onUnauthorized ?? (() => {});
}

/**
 * Typed HTTP client pointed at `VITE_API_URL`, reading the bearer token
 * through whatever `configureApiAuth` registered.
 */
export const api = createApiClient({
    baseURL: import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000",
    getToken: () => readToken(),
    onUnauthorized: () => handleUnauthorized(),
});

/** Stable, namespaced query keys for TanStack Query. */
export const queryKeys = createQueryKeys("app", {
    me: () => ["me"],
});
