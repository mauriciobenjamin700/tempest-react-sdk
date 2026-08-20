import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApiUrl } from "./build-url";

describe("buildApiUrl — base URL carrying a path", () => {
    it("keeps the base path when the request path opens with a slash", () => {
        expect(buildApiUrl("https://api.test/api", "/auth/login")).toBe(
            "https://api.test/api/auth/login",
        );
    });

    it("keeps the base path when the request path is relative", () => {
        expect(buildApiUrl("https://api.test/api", "auth/login")).toBe(
            "https://api.test/api/auth/login",
        );
    });

    it("does not double the separator when the base ends with a slash", () => {
        expect(buildApiUrl("https://api.test/api/", "/auth/login")).toBe(
            "https://api.test/api/auth/login",
        );
    });

    it("keeps a multi-segment base path", () => {
        expect(buildApiUrl("https://api.test/service/v2", "/orders")).toBe(
            "https://api.test/service/v2/orders",
        );
    });

    it("still works with no path on the base", () => {
        expect(buildApiUrl("https://api.test", "/orders")).toBe("https://api.test/orders");
    });
});

describe("buildApiUrl — prefix option", () => {
    it("nests every request under the prefix", () => {
        expect(buildApiUrl("https://api.test", "/auth/login", { prefix: "/api" })).toBe(
            "https://api.test/api/auth/login",
        );
    });

    it("accepts a prefix written without slashes", () => {
        expect(buildApiUrl("https://api.test", "auth/login", { prefix: "api" })).toBe(
            "https://api.test/api/auth/login",
        );
    });

    it("joins a prefix after a base that already has a path", () => {
        expect(buildApiUrl("https://api.test/gateway", "/orders", { prefix: "/api" })).toBe(
            "https://api.test/gateway/api/orders",
        );
    });

    it("applies the prefix at most once", () => {
        expect(buildApiUrl("https://api.test", "/api/auth/login", { prefix: "/api" })).toBe(
            "https://api.test/api/auth/login",
        );
    });

    it("compares the prefix by segment, so /api-keys is not already-prefixed", () => {
        expect(buildApiUrl("https://api.test", "/api-keys", { prefix: "/api" })).toBe(
            "https://api.test/api/api-keys",
        );
    });

    it("treats a multi-segment prefix as already applied only in full", () => {
        expect(buildApiUrl("https://api.test", "/v1/orders", { prefix: "/api/v1" })).toBe(
            "https://api.test/api/v1/v1/orders",
        );
    });
});

describe("buildApiUrl — path shapes", () => {
    it("preserves a trailing slash, which FastAPI redirects on without", () => {
        expect(buildApiUrl("https://api.test/api", "/categories/")).toBe(
            "https://api.test/api/categories/",
        );
    });

    it("preserves a trailing slash ahead of a query string", () => {
        expect(buildApiUrl("https://api.test/api", "/categories/?page=1")).toBe(
            "https://api.test/api/categories/?page=1",
        );
    });

    it("keeps a query string already written into the path", () => {
        expect(buildApiUrl("https://api.test/api", "/orders?page=2")).toBe(
            "https://api.test/api/orders?page=2",
        );
    });

    it("merges params with a query string already in the path", () => {
        const url = new URL(
            buildApiUrl("https://api.test/api", "/orders?page=2", { params: { size: 50 } }),
        );
        expect(url.searchParams.get("page")).toBe("2");
        expect(url.searchParams.get("size")).toBe("50");
    });

    it("skips null and undefined params", () => {
        const url = new URL(
            buildApiUrl("https://api.test", "/search", {
                params: { q: "x", page: 2, empty: undefined, none: null },
            }),
        );
        expect(url.searchParams.get("q")).toBe("x");
        expect(url.searchParams.has("empty")).toBe(false);
        expect(url.searchParams.has("none")).toBe(false);
    });

    it("resolves an empty path to the base itself", () => {
        expect(buildApiUrl("https://api.test/api", "")).toBe("https://api.test/api");
    });

    it("resolves a bare slash to the base with its trailing slash", () => {
        expect(buildApiUrl("https://api.test/api", "/")).toBe("https://api.test/api/");
    });

    it("collapses a doubled slash between base and path", () => {
        expect(buildApiUrl("https://api.test/api/", "//orders")).toBe(
            "https://api.test/api/orders",
        );
    });
});

describe("buildApiUrl — absolute paths and relative bases", () => {
    it("uses an absolute path as-is, ignoring base and prefix", () => {
        expect(
            buildApiUrl("https://api.test/api", "https://cdn.test/signed", { prefix: "/api" }),
        ).toBe("https://cdn.test/signed");
    });

    it("appends params to an absolute path", () => {
        expect(
            buildApiUrl("https://api.test", "https://cdn.test/signed", { params: { t: 1 } }),
        ).toBe("https://cdn.test/signed?t=1");
    });

    it("resolves a relative baseURL against the current origin", () => {
        expect(buildApiUrl("/api", "/auth/login")).toBe(`${window.location.origin}/api/auth/login`);
    });

    it("throws a config-level message when a relative base has no origin", () => {
        const location = vi.spyOn(globalThis, "location", "get");
        location.mockReturnValue(undefined as unknown as Location);
        expect(() => buildApiUrl("/api", "/auth/login")).toThrow(/baseURL "\/api" is relative/);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});
