import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadWithProgress } from "./upload-with-progress";

/**
 * An `XMLHttpRequest` double that answers `200` with a JSON body, as if it had
 * followed redirects to `responseURL`.
 */
class RedirectedXhr {
    static responseURL = "";
    static created = 0;
    upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 200;
    responseText = JSON.stringify({ url: "https://evil.example/avatar.png" });
    responseURL = RedirectedXhr.responseURL;
    withCredentials = false;
    sentHeaders: Record<string, string> = {};

    constructor() {
        RedirectedXhr.created += 1;
    }
    open(): void {}
    setRequestHeader(name: string, value: string): void {
        this.sentHeaders[name] = value;
    }
    getResponseHeader(name: string): string | null {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
    }
    abort(): void {
        this.onabort?.();
    }
    send(): void {
        setTimeout(() => this.onload?.(), 0);
    }
}

/**
 * Stub `XMLHttpRequest` with {@link RedirectedXhr} landing on `finalUrl`.
 *
 * @param finalUrl - The `responseURL` the double reports.
 */
function installXhr(finalUrl: string): void {
    RedirectedXhr.responseURL = finalUrl;
    RedirectedXhr.created = 0;
    vi.stubGlobal("XMLHttpRequest", RedirectedXhr);
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("uploadWithProgress — an answer from another origin is never the result (#570)", () => {
    it("rejects with REDIRECT_REFUSED when the XHR followed a redirect to another origin", async () => {
        installXhr("http://localhost:5471/sink/307");

        await expect(
            uploadWithProgress({
                url: "/upload",
                body: new Blob([new Uint8Array(8)]),
                headers: { "X-Api-Key": "secret" },
            }),
        ).rejects.toMatchObject({ status: 200, code: "REDIRECT_REFUSED" });
    });

    it("still resolves a redirect that stayed on the same origin, like FastAPI's trailing-slash 307", async () => {
        installXhr(`${location.origin}/upload/`);

        await expect(
            uploadWithProgress({ url: "/upload", body: new Blob([new Uint8Array(8)]) }),
        ).resolves.toEqual({ url: "https://evil.example/avatar.png" });
    });

    it("resolves when the transport reports no responseURL at all", async () => {
        installXhr("");

        await expect(
            uploadWithProgress({ url: "/upload", body: new Blob([new Uint8Array(8)]) }),
        ).resolves.toBeDefined();
    });

    it("refuses a cross-origin landing even when the request started on another origin", async () => {
        installXhr("https://cdn.other.example/final");

        await expect(
            uploadWithProgress({
                url: "https://storage.example/put",
                method: "PUT",
                body: new Blob([new Uint8Array(8)]),
            }),
        ).rejects.toMatchObject({ code: "REDIRECT_REFUSED" });
    });
});

describe('uploadWithProgress — redirect: "error" never lets the request leave (#570)', () => {
    /**
     * Stub `fetch` with one answer, recording what it was called with.
     *
     * @param answer - What the call resolves (or rejects) with.
     * @returns The recorded calls.
     */
    function installFetch(
        answer: () => Promise<Response> | Response,
    ): Array<{ url: string; init: RequestInit }> {
        const calls: Array<{ url: string; init: RequestInit }> = [];
        vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            return answer();
        });
        installXhr("");
        return calls;
    }

    it("goes out over fetch with redirect: manual, carrying the same headers", async () => {
        const calls = installFetch(
            () =>
                new Response(JSON.stringify({ ok: true }), {
                    status: 201,
                    headers: { "content-type": "application/json" },
                }),
        );

        const result = await uploadWithProgress({
            url: "/upload",
            body: new Blob([new Uint8Array(8)]),
            headers: { "X-Api-Key": "secret" },
            getToken: () => "tok",
            redirect: "error",
            requestId: () => "rid",
        });

        expect(result).toEqual({ ok: true });
        expect(RedirectedXhr.created).toBe(0);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.init.redirect).toBe("manual");
        expect(calls[0]!.init.method).toBe("POST");
        expect(calls[0]!.init.headers).toMatchObject({
            "X-Api-Key": "secret",
            Authorization: "Bearer tok",
            "X-Request-ID": "rid",
        });
        expect(calls[0]!.init.credentials).toBe("same-origin");
    });

    it("refuses the browser's opaque redirect and a server runtime's real 3xx", async () => {
        installFetch(
            () => ({ type: "opaqueredirect", status: 0, headers: new Headers() }) as Response,
        );
        await expect(
            uploadWithProgress({ url: "/upload", body: new Blob(["x"]), redirect: "error" }),
        ).rejects.toMatchObject({ status: 0, code: "REDIRECT_REFUSED" });

        installFetch(() => new Response(null, { status: 307, headers: { Location: "/x" } }));
        await expect(
            uploadWithProgress({ url: "/upload", body: new Blob(["x"]), redirect: "error" }),
        ).rejects.toMatchObject({ status: 307, code: "REDIRECT_REFUSED" });
    });

    it("reports progress once, when the whole body is confirmed", async () => {
        installFetch(() => new Response(null, { status: 204 }));
        const onProgress = vi.fn();

        const result = await uploadWithProgress({
            url: "/upload",
            body: new Blob([new Uint8Array(10)]),
            redirect: "error",
            onProgress,
        });

        expect(result).toBeUndefined();
        expect(onProgress).toHaveBeenCalledTimes(1);
        expect(onProgress).toHaveBeenCalledWith({
            loaded: 10,
            total: 10,
            fraction: 1,
            lengthComputable: true,
        });
    });

    it("reports an unknown total for a FormData body", async () => {
        installFetch(() => new Response("plain", { status: 200 }));
        const onProgress = vi.fn();

        const result = await uploadWithProgress({
            url: "/upload",
            body: new FormData(),
            redirect: "error",
            withCredentials: true,
            onProgress,
        });

        expect(result).toBe("plain");
        expect(onProgress).toHaveBeenCalledWith({
            loaded: 0,
            total: 0,
            fraction: null,
            lengthComputable: false,
        });
    });

    it("keeps the error contract: a non-2xx is a TempestApiError with the body's detail", async () => {
        installFetch(
            () =>
                new Response(JSON.stringify({ detail: "grande demais" }), {
                    status: 413,
                    headers: { "content-type": "application/json" },
                }),
        );

        await expect(
            uploadWithProgress({ url: "/upload", body: new Blob(["x"]), redirect: "error" }),
        ).rejects.toMatchObject({ status: 413, detail: "grande demais" });
    });

    it("turns a transport failure into status 0 and an abort into AbortError", async () => {
        installFetch(() => Promise.reject(new TypeError("Failed to fetch")));
        await expect(
            uploadWithProgress({ url: "/upload", body: new Blob(["x"]), redirect: "error" }),
        ).rejects.toMatchObject({ status: 0 });

        const controller = new AbortController();
        installFetch(() => {
            controller.abort();
            return Promise.reject(new DOMException("Aborted", "AbortError"));
        });
        await expect(
            uploadWithProgress({
                url: "/upload",
                body: new Blob(["x"]),
                redirect: "error",
                signal: controller.signal,
            }),
        ).rejects.toMatchObject({ name: "AbortError" });
    });

    it("rejects a JSON body the parser cannot read", async () => {
        installFetch(
            () =>
                new Response("{nope", {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
        );

        await expect(
            uploadWithProgress({ url: "/upload", body: new Blob(["x"]), redirect: "error" }),
        ).rejects.toBeInstanceOf(SyntaxError);
    });
});
