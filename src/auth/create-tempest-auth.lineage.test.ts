import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionSupersededError } from "../http";
import { createTempestAuth } from "./create-tempest-auth";
import type {
    CreateTempestAuthOptions,
    TempestAuth,
    TempestSessionEnd,
} from "./create-tempest-auth";

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
 * One backend shared by every "tab", whose `GET /api/auth/me` answers only when
 * the test opens that account's gate — the window in which a tab that just
 * signed in holds a token but no user.
 *
 * Account A logs in as `A-tok-1`/`A-ref-1`, B as `B-tok-1`/`B-ref-1`; each
 * refresh rotates the pair (`A-tok-2`/`A-ref-2`, …). `/me` answers with the
 * account that owns the bearer it was sent with. `POST /api/auth/logout`
 * records the refresh token it was asked to revoke.
 *
 * @returns The fetcher factory, the gate openers, the revoked refresh tokens
 *   and the refresh tokens each tab presented.
 */
function meBackend() {
    const owners = new Map<string, string>();
    const generation = new Map<string, number>();
    const gates = new Map<string, () => void>();
    const waiting = new Map<string, Promise<void>>();
    const asked = new Set<string>();
    const revoked: (string | null)[] = [];
    const presented: { tab: string; refresh: string | null }[] = [];

    for (const account of ["A", "B"]) {
        waiting.set(
            account,
            new Promise<void>((resolve) => {
                gates.set(account, resolve);
            }),
        );
    }

    function issue(account: string): { access_token: string; refresh_token: string } {
        const n = (generation.get(account) ?? 0) + 1;
        generation.set(account, n);
        owners.set(`${account}-tok-${n}`, account);
        owners.set(`${account}-ref-${n}`, account);
        return { access_token: `${account}-tok-${n}`, refresh_token: `${account}-ref-${n}` };
    }

    function fetcherFor(tab: string): typeof fetch {
        return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const headers = (init?.headers ?? {}) as Record<string, string>;
            const bearer = (headers.Authorization ?? "").replace("Bearer ", "");
            const body = init?.body
                ? (JSON.parse(String(init.body)) as { email?: string; refresh_token?: string })
                : {};
            if (url.endsWith("/api/auth/login")) {
                return jsonResponse(issue(body.email === "b@x.test" ? "B" : "A"));
            }
            if (url.endsWith("/api/auth/refresh")) {
                presented.push({ tab, refresh: body.refresh_token ?? null });
                const owner = body.refresh_token ? owners.get(body.refresh_token) : undefined;
                return owner ? jsonResponse(issue(owner)) : jsonResponse({ detail: "no" }, 401);
            }
            if (url.endsWith("/api/auth/logout")) {
                revoked.push(body.refresh_token ?? null);
                return new Response(null, { status: 204 });
            }
            if (url.endsWith("/api/auth/me")) {
                const owner = owners.get(bearer);
                if (!owner) return jsonResponse({ detail: "expired" }, 401);
                asked.add(owner);
                await waiting.get(owner);
                return jsonResponse({ id: owner });
            }
            const owner = owners.get(bearer);
            return owner ? jsonResponse({ acting_as: owner }) : jsonResponse({ detail: "x" }, 401);
        }) as unknown as typeof fetch;
    }

    return {
        fetcherFor,
        open: (account: string) => gates.get(account)?.(),
        asked,
        revoked,
        presented,
    };
}

const created: Auth[] = [];

/**
 * Open one "tab" over the shared storage, loading the user from `mePath`.
 *
 * @param name - Label recorded with each refresh this tab sends.
 * @param backend - The shared backend.
 * @param extra - Extra options.
 * @returns The tab's auth preset.
 */
function openTab(
    name: string,
    backend: ReturnType<typeof meBackend>,
    extra: Partial<CreateTempestAuthOptions<User>> = {},
): Auth {
    const auth = createTempestAuth<User>({
        baseURL: "https://api.example.test",
        fetcher: backend.fetcherFor(name),
        mePath: "/api/auth/me",
        ...extra,
    });
    created.push(auth);
    return auth;
}

/**
 * Let every pending promise and fetch mock settle.
 */
