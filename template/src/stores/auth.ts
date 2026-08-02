import { createAuthStore, createSelectors } from "tempest-react-sdk";

import { configureApiAuth } from "@/lib/api";

/** The user shape your backend returns. Adjust to match your API. */
export interface User {
    id: string;
    name: string;
    email: string;
}

/**
 * App-wide auth store: persisted user + token in localStorage, with auto
 * `isAuthenticated`. `createSelectors` adds `useAuth.use.<field>()` hooks that
 * subscribe to a single slice.
 */
export const useAuth = createSelectors(createAuthStore<User>({ name: "app-auth" }));

/**
 * Hand the store to the HTTP client.
 *
 * The dependency points this way on purpose: `@/lib/api` knows nothing about
 * auth, so a project without accounts deletes this file and the client keeps
 * working unauthenticated.
 */
configureApiAuth({
    getToken: () => useAuth.getState().token,
    onUnauthorized: () => useAuth.getState().logout(),
});
