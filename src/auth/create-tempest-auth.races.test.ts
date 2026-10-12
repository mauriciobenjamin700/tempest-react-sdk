import { beforeEach, describe, expect, it, vi } from "vitest";

import { SessionSupersededError } from "../http";
import { createTempestAuth } from "./create-tempest-auth";

interface User {
    id: string;
}

/**
 * Build a JSON `Response`, since the client only parses a body when the content
 * type says JSON.
 *
 * @param body - Value to serialize.
 * @param status - HTTP status, defaulting to 200.
 * @returns The response.
 */
function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

/**
 * A promise with its resolver, to hold a mocked response until the test has
 * moved the session.
 *
 * @returns The promise and the function that opens it.
 */
function gate(): { wait: Promise<void>; open: () => void } {
    let open!: () => void;
    const wait = new Promise<void>((resolve) => {
        open = resolve;
    });
    return { wait, open };
}

/**
 * Let pending microtasks and a macrotask run.
 *
 * @returns A promise that settles after a macrotask.
 */
function tick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The login body's `email`, which the mocked backends key the account on.
 *
 * @param init - The request init the fetcher received.
 * @returns The email, or an empty string.
 */
function emailOf(init?: RequestInit): string {
    return (JSON.parse(String(init?.body ?? "{}")) as { email?: string }).email ?? "";
}

/**
 * The bearer a request carried, without the scheme.
 *
 * @param init - The request init the fetcher received.
 * @returns The token, or undefined.
 */
function bearerOf(init?: RequestInit): string | undefined {
    return ((init?.headers ?? {}) as Record<string, string>).Authorization?.replace("Bearer ", "");
}

/**
 * Races found in review of the session-epoch fix (#435/#445). Every test here
 * failed against 5676a30, before the fix it pins.
 */