async function flush(): Promise<void> {
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Deliver the `storage` event the browser fires in every **other** tab.
 *
 * @param key - The key that changed.
 */
function deliverStorageEvent(key: string | null): void {
    window.dispatchEvent(new StorageEvent("storage", { key, storageArea: localStorage }));
}

/**
 * The `{ user, token }` the persist middleware wrote.
 *
 * @returns The persisted session.
 */
function persisted(): { user: User | null; token: string | null } {
    const raw = localStorage.getItem("tempest-auth");
    return raw
        ? (JSON.parse(raw) as { state: { user: User | null; token: string | null } }).state
        : { user: null, token: null };
}

/**
 * Issue #544: while a tab's `login()` waited for `/me`, its user was `null`; a
 * login of another account in another tab left the shared user `null` too, and
 * `followSharedSession` took `null === null` for "same user" and adopted the
 * other account's token as a rotation. Measured on `b054c16` with this
 * backend: tab 1 ended holding `{ user: A, token: "B-tok-1" }`, wrote it to
 * storage, and its requests acted as B. When the storage event had not yet
 * arrived, tab 1's `/me` wrote `{ user: A, token: "A-tok-1" }` next to B's
 * refresh token — and tab 2 then followed that, pairing user A with B's
 * refresh token.
 *
 * Continuity is now decided by a session lineage minted by `login()` and kept
 * across rotations, not by comparing users.
 */
describe("createTempestAuth — a session is continued only by its own lineage", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("does not adopt another account's token while its own user is still loading", async () => {
        const backend = meBackend();
        const tab1 = openTab("tab1", backend);
        const tab2 = openTab("tab2", backend);

        const first = tab1.login({ email: "a@x.test", password: "x" });
        await flush();
        expect(backend.asked.has("A")).toBe(true);
        const second = tab2.login({ email: "b@x.test", password: "x" });
        await flush();
        deliverStorageEvent("tempest-auth");

        expect(tab1.getToken()).toBe("B-tok-1");
        backend.open("A");
        await expect(first).rejects.toBeInstanceOf(SessionSupersededError);
        expect(persisted()).toEqual({ user: null, token: "B-tok-1" });

        backend.open("B");
        await expect(second).resolves.toEqual({ id: "B" });
        deliverStorageEvent("tempest-auth");
        expect(persisted()).toEqual({ user: { id: "B" }, token: "B-tok-1" });
        expect(tab1.useAuthStore.getState()).toMatchObject({ user: { id: "B" }, token: "B-tok-1" });
        await expect(tab1.api.get("/api/orders")).resolves.toEqual({ acting_as: "B" });
    });

    it("discards its user when another account signed in before the storage event arrived", async () => {
        const backend = meBackend();
        const ended = vi.fn<(session: TempestSessionEnd<User>) => void>();
        const tab1 = openTab("tab1", backend, { onSessionEnd: ended });
        const tab2 = openTab("tab2", backend);

        const first = tab1.login({ email: "a@x.test", password: "x" });
        await flush();
        const second = tab2.login({ email: "b@x.test", password: "x" });
        await flush();

        backend.open("A");
        await expect(first).rejects.toBeInstanceOf(SessionSupersededError);
        expect(persisted()).toEqual({ user: null, token: "B-tok-1" });
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("B-ref-1");
        expect(ended.mock.calls[0]?.[0]).toMatchObject({
            reason: "switch",
            token: "A-tok-1",
            elsewhere: true,
        });

        backend.open("B");
        await expect(second).resolves.toEqual({ id: "B" });
        deliverStorageEvent("tempest-auth");
        expect(tab2.useAuthStore.getState()).toMatchObject({ user: { id: "B" }, token: "B-tok-1" });
        expect(tab1.useAuthStore.getState()).toMatchObject({ user: { id: "B" }, token: "B-tok-1" });
    });

    it("keeps a loaded session when another tab rotates it", async () => {
        const backend = meBackend();
        const ended = vi.fn();
        backend.open("A");
        const tab1 = openTab("tab1", backend, { onSessionEnd: ended });
        await tab1.login({ email: "a@x.test", password: "x" });
        const tab2 = openTab("tab2", backend, { onSessionEnd: ended });

        await tab2.refresh();
        deliverStorageEvent("tempest-auth");

        expect(tab1.getToken()).toBe("A-tok-2");
        expect(tab1.useAuthStore.getState().user).toEqual({ id: "A" });
        expect(ended).not.toHaveBeenCalled();
        expect(backend.presented).toEqual([{ tab: "tab2", refresh: "A-ref-1" }]);
    });

    it("adopts a rotation made by another tab before its own user loaded", async () => {
        const backend = meBackend();
        const ended = vi.fn();
        const tab1 = openTab("tab1", backend, { onSessionEnd: ended });

        const first = tab1.login({ email: "a@x.test", password: "x" });
        await flush();
        const tab2 = openTab("tab2", backend);
        await tab2.refresh();
        deliverStorageEvent("tempest-auth");
        expect(tab1.getToken()).toBe("A-tok-2");

        backend.open("A");
        await expect(first).resolves.toEqual({ id: "A" });
        expect(persisted()).toEqual({ user: { id: "A" }, token: "A-tok-2" });
        expect(ended).not.toHaveBeenCalled();
    });

    it("treats the same user signing in again elsewhere as a new session, not a rotation", async () => {
        const backend = meBackend();
        backend.open("A");
        const ended = vi.fn<(session: TempestSessionEnd<User>) => void>();
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });
        const tab2 = openTab("tab2", backend, { onSessionEnd: ended });

        await tab1.login({ email: "a@x.test", password: "x" });
        deliverStorageEvent("tempest-auth");

        expect(tab2.getToken()).toBe("A-tok-2");
        expect(ended.mock.calls[0]?.[0]).toMatchObject({ reason: "switch", elsewhere: true });
    });

    it("keeps following a session persisted before lineages existed", async () => {
        localStorage.setItem(
            "tempest-auth",
            JSON.stringify({ state: { user: { id: "A" }, token: "A-tok-1" }, version: 0 }),
        );
        localStorage.setItem("tempest-auth-refresh", "A-ref-1");
        const backend = meBackend();
        await backend.fetcherFor("seed")("https://api.example.test/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: "a@x.test" }),
        });
        const ended = vi.fn();
        const tab1 = openTab("tab1", backend, { onSessionEnd: ended });
        const tab2 = openTab("tab2", backend, { onSessionEnd: ended });

        await tab2.refresh();
        deliverStorageEvent("tempest-auth");

        expect(tab1.getToken()).toBe("A-tok-2");
        expect(ended).not.toHaveBeenCalled();
        expect(localStorage.getItem("tempest-auth-lineage")).toBeNull();
    });

    it("mints a lineage without crypto.randomUUID, as on a page served over plain http", async () => {
        const backend = meBackend();
        backend.open("A");
        vi.stubGlobal("crypto", {});
        try {
            const tab1 = openTab("tab1", backend);
            await tab1.login({ email: "a@x.test", password: "x" });
        } finally {
            vi.unstubAllGlobals();
        }

        expect(localStorage.getItem("tempest-auth-lineage")).toMatch(/\S{8,}/);
    });

    it("clears the lineage when the session ends", async () => {
        const backend = meBackend();
        backend.open("A");
        const tab1 = openTab("tab1", backend);
        await tab1.login({ email: "a@x.test", password: "x" });
        expect(localStorage.getItem("tempest-auth-lineage")).not.toBeNull();

        await tab1.logout();

        expect(localStorage.getItem("tempest-auth-lineage")).toBeNull();
    });
});

