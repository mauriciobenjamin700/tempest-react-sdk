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
