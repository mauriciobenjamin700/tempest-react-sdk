import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { TempestApiError } from "./errors";

function ok(): Response {
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}

/**
 * The response a browser's `fetch` resolves with when `redirect: "manual"`
 * stops a redirect: type `opaqueredirect`, status `0`, no readable headers.
 * `new Response` cannot build one, so the getters are overridden.
 */
function opaqueRedirect(): Response {
    const response = new Response(null, { status: 200 });
    Object.defineProperty(response, "type", { value: "opaqueredirect" });
    Object.defineProperty(response, "status", { value: 0 });
    Object.defineProperty(response, "ok", { value: false });
    return response;
}

/** What a server runtime's `fetch` resolves with for the same stopped redirect. */
function realRedirect(status: number): Response {
    return new Response(null, { status, headers: { Location: "https://evil.test/collect" } });
}

function initOf(fetcher: ReturnType<typeof vi.fn>, call = 0): RequestInit {
    return fetcher.mock.calls[call][1] as RequestInit;
}

/**
 * Browsers strip `Authorization` on a cross-origin redirect and nothing else
 * (Chrome 150, `fetch` and XHR, 301/302/303/307/308 — #554). Until 0.82.0 a
 * request carrying the client's static `headers` followed any redirect, so an
 * open redirect on the API took an `X-Api-Key` to whatever origin it named.
 */
describe("createApiClient — static headers never follow a redirect", () => {
    it("asks fetch not to follow redirects when the request carries static headers", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            headers: { "X-Api-Key": "key" },
            fetcher,
        });

        await api.get("/me");

        expect(initOf(fetcher).redirect).toBe("manual");
    });

    it("throws REDIRECT_REFUSED on a browser's opaque redirect instead of returning it", async () => {
        const fetcher = vi.fn().mockResolvedValue(opaqueRedirect());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            headers: { "X-Api-Key": "key" },
            requestId: () => "rid-1",
            fetcher,
        });

        const error = await api.get("/open-redirect").catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(TempestApiError);
        expect(error).toMatchObject({ status: 0, code: "REDIRECT_REFUSED", requestId: "rid-1" });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it.each([301, 302, 303, 307, 308])(
        "throws REDIRECT_REFUSED on a server runtime's %i without following it",
        async (status) => {
            const fetcher = vi.fn().mockResolvedValue(realRedirect(status));
            const api = createApiClient({
                baseURL: "https://api.acme.com",
                headers: { "X-Api-Key": "key" },
                fetcher,
            });

            await expect(api.post("/items", { body: {} })).rejects.toMatchObject({
                status,
                code: "REDIRECT_REFUSED",
            });
            expect(fetcher).toHaveBeenCalledTimes(1);
        },
    );

    it("never retries a refused redirect, though its browser status reads like a network failure", async () => {
        const fetcher = vi.fn().mockResolvedValue(opaqueRedirect());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            headers: { "X-Api-Key": "key" },
            retry: { retries: 3, initialDelay: 0 },
            fetcher,
        });

        await expect(api.get("/x")).rejects.toMatchObject({ code: "REDIRECT_REFUSED" });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("returns a 304 as before, because it is a cache answer and not a redirect", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            headers: { "X-Api-Key": "key" },
            fetcher,
        });

        await expect(api.get("/x")).rejects.not.toMatchObject({ code: "REDIRECT_REFUSED" });
    });

    it("lets a redirect set on the call win, so a trailing-slash 307 can be followed on purpose", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            headers: { "X-Api-Key": "key" },
            fetcher,
        });

        await api.post("/items", { body: {}, redirect: "follow" });

        expect(initOf(fetcher).redirect).toBe("follow");
    });

    it("keeps following redirects for a bearer-only client, whose header the browser strips", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            getToken: () => "tok",
            fetcher,
        });

        await api.get("/me");

        expect(initOf(fetcher).redirect).toBeUndefined();
    });

    it("keeps following redirects off the credential scope, where the static headers are not sent", async () => {
        const fetcher = vi.fn().mockResolvedValue(opaqueRedirect());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            headers: { "X-Api-Key": "key" },
            fetcher,
        });

        await api.get("https://cdn.other/asset.json").catch(() => undefined);

        expect(initOf(fetcher).redirect).toBeUndefined();
    });
});
