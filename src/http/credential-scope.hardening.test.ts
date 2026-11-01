import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { isTrustedCredentialTarget, resetSuppressedCredentialReports } from "./credential-scope";
import { uploadPresignedPost, type PresignedPost } from "./presigned-post";
import { uploadWithProgress } from "./upload-with-progress";

/**
 * #530 — the credential scope closes by default. Every case here failed
 * against b054c16 (0.81.0), measured with
 * `npx vitest run src/http/credential-scope.hardening.test.ts`.
 */

function ok(): Response {
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}

function headersOf(fetcher: ReturnType<typeof vi.fn>, call = 0): Record<string, string> {
    return (fetcher.mock.calls[call][1] as RequestInit).headers as Record<string, string>;
}

/** An `XMLHttpRequest` double that records the URL and the headers it was given. */
class RecordingXhr {
    static last: RecordingXhr | null = null;
    url = "";
    sent: Record<string, string> = {};
    status = 204;
    responseText = "";
    withCredentials = false;
    upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;

    constructor() {
        RecordingXhr.last = this;
    }

    open(_method: string, url: string): void {
        this.url = url;
    }

    setRequestHeader(name: string, value: string): void {
        this.sent[name] = value;
    }

    getResponseHeader(): string | null {
        return null;
    }

    abort(): void {
        this.onabort?.();
    }

    send(): void {
        queueMicrotask(() => this.onload?.());
    }
}

afterEach(() => {
    resetSuppressedCredentialReports();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    document.querySelectorAll("base").forEach((node) => node.remove());
});

describe("isTrustedCredentialTarget — a target that does not parse is refused", () => {
    it("refuses a malformed absolute target instead of failing open", () => {
        expect(isTrustedCredentialTarget("http://[bad", "https://api.acme.com")).toBe(false);
    });

    it("refuses a malformed target outside a browsing context too", () => {
        vi.stubGlobal("document", undefined);
        vi.stubGlobal("location", undefined);
        expect(isTrustedCredentialTarget("http://[bad", "https://api.acme.com")).toBe(false);
    });

    it("refuses an opaque origin, which compares equal to every other opaque one as a string", () => {
        expect(isTrustedCredentialTarget("data:text/plain,x", "file:///app/index.html")).toBe(
            false,
        );
    });

    it("still allows a relative target outside a browsing context, where there is no origin to cross", () => {
        vi.stubGlobal("document", undefined);
        vi.stubGlobal("location", undefined);
        expect(isTrustedCredentialTarget("/api/me", "https://api.acme.com")).toBe(true);
    });
});

describe("isTrustedCredentialTarget — a relative target resolves where the request goes", () => {
    it("compares a relative target against the document base URL, the one XHR uses", () => {
        const base = document.createElement("base");
        base.href = "https://evil.test/";
        document.head.append(base);

        expect(isTrustedCredentialTarget("upload", "/api")).toBe(false);
    });

    it("keeps a relative reference on the page's own origin even under a foreign base", () => {
        const base = document.createElement("base");
        base.href = "https://evil.test/";
        document.head.append(base);

        expect(isTrustedCredentialTarget(`${location.origin}/api/me`, "/api")).toBe(true);
    });
});

describe("uploadWithProgress — the bearer is scoped to the page origin by default", () => {
    it("withholds the token from another origin when credentialOrigin is unset", async () => {
        vi.stubGlobal("XMLHttpRequest", RecordingXhr);
        await uploadWithProgress({
            url: "https://storage.other/u",
            body: new FormData(),
            getToken: () => "tok",
        });
        expect(RecordingXhr.last?.sent.Authorization).toBeUndefined();
    });

    it("still sends it to a relative url on the page's own origin", async () => {
        vi.stubGlobal("XMLHttpRequest", RecordingXhr);
        await uploadWithProgress({
            url: "/api/upload",
            body: new FormData(),
            getToken: () => "tok",
        });
        expect(RecordingXhr.last?.sent.Authorization).toBe("Bearer tok");
    });

    it("withholds it from a relative url that a foreign <base> sends elsewhere", async () => {
        const base = document.createElement("base");
        base.href = "https://evil.test/";
        document.head.append(base);
        vi.stubGlobal("XMLHttpRequest", RecordingXhr);

        await uploadWithProgress({
            url: "upload",
            body: new FormData(),
            getToken: () => "tok",
            credentialOrigin: "/",
        });

        expect(RecordingXhr.last?.sent.Authorization).toBeUndefined();
    });
});

