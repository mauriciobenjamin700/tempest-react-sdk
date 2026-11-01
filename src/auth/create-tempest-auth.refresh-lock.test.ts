import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempestAuth } from "./create-tempest-auth";
import type { CreateTempestAuthOptions, TempestAuth } from "./create-tempest-auth";

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
 * A cookie-refresh backend with **reuse detection**, the way the
 * tempest-fastapi-sdk rotates refresh tokens: redeeming a refresh token that
 * was already redeemed revokes the whole rotation family. The refresh route
 * takes a few milliseconds, so two tabs can overlap on it.
 *
 * @returns The fetcher factory, the refresh tokens presented, and whether the
 *   family was revoked.
 */
function reuseDetectingBackend() {
    let cookie = "ref-1";
    let generation = 1;
    const used = new Set<string>();
    const presented: string[] = [];
    const status = { familyRevoked: false };

    function fetcher(): typeof fetch {
        return (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/api/auth/refresh")) {
                const sent = cookie;
                presented.push(sent);
                await new Promise((resolve) => setTimeout(resolve, 5));
                if (used.has(sent)) status.familyRevoked = true;
                if (status.familyRevoked) return jsonResponse({ detail: "reuse" }, 401);
                used.add(sent);
                generation += 1;
                cookie = `ref-${generation}`;
                return jsonResponse({ access_token: `tok-${generation}` });
            }
            const headers = (init?.headers ?? {}) as Record<string, string>;
            const bearer = (headers.Authorization ?? "").replace("Bearer ", "");
            return bearer === `tok-${generation}`
                ? jsonResponse({ ok: true })
                : jsonResponse({ detail: "expired" }, 401);
        }) as typeof fetch;
    }

    return { fetcher, presented, status };
}

/**
 * An in-memory `LockManager` shared by every "tab" of a test: exclusive locks
 * granted in request order, honouring `signal`.
 *
 * @returns The manager and the lock names requested.
 */
function fakeLocks() {
    const tails = new Map<string, Promise<void>>();
    const requested: string[] = [];
    const manager = {
        async request(
            name: string,
            options: { signal?: AbortSignal },
            callback: () => Promise<unknown>,
        ): Promise<unknown> {
            requested.push(name);
            const previous = tails.get(name) ?? Promise.resolve();
            let release!: () => void;
            const mine = new Promise<void>((resolve) => {
                release = resolve;
            });
            tails.set(
                name,
                previous.then(() => mine),
            );
            try {
                await new Promise<void>((resolve, reject) => {
                    options.signal?.addEventListener("abort", () =>
                        reject(new DOMException("aborted", "AbortError")),
                    );
                    void previous.then(resolve);
                });
            } catch (error) {
                release();
                throw error;
            }
            try {
                return await callback();
            } finally {
                release();
            }
        },
    };
    return { manager, requested };
}

/**
 * Install `locks` as `navigator.locks` until {@link uninstallLocks}.
 *
 * @param locks - The manager to install.
 */
function installLocks(locks: unknown): void {
    Object.defineProperty(navigator, "locks", { configurable: true, value: locks });
}

/** Remove the `navigator.locks` {@link installLocks} added. */
function uninstallLocks(): void {
    Reflect.deleteProperty(navigator, "locks");
}

const created: Auth[] = [];

/**
 * Open one "tab" in cookie mode over the shared storage.
 *
 * @param backend - The shared backend.
 * @param extra - Extra options.
 * @returns The tab's auth preset.
 */
function openTab(
    backend: ReturnType<typeof reuseDetectingBackend>,
    extra: Partial<CreateTempestAuthOptions<User>> = {},
): Auth {
    const auth = createTempestAuth<User>({
        baseURL: "https://api.example.test",
        withCredentials: true,
        logoutPath: "/api/auth/logout",
        fetcher: backend.fetcher(),
        ...extra,
    });
    created.push(auth);
    return auth;
}

/**
 * Run-7 hardening note: there was no lock around refresh across tabs. Measured
 * before the lock with this backend and two presets calling the boot
 * `refresh()` together — what a browser restart restoring two tabs does: both
 * presented `ref-1`, the second redemption revoked the family, and one tab
 * rejected while the other held an access token with no live refresh token
 * behind it. The first test below is that measurement, kept as the
 * fail-open baseline.
 */
