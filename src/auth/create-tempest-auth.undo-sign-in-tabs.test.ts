import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SessionSupersededError, TempestApiError } from "../http";
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
 * One backend shared by every "tab". `/api/auth/login` issues `tok-<email>` /
 * `ref-<email>`; `/api/auth/refresh` redeems `ref-<email>` (or, without a
 * body, the account the test set as the cookie) as `tok-<email>` /
 * `ref-<email>`. `/api/auth/me` for account A is held until the test answers
 * it with a status; every other account loads at once. `/api/auth/logout`
 * records the bearer and the refresh token of each revocation.
 *
 * @returns The fetcher, the answer for A's `/me`, whether A's `/me` was
 *   asked, the cookie account and the revocations.
 */
function sharedBackend(): {
    fetcher: typeof fetch;
    answerMe: (status: number) => void;
    meAsked: () => boolean;
    cookie: { account: string };
    revoked: { bearer: string; refresh: string }[];
} {
    let release: (status: number) => void = () => undefined;
    const held = new Promise<number>((resolve) => {
        release = resolve;
    });
    let asked = false;
    const cookie = { account: "A" };
    const revoked: { bearer: string; refresh: string }[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const bearer = (headers.Authorization ?? "").replace("Bearer ", "");
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};
        if (path === "/api/auth/login") {
            cookie.account = body.email;
            return jsonResponse({
                access_token: `tok-${body.email}`,
                refresh_token: `ref-${body.email}`,
            });
        }
        if (path === "/api/auth/refresh") {
            const account = body.refresh_token?.replace("ref-", "") ?? cookie.account;
            return jsonResponse({
                access_token: `tok-${account}`,
                refresh_token: `ref-${account}`,
            });
        }
        if (path === "/api/auth/logout") {
            revoked.push({ bearer, refresh: body.refresh_token ?? "<cookie>" });
            return new Response(null, { status: 204 });
        }
        const account = bearer.replace("tok-", "");
        if (account === "A") {
            asked = true;
            const status = await held;
            if (status !== 200) return jsonResponse({ detail: "profile unavailable" }, status);
        }
        return jsonResponse({ id: account });
    }) as typeof fetch;
    return {
        fetcher,
        answerMe: (status) => release(status),
        meAsked: () => asked,
        cookie,
        revoked,
    };
}

const created: Auth[] = [];

/**
 * Open one "tab" over the shared `localStorage`, with `mePath` and
 * `logoutPath`.
 *
 * @param backend - The shared backend.
 * @param ended - Collects every `onSessionEnd` the tab runs.
 * @param extra - Extra options.
 * @returns The tab's preset.
 */
