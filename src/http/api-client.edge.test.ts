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
        expect(
            (fetcher.mock.calls[0][1] as RequestInit).method,
        ).toBe("PUT");
        expect(
            (fetcher.mock.calls[1][1] as RequestInit).method,
        ).toBe("PATCH");
    });
});
