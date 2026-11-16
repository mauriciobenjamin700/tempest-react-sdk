import { describe, expect, it } from "vitest";

import { createApiClient } from "./api-client";
import { SessionSupersededError } from "./errors";

/**
 * A fetcher whose response waits for `release()`, so the test can move the
 * session epoch while the request is on the wire.
 *
 * @param body - The JSON body to answer with.
 * @returns The fetcher and the function that lets the response land.
 */
function heldFetcher(body: unknown): { fetcher: typeof fetch; release: () => void } {
    let release: () => void = () => undefined;
    const landed = new Promise<void>((resolve) => {
        release = resolve;
    });
    const fetcher = (async () => {
        await landed;
        return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    }) as typeof fetch;
    return { fetcher, release };
}

describe("createApiClient — responses of an ended session (#609)", () => {
    it("rejects a response sent with a token when the session epoch moved before it landed", async () => {
        const { fetcher, release } = heldFetcher(["private-of-A"]);
        let epoch = 0;
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => "A-token",
            getSessionEpoch: () => epoch,
        });

        const pending = api.get<string[]>("/data");
        epoch += 1;
        release();

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
    });

    it("resolves a response of the session still current", async () => {
        const { fetcher, release } = heldFetcher(["private-of-A"]);
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => "A-token",
            getSessionEpoch: () => 0,
        });

        const pending = api.get<string[]>("/data");
        release();

        await expect(pending).resolves.toEqual(["private-of-A"]);
    });

    it("resolves a tokenless response across a session change, since it carries no account", async () => {
        const { fetcher, release } = heldFetcher(["public"]);
        let epoch = 0;
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => null,
            getSessionEpoch: () => epoch,
        });

        const pending = api.get<string[]>("/catalog");
        epoch += 1;
        release();

        await expect(pending).resolves.toEqual(["public"]);
    });

    it("resolves without getSessionEpoch, as before", async () => {
        const { fetcher, release } = heldFetcher(["private-of-A"]);
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => "A-token",
        });

        const pending = api.get<string[]>("/data");
        release();

        await expect(pending).resolves.toEqual(["private-of-A"]);
    });
});

/**
 * A fetcher whose error response waits for `release()`, so the test can move
 * the session epoch while a request that will fail is on the wire.
 *
 * @param status - The non-2xx status to answer with.
 * @param body - The JSON error envelope, holding the ended account's data.
 * @returns The fetcher and the function that lets the response land.
 */
function heldErrorFetcher(
    status: number,
    body: unknown,
): { fetcher: typeof fetch; release: () => void } {
    let release: () => void = () => undefined;
    const landed = new Promise<void>((resolve) => {
        release = resolve;
    });
    const fetcher = (async () => {
        await landed;
        return new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
        });
    }) as typeof fetch;
    return { fetcher, release };
}

/**
 * Security audit run-15 (low): the #609 check ran only on a 2xx, so an error
 * response to account A's request that landed after `logout()` + `login(B)`
 * became a `TempestApiError` carrying A's body and reached B's `onError`.
 */
