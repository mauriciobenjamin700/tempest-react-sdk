import { afterEach, describe, expect, it, vi } from "vitest";
import {
    isTrustedCredentialTarget,
    reportSuppressedCredential,
    resetSuppressedCredentialReports,
} from "./credential-scope";

describe("isTrustedCredentialTarget", () => {
    it("allows a target on the reference origin", () => {
        expect(isTrustedCredentialTarget("https://api.acme.com/me", "https://api.acme.com")).toBe(
            true,
        );
    });

    it("ignores path, query and trailing slash when comparing", () => {
        expect(
            isTrustedCredentialTarget(
                "https://api.acme.com/v2/me?page=2",
                "https://api.acme.com/api/",
            ),
        ).toBe(true);
    });

    it("refuses a target on another origin", () => {
        expect(isTrustedCredentialTarget("https://cdn.other/u/1", "https://api.acme.com")).toBe(
            false,
        );
    });

    it("treats a different port as a different origin", () => {
        expect(
            isTrustedCredentialTarget("https://api.acme.com:8443/me", "https://api.acme.com"),
        ).toBe(false);
    });

    it("treats http and https as different origins", () => {
        expect(isTrustedCredentialTarget("http://api.acme.com/me", "https://api.acme.com")).toBe(
            false,
        );
    });

    it("allows an origin the app listed as trusted", () => {
        expect(
            isTrustedCredentialTarget("https://cdn.acme.com/u/1", "https://api.acme.com", [
                "https://cdn.acme.com",
            ]),
        ).toBe(true);
    });

    it("compares a trusted entry as an origin, not as a string", () => {
        expect(
            isTrustedCredentialTarget("https://cdn.acme.com/u/1", "https://api.acme.com", [
                "https://cdn.acme.com/uploads/",
            ]),
        ).toBe(true);
    });

    it("does not let a trusted entry widen to a sibling host", () => {
        expect(
            isTrustedCredentialTarget("https://evil.acme.com/u/1", "https://api.acme.com", [
                "https://cdn.acme.com",
            ]),
        ).toBe(false);
    });

    it("resolves a relative reference against the document, so a proxied baseURL still matches", () => {
        const target = `${globalThis.location.origin}/api/uploads/abc`;
        expect(isTrustedCredentialTarget(target, "/api/uploads")).toBe(true);
    });

    it("refuses an absolute foreign target even when the reference is relative", () => {
        expect(isTrustedCredentialTarget("https://evil.test/u/1", "/api/uploads")).toBe(false);
    });
});

describe("reportSuppressedCredential", () => {
    afterEach(() => {
        resetSuppressedCredentialReports();
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("names the target origin and the scope once per origin", () => {
        vi.stubEnv("NODE_ENV", "development");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        reportSuppressedCredential("https://evil.test/u/1", "https://api.acme.com");
        reportSuppressedCredential("https://evil.test/u/2", "https://api.acme.com");

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("https://evil.test");
        expect(warn.mock.calls[0][0]).toContain("https://api.acme.com");
    });

    it("reports a second origin separately", () => {
        vi.stubEnv("NODE_ENV", "development");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        reportSuppressedCredential("https://a.test/u", "https://api.acme.com");
        reportSuppressedCredential("https://b.test/u", "https://api.acme.com");

        expect(warn).toHaveBeenCalledTimes(2);
    });

    it("says nothing in a production build", () => {
        vi.stubEnv("NODE_ENV", "production");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        reportSuppressedCredential("https://evil.test/u/1", "https://api.acme.com");

        expect(warn).not.toHaveBeenCalled();
    });
});
