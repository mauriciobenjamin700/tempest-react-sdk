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

describe("ApiClient.wsUrl", () => {
    it("swaps https for wss and keeps base URL, prefix, path and params", () => {
        const api = createApiClient({ baseURL: "https://api.example.com/v1", prefix: "/api" });
        expect(api.wsUrl("/trips/7/watch", { ticket: "t1", gone: undefined })).toBe(
            "wss://api.example.com/v1/api/trips/7/watch?ticket=t1",
        );
    });

    it("swaps http for ws and keeps the port", () => {
        const api = createApiClient({ baseURL: "http://localhost:8000", prefix: "/api" });
        expect(api.wsUrl("/ws")).toBe("ws://localhost:8000/api/ws");
    });

    it("resolves a relative baseURL against the page, as url does", () => {
        const api = createApiClient({ baseURL: "/api" });
        const page = new URL(globalThis.location.href);
        const expected = page.protocol === "https:" ? "wss:" : "ws:";
        expect(api.wsUrl("/live")).toBe(`${expected}//${page.host}/api/live`);
    });

    it("swaps the scheme whatever its case", () => {
        const api = createApiClient({ baseURL: "https://api.example.com" });
        expect(api.wsUrl("HTTPS://Push.example.com/feed")).toMatch(/^wss:\/\//i);
    });

    it("returns a path that is already a socket URL as it is", () => {
        const api = createApiClient({ baseURL: "https://api.example.com" });
        expect(api.wsUrl("wss://push.example.com/feed")).toBe("wss://push.example.com/feed");
    });

    it("throws at the call for a scheme with no socket equivalent, instead of handing it to WebSocket", () => {
        const api = createApiClient({ baseURL: "https://api.example.com" });
        expect(() => api.wsUrl("blob:https://api.example.com/1")).toThrow(/needs an http\(s\) URL/);
    });

    it("sends nothing and never carries the token", () => {
        const fetcher = vi.fn() as unknown as typeof fetch;
        const api = createApiClient({
            baseURL: "https://api.example.com",
            getToken: () => "secret",
            fetcher,
        });
        expect(api.wsUrl("/x")).not.toContain("secret");
        expect(fetcher).not.toHaveBeenCalled();
    });
});
