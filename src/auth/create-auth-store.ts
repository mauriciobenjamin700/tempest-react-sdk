import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface AuthState<TUser> {
    user: TUser | null;
    token: string | null;
    isAuthenticated: boolean;
    setSession: (session: { user: TUser; token: string }) => void;
    setUser: (user: TUser | null) => void;
    setToken: (token: string | null) => void;
    logout: () => void;
}

export interface CreateAuthStoreOptions<TUser> {
    /** Persist key used in storage (default: "tempest-auth"). */
    name?: string;
    /** Which storage to persist into (default: localStorage). */
    storage?: "local" | "session";
    /** Initial user (useful for SSR hydration). */
    initialUser?: TUser | null;
    /** Initial token. */
    initialToken?: string | null;
}

/**
 * Build a typed Zustand auth store with `persist` middleware. Each app passes
 * its own `TUser` shape so the SDK does not own the user model.
 *
 * @example
 * const useAuthStore = createAuthStore<UserResponse>();
 * const { user, token, logout } = useAuthStore();
 */
export function createAuthStore<TUser>(options: CreateAuthStoreOptions<TUser> = {}) {
    const name = options.name ?? "tempest-auth";
    const storageImpl = options.storage === "session" ? () => sessionStorage : () => localStorage;

    return create<AuthState<TUser>>()(
        persist(
            (set) => ({
                user: options.initialUser ?? null,
                token: options.initialToken ?? null,
                isAuthenticated: !!options.initialToken,
                setSession: ({ user, token }) => set({ user, token, isAuthenticated: true }),
                setUser: (user) => set({ user }),
                setToken: (token) => set({ token, isAuthenticated: !!token }),
                logout: () => set({ user: null, token: null, isAuthenticated: false }),
            }),
            {
                name,
                storage: createJSONStorage(storageImpl),
                partialize: (state) => ({ user: state.user, token: state.token }),
                onRehydrateStorage: () => (state) => {
                    if (state) state.isAuthenticated = !!state.token;
                },
            },
        ),
    );
}
