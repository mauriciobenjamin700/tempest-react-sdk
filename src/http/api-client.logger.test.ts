import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { createApiClient } from "./api-client";
import type { ApiClientLogger } from "./types";

type LogFn = (message: string, context?: Record<string, unknown>) => void;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
        ...init,
    });
}

function fakeLogger(): ApiClientLogger & { debug: Mock<LogFn>; warn: Mock<LogFn> } {
    return { debug: vi.fn<LogFn>(), warn: vi.fn<LogFn>() };
}

describe("createApiClient — logger", () => {
    it("writes nothing when no logger is configured", async () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
        const api = createApiClient({ baseURL: "https://api.example.com", fetcher });

        await api.get("/users");

        expect(spy).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        spy.mockRestore();
        warn.mockRestore();
    });

    it("logs a successful request at debug with requestId, status and ms", async () => {
        const logger = fakeLogger();
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
        const api = createApiClient({
            baseURL: "https://api.example.com",
            requestId: () => "req-1",
            logger,
            fetcher,
        });

        await api.get("/users", { params: { page: 2 } });

        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalledTimes(1);
        const [message, context] = logger.debug.mock.calls[0]!;
        expect(message).toBe("GET /users → 200");
        expect(context).toMatchObject({ requestId: "req-1", status: 200 });
        expect(typeof context?.ms).toBe("number");
    });

    it("never logs the query string, the body or the headers", async () => {
        const logger = fakeLogger();
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
        const api = createApiClient({
            baseURL: "https://api.example.com",
            getToken: () => "super-secret-token",
            logger,
            fetcher,
        });

        await api.post("/auth/login", {
            body: { email: "a@b.com", password: "hunter2" },
            params: { access_token: "leaky" },
        });

        const serialized = JSON.stringify(logger.debug.mock.calls);
        expect(serialized).not.toContain("super-secret-token");
        expect(serialized).not.toContain("hunter2");
        expect(serialized).not.toContain("leaky");
        expect(serialized).toContain("POST /auth/login → 200");
    });

    it("logs a failed status at warn", async () => {
        const logger = fakeLogger();
        const fetcher = vi
            .fn()
            .mockResolvedValue(jsonResponse({ detail: "nope" }, { status: 403 }));
        const api = createApiClient({ baseURL: "https://api.example.com", logger, fetcher });

        await expect(api.get("/admin")).rejects.toThrow("nope");

        expect(logger.debug).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
            "GET /admin → 403",
            expect.objectContaining({ status: 403 }),
        );
    });

    it("logs a fetch that never answered at warn, carrying the error", async () => {
        const logger = fakeLogger();
        const failure = new TypeError("Failed to fetch");
        const fetcher = vi.fn().mockRejectedValue(failure);
        const api = createApiClient({ baseURL: "https://api.example.com", logger, fetcher });

        await expect(api.get("/users")).rejects.toThrow("Failed to fetch");

        expect(logger.warn).toHaveBeenCalledWith(
            "GET /users → no response",
            expect.objectContaining({ error: failure }),
        );
    });

    it("logs one line per attempt, so the refresh replay shows up", async () => {
        const logger = fakeLogger();
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, { status: 401 }))
            .mockResolvedValueOnce(jsonResponse({ ok: true }));
        const api = createApiClient({
            baseURL: "https://api.example.com",
            refresh: async () => {},
            logger,
            fetcher,
        });

        await api.get("/me");

        expect(logger.warn).toHaveBeenCalledWith("GET /me → 401", expect.anything());
        expect(logger.debug).toHaveBeenCalledWith("GET /me → 200", expect.anything());
    });

    it("warns when onUnauthorized fires", async () => {
        const logger = fakeLogger();
        const onUnauthorized = vi.fn();
        const fetcher = vi
            .fn()
            .mockResolvedValue(jsonResponse({ detail: "expired" }, { status: 401 }));
        const api = createApiClient({
            baseURL: "https://api.example.com",
            onUnauthorized,
            logger,
            fetcher,
        });

        await expect(api.get("/me")).rejects.toThrow("expired");

        expect(onUnauthorized).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(
            "unauthorized — calling onUnauthorized",
            expect.objectContaining({ status: 401 }),
        );
    });

    it("warns and keeps the response error when onUnauthorized throws", async () => {
        const logger = fakeLogger();
        const failure = new Error("logout POST came back 422");
        const fetcher = vi
            .fn()
            .mockResolvedValue(jsonResponse({ detail: "expired" }, { status: 401 }));
        const api = createApiClient({
            baseURL: "https://api.example.com",
            onUnauthorized: () => Promise.reject(failure),
            logger,
            fetcher,
        });

        await expect(api.get("/me")).rejects.toThrow("expired");

        expect(logger.warn).toHaveBeenCalledWith(
            "onUnauthorized threw — keeping the original response error",
            expect.objectContaining({ error: failure, status: 401 }),
        );
    });

    it("logs every retry attempt", async () => {
        const logger = fakeLogger();
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ detail: "boom" }, { status: 503 }))
            .mockResolvedValueOnce(jsonResponse({ ok: true }));
        const api = createApiClient({
            baseURL: "https://api.example.com",
            retry: { retries: 2, initialDelay: 0 },
            logger,
            fetcher,
        });

        await api.get("/users");

        expect(logger.warn).toHaveBeenCalledWith("GET /users → 503", expect.anything());
        expect(logger.debug).toHaveBeenCalledWith("GET /users → 200", expect.anything());
    });

    it("accepts the SDK logger without an adapter", async () => {
        const entries: string[] = [];
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
        const { createLogger } = await import("../logger");
        const api = createApiClient({
            baseURL: "https://api.example.com",
            logger: createLogger({
                level: "debug",
                namespace: "http",
                sinks: [(entry) => entries.push(entry.message)],
            }),
            fetcher,
        });

        await api.get("/users");

        expect(entries).toEqual(["[http] GET /users → 200"]);
    });
});