describe("createApiClient — static headers follow the credential scope", () => {
    it("withholds config.headers from an absolute path on another origin", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            headers: { "X-Api-Key": "secret" },
            fetcher,
        });

        await api.get("https://evil.test/collect");

        expect(headersOf(fetcher)["X-Api-Key"]).toBeUndefined();
    });

    it("keeps sending config.headers to the client's own origin and to trusted ones", async () => {
        const fetcher = vi.fn(async () => ok());
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            headers: { "X-Api-Key": "secret" },
            trustedOrigins: ["https://cdn.acme.com"],
            fetcher,
        });

        await api.get("/me");
        await api.get("https://cdn.acme.com/a");

        expect(headersOf(fetcher, 0)["X-Api-Key"]).toBe("secret");
        expect(headersOf(fetcher, 1)["X-Api-Key"]).toBe("secret");
    });

    it("still sends headers the caller wrote on that one request", async () => {
        const fetcher = vi.fn().mockResolvedValue(ok());
        const api = createApiClient({ baseURL: "https://api.acme.com", fetcher });

        await api.get("https://cdn.other/a", { headers: { "X-Trace": "1" } });

        expect(headersOf(fetcher)["X-Trace"]).toBe("1");
    });
});

describe("createApiClient — a 401 from outside the scope says nothing about the session", () => {
    it("does not refresh or call onUnauthorized for a foreign 401", async () => {
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

        await expect(api.get("https://evil.test/me")).rejects.toMatchObject({ status: 401 });

        expect(refresh).not.toHaveBeenCalled();
        expect(onUnauthorized).not.toHaveBeenCalled();
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("still refreshes on a 401 from its own origin", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(new Response("{}", { status: 401 }))
            .mockResolvedValueOnce(ok());
        const refresh = vi.fn().mockResolvedValue(undefined);
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            getToken: () => "tok",
            refresh,
            fetcher,
        });

        await api.get("/me");

        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("still reports a 401 to a cookie session on its own origin, which carries no bearer", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
        const onUnauthorized = vi.fn();
        const api = createApiClient({
            baseURL: "https://api.acme.com",
            withCredentials: true,
            onUnauthorized,
            fetcher,
        });

        await expect(api.get("/me")).rejects.toMatchObject({ status: 401 });

        expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });
});

describe("uploadPresignedPost — the size precheck reads max_bytes as a number", () => {
    function postWith(maxBytes: unknown): PresignedPost {
        return { url: "https://bucket.test/", fields: {}, max_bytes: maxBytes } as PresignedPost;
    }

    it("refuses an oversized file when max_bytes arrives as a numeric string", async () => {
        vi.stubGlobal("XMLHttpRequest", RecordingXhr);
        await expect(
            uploadPresignedPost(postWith("4"), new Blob([new Uint8Array(5)])),
        ).rejects.toMatchObject({ status: 413, code: "FILE_TOO_LARGE" });
    });

    it("leaves the limit to storage when the API sent no max_bytes, as a bare boto3 policy does", async () => {
        vi.stubGlobal("XMLHttpRequest", RecordingXhr);
        await expect(
            uploadPresignedPost(postWith(undefined), new Blob([new Uint8Array(5)])),
        ).resolves.toBeUndefined();
        expect(RecordingXhr.last?.url).toBe("https://bucket.test/");
    });
});
