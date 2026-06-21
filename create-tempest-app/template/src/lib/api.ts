import { createApiClient, createQueryKeys } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

/**
 * Typed HTTP client. Reads the bearer token from the auth store on every
 * request and points at `VITE_API_URL`.
 */
export const api = createApiClient({
    baseURL: import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000",
    getToken: () => useAuth.getState().token,
    onUnauthorized: () => useAuth.getState().logout(),
});

/** Stable, namespaced query keys for TanStack Query. */
export const queryKeys = createQueryKeys("app", {
    me: () => ["me"],
});
