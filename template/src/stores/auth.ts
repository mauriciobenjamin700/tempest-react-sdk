import { createAuthStore, createSelectors } from "tempest-react-sdk";

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
