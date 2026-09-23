import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSuppressedCredentialReports } from "./credential-scope";
import {
    DEFAULT_CSRF_COOKIE_NAME,
    DEFAULT_CSRF_HEADER_NAME,
    csrfHeaders,
    resetCsrfReports,
} from "./csrf";
import type { CsrfHeadersInput } from "./csrf";

const API = "https://api.acme.com";

/** Set a cookie on the jsdom document. */
function setCookie(name: string, value: string): void {
    document.cookie = `${name}=${value}; path=/`;
}

/** Expire a cookie on the jsdom document. */
function clearCookie(name: string): void {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function headersFor(overrides: Partial<CsrfHeadersInput> = {}): Record<string, string> {
    return csrfHeaders({
        method: "POST",
        url: `${API}/orders`,
        reference: API,
        csrf: true,
        ...overrides,
    });
}

beforeEach(() => {
    setCookie(DEFAULT_CSRF_COOKIE_NAME, "tok-1");
});

afterEach(() => {
    vi.unstubAllGlobals();
    clearCookie(DEFAULT_CSRF_COOKIE_NAME);
    clearCookie("XSRF-TOKEN");
    resetCsrfReports();
    resetSuppressedCredentialReports();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("csrfHeaders — the defaults match tempest-fastapi-sdk's CSRFMiddleware", () => {
    it("pins the cookie and header names the backend ships", () => {
        expect(DEFAULT_CSRF_COOKIE_NAME).toBe("csrf_token");
        expect(DEFAULT_CSRF_HEADER_NAME).toBe("X-CSRF-Token");
    });

    it("echoes the csrf_token cookie as X-CSRF-Token with csrf: true", () => {
        expect(headersFor()).toEqual({ "X-CSRF-Token": "tok-1" });
    });
});

describe("csrfHeaders — nothing changes without csrf", () => {
    it.each([undefined, false])("returns no header for csrf: %s", (csrf) => {
        expect(headersFor({ csrf })).toEqual({});
    });
});

describe("csrfHeaders — every method that can change state carries the token", () => {
    it.each(["POST", "PUT", "PATCH", "DELETE", "post", "PROPFIND"])("sends it on %s", (method) => {
        expect(headersFor({ method })).toEqual({ "X-CSRF-Token": "tok-1" });
    });
});

describe("csrfHeaders — safe methods never carry the token", () => {
    it.each(["GET", "HEAD", "OPTIONS", "TRACE", "get"])("omits it on %s", (method) => {
        expect(headersFor({ method })).toEqual({});
    });
});

describe("csrfHeaders — the token never crosses an origin", () => {
    it("withholds it from a URL on another origin", () => {
        expect(headersFor({ url: "https://evil.test/collect" })).toEqual({});
    });

    it("sends it to an origin the app declared trusted", () => {
        expect(
            headersFor({
                url: "https://files.acme.com/u",
                trustedOrigins: ["https://files.acme.com"],
            }),
        ).toEqual({ "X-CSRF-Token": "tok-1" });
    });

    it("reports the withheld header once per origin in a development build", () => {
        vi.stubEnv("NODE_ENV", "development");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        headersFor({ url: "https://evil.test/a" });
        headersFor({ url: "https://evil.test/b" });

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("X-CSRF-Token was not sent to https://evil.test");
    });

    it("does not read the token for a target it will not send it to", () => {
        const getToken = vi.fn(() => "tok-mem");
        headersFor({ url: "https://evil.test/a", csrf: { getToken } });
        expect(getToken).not.toHaveBeenCalled();
    });
});

describe("csrfHeaders — a header you set yourself is never replaced", () => {
    it("leaves an exact-case header alone", () => {
        expect(headersFor({ headers: { "X-CSRF-Token": "mine" } })).toEqual({});
    });

    it("compares header names case-insensitively, so fetch never joins two values", () => {
        expect(headersFor({ headers: { "x-csrf-token": "mine" } })).toEqual({});
    });

    it("accepts a Headers instance too", () => {
        expect(headersFor({ headers: new Headers({ "X-CSRF-Token": "mine" }) })).toEqual({});
    });
});

describe("csrfHeaders — a missing token sends the write without it and says so in dev", () => {
    it("returns no header when the cookie is absent", () => {
        clearCookie(DEFAULT_CSRF_COOKIE_NAME);
        expect(headersFor()).toEqual({});
    });

    it("warns once per source in a development build, naming the cookie", () => {
        vi.stubEnv("NODE_ENV", "development");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        clearCookie(DEFAULT_CSRF_COOKIE_NAME);

        headersFor();
        headersFor();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('"csrf_token" cookie');
        expect(warn.mock.calls[0][0]).toContain("HttpOnly");
    });

    it("names getToken when that is the source that came back empty", () => {
        vi.stubEnv("NODE_ENV", "development");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        headersFor({ csrf: { getToken: () => null } });

        expect(warn.mock.calls[0][0]).toContain("csrf.getToken() returned nothing");
    });

    it("says nothing in a production build", () => {
        vi.stubEnv("NODE_ENV", "production");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        clearCookie(DEFAULT_CSRF_COOKIE_NAME);

        headersFor();

        expect(warn).not.toHaveBeenCalled();
    });

    it("returns no header outside a document, where there is no cookie jar", () => {
        vi.stubGlobal("document", undefined);
        expect(headersFor()).toEqual({});
    });
});

describe("csrfHeaders — the names and the source are configurable", () => {
    it("reads another cookie into another header", () => {
        setCookie("XSRF-TOKEN", "angular-style");
        expect(
            headersFor({ csrf: { cookieName: "XSRF-TOKEN", headerName: "X-XSRF-TOKEN" } }),
        ).toEqual({ "X-XSRF-TOKEN": "angular-style" });
    });

    it("takes the token from getToken instead of the cookie", () => {
        expect(headersFor({ csrf: { getToken: () => "tok-mem" } })).toEqual({
            "X-CSRF-Token": "tok-mem",
        });
    });
});

describe("csrfHeaders — the cookie is read per request, so rotation needs no capture step", () => {
    it("sends the rotated value on the next write", () => {
        expect(headersFor()["X-CSRF-Token"]).toBe("tok-1");
        setCookie(DEFAULT_CSRF_COOKIE_NAME, "tok-2");
        expect(headersFor()["X-CSRF-Token"]).toBe("tok-2");
    });

    it("finds the cookie among others and URI-decodes it", () => {
        setCookie("other", "x");
        setCookie(DEFAULT_CSRF_COOKIE_NAME, "a%2Bb");
        expect(headersFor()["X-CSRF-Token"]).toBe("a+b");
    });

    it("returns the raw value when it is not valid percent-encoding", () => {
        setCookie(DEFAULT_CSRF_COOKIE_NAME, "a%E0b");
        expect(headersFor()["X-CSRF-Token"]).toBe("a%E0b");
    });
});
