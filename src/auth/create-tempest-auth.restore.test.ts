import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
 * A cookie-refresh backend whose HttpOnly cookie belongs to whichever account
 * the test names in `cookie.owner` — what a boot restore or an OAuth callback
 * redeems. Each redemption answers a fresh access token of that account, after
 * a few milliseconds so two tabs can overlap on it.
 *
 * @returns The fetcher and the cookie holder.
 */
function cookieRestoreBackend(): { fetcher: typeof fetch; cookie: { owner: string } } {
    const cookie = { owner: "A" };
    let issued = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/auth/refresh") {
            issued += 1;
            const owner = cookie.owner;
            await new Promise((resolve) => setTimeout(resolve, 5));
            return jsonResponse({ access_token: `${owner}-tok-${issued}` });
        }
        if (path === "/api/auth/logout") return new Response(null, { status: 204 });
        return jsonResponse({ detail: "not found" }, 404);
    }) as unknown as typeof fetch;
    return { fetcher, cookie };
}

/**
 * An in-memory `LockManager` shared by every "tab": exclusive locks granted in
 * request order.
 *
 * @returns The manager.
 */
function fakeLocks(): {
    request: (
        name: string,
        options: { signal?: AbortSignal },
        callback: () => Promise<unknown>,
    ) => Promise<unknown>;
} {
    const tails = new Map<string, Promise<void>>();
    return {
        async request(name, _options, callback) {
            const previous = tails.get(name) ?? Promise.resolve();
            let release!: () => void;
            const mine = new Promise<void>((resolve) => {
                release = resolve;
            });
            tails.set(
                name,
                previous.then(() => mine),
            );
            await previous;
            try {
                return await callback();
            } finally {
                release();
            }
        },
    };
}

const created: Auth[] = [];

/**
 * Open one "tab" in cookie mode over the shared `localStorage`.
 *
 * @param fetcher - The shared backend.
 * @param ended - Collects every `onSessionEnd` this tab runs.
 * @returns The tab's preset.
 */
function openTab(fetcher: typeof fetch, ended: TempestSessionEnd<User>[] = []): Auth {
    const auth = createTempestAuth<User>({
        baseURL: "https://api.example.test",
        withCredentials: true,
        logoutPath: "/api/auth/logout",
        fetcher,
        onSessionEnd: (event) => {
            ended.push(event);
        },
    });
    created.push(auth);
    return auth;
}

/**
 * #561 (C2): a session restored by `refresh()` — the boot restore in cookie
 * mode, an OAuth callback — never got a lineage, and `sessionKey()` answered
 * the constant `"unlineaged"` for all of them. Account A restored, signed out,
 * and account B restored next had the **same** key, so an upload bound by
 * `getToken: auth.getToken` was resumed by B against A's upload URL. The tests
 * marked (C2) failed against ca630df.
 */