describe("createTempestAuth — session races", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("does not install a login whose session was ended while its POST was in flight", async () => {
        const held = gate();
        const fetcher = vi.fn(async (input: RequestInfo | URL) => {
            if (String(input).endsWith("/api/auth/login")) {
                await held.wait;
                return jsonResponse({ access_token: "A-tok-1", refresh_token: "A-ref-1" });
            }
            return jsonResponse({}, 404);
        });
        const auth = createTempestAuth<User>({ baseURL: "https://api.example.test", fetcher });

        const signingIn = auth.login({ email: "a@x.test", password: "x" });
        await tick();
        await auth.logout();
        held.open();

        await expect(signingIn).rejects.toBeInstanceOf(SessionSupersededError);
        expect(auth.getToken()).toBeNull();
        expect(localStorage.getItem("tempest-auth-refresh")).toBeNull();
    });

    it("does not end B's session when A's replay comes back 401 after B signed in", async () => {
        const replay = gate();
        const onSessionEnd = vi.fn();
        const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/api/auth/login")) {
                const who = emailOf(init) === "b@x.test" ? "B" : "A";
                return jsonResponse({
                    access_token: `${who}-tok-1`,
                    refresh_token: `${who}-ref-1`,
                });
            }
            if (url.endsWith("/api/auth/refresh")) {
                return jsonResponse({ access_token: "A-tok-2", refresh_token: "A-ref-2" });
            }
            const bearer = bearerOf(init);
            if (bearer === "A-tok-2") {
                await replay.wait;
                return jsonResponse({ detail: "revoked" }, 401);
            }
            if (bearer === "B-tok-1") return jsonResponse({ acting_as: "B" });
            return jsonResponse({ detail: "expired" }, 401);
        });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher,
            onSessionEnd,
        });
        await auth.login({ email: "a@x.test", password: "x" });

        const pending = auth.api.get("/api/orders");
        await tick();
        await auth.logout();
        await auth.login({ email: "b@x.test", password: "x" });
        replay.open();

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
        expect(auth.getToken()).toBe("B-tok-1");
        expect(onSessionEnd).toHaveBeenCalledOnce();
    });

    it("does not deadlock when onSessionEnd awaits auth.api", async () => {
        const fetcher = vi.fn(async (input: RequestInfo | URL) => {
            if (String(input).endsWith("/api/auth/login")) {
                return jsonResponse({ access_token: "A-tok-1", refresh_token: "A-ref-1" });
            }
            return jsonResponse({ detail: "no" }, 401);
        });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher,
            onSessionEnd: async () => {
                await auth.api.get("/api/goodbye").catch(() => undefined);
            },
        });
        await auth.login({ email: "a@x.test", password: "x" });

        const outcome = await Promise.race([
            auth.logout().then(() => "settled"),
            new Promise((resolve) => setTimeout(() => resolve("deadlocked"), 200)),
        ]);

        expect(outcome).toBe("settled");
    });

    it("does not deadlock when onSessionEnd awaits auth.logout()", async () => {
        const fetcher = vi.fn(async () =>
            jsonResponse({ access_token: "A-tok-1", refresh_token: "A-ref-1" }),
        );
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher,
            onSessionEnd: async () => {
                await auth.logout();
            },
        });
        await auth.login({ email: "a@x.test", password: "x" });

        const outcome = await Promise.race([
            auth.logout().then(() => "settled"),
            new Promise((resolve) => setTimeout(() => resolve("deadlocked"), 200)),
        ]);

        expect(outcome).toBe("settled");
    });

    it("surfaces the hook's error as an unhandled rejection when logout() is not awaited", async () => {
        const boom = new Error("teardown failed");
        const fetcher = vi.fn(async () =>
            jsonResponse({ access_token: "A-tok-1", refresh_token: "A-ref-1" }),
        );
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher,
            onSessionEnd: () => Promise.reject(boom),
        });
        await auth.login({ email: "a@x.test", password: "x" });

        const saved = process.listeners("unhandledRejection");
        process.removeAllListeners("unhandledRejection");
        const unhandled: unknown[] = [];
        const listener = (reason: unknown): void => {
            unhandled.push(reason);
        };
        process.on("unhandledRejection", listener);
        try {
            void auth.logout();
            await new Promise((resolve) => setTimeout(resolve, 20));
        } finally {
            process.off("unhandledRejection", listener);
            for (const handler of saved) {
                process.on("unhandledRejection", handler as (...args: unknown[]) => void);
            }
        }

        expect(unhandled).toEqual([boom]);
    });

    /**
     * A backend keyed on the login email whose `/me` for account A waits on a
     * gate, so the test can move the session while A's profile is in flight.
     *
     * @param held - The gate A's `/me` waits on.
     * @returns The mocked fetcher.
     */
    function meFetcher(held: { wait: Promise<void> }): typeof fetch {
        return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/api/auth/login")) {
                const who = emailOf(init) === "b@x.test" ? "B" : "A";
                return jsonResponse({ access_token: `${who}-tok-1` });
            }
            if (url.endsWith("/api/auth/me")) {
                const token = bearerOf(init);
                if (token === "A-tok-1") {
                    await held.wait;
                    return jsonResponse({ id: "A" });
                }
                return jsonResponse({ id: token === "B-tok-1" ? "B" : "?" });
            }
            return jsonResponse({}, 404);
        }) as unknown as typeof fetch;
    }

    it("discards A's profile when logout() ends the session while A's /me is in flight", async () => {
        const held = gate();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            mePath: "/api/auth/me",
            fetcher: meFetcher(held),
        });

        const signingIn = auth.login({ email: "a@x.test", password: "x" });
        await tick();
        await auth.logout();
        held.open();

        await expect(signingIn).rejects.toBeInstanceOf(SessionSupersededError);
        expect(auth.useAuthStore.getState().user).toBeNull();
        expect(JSON.parse(localStorage.getItem("tempest-auth") ?? "{}").state?.user).toBeNull();
    });

    it("keeps B's profile when A's /me resolves after logout() and login(B)", async () => {
        const held = gate();
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            mePath: "/api/auth/me",
            fetcher: meFetcher(held),
        });

        const signingIn = auth.login({ email: "a@x.test", password: "x" });
        await tick();
        await auth.logout();
        await expect(auth.login({ email: "b@x.test", password: "x" })).resolves.toEqual({
            id: "B",
        });
        held.open();

        await expect(signingIn).rejects.toBeInstanceOf(SessionSupersededError);
        expect(auth.getToken()).toBe("B-tok-1");
        expect(auth.useAuthStore.getState().user).toEqual({ id: "B" });
        expect(JSON.parse(localStorage.getItem("tempest-auth") ?? "{}").state?.user).toEqual({
            id: "B",
        });
    });

    it("rejects as superseded when A's /me fails after the session moved", async () => {
        const held = gate();
        const fetcher = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/api/auth/login")) return jsonResponse({ access_token: "A-tok-1" });
            await held.wait;
            return jsonResponse({ detail: "boom" }, 500);
        });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            mePath: "/api/auth/me",
            fetcher,
        });

        const signingIn = auth.login({ email: "a@x.test", password: "x" });
        await tick();
        await auth.logout();
        held.open();

        await expect(signingIn).rejects.toBeInstanceOf(SessionSupersededError);
        expect(auth.useAuthStore.getState().user).toBeNull();
    });

    it("does not refresh or end B's session for a tokenless request that fails after B signed in", async () => {
        const held = gate();
        const onSessionEnd = vi.fn();
        const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/api/auth/login")) {
                return jsonResponse({ access_token: "B-tok-1", refresh_token: "B-ref-1" });
            }
            if (url.endsWith("/api/auth/refresh")) return jsonResponse({ detail: "no" }, 401);
            if (bearerOf(init) === undefined) {
                await held.wait;
                return jsonResponse({ detail: "anonymous" }, 401);
            }
            return jsonResponse({ ok: true });
        });
        const auth = createTempestAuth<User>({
            baseURL: "https://api.example.test",
            fetcher,
            onSessionEnd,
        });

        const anonymous = auth.api.get("/api/public");
        await tick();
        await auth.login({ email: "b@x.test", password: "x" });
        held.open();

        await expect(anonymous).rejects.toBeDefined();
        expect(auth.getToken()).toBe("B-tok-1");
        expect(onSessionEnd).not.toHaveBeenCalled();
        expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/refresh"))).toHaveLength(
            0,
        );
    });
});
