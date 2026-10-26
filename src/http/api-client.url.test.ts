import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";

describe("ApiClient.url", () => {
    it("joins base URL, prefix and path the way a request would", () => {
        const api = createApiClient({ baseURL: "https://api.example.com/v1", prefix: "/api" });
        expect(api.url("/sse/stream")).toBe("https://api.example.com/v1/api/sse/stream");
    });

    it("appends params and skips undefined and null", () => {
        const api = createApiClient({ baseURL: "https://api.example.com" });
        expect(api.url("/files", { name: "a b", page: 2, gone: undefined, none: null })).toBe(
            "https://api.example.com/files?name=a+b&page=2",
        );
    });

    it("sends nothing and never carries the token", () => {
        const fetcher = vi.fn() as unknown as typeof fetch;
        const api = createApiClient({
            baseURL: "https://api.example.com",
            getToken: () => "secret",
            fetcher,
        });
        expect(api.url("/x")).not.toContain("secret");
        expect(fetcher).not.toHaveBeenCalled();
    });
});
