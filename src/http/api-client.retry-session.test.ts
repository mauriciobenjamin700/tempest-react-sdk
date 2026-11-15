import { describe, expect, it } from "vitest";

import { createApiClient } from "./api-client";
import { SessionSupersededError } from "./errors";
import type { RetryOptions } from "./retry";

/**
 * A fetcher that answers each call with the next status of `statuses` (the
 * last one repeats) and records the `Authorization` header every call left
 * with.
 *
 * @param statuses - The status of each call, in order.
 * @returns The fetcher and the headers it saw, one entry per call.
 */
function scriptedFetcher(statuses: readonly number[]): {
    fetcher: typeof fetch;
    sent: (string | null)[];
} {
    const sent: (string | null)[] = [];
    const fetcher = (async (_url: string, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        sent.push(headers.Authorization ?? null);
        const status = statuses[Math.min(sent.length - 1, statuses.length - 1)] ?? 200;
        return new Response(JSON.stringify({ detail: `answer ${sent.length}` }), {
            status,
            headers: { "content-type": "application/json" },
        });
    }) as typeof fetch;
    return { fetcher, sent };
}

/**
 * A mutable session the tests drive like `createTempestAuth` does: every
 * `logout()` and every accepted `login()` moves the epoch.
 */
interface FakeSession {
    token: string | null;
    epoch: number;
    logout: () => void;
    login: (token: string) => void;
}

/**
 * Build a {@link FakeSession}.
 *
 * @param token - The token the session starts with, or `null` when signed out.
 * @returns The session.
 */
function fakeSession(token: string | null): FakeSession {
    const session: FakeSession = {
        token,
        epoch: 0,
        logout: () => {
            session.token = null;
            session.epoch += 1;
        },
        login: (next: string) => {
            session.token = next;
            session.epoch += 1;
        },
    };
    return session;
}

/**
 * A client over `session`, retrying with a 1 ms backoff and running
 * `duringBackoff` from `onRetry` — after an attempt failed, before the next
 * one leaves.
 *
 * @param session - The session the client reads.
 * @param fetcher - The transport.
 * @param duringBackoff - What happens to the session while the client waits.
 * @param retry - Extra retry options, such as a custom `shouldRetry`.
 * @returns The client.
 */
function retryingClient(
    session: FakeSession,
    fetcher: typeof fetch,
    duringBackoff: () => void,
    retry: RetryOptions = {},
): ReturnType<typeof createApiClient> {
    return createApiClient({
        baseURL: "https://api.example.test",
        fetcher,
        getToken: () => session.token,
        getSessionEpoch: () => session.epoch,
        retry: { initialDelay: 1, onRetry: duringBackoff, ...retry },
    });
}

/**
 * Security audit run-15 §6 (#643): the retry wrapper read the credential again
 * for every attempt, so a replay scheduled for account A left with account B's
 * bearer when `logout()` + `login(B)` ran during the backoff, and resolved into
 * the continuation A started. With a `shouldRetry` that replays writes, A's
 * `POST` was executed in B's account.
 */