describe("createTempestAuth — a session restored by refresh() is a session of its own", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
        Reflect.deleteProperty(navigator, "locks");
    });

    it("gives two accounts restored one after the other different keys (C2)", async () => {
        const { fetcher, cookie } = cookieRestoreBackend();
        const auth = openTab(fetcher);

        await auth.refresh();
        const keyOfA = auth.sessionKey();
        await auth.logout();
        cookie.owner = "B";
        await auth.refresh();

        expect(auth.getToken()).toMatch(/^B-tok-/);
        expect(keyOfA).not.toBeNull();
        expect(auth.sessionKey()).not.toBeNull();
        expect(auth.sessionKey()).not.toBe(keyOfA);
    });

    it("never answers a key shared by every restored session (C2)", async () => {
        const { fetcher } = cookieRestoreBackend();
        const auth = openTab(fetcher);

        await auth.refresh();

        expect(auth.sessionKey()).not.toBe("unlineaged");
    });

    it("keeps the restored session's key across its rotations", async () => {
        const { fetcher } = cookieRestoreBackend();
        const auth = openTab(fetcher);

        await auth.refresh();
        const restored = auth.sessionKey();
        await auth.refresh();

        expect(auth.getToken()).toBe("A-tok-2");
        expect(auth.sessionKey()).toBe(restored);
    });

    it("keeps the key of a page reloaded on the restored session", async () => {
        const { fetcher } = cookieRestoreBackend();
        const before = openTab(fetcher);
        await before.refresh();
        const restored = before.sessionKey();
        before.dispose();

        const reloaded = openTab(fetcher);
        await reloaded.refresh();

        expect(reloaded.sessionKey()).toBe(restored);
    });

    it("shows a second tab that boots after the restore the same session, not a switch", async () => {
        const { fetcher } = cookieRestoreBackend();
        const endedIn2: TempestSessionEnd<User>[] = [];
        const tab1 = openTab(fetcher);
        const tab2 = openTab(fetcher, endedIn2);

        await tab1.refresh();
        await tab2.refresh();

        expect(tab2.getToken()).toBe(tab1.getToken());
        expect(tab2.sessionKey()).toBe(tab1.sessionKey());
        expect(endedIn2).toEqual([]);
    });

    it("restores two tabs booting together under the refresh lock as one session", async () => {
        Object.defineProperty(navigator, "locks", { configurable: true, value: fakeLocks() });
        const { fetcher } = cookieRestoreBackend();
        const endedIn1: TempestSessionEnd<User>[] = [];
        const endedIn2: TempestSessionEnd<User>[] = [];
        const tab1 = openTab(fetcher, endedIn1);
        const tab2 = openTab(fetcher, endedIn2);

        await Promise.all([tab1.refresh(), tab2.refresh()]);

        expect(tab2.getToken()).toBe(tab1.getToken());
        expect(tab2.sessionKey()).toBe(tab1.sessionKey());
        expect(tab1.sessionKey()).not.toBeNull();
        expect([...endedIn1, ...endedIn2]).toEqual([]);
    });

    it("ends neither tab when two restores overlap without the lock", async () => {
        const { fetcher } = cookieRestoreBackend();
        const endedIn1: TempestSessionEnd<User>[] = [];
        const endedIn2: TempestSessionEnd<User>[] = [];
        const tab1 = openTab(fetcher, endedIn1);
        const tab2 = openTab(fetcher, endedIn2);

        await Promise.allSettled([tab1.refresh(), tab2.refresh()]);

        expect(tab2.sessionKey()).toBe(tab1.sessionKey());
        expect(tab1.sessionKey()).not.toBeNull();
        expect([...endedIn1, ...endedIn2]).toEqual([]);
    });
});

/**
 * #561 (C2), the other half: a session persisted before lineages existed has
 * none either. Its key is now minted per preset and per session instead of
 * the shared constant, so it still survives the session's rotations but never
 * equals another session's.
 */
describe("createTempestAuth — a session persisted without a lineage", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    function persistLegacy(owner: string): void {
        localStorage.setItem(
            "tempest-auth",
            JSON.stringify({ state: { user: { id: owner }, token: `${owner}-tok-0` }, version: 0 }),
        );
    }

    it("keeps one key while the session rotates", async () => {
        persistLegacy("A");
        const { fetcher } = cookieRestoreBackend();
        const auth = openTab(fetcher);
        const legacy = auth.sessionKey();

        await auth.refresh();

        expect(legacy).not.toBeNull();
        expect(auth.sessionKey()).toBe(legacy);
    });

    it("does not share its key with the next session persisted without a lineage", async () => {
        persistLegacy("A");
        const { fetcher } = cookieRestoreBackend();
        const auth = openTab(fetcher);
        const keyOfA = auth.sessionKey();

        persistLegacy("B");
        window.dispatchEvent(
            new StorageEvent("storage", { key: "tempest-auth", storageArea: localStorage }),
        );

        expect(auth.getToken()).toBe("B-tok-0");
        expect(auth.sessionKey()).not.toBeNull();
        expect(auth.sessionKey()).not.toBe(keyOfA);
    });
});
