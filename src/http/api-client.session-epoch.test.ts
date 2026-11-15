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

            const pending = api.post("/orders", { item: 1 });
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

        const pending = api.post("/orders", { item: 1 });
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

    it("rejects the 401 of a failed refresh with SessionSupersededError once the session changed", async () => {
        let epoch = 0;
        const fetcher = (async () =>
            new Response(JSON.stringify({ detail: "private-of-A" }), {
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

        await expect(api.get("/me")).rejects.toBeInstanceOf(SessionSupersededError);
    });
});
