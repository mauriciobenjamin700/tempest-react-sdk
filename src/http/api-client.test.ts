import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import type { ApiError } from "./types";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
        ...init,
    });
}

describe("createApiClient", () => {
    afterEach(() => vi.restoreAllMocks());

    it("merges baseURL + path + params", async () => {
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
        const api = createApiClient({ baseURL: "https://api.example.com", fetcher });
        await api.get("/users", { params: { page: 2 } });
        const url = String(fetcher.mock.calls[0][0]);
        expect(url).toBe("https://api.example.com/users?page=2");
    });

    it("attaches Authorization header from getToken", async () => {
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
        const api = createApiClient({
            baseURL: "https://api.example.com",
            getToken: () => "abc",
            fetcher,
        });
        await api.get("/me");
        const init = fetcher.mock.calls[0][1] as RequestInit;
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
    });

    it("serializes JSON body and sets Content-Type", async () => {
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
        const api = createApiClient({ baseURL: "https://api.example.com", fetcher });
        await api.post("/x", { body: { a: 1 } });
        const init = fetcher.mock.calls[0][1] as RequestInit;
        expect(init.body).toBe(JSON.stringify({ a: 1 }));
        expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    it("returns undefined on 204", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        const api = createApiClient({ baseURL: "https://api.example.com", fetcher });
        const result = await api.delete("/x");
        expect(result).toBeUndefined();
    });

    it("throws ApiError on non-2xx response", async () => {
        const fetcher = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ detail: "Forbidden" }), {
                status: 403,
                headers: { "content-type": "application/json" },
            }),
        );
        const api = createApiClient({ baseURL: "https://api.example.com", fetcher });
        try {
            await api.get("/x");
            throw new Error("should not reach");
        } catch (error) {
            const apiError = error as ApiError;
            expect(apiError.status).toBe(403);
            expect(apiError.detail).toBe("Forbidden");
        }
    });

    it("calls refresh + retries once on 401", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(new Response("", { status: 401 }))
            .mockResolvedValueOnce(jsonResponse({ ok: true }));
        const refresh = vi.fn().mockResolvedValue(undefined);
        const api = createApiClient({
            baseURL: "https://api.example.com",
            refresh,
            fetcher,
        });
        await api.get("/x");
        expect(refresh).toHaveBeenCalledOnce();
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("calls onUnauthorized when 401 has no refresh", async () => {
        const fetcher = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ detail: "x" }), {
                status: 401,
                headers: { "content-type": "application/json" },
            }),
        );
        const onUnauthorized = vi.fn();
        const api = createApiClient({
            baseURL: "https://api.example.com",
            onUnauthorized,
            fetcher,
        });
        await expect(api.get("/x")).rejects.toMatchObject({ status: 401 });
        expect(onUnauthorized).toHaveBeenCalled();
    });

    it("passes FormData without JSON Content-Type", async () => {
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({ url: "/u" }));
        const api = createApiClient({ baseURL: "https://api.example.com", fetcher });
        const form = new FormData();
        form.append("file", new Blob(["x"]));
        await api.upload("/uploads", form);
        const init = fetcher.mock.calls[0][1] as RequestInit;
        expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    });
});
