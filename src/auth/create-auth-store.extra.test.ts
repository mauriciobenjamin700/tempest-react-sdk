import { afterEach, describe, expect, it } from "vitest";
import { createAuthStore } from "./create-auth-store";

type User = { id: string };

describe("createAuthStore extras", () => {
    afterEach(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });

    it("setUser updates only the user field", () => {
        const useAuth = createAuthStore<User>({ name: "test1" });
        useAuth.getState().setSession({ user: { id: "1" }, token: "t" });
        useAuth.getState().setUser({ id: "2" });
        const state = useAuth.getState();
        expect(state.user?.id).toBe("2");
        expect(state.token).toBe("t");
    });

    it("setToken updates isAuthenticated", () => {
        const useAuth = createAuthStore<User>({ name: "test2" });
        useAuth.getState().setToken("xyz");
        expect(useAuth.getState().isAuthenticated).toBe(true);
        useAuth.getState().setToken(null);
        expect(useAuth.getState().isAuthenticated).toBe(false);
    });

    it("respects sessionStorage choice", () => {
        const useAuth = createAuthStore<User>({
            name: "test3",
            storage: "session",
        });
        useAuth.getState().setSession({ user: { id: "1" }, token: "t" });
        // Wait a microtask for zustand persist write
        return Promise.resolve().then(() => {
            const stored = window.sessionStorage.getItem("test3");
            expect(stored).toContain("\"id\":\"1\"");
        });
    });

    it("respects initial values", () => {
        const useAuth = createAuthStore<User>({
            name: "test4",
            initialUser: { id: "init" },
            initialToken: "init-token",
        });
        const state = useAuth.getState();
        expect(state.user?.id).toBe("init");
        expect(state.isAuthenticated).toBe(true);
    });
});
