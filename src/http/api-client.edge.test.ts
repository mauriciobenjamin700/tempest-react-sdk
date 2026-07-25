import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";

describe("createApiClient — edge cases", () => {
    it("returns text on non-JSON content type", async () => {
        const fetcher = vi.fn().mockResolvedValue(
            new Response("hello world", {
                status: 200,
                headers: { "content-type": "text/plain" },
            }),
        );
        const api = createApiClient({ baseURL: "https://x", fetcher });
        const result = await api.get<string>("/y");
        expect(result).toBe("hello world");
    });

    it("falls back to default detail message when error body lacks one", async () => {
        const fetcher = vi.fn().mockResolvedValue(
            new Response("plain", {
                status: 500,
                headers: { "content-type": "text/plain" },
            }),
        );
        const api = createApiClient({ baseURL: "https://x", fetcher });
        await expect(api.get("/y")).rejects.toMatchObject({
            status: 500,
            detail: expect.stringContaining("500"),
        });
    });

    it("falls through to onUnauthorized when refresh rejects", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(new Response("", { status: 401 }))
            .mockResolvedValueOnce(new Response("", { status: 401 }));
        const onUnauthorized = vi.fn();
        const refresh = vi.fn().mockRejectedValue(new Error("refresh failed"));
        const api = createApiClient({
            baseURL: "https://x",
            fetcher,
            refresh,
            onUnauthorized,
        });
        await expect(api.get("/y")).rejects.toMatchObject({ status: 401 });
        expect(onUnauthorized).toHaveBeenCalled();
    });

    it("merges custom headers and default config.headers", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        const api = createApiClient({
            baseURL: "https://x",
            headers: { "X-App": "test" },
            fetcher,
        });
        await api.get("/y", { headers: { "X-Trace": "abc" } });
        const init = fetcher.mock.calls[0][1] as RequestInit;
        const headers = init.headers as Record<string, string>;
        expect(headers["X-App"]).toBe("test");
        expect(headers["X-Trace"]).toBe("abc");
    });

    it("appends params and supports put/patch", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        const api = createApiClient({ baseURL: "https://x", fetcher });
        await api.put("/y", { body: { a: 1 } });
        await api.patch("/y", { body: { a: 2 } });
        expect((fetcher.mock.calls[0][1] as RequestInit).method).toBe("PUT");
        expect((fetcher.mock.calls[1][1] as RequestInit).method).toBe("PATCH");
    });
});

describe("createApiClient — url building, credentials and response shapes", () => {
    it("joins a baseURL without a trailing slash", async () => {
        const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
        const api = createApiClient({ baseURL: "https://api.test/v1", fetcher });
        await api.get("orders");
        expect(String(fetcher.mock.calls[0][0])).toBe("https://api.test/v1/orders");
    });

    it("skips null and undefined query params", async () => {
        const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
        const api = createApiClient({ baseURL: "https://api.test/", fetcher });
        await api.get("search", { params: { q: "x", page: 2, empty: undefined, none: null } });
        const url = new URL(String(fetcher.mock.calls[0][0]));
        expect(url.searchParams.get("q")).toBe("x");
        expect(url.searchParams.get("page")).toBe("2");
        expect(url.searchParams.has("empty")).toBe(false);
        expect(url.searchParams.has("none")).toBe(false);
    });

    it("omits the Authorization header when getToken returns nothing", async () => {
        const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
        const api = createApiClient({
            baseURL: "https://api.test/",
            fetcher,
            getToken: () => null,
        });
        await api.get("me");
        const headers = new Headers((fetcher.mock.calls[0][1] as RequestInit).headers);
        expect(headers.has("authorization")).toBe(false);
    });

    it("sends credentials: include when withCredentials is set", async () => {
        const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
        const api = createApiClient({
            baseURL: "https://api.test/",
            fetcher,
            withCredentials: true,
        });
        await api.get("me");
        expect((fetcher.mock.calls[0][1] as RequestInit).credentials).toBe("include");
    });

    it("returns undefined for 204 and raw text for a non-JSON body", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(
                new Response("plain", { status: 200, headers: { "content-type": "text/plain" } }),
            );
        const api = createApiClient({ baseURL: "https://api.test/", fetcher });
        expect(await api.get("empty")).toBeUndefined();
        expect(await api.get("text")).toBe("plain");
    });

    it("passes FormData through without JSON headers", async () => {
        const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
        const api = createApiClient({ baseURL: "https://api.test/", fetcher });
        const form = new FormData();
        form.set("file", "x");
        await api.post("upload", { body: form });

        const init = fetcher.mock.calls[0][1] as RequestInit;
        expect(init.body).toBe(form);
        expect(new Headers(init.headers).has("content-type")).toBe(false);
    });
});
