import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { resetSuppressedCredentialReports } from "./credential-scope";

function ok(): Response {
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}

/** The headers the fetcher was called with on a given attempt. */
function headersOf(fetcher: ReturnType<typeof vi.fn>, call = 0): Record<string, string> {
    return (fetcher.mock.calls[call][1] as RequestInit).headers as Record<string, string>;
}

/**
 * Until 0.66.0 an absolute path overrode `baseURL` and the bearer token went
 * with it, so a URL the app read off the network — a pagination link, a
 * `download_url` — decided which origin received the credential.
 */
describe("createApiClient — the bearer token is scoped to baseURL's origin", () => {
    afterEach(() => {
        resetSuppressedCredentialReports();
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("sends the token to the client's own origin", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            getToken: () => "tok",
            fetcher,
        });

        await api.get("/me");

        expect(headersOf(fetcher).Authorization).toBe("Bearer tok");
    });

    it("withholds the token from an absolute path on another origin", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            getToken: () => "tok",
            fetcher,
        });

        await api.get("https://evil.test/collect");

        expect(String(fetcher.mock.calls[0][0])).toBe("https://evil.test/collect");
        expect(headersOf(fetcher).Authorization).toBeUndefined();
    });

    it("still sends the request, because an off-origin call is not always an attack", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            getToken: () => "tok",
            fetcher,
        });

        await expect(api.get("https://cdn.other/asset.json")).resolves.toEqual({});
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("sends the token to an origin the app declared trusted", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            getToken: () => "tok",
            trustedOrigins: ["https://cdn.acme.com"],
            fetcher,
        });

        await api.get("https://cdn.acme.com/u/1");

        expect(headersOf(fetcher).Authorization).toBe("Bearer tok");
    });

    it("leaves an Authorization the caller wrote by hand alone", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            getToken: () => "tok",
            fetcher,
        });

        await api.get("https://cdn.other/u/1", { headers: { Authorization: "Bearer explicit" } });

        expect(headersOf(fetcher).Authorization).toBe("Bearer explicit");
    });

    it("says once, in a development build, which origin was withheld from", async () => {
        vi.stubEnv("NODE_ENV", "development");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const fetcher = vi.fn(async () => ok());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            getToken: () => "tok",
            fetcher,
        });

        await api.get("https://evil.test/a");
        await api.get("https://evil.test/b");

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("https://evil.test");
    });
});

describe("createApiClient — per-request auth and retry policy", () => {
    afterEach(() => vi.restoreAllMocks());

    it("skipAuth sends no Authorization", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            getToken: () => "tok",
            fetcher,
        });

        await api.post("/auth/login", { skipAuth: true });

        expect(headersOf(fetcher).Authorization).toBeUndefined();
    });

    it("skipAuth keeps a 401 out of the refresh cycle, which is what stops refresh recursing", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
        const refresh = vi.fn().mockResolvedValue(undefined);
        const onUnauthorized = vi.fn();
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            getToken: () => "tok",
            refresh,
            onUnauthorized,
            fetcher,
        });

        await expect(api.post("/auth/refresh", { skipAuth: true })).rejects.toMatchObject({
            status: 401,
        });
        expect(refresh).not.toHaveBeenCalled();
        expect(onUnauthorized).not.toHaveBeenCalled();
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("skipAuthRetry authenticates but lets the 401 surface", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
        const refresh = vi.fn().mockResolvedValue(undefined);
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            getToken: () => "tok",
            refresh,
            fetcher,
        });

        await expect(api.get("/me", { skipAuthRetry: true })).rejects.toMatchObject({
            status: 401,
        });
        expect(headersOf(fetcher).Authorization).toBe("Bearer tok");
        expect(refresh).not.toHaveBeenCalled();
    });

    it("retry: false turns retrying off for one call on a client that has it on", async () => {
        const fetcher = vi.fn(async () => new Response("{}", { status: 503 }));
        const api = createApiClient({ baseURL: "https://api.acme.com", retry: true, fetcher });

        await expect(api.get("/flaky", { retry: false })).rejects.toMatchObject({ status: 503 });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("retry options turn retrying on for one call on a client that has none", async () => {
        const fetcher = vi.fn(async () => new Response("{}", { status: 503 }));
        const api = createApiClient({ baseURL: "https://api.acme.com", fetcher });

        await expect(
            api.get("/flaky", { retry: { retries: 3, initialDelay: 0 } }),
        ).rejects.toMatchObject({ status: 503 });
        expect(fetcher).toHaveBeenCalledTimes(3);
    });

    it("does not forward the policy fields to fetch as request init", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({ baseURL: "https://api.acme.com", fetcher });

        await api.get("/me", { skipAuth: true, skipAuthRetry: true, retry: false });

        const init = fetcher.mock.calls[0][1] as Record<string, unknown>;
        expect(init).not.toHaveProperty("skipAuth");
        expect(init).not.toHaveProperty("skipAuthRetry");
        expect(init).not.toHaveProperty("retry");
    });
});