function openTab(
    backend: ReturnType<typeof sharedBackend>,
    ended: TempestSessionEnd<User>[],
    extra: Partial<CreateTempestAuthOptions<User>> = {},
): Auth {
    const auth = createTempestAuth<User>({
        baseURL: "https://api.example.test",
        mePath: "/api/auth/me",
        logoutPath: "/api/auth/logout",
        fetcher: backend.fetcher,
        onSessionEnd: (event) => {
            ended.push(event);
        },
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
 * Deliver the `storage` event the browser fires in every **other** tab — jsdom
 * fires none, so the test chooses when it reaches tab 1.
 */
function deliverStorageEvent(): void {
    window.dispatchEvent(
        new StorageEvent("storage", { key: "tempest-auth", storageArea: localStorage }),
    );
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
 * Summarise the hooks a tab ran.
 *
 * @param ended - What `onSessionEnd` received.
 * @returns Reason, token and `elsewhere` of each call.
 */
function hooks(ended: TempestSessionEnd<User>[]): [string, string | null, boolean][] {
    return ended.map((event) => [event.reason, event.token, event.elsewhere]);
}

/**
 * Security audit run-19, finding 3.1 — a regression of #752. The undo of a
 * sign-in whose `mePath` failed (#748) revoked and cleared whatever the shared
 * storage held, without first following it the way `logout()` has since
 * #524. Tab 1 signs in as A and its `/me` is held; tab 2 signs in as B; tab
 * 1's `/me` fails before the storage event reaches it. Measured on 808393e:
 * `login(A)` rejected with the `503`, `logoutPath` received `Bearer tok-A`
 * with `ref-B`, the storage was left `{ user: null, token: null }` with no
 * refresh token, and tab 2 followed into `onSessionEnd` `"logout"`,
 * `elsewhere: true` — B signed out of every tab and revoked on the server.
 * The same happened when the sign-in was a `restore()` and in cookie mode,
 * where the revocation carried what B's login had just stored.
 *
 * `fetchUser` now follows the shared storage on failure as it already did on
 * success: a session another tab replaced makes the sign-in superseded, which
 * the undo leaves alone. The control — the storage event first — was already
 * superseded and still is; a sole sign-in whose `/me` fails is still undone.
 */
describe("createTempestAuth — undoing a failed sign-in spares another tab's session", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        for (const auth of created.splice(0)) auth.dispose();
    });

    it("does not revoke or clear B when A's /me fails before the storage event arrives", async () => {
        const backend = sharedBackend();
        const ended1: TempestSessionEnd<User>[] = [];
        const ended2: TempestSessionEnd<User>[] = [];
        const tab1 = openTab(backend, ended1);
        const tab2 = openTab(backend, ended2);

        const first = tab1.login({ email: "A", password: "x" }).catch((reason: unknown) => reason);
        await flush();
        expect(backend.meAsked()).toBe(true);
        await expect(tab2.login({ email: "B", password: "x" })).resolves.toEqual({ id: "B" });
        backend.answerMe(503);

        expect(await first).toBeInstanceOf(SessionSupersededError);
        await flush();
        deliverStorageEvent();
        await flush();

        expect(backend.revoked).toEqual([{ bearer: "", refresh: "ref-A" }]);
        expect(persisted()).toEqual({ user: { id: "B" }, token: "tok-B" });
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("ref-B");
        expect(tab1.useAuthStore.getState()).toMatchObject({ token: "tok-B", user: { id: "B" } });
        expect(tab2.useAuthStore.getState()).toMatchObject({ token: "tok-B", user: { id: "B" } });
        expect(hooks(ended1)).toEqual([["switch", "tok-A", true]]);
        expect(ended2.filter((event) => event.elsewhere)).toEqual([]);
    });

    it("ends the same way when the storage event arrives before A's /me fails", async () => {
        const backend = sharedBackend();
        const ended1: TempestSessionEnd<User>[] = [];
        const ended2: TempestSessionEnd<User>[] = [];
        const tab1 = openTab(backend, ended1);
        const tab2 = openTab(backend, ended2);

        const first = tab1.login({ email: "A", password: "x" }).catch((reason: unknown) => reason);
        await flush();
        await tab2.login({ email: "B", password: "x" });
        deliverStorageEvent();
        backend.answerMe(503);

        expect(await first).toBeInstanceOf(SessionSupersededError);
        await flush();

        expect(backend.revoked).toEqual([{ bearer: "", refresh: "ref-A" }]);
        expect(persisted()).toEqual({ user: { id: "B" }, token: "tok-B" });
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("ref-B");
        expect(hooks(ended1)).toEqual([["switch", "tok-A", true]]);
        expect(ended2.filter((event) => event.elsewhere)).toEqual([]);
    });

    it("still undoes a sign-in no other tab replaced", async () => {
        const backend = sharedBackend();
        const ended1: TempestSessionEnd<User>[] = [];
        const tab1 = openTab(backend, ended1);
        openTab(backend, []);

        const first = tab1.login({ email: "A", password: "x" }).catch((reason: unknown) => reason);
        await flush();
        backend.answerMe(503);

        expect(await first).toBeInstanceOf(TempestApiError);
        expect(backend.revoked).toEqual([{ bearer: "tok-A", refresh: "ref-A" }]);
        expect(persisted()).toEqual({ user: null, token: null });
        expect(localStorage.getItem("tempest-auth-refresh")).toBeNull();
        expect(hooks(ended1)).toEqual([["expired", "tok-A", false]]);
    });

    it("does not revoke or clear B when a restore() loses its /me to B's sign-in", async () => {
        const backend = sharedBackend();
        localStorage.setItem("tempest-auth-refresh", "ref-A");
        const ended1: TempestSessionEnd<User>[] = [];
        const ended2: TempestSessionEnd<User>[] = [];
        const tab1 = openTab(backend, ended1);
        const tab2 = openTab(backend, ended2);

        const first = tab1.restore().catch((reason: unknown) => reason);
        await flush();
        expect(backend.meAsked()).toBe(true);
        await tab2.login({ email: "B", password: "x" });
        backend.answerMe(503);

        expect(await first).toBeInstanceOf(SessionSupersededError);
        await flush();

        expect(backend.revoked.map((entry) => entry.refresh)).not.toContain("ref-B");
        expect(persisted()).toEqual({ user: { id: "B" }, token: "tok-B" });
        expect(localStorage.getItem("tempest-auth-refresh")).toBe("ref-B");
        expect(ended2.filter((event) => event.elsewhere)).toEqual([]);
    });

    it("does not revoke B's cookie when A's /me fails in cookie mode", async () => {
        const backend = sharedBackend();
        const ended1: TempestSessionEnd<User>[] = [];
        const ended2: TempestSessionEnd<User>[] = [];
        const tab1 = openTab(backend, ended1, { withCredentials: true });
        const tab2 = openTab(backend, ended2, { withCredentials: true });

        const first = tab1.login({ email: "A", password: "x" }).catch((reason: unknown) => reason);
        await flush();
        await tab2.login({ email: "B", password: "x" });
        backend.answerMe(503);

        expect(await first).toBeInstanceOf(SessionSupersededError);
        await flush();

        expect(backend.revoked).toEqual([]);
        expect(persisted()).toEqual({ user: { id: "B" }, token: "tok-B" });
        expect(tab2.useAuthStore.getState()).toMatchObject({ token: "tok-B", user: { id: "B" } });
        expect(ended2.filter((event) => event.elsewhere)).toEqual([]);
    });
});
