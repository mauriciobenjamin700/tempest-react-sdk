import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrfReports } from "../http/csrf";
import { createTempestAuth } from "./create-tempest-auth";

const API = "https://api.acme.com";

/** The headers the fetcher was called with on a given attempt. */
function headersOf(fetcher: ReturnType<typeof vi.fn>, call = 0): Record<string, string> {
    return (fetcher.mock.calls[call][1] as RequestInit).headers as Record<string, string>;
}

function tokens(): Response {
    return new Response(JSON.stringify({ access_token: "a" }), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}

beforeEach(() => {
    document.cookie = "csrf_token=tok-1; path=/";
});

afterEach(() => {
    document.cookie = "csrf_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    resetCsrfReports();
    localStorage.clear();
});

/**
 * With `withCredentials: true` the refresh token lives in a cookie the browser
 * attaches to a `POST /auth/refresh` another site triggers. Login and refresh go
 * out with `skipAuth`, so a CSRF header tied to auth would miss exactly them.
 */
describe("createTempestAuth — csrf reaches the writes that skip auth", () => {
    it("sends the token on login", async () => {
        const fetcher = vi.fn().mockImplementation(async () => tokens());
        const auth = createTempestAuth({
            baseURL: API,
            withCredentials: true,
            csrf: true,
            storeName: "csrf-login",
            fetcher,
        });

        await auth.login({ email: "a@b.c", password: "x" });

        expect(headersOf(fetcher)["X-CSRF-Token"]).toBe("tok-1");
    });

    it("sends the token on refresh", async () => {
        const fetcher = vi.fn().mockImplementation(async () => tokens());
        const auth = createTempestAuth({
            baseURL: API,
            withCredentials: true,
            csrf: true,
            storeName: "csrf-refresh",
            fetcher,
        });

        await auth.refresh();

        expect(String(fetcher.mock.calls[0][0])).toContain("/api/auth/refresh");
        expect(headersOf(fetcher)["X-CSRF-Token"]).toBe("tok-1");
    });

    it("sends nothing new without csrf", async () => {
        const fetcher = vi.fn().mockImplementation(async () => tokens());
        const auth = createTempestAuth({
            baseURL: API,
            withCredentials: true,
            storeName: "csrf-off",
            fetcher,
        });

        await auth.refresh();

        expect(headersOf(fetcher)["X-CSRF-Token"]).toBeUndefined();
    });
});
