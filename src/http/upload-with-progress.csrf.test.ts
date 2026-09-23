import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrfReports } from "./csrf";
import { uploadWithProgress } from "./upload-with-progress";

/** An `XMLHttpRequest` double that records the headers it was given. */
class XHRMock {
    upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 204;
    responseText = "";
    withCredentials = false;
    sent: Record<string, string> = {};
    open = vi.fn();
    abort = vi.fn();
    setRequestHeader(name: string, value: string): void {
        this.sent[name] = value;
    }
    send(): void {
        setTimeout(() => this.onload?.(), 0);
    }
    getResponseHeader(): string | null {
        return null;
    }
}

function installXhr(): XHRMock {
    const xhr = new XHRMock();
    vi.stubGlobal("XMLHttpRequest", function () {
        return xhr;
    } as unknown as typeof XMLHttpRequest);
    return xhr;
}

beforeEach(() => {
    document.cookie = "csrf_token=tok-1; path=/";
});

afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "csrf_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    resetCsrfReports();
});

describe("uploadWithProgress — csrf sends the token with the upload", () => {
    it("sends nothing new without csrf", async () => {
        const xhr = installXhr();
        await uploadWithProgress({ url: "/uploads", body: new FormData() });
        expect(xhr.sent["X-CSRF-Token"]).toBeUndefined();
    });

    it.each(["POST", "PUT", "PATCH"] as const)(
        "sends it on %s to the page's own origin",
        async (method) => {
            const xhr = installXhr();
            await uploadWithProgress({ url: "/uploads", method, body: new FormData(), csrf: true });
            expect(xhr.sent["X-CSRF-Token"]).toBe("tok-1");
        },
    );

    it("leaves a CSRF header you set alone", async () => {
        const xhr = installXhr();
        await uploadWithProgress({
            url: "/uploads",
            body: new FormData(),
            headers: { "x-csrf-token": "mine" },
            csrf: true,
        });
        expect(xhr.sent["X-CSRF-Token"]).toBeUndefined();
        expect(xhr.sent["x-csrf-token"]).toBe("mine");
    });
});

/**
 * The bearer token's scope is opt-in here for compatibility with every version
 * before 0.66.0. The CSRF option is new, so it starts closed: with no
 * `credentialOrigin`, the scope is the page's own origin.
 */
describe("uploadWithProgress — the token is scoped even without credentialOrigin", () => {
    it("withholds it from another origin when no origin is declared", async () => {
        const xhr = installXhr();
        await uploadWithProgress({
            url: "https://storage.other/u",
            body: new FormData(),
            csrf: true,
        });
        expect(xhr.sent["X-CSRF-Token"]).toBeUndefined();
    });

    it("sends it to the declared credentialOrigin", async () => {
        const xhr = installXhr();
        await uploadWithProgress({
            url: "https://api.acme.com/uploads",
            body: new FormData(),
            credentialOrigin: "https://api.acme.com",
            csrf: true,
        });
        expect(xhr.sent["X-CSRF-Token"]).toBe("tok-1");
    });

    it("sends it to a trusted origin next to the declared one", async () => {
        const xhr = installXhr();
        await uploadWithProgress({
            url: "https://storage.acme.com/u",
            body: new FormData(),
            credentialOrigin: "https://api.acme.com",
            trustedOrigins: ["https://storage.acme.com"],
            csrf: { getToken: () => "tok-mem" },
        });
        expect(xhr.sent["X-CSRF-Token"]).toBe("tok-mem");
    });

    it("sends it wherever url points outside a browsing context, where there is no page origin", async () => {
        const xhr = installXhr();
        vi.stubGlobal("location", undefined);
        await uploadWithProgress({
            url: "https://api.acme.com/uploads",
            body: new FormData(),
            csrf: { getToken: () => "tok-mem" },
        });
        expect(xhr.sent["X-CSRF-Token"]).toBe("tok-mem");
    });
});