describe("createApiClient — retries across a session change (#643)", () => {
    it("does not send a GET replay after the first attempt's session was replaced", async () => {
        const session = fakeSession("A-token");
        const { fetcher, sent } = scriptedFetcher([503, 200]);
        const api = retryingClient(session, fetcher, () => {
            session.logout();
            session.login("B-token");
        });

        await expect(api.get("/me")).rejects.toBeInstanceOf(SessionSupersededError);
        expect(sent).toEqual(["Bearer A-token"]);
    });

    it("does not re-send a POST as the next account under a shouldRetry that replays writes", async () => {
        const session = fakeSession("A-token");
        const { fetcher, sent } = scriptedFetcher([503, 201]);
        const api = retryingClient(
            session,
            fetcher,
            () => {
                session.logout();
                session.login("B-token");
            },
            { shouldRetry: () => true },
        );

        const pending = api.post("/transfers", { body: { amount: 100 } });

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
        expect(sent).toEqual(["Bearer A-token"]);
    });

    it("does not send the replay signed out after a logout", async () => {
        const session = fakeSession("A-token");
        const { fetcher, sent } = scriptedFetcher([503, 200]);
        const api = retryingClient(session, fetcher, () => session.logout());

        await expect(api.get("/me")).rejects.toBeInstanceOf(SessionSupersededError);
        expect(sent).toEqual(["Bearer A-token"]);
    });

    it("does not let a replay of a signed-out request pick up the token of a login", async () => {
        const session = fakeSession(null);
        const { fetcher, sent } = scriptedFetcher([503, 201]);
        const api = retryingClient(session, fetcher, () => session.login("B-token"), {
            shouldRetry: () => true,
        });

        const pending = api.post("/guest-orders", { body: { item: 1 } });

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
        expect(sent).toEqual([null]);
    });

    it("keeps replaying a skipAuth request across a session change, since no attempt carries a credential", async () => {
        const session = fakeSession("A-token");
        const { fetcher, sent } = scriptedFetcher([503, 200]);
        const api = retryingClient(session, fetcher, () => {
            session.logout();
            session.login("B-token");
        });

        await expect(api.get("/catalog", { skipAuth: true })).resolves.toEqual({
            detail: "answer 2",
        });
        expect(sent).toEqual([null, null]);
    });

    it("keeps replaying a tokenless request whose replay is tokenless too", async () => {
        const session = fakeSession(null);
        const { fetcher, sent } = scriptedFetcher([503, 200]);
        const api = retryingClient(session, fetcher, () => {
            session.epoch += 1;
        });

        await expect(api.get("/catalog")).resolves.toEqual({ detail: "answer 2" });
        expect(sent).toEqual([null, null]);
    });

    it("replays with the rotated token when the session is the same", async () => {
        const session = fakeSession("A-token");
        const { fetcher, sent } = scriptedFetcher([503, 200]);
        const api = retryingClient(session, fetcher, () => {
            session.token = "A-token-rotated";
        });

        await expect(api.get("/me")).resolves.toEqual({ detail: "answer 2" });
        expect(sent).toEqual(["Bearer A-token", "Bearer A-token-rotated"]);
    });

    it("keeps the 401 when onUnauthorized signs out because of it, even under a shouldRetry that replays 401", async () => {
        const session = fakeSession("A-token");
        const { fetcher, sent } = scriptedFetcher([401, 200]);
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => session.token,
            getSessionEpoch: () => session.epoch,
            onUnauthorized: () => session.logout(),
            retry: { initialDelay: 1, shouldRetry: () => true },
        });

        await expect(api.get("/me")).rejects.toMatchObject({ status: 401 });
        expect(sent).toEqual(["Bearer A-token"]);
    });

    it("never replays a SessionSupersededError, whatever shouldRetry says", async () => {
        const session = fakeSession("A-token");
        let release: () => void = () => undefined;
        const landed = new Promise<void>((resolve) => {
            release = resolve;
        });
        let calls = 0;
        const fetcher = (async () => {
            calls += 1;
            await landed;
            return new Response("{}", {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        const api = retryingClient(session, fetcher, () => undefined, {
            shouldRetry: () => true,
        });

        const pending = api.get("/me");
        session.logout();
        session.login("B-token");
        release();

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
        expect(calls).toBe(1);
    });

    it("replays as before without getSessionEpoch, which is what tells sessions apart", async () => {
        const session = fakeSession("A-token");
        const { fetcher, sent } = scriptedFetcher([503, 200]);
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => session.token,
            retry: { initialDelay: 1 },
        });

        await expect(api.get("/me")).resolves.toEqual({ detail: "answer 2" });
        expect(sent).toEqual(["Bearer A-token", "Bearer A-token"]);
    });
});
