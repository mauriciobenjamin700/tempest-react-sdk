import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiClient } from "@/http/api-client";

import { exchangeOAuthCallback, readOAuthCallbackParams } from "./callback";

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

describe("readOAuthCallbackParams — code and state leave the address bar once read", () => {
    it("removes code and state from the URL, keeping the other params, the hash and history.state", () => {
        window.history.replaceState({ idx: 3 }, "", "/callback?code=c1&from=menu&state=s1#top");

        expect(readOAuthCallbackParams()).toEqual({ code: "c1", state: "s1" });

        expect(window.location.pathname + window.location.search + window.location.hash).toBe(
            "/callback?from=menu#top",
        );
        expect(window.history.state).toEqual({ idx: 3 });
    });

    it("drops the '?' when code and state were the only params", () => {
        window.history.replaceState(null, "", "/callback?code=c1&state=s1");

        readOAuthCallbackParams();

        expect(window.location.href).toBe(`${window.location.origin}/callback`);
    });

    it("scrubs even when the callback is refused, since the code is already exposed", () => {
        window.history.replaceState(null, "", "/callback?code=ATTACKER_CODE");

        expect(() => readOAuthCallbackParams()).toThrow();
        expect(window.location.search).toBe("");
    });

    it("leaves the URL alone with scrubUrl: false", () => {
        window.history.replaceState(null, "", "/callback?code=c1&state=s1");

        readOAuthCallbackParams(undefined, { scrubUrl: false });

        expect(window.location.search).toBe("?code=c1&state=s1");
    });

    it("does not touch the URL when reading an explicit search string", () => {
        window.history.replaceState(null, "", "/callback?code=real&state=real");

        readOAuthCallbackParams("?code=c&state=s");

        expect(window.location.search).toBe("?code=real&state=real");
    });

    it("does not call replaceState when there is nothing to remove", () => {
        window.history.replaceState(null, "", "/callback?error=access_denied");
        const spy = vi.spyOn(window.history, "replaceState");

        expect(() => readOAuthCallbackParams()).toThrow();
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it("is scrubbed by exchangeOAuthCallback before the request goes out", async () => {
        window.history.replaceState(null, "", "/callback?code=c1&state=s1");
        let searchAtFetch = "";
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher: (async () => {
                searchAtFetch = window.location.search;
                return new Response("{}", {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }) as typeof fetch,
        });

        await exchangeOAuthCallback(api, "google");

        expect(searchAtFetch).toBe("");
    });

    it("keeps the URL with exchangeOAuthCallback's scrubUrl: false", async () => {
        window.history.replaceState(null, "", "/callback?code=c1&state=s1");
        const api = createApiClient({
            baseURL: "https://api.example.test",
            fetcher: (async () =>
                new Response("{}", {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })) as typeof fetch,
        });

        await exchangeOAuthCallback(api, "google", { scrubUrl: false });

        expect(window.location.search).toBe("?code=c1&state=s1");
    });
});