describe("createApiClient — error responses of an ended session (run-15)", () => {
    it.each([404, 409, 422, 500])(
        "rejects a %i sent with a token when the session epoch moved before it landed",
        async (status) => {
            const { fetcher, release } = heldErrorFetcher(status, {
                detail: "private-of-A",
            });
            let epoch = 0;
            const api = createApiClient({
                baseURL: "https://api.example.test",
                fetcher,
                getToken: () => "A-token",
                getSessionEpoch: () => epoch,
            });

            const pending = api.post("/orders", { body: JSON.stringify({ item: 1 }) });
            epoch += 1;
            release();

            await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
        },
    );

    it("still rejects with the API error when the session is current", async () => {
        const { fetcher, release } = heldErrorFetcher(409, { detail: "conflict" });
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => "A-token",
            getSessionEpoch: () => 0,
        });

        const pending = api.post("/orders", { body: JSON.stringify({ item: 1 }) });
        release();

        await expect(pending).rejects.toMatchObject({ status: 409, detail: "conflict" });
    });

    it("still rejects a tokenless error with the API error across a session change", async () => {
        const { fetcher, release } = heldErrorFetcher(404, { detail: "missing" });
        let epoch = 0;
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => null,
            getSessionEpoch: () => epoch,
        });

        const pending = api.get("/catalog/9");
        epoch += 1;
        release();

        await expect(pending).rejects.toMatchObject({ status: 404 });
    });

    it("rejects the 401 of a failed refresh with SessionSupersededError when the session changed in flight", async () => {
        const { fetcher, release } = heldErrorFetcher(401, { detail: "private-of-A" });
        let epoch = 0;
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => "A-token",
            getSessionEpoch: () => epoch,
            refresh: async () => {
                throw new Error("refresh failed");
            },
        });

        const pending = api.get("/me");
        epoch += 1;
        release();

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
    });

    it("keeps the 401 when the refresh failure itself ends the session", async () => {
        let epoch = 0;
        const fetcher = (async () =>
            new Response(JSON.stringify({ detail: "expired" }), {
                status: 401,
                headers: { "content-type": "application/json" },
            })) as typeof fetch;
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => "A-token",
            getSessionEpoch: () => epoch,
            refresh: async () => {
                epoch += 1;
                throw new Error("refresh failed");
            },
        });

        await expect(api.get("/me")).rejects.toMatchObject({ status: 401 });
    });

    it("keeps the 401 when onUnauthorized signs out because of it", async () => {
        let epoch = 0;
        const fetcher = (async () =>
            new Response(JSON.stringify({ detail: "expired" }), {
                status: 401,
                headers: { "content-type": "application/json" },
            })) as typeof fetch;
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => "A-token",
            getSessionEpoch: () => epoch,
            onUnauthorized: () => {
                epoch += 1;
            },
        });

        await expect(api.get("/me")).rejects.toMatchObject({ status: 401 });
    });
});

/**
 * Security audit run-16 (low): the replay after a successful `refresh()`
 * never checked the session of the rejected attempt. With a standalone
 * `createApiClient`, a `refresh` hook that ignores its context (a documented
 * use), and `logout()` + `login(B)` during the refresh, A's POST was resent
 * with B's bearer and B's answer resolved into A's continuation.
 * `createTempestAuth` guards its own refresh and was never affected.
 */
describe("createApiClient — replay after a refresh that outlived the session (run-16)", () => {
    function switchingClient(next: string | null, retry?: boolean) {
        let token: string | null = "A-token";
        let epoch = 0;
        const sent: (string | null)[] = [];
        const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
            const bearer = new Headers(init?.headers).get("Authorization");
            sent.push(bearer);
            if (bearer === "Bearer A-token") {
                return new Response(JSON.stringify({ detail: "expired" }), {
                    status: 401,
                    headers: { "content-type": "application/json" },
                });
            }
            return new Response(JSON.stringify({ owner: bearer }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => token,
            getSessionEpoch: () => epoch,
            refresh: async () => {
                epoch += 1;
                token = next;
            },
            ...(retry ? { retry: { retries: 2, initialDelay: 1, shouldRetry: () => true } } : {}),
        });
        return { api, sent };
    }

    it.each([
        ["an account switch", "B-token"],
        ["a sign-out", null],
    ])("rejects instead of replaying A's request after %s during the refresh", async (_, next) => {
        const { api, sent } = switchingClient(next);

        await expect(
            api.post("/orders", { body: JSON.stringify({ item: 1 }) }),
        ).rejects.toBeInstanceOf(SessionSupersededError);
        expect(sent).toEqual(["Bearer A-token"]);
    });

    it("does not replay as B through the retry loop either", async () => {
        const { api, sent } = switchingClient("B-token", true);

        await expect(
            api.post("/orders", { body: JSON.stringify({ item: 1 }) }),
        ).rejects.toBeInstanceOf(SessionSupersededError);
        expect(sent).toEqual(["Bearer A-token"]);
    });

    it("still replays after a refresh that keeps the session (token rotation)", async () => {
        let token = "A-token";
        const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
            const bearer = new Headers(init?.headers).get("Authorization");
            return new Response(JSON.stringify({ owner: bearer }), {
                status: bearer === "Bearer A-token" ? 401 : 200,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher,
            getToken: () => token,
            getSessionEpoch: () => 0,
            refresh: async () => {
                token = "A-token-2";
            },
        });

        await expect(api.get("/me")).resolves.toEqual({ owner: "Bearer A-token-2" });
    });
});
