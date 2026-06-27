import { describe, it, expect } from "vitest";

import { createApiClient } from "./api-client";
import { isApiError } from "./errors";
import type { ApiError } from "./types";

describe("createApiClient — X-Request-ID + Tempest error", () => {
    it("sends an X-Request-ID header by default", async () => {
        let seen: string | null = null;
        const api = createApiClient({
            baseURL: "https://api.test",
            fetcher: async (_url, init) => {
                seen = new Headers(init?.headers).get("X-Request-ID");
                return new Response("{}", {
                    status: 200,
                    headers: { "content-type": "application/json" },
                });
            },
        });
        await api.get("/ping");
        expect(seen).toBeTruthy();
    });

    it("uses the configured requestId factory and echoes it on error", async () => {
        const api = createApiClient({
            baseURL: "https://api.test",
            requestId: () => "fixed-id",
            fetcher: async () =>
                new Response(JSON.stringify({ detail: "Conflict", code: "DUP" }), {
                    status: 409,
                    headers: { "content-type": "application/json" },
                }),
        });

        await expect(api.post("/x")).rejects.toMatchObject({
            status: 409,
            code: "DUP",
            requestId: "fixed-id",
        });
    });

    it("prefers details.request_id from the body over the sent id", async () => {
        const api = createApiClient({
            baseURL: "https://api.test",
            requestId: () => "sent",
            fetcher: async () =>
                new Response(
                    JSON.stringify({ detail: "x", details: { request_id: "from-body" } }),
                    { status: 400, headers: { "content-type": "application/json" } },
                ),
        });

        try {
            await api.get("/x");
            expect.unreachable();
        } catch (err) {
            expect(isApiError(err)).toBe(true);
            expect((err as ApiError).requestId).toBe("from-body");
        }
    });

    it("disables the header when requestId returns empty string", async () => {
        let hasHeader = true;
        const api = createApiClient({
            baseURL: "https://api.test",
            requestId: () => "",
            fetcher: async (_url, init) => {
                hasHeader = new Headers(init?.headers).has("X-Request-ID");
                return new Response(null, { status: 204 });
            },
        });
        await api.delete("/x");
        expect(hasHeader).toBe(false);
    });
});
