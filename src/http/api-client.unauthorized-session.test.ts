import { describe, expect, it } from "vitest";

import { createApiClient } from "./api-client";
import { SessionSupersededError } from "./errors";

/** The session a standalone client reads: a bearer token and its epoch. */
interface StandaloneSession {
    token: string | null;
    epoch: number;
}

/**
 * A fetcher that answers every attempt with a `401`, running `whileInFlight`
 * after the attempt left and before its answer lands, so a test can switch
 * accounts while the request is on the wire.
 *
 * @param whileInFlight - Called with the 1-based attempt number.
 * @returns The fetcher and the `Authorization` header of each attempt.
 */
function unauthorizedFetcher(whileInFlight: (attempt: number) => void): {
    fetcher: typeof fetch;
    sentWith: (string | null)[];
} {
    const sentWith: (string | null)[] = [];
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        sentWith.push(new Headers(init?.headers).get("authorization"));
        await Promise.resolve();
        whileInFlight(sentWith.length);
        return new Response(JSON.stringify({ detail: "token of A revoked" }), {
            status: 401,
            headers: { "content-type": "application/json" },
        });
    }) as typeof fetch;
    return { fetcher, sentWith };
}

/**
 * Security audit run-17 (low): `endedOnArrival` was read but the `401`
 * handling ran anyway, so a standalone client whose `onUnauthorized` signs
 * out ended account B's session for account A's stale `401` that landed
 * after `logout()` + `login(B)`, and a `refresh` hook ran with A's context
 * while B was signed in. The epoch is now compared on arrival, before any
 * hook, which keeps the #646 rule: a `401` whose own handling ends the
 * session still rejects with the `401` (the last test, and the #646 tests in
 * `api-client.session-epoch.test.ts`). The first four failed on bd0a15c.
 */
describe("createApiClient — 401 handling for a session that ended before it landed (run-17)", () => {
    it("does not run onUnauthorized for A's 401 that lands after login(B)", async () => {
        let session: StandaloneSession = { token: "A-token", epoch: 0 };
        const notified: unknown[] = [];
        const { fetcher } = unauthorizedFetcher(() => {
            session = { token: "B-token", epoch: 2 };
        });
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => session.token,
            getSessionEpoch: () => session.epoch,
            onUnauthorized: (_response, context) => {
                notified.push(context);
                session = { token: null, epoch: session.epoch + 1 };
            },
        });

        await expect(api.get("/poll")).rejects.toBeInstanceOf(SessionSupersededError);
        expect(notified).toEqual([]);
        expect(session).toEqual({ token: "B-token", epoch: 2 });
    });

    it("does not call refresh or onUnauthorized for A's 401 that lands after login(B)", async () => {
        let session: StandaloneSession = { token: "A-token", epoch: 0 };
        const refreshed: unknown[] = [];
        const notified: unknown[] = [];
        const { fetcher, sentWith } = unauthorizedFetcher(() => {
            session = { token: "B-token", epoch: 2 };
        });
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => session.token,
            getSessionEpoch: () => session.epoch,
            refresh: async (context) => {
                refreshed.push(context);
            },
            onUnauthorized: (_response, context) => {
                notified.push(context);
            },
        });

        await expect(api.get("/poll")).rejects.toBeInstanceOf(SessionSupersededError);
        expect(refreshed).toEqual([]);
        expect(notified).toEqual([]);
        expect(sentWith).toEqual(["Bearer A-token"]);
    });

    it("does not run onUnauthorized for the 401 to A's replay that lands after login(B)", async () => {
        let session: StandaloneSession = { token: "A-token", epoch: 0 };
        const notified: unknown[] = [];
        const { fetcher, sentWith } = unauthorizedFetcher((attempt) => {
            if (attempt === 2) session = { token: "B-token", epoch: 2 };
        });
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => session.token,
            getSessionEpoch: () => session.epoch,
            refresh: async () => {
                session = { token: "A-token-2", epoch: 0 };
            },
            onUnauthorized: (_response, context) => {
                notified.push(context);
                session = { token: null, epoch: session.epoch + 1 };
            },
        });

        await expect(api.get("/poll")).rejects.toBeInstanceOf(SessionSupersededError);
        expect(sentWith).toEqual(["Bearer A-token", "Bearer A-token-2"]);
        expect(notified).toEqual([]);
        expect(session).toEqual({ token: "B-token", epoch: 2 });
    });

    it("does not run onUnauthorized for a tokenless 401 that lands after login(B)", async () => {
        let session: StandaloneSession = { token: null, epoch: 0 };
        const notified: unknown[] = [];
        const { fetcher, sentWith } = unauthorizedFetcher(() => {
            session = { token: "B-token", epoch: 1 };
        });
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => session.token,
            getSessionEpoch: () => session.epoch,
            onUnauthorized: (_response, context) => {
                notified.push(context);
                session = { token: null, epoch: session.epoch + 1 };
            },
        });

        await expect(api.get("/poll")).rejects.toBeInstanceOf(SessionSupersededError);
        expect(sentWith).toEqual([null]);
        expect(notified).toEqual([]);
        expect(session).toEqual({ token: "B-token", epoch: 1 });
    });

    it("still runs onUnauthorized and keeps the 401 when the session did not change", async () => {
        let session: StandaloneSession = { token: "A-token", epoch: 0 };
        const notified: unknown[] = [];
        const { fetcher } = unauthorizedFetcher(() => undefined);
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => session.token,
            getSessionEpoch: () => session.epoch,
            onUnauthorized: (_response, context) => {
                notified.push(context);
                session = { token: null, epoch: session.epoch + 1 };
            },
        });

        await expect(api.get("/poll")).rejects.toMatchObject({ status: 401 });
        expect(notified).toEqual([{ token: "A-token", epoch: 0 }]);
        expect(session).toEqual({ token: null, epoch: 1 });
    });
});