/**
 * Run-7 hardening note: `login()` replacing a live session never revoked it, so
 * the previous account's refresh token stayed redeemable on the server until it
 * expired. In body mode the client still holds that token when the switch
 * happens; in cookie mode the jar already holds the new account's cookie, so a
 * revocation would revoke the new session and none is sent.
 */
describe("createTempestAuth — an account switch revokes the session it replaces", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("revokes the previous refresh token in body mode", async () => {
        const backend = meBackend();
        backend.open("A");
        backend.open("B");
        const tab1 = openTab("tab1", backend, { logoutPath: "/api/auth/logout" });
        await tab1.login({ email: "a@x.test", password: "x" });

        await tab1.login({ email: "b@x.test", password: "x" });
        await flush();

        expect(backend.revoked).toEqual(["A-ref-1"]);
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("B-ref-1");
    });

    it("sends no revocation on a switch in cookie mode", async () => {
        const backend = meBackend();
        backend.open("A");
        backend.open("B");
        const tab1 = openTab("tab1", backend, {
            logoutPath: "/api/auth/logout",
            withCredentials: true,
        });
        await tab1.login({ email: "a@x.test", password: "x" });

        await tab1.login({ email: "b@x.test", password: "x" });
        await flush();

        expect(backend.revoked).toEqual([]);
    });

    it("sends no revocation when the first login finds no session to replace", async () => {
        const backend = meBackend();
        backend.open("A");
        const tab1 = openTab("tab1", backend, { logoutPath: "/api/auth/logout" });

        await tab1.login({ email: "a@x.test", password: "x" });
        await flush();

        expect(backend.revoked).toEqual([]);
    });
});
