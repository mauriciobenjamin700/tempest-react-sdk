import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SessionSupersededError } from "../http";
import { createTempestAuth } from "./create-tempest-auth";
import type { TempestAuth, TempestSessionEnd } from "./create-tempest-auth";

interface User {
    id: string;
}

type Auth = TempestAuth<User, { email: string; password: string }>;

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
 * A body-mode backend with **reuse detection**, the way the
 * tempest-fastapi-sdk rotates refresh tokens: the refresh token travels in the
 * JSON body, every redemption issues a new pair, and presenting one that was
 * already redeemed revokes the whole family. The refresh route takes a few
 * milliseconds, so two tabs can overlap on it.
 *
 * @returns The fetcher, the refresh tokens presented, and whether the family
 *   was revoked.
 */
function bodyReuseBackend(): {
    fetcher: typeof fetch;
    presented: string[];
    status: { familyRevoked: boolean };
} {
    let generation = 1;
    const used = new Set<string>();
    const presented: string[] = [];
    const status = { familyRevoked: false };
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/auth/login") {
            return jsonResponse({ access_token: "tok-1", refresh_token: "ref-1" });
        }
        if (path === "/api/auth/refresh") {
            const sent = (JSON.parse(String(init?.body ?? "{}")) as { refresh_token?: string })
                .refresh_token;
            presented.push(sent ?? "<none>");
            await new Promise((resolve) => setTimeout(resolve, 5));
            if (sent === undefined) return jsonResponse({ detail: "missing" }, 401);
            if (used.has(sent)) status.familyRevoked = true;
            if (status.familyRevoked) return jsonResponse({ detail: "reuse" }, 401);
            used.add(sent);
            generation += 1;
            return jsonResponse({
                access_token: `tok-${generation}`,
                refresh_token: `ref-${generation}`,
            });
        }
        if (path === "/api/auth/me") return jsonResponse({ id: "A" });
        return jsonResponse({ detail: "not found" }, 404);
    }) as typeof fetch;
    return { fetcher, presented, status };
}

/**
 * An in-memory `LockManager` shared by every "tab": exclusive locks granted in
 * request order, passing a lock object to the callback and honouring
 * `ifAvailable` (the callback gets `null` when the lock is held) and `signal`,
 * as the Web Locks API does.
 *
 * @returns The manager.
 */
function fakeLocks(): {
    request: (
        name: string,
        options: { signal?: AbortSignal; ifAvailable?: boolean },
        callback: (lock: { name: string } | null) => unknown,
    ) => Promise<unknown>;
} {
    const tails = new Map<string, Promise<void>>();
    const pending = new Map<string, number>();
    return {
        async request(name, options, callback) {
            if (options.ifAvailable && (pending.get(name) ?? 0) > 0) return await callback(null);
            pending.set(name, (pending.get(name) ?? 0) + 1);
            const previous = tails.get(name) ?? Promise.resolve();
            let release!: () => void;
            const mine = new Promise<void>((resolve) => {
                release = resolve;
            });
            tails.set(
                name,
                previous.then(() => mine),
            );
            const done = (): void => {
                pending.set(name, (pending.get(name) ?? 1) - 1);
                release();
            };
            try {
                await new Promise<void>((resolve, reject) => {
                    options.signal?.addEventListener("abort", () =>
                        reject(new DOMException("aborted", "AbortError")),
                    );
                    void previous.then(resolve);
                });
            } catch (error) {
                done();
                throw error;
            }
            try {
                return await callback({ name });
            } finally {
                done();
            }
        },
    };
}

const created: Auth[] = [];

/**
 * Open one "tab" in body mode over the shared `localStorage`.
 *
 * @param fetcher - The shared backend.
 * @param ended - Collects every `onSessionEnd` this tab runs.
 * @returns The tab's preset.
 */
function openTab(fetcher: typeof fetch, ended: TempestSessionEnd<User>[] = []): Auth {
    const auth = createTempestAuth<User>({
        baseURL: "https://api.example.test",
        mePath: "/api/auth/me",
        fetcher,
        onSessionEnd: async (event) => {
            ended.push(event);
            await new Promise((resolve) => setTimeout(resolve, 5));
        },
    });
    created.push(auth);
    return auth;
}

/**
 * #594: two body-mode tabs calling `restore()` together presented the same
 * refresh token. The redemption ran under the refresh lock, but the tab that
 * redeemed only wrote the new pair in `replaceSession`, after releasing the
 * lock and after its `onSessionEnd`, so the tab waiting behind it read the
 * spent `ref-1` (measured on b99a0c6: `presented` was `["ref-1", "ref-1"]`
 * and the family was revoked). A sign-in now holds an origin-wide sign-in lock
 * from the redemption until it is installed, and a tab that finds it held
 * adopts the session it installs instead of redeeming again.
 */
