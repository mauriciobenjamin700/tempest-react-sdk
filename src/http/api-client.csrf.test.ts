import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { resetSuppressedCredentialReports } from "./credential-scope";
import { resetCsrfReports } from "./csrf";

const API = "https://api.acme.com";

function ok(): Response {
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}

/** The headers the fetcher was called with on a given attempt. */
function headersOf(fetcher: ReturnType<typeof vi.fn>, call = 0): Record<string, string> {
    return (fetcher.mock.calls[call][1] as RequestInit).headers as Record<string, string>;
}

beforeEach(() => {
    document.cookie = "csrf_token=tok-1; path=/";
});

afterEach(() => {
    document.cookie = "csrf_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    resetCsrfReports();
    resetSuppressedCredentialReports();
    vi.restoreAllMocks();
});

/**
 * Before 0.68.0 `withCredentials: true` put the session in a cookie the browser
 * attaches on its own, and the client had no CSRF header to pair with it.
 */
describe("createApiClient — without csrf, no request changes", () => {
    it("sends no CSRF header on a write", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({ baseURL: API, withCredentials: true, fetcher });

        await api.post("/orders", { body: { id: 1 } });

        expect(Object.keys(headersOf(fetcher))).toEqual(["Content-Type", "X-Request-ID"]);
    });
});

describe("createApiClient — every write carries the token", () => {
    it.each(["post", "put", "patch", "delete"] as const)("sends it on %s", async (method) => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({ baseURL: API, csrf: true, fetcher });

        await api[method]("/orders/1");

        expect(headersOf(fetcher)["X-CSRF-Token"]).toBe("tok-1");
    });

    it("sends it on an upload", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({ baseURL: API, csrf: true, fetcher });

        await api.upload("/files", new FormData());

        expect(headersOf(fetcher)["X-CSRF-Token"]).toBe("tok-1");
    });
});

describe("createApiClient — reads never carry the token", () => {
    it("omits it on get, head, blob and arrayBuffer", async () => {
        const fetcher = vi.fn().mockImplementation(async () => ok());
        const api = createApiClient({ baseURL: API, csrf: true, fetcher });

        await api.get("/orders");
        await api.blob("/file");
        await api.arrayBuffer("/file");
        await api.request("/orders", { method: "HEAD" });

        for (let call = 0; call < 4; call += 1) {
            expect(headersOf(fetcher, call)["X-CSRF-Token"]).toBeUndefined();
        }
    });
});

describe("createApiClient — the token never leaves baseURL's origin", () => {
    it("withholds it from an absolute path on another origin", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({ baseURL: API, csrf: true, fetcher });

        await api.post("https://evil.test/collect");

        expect(headersOf(fetcher)["X-CSRF-Token"]).toBeUndefined();
    });

    it("sends it to an origin listed in trustedOrigins", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: API,
            csrf: true,
            trustedOrigins: ["https://files.acme.com"],
            fetcher,
        });

        await api.post("https://files.acme.com/u");

        expect(headersOf(fetcher)["X-CSRF-Token"]).toBe("tok-1");
    });
});

describe("createApiClient — the CSRF header does not follow auth", () => {
    it("is sent on a skipAuth write, because login and refresh are the forgeable ones", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: API,
            csrf: true,
            getToken: () => "bearer",
            fetcher,
        });

        await api.post("/auth/refresh", { skipAuth: true });

        expect(headersOf(fetcher).Authorization).toBeUndefined();
        expect(headersOf(fetcher)["X-CSRF-Token"]).toBe("tok-1");
    });

    it("re-reads the cookie on the replay after a refresh, which may have rotated it", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(new Response("{}", { status: 401 }))
            .mockResolvedValueOnce(ok());
        const api = createApiClient({
            baseURL: API,
            csrf: true,
            refresh: async () => {
                document.cookie = "csrf_token=tok-2; path=/";
            },
            fetcher,
        });

        await api.post("/orders");

        expect(headersOf(fetcher, 0)["X-CSRF-Token"]).toBe("tok-1");
        expect(headersOf(fetcher, 1)["X-CSRF-Token"]).toBe("tok-2");
    });
});

describe("createApiClient — a CSRF header you set is never replaced", () => {
    it("keeps a per-request header, in any casing, as the only one", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({ baseURL: API, csrf: true, fetcher });

        await api.post("/orders", { headers: { "x-csrf-token": "mine" } });

        const sent = new Headers(headersOf(fetcher));
        expect(sent.get("X-CSRF-Token")).toBe("mine");
    });

    it("keeps a header set in the client's default headers", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: API,
            csrf: true,
            headers: { "X-CSRF-Token": "static" },
            fetcher,
        });

        await api.post("/orders");

        expect(new Headers(headersOf(fetcher)).get("X-CSRF-Token")).toBe("static");
    });
});
