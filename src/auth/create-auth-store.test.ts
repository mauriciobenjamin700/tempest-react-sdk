import { afterEach, describe, expect, it } from "vitest";
import { createAuthStore } from "./create-auth-store";

type User = { id: string; name: string };

describe("createAuthStore", () => {
    afterEach(() => window.localStorage.clear());

    it("starts unauthenticated", () => {
        const useAuth = createAuthStore<User>({ name: "test-auth" });
        const state = useAuth.getState();
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(state.isAuthenticated).toBe(false);
    });

    it("setSession marks isAuthenticated true", () => {
        const useAuth = createAuthStore<User>({ name: "test-auth" });
        useAuth.getState().setSession({
            user: { id: "1", name: "Mau" },
            token: "abc",
        });
        const state = useAuth.getState();
        expect(state.isAuthenticated).toBe(true);
        expect(state.user?.id).toBe("1");
        expect(state.token).toBe("abc");
    });

    it("logout clears the session", () => {
        const useAuth = createAuthStore<User>({ name: "test-auth" });
        useAuth.getState().setSession({ user: { id: "1", name: "x" }, token: "t" });
        useAuth.getState().logout();
        const state = useAuth.getState();
        expect(state.token).toBeNull();
        expect(state.user).toBeNull();
        expect(state.isAuthenticated).toBe(false);
    });
});