describe("createTempestAuth — a restore redeems once across tabs (#594)", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        Object.defineProperty(navigator, "locks", { configurable: true, value: fakeLocks() });
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
        Reflect.deleteProperty(navigator, "locks");
    });

    /**
     * Sign tab 1 in and open tab 2 on the same stored session.
     *
     * @param backend - The shared backend.
     * @returns Both tabs and what each one's `onSessionEnd` saw.
     */
    async function twoSignedInTabs(backend: ReturnType<typeof bodyReuseBackend>): Promise<{
        tab1: Auth;
        tab2: Auth;
        endedIn1: TempestSessionEnd<User>[];
        endedIn2: TempestSessionEnd<User>[];
    }> {
        const endedIn1: TempestSessionEnd<User>[] = [];
        const endedIn2: TempestSessionEnd<User>[] = [];
        const tab1 = openTab(backend.fetcher, endedIn1);
        await tab1.login({ email: "a@example.test", password: "x" });
        const tab2 = openTab(backend.fetcher, endedIn2);
        return { tab1, tab2, endedIn1, endedIn2 };
    }

    it("redeems once when two tabs restore together, and both end on that session", async () => {
        const backend = bodyReuseBackend();
        const { tab1, tab2, endedIn1, endedIn2 } = await twoSignedInTabs(backend);

        const results = await Promise.allSettled([tab1.restore(), tab2.restore()]);

        expect(backend.presented).toEqual(["ref-1"]);
        expect(backend.status.familyRevoked).toBe(false);
        expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
        expect(tab1.getToken()).toBe("tok-2");
        expect(tab2.getToken()).toBe("tok-2");
        expect(tab2.sessionKey()).toBe(tab1.sessionKey());
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("ref-2");
        expect(endedIn1.map((event) => [event.reason, event.elsewhere])).toEqual([
            ["switch", false],
        ]);
        expect(endedIn2.map((event) => [event.reason, event.elsewhere])).toEqual([
            ["switch", true],
        ]);
    });

    it("hands the adopting tab the user the restoring tab loaded", async () => {
        const backend = bodyReuseBackend();
        const { tab1, tab2 } = await twoSignedInTabs(backend);

        const [first, second] = await Promise.all([tab1.restore(), tab2.restore()]);

        expect(first).toEqual({ id: "A" });
        expect(second).toEqual({ id: "A" });
    });

    it("lets a refresh that waited behind a restore follow it instead of redeeming the spent token", async () => {
        const backend = bodyReuseBackend();
        const { tab1, tab2, endedIn2 } = await twoSignedInTabs(backend);

        const [restored, refreshed] = await Promise.allSettled([tab1.restore(), tab2.refresh()]);

        expect(backend.presented).toEqual(["ref-1"]);
        expect(backend.status.familyRevoked).toBe(false);
        expect(restored.status).toBe("fulfilled");
        expect(refreshed.status === "rejected" && refreshed.reason).toBeInstanceOf(
            SessionSupersededError,
        );
        expect(tab2.getToken()).toBe("tok-2");
        expect(tab2.sessionKey()).toBe(tab1.sessionKey());
        expect(endedIn2.map((event) => [event.reason, event.elsewhere])).toEqual([
            ["switch", true],
        ]);
    });

    it("lets a restore that waited behind a rotation redeem the rotated token", async () => {
        const backend = bodyReuseBackend();
        const { tab1, tab2 } = await twoSignedInTabs(backend);

        await Promise.all([tab2.refresh(), tab1.restore()]);

        expect(backend.presented).toEqual(["ref-1", "ref-2"]);
        expect(backend.status.familyRevoked).toBe(false);
        expect(tab1.getToken()).toBe("tok-3");
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("ref-3");
    });

    it("rejects the waiting restore as superseded when the restore it waited for was signed out", async () => {
        const backend = bodyReuseBackend();
        const { tab1, tab2 } = await twoSignedInTabs(backend);

        const first = tab1.restore();
        const second = tab2.restore();
        await new Promise((resolve) => setTimeout(resolve, 7));
        await tab1.logout();

        await expect(first).rejects.toBeInstanceOf(SessionSupersededError);
        await expect(second).rejects.toBeInstanceOf(SessionSupersededError);
        expect(backend.presented).toEqual(["ref-1"]);
        expect(tab2.getToken()).toBeNull();
    });
});