describe("createTempestAuth — one tab at a time redeems the shared refresh token", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
        uninstallLocks();
        vi.useRealTimers();
    });

    it("redeems twice, and loses the family to reuse detection, without the Web Locks API", async () => {
        const backend = reuseDetectingBackend();
        const tab1 = openTab(backend);
        const tab2 = openTab(backend);

        const results = await Promise.allSettled([tab1.refresh(), tab2.refresh()]);

        expect(backend.presented).toEqual(["ref-1", "ref-1"]);
        expect(backend.status.familyRevoked).toBe(true);
        expect(results.map((result) => result.status)).toContain("rejected");
    });

    it("restores two tabs booting together with a single redemption", async () => {
        const { manager, requested } = fakeLocks();
        installLocks(manager);
        const backend = reuseDetectingBackend();
        const tab1 = openTab(backend);
        const tab2 = openTab(backend);

        await Promise.all([tab1.refresh(), tab2.refresh()]);

        expect(backend.presented).toEqual(["ref-1"]);
        expect(backend.status.familyRevoked).toBe(false);
        expect(tab1.getToken()).toBe("tok-2");
        expect(tab2.getToken()).toBe("tok-2");
        expect(requested).toEqual([
            "tempest-react-sdk:tempest-auth:refresh",
            "tempest-react-sdk:tempest-auth:refresh",
        ]);
    });

    it("rotates once when the access token expires in two tabs at the same time", async () => {
        const { manager } = fakeLocks();
        installLocks(manager);
        const backend = reuseDetectingBackend();
        const tab1 = openTab(backend);
        await tab1.refresh();
        const tab2 = openTab(backend);
        await tab1.refresh();
        await tab2.refresh();
        expect(backend.presented).toEqual(["ref-1", "ref-2"]);

        await Promise.all([tab1.refresh(), tab2.refresh()]);

        expect(backend.presented).toEqual(["ref-1", "ref-2", "ref-3"]);
        expect(backend.status.familyRevoked).toBe(false);
        expect(tab1.getToken()).toBe("tok-4");
        expect(tab2.getToken()).toBe("tok-4");
        await expect(tab2.api.get("/api/orders")).resolves.toEqual({ ok: true });
    });

    it("redeems without the lock after waiting too long behind a tab that never releases it", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const { manager } = fakeLocks();
        installLocks(manager);
        void manager.request(
            "tempest-react-sdk:tempest-auth:refresh",
            {},
            () => new Promise(() => undefined),
        );
        const backend = reuseDetectingBackend();
        const tab1 = openTab(backend);

        const pending = tab1.refresh();
        await vi.advanceTimersByTimeAsync(10_000);
        await vi.advanceTimersByTimeAsync(10);
        await pending;

        expect(backend.presented).toEqual(["ref-1"]);
        expect(tab1.getToken()).toBe("tok-2");
    });

    it("redeems without the lock when acquiring it throws", async () => {
        installLocks({
            request: () => Promise.reject(new DOMException("opaque origin", "SecurityError")),
        });
        const backend = reuseDetectingBackend();
        const tab1 = openTab(backend);

        await tab1.refresh();

        expect(tab1.getToken()).toBe("tok-2");
    });

    it("surfaces a failed redemption made under the lock without redeeming again", async () => {
        const { manager } = fakeLocks();
        installLocks(manager);
        const backend = reuseDetectingBackend();
        backend.status.familyRevoked = true;
        const tab1 = openTab(backend);

        await expect(tab1.refresh()).rejects.toMatchObject({ status: 401 });

        expect(backend.presented).toEqual(["ref-1"]);
    });

    it("takes no lock in sessionStorage mode, where no other tab shares the session", async () => {
        const { manager, requested } = fakeLocks();
        installLocks(manager);
        const backend = reuseDetectingBackend();
        const tab1 = openTab(backend, { storage: "session" });

        await tab1.refresh();

        expect(requested).toEqual([]);
        expect(tab1.getToken()).toBe("tok-2");
    });
});
