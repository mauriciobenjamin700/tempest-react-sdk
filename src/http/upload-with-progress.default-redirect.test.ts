import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadWithProgress } from "./upload-with-progress";

/** An `XMLHttpRequest` double that answers `200` with a JSON body. */
class AnsweringXhr {
    static created = 0;
    upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 200;
    responseText = JSON.stringify({ via: "xhr" });
    responseURL = "";
    withCredentials = false;

    constructor() {
        AnsweringXhr.created += 1;
    }
    open(): void {}
    setRequestHeader(): void {}
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

/** What `fetch` was called with. */
interface FetchCall {
    url: string;
    init: RequestInit;
}

let calls: FetchCall[];
let answer: () => Response;

beforeEach(() => {
    AnsweringXhr.created = 0;
    calls = [];
    answer = () =>
        new Response(JSON.stringify({ via: "fetch" }), {
            status: 201,
            headers: { "content-type": "application/json" },
        });
    vi.stubGlobal("XMLHttpRequest", AnsweringXhr);
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return answer();
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const body = new Blob([new Uint8Array(8)]);

/**
 * #570, option adopted by the owner: the XHR path follows every redirect, and
 * Chromium 153, Firefox 155 and WebKit 26.6 all carried the fixed `headers`
 * to the other origin (measured on the built `dist/`). Progress is the only
 * thing that path buys, so a call that asked for none now goes out over
 * `fetch` with `redirect: "manual"`. On c16aae0 the first four tests fail:
 * the call went over XHR.
 */
describe("uploadWithProgress — fixed headers without onProgress never follow a redirect (#570)", () => {
    it("sends fixed headers without onProgress over fetch with redirect: manual", async () => {
        await expect(
            uploadWithProgress({ url: "/upload", body, headers: { "X-Api-Key": "secret" } }),
        ).resolves.toEqual({ via: "fetch" });

        expect(AnsweringXhr.created).toBe(0);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.init.redirect).toBe("manual");
        expect(calls[0]!.init.headers).toMatchObject({ "X-Api-Key": "secret" });
    });

    it("refuses a cross-origin redirect before the headers leave", async () => {
        answer = () => ({ type: "opaqueredirect", status: 0, headers: new Headers() }) as Response;

        await expect(
            uploadWithProgress({ url: "/upload", body, headers: { "X-Api-Key": "secret" } }),
        ).rejects.toMatchObject({ code: "REDIRECT_REFUSED" });
        expect(calls).toHaveLength(1);
        expect(AnsweringXhr.created).toBe(0);
    });

    /**
     * The breaking half, pinned on purpose: a browser hands a stopped redirect
     * back opaque, with no `Location`, so FastAPI's trailing-slash `307` on the
     * same origin cannot be told apart from one to another host. The caller
     * fixes the URL, or passes `redirect: "follow"`.
     */
    it("refuses a same-origin trailing-slash 307 in that combination too", async () => {
        answer = () => new Response(null, { status: 307, headers: { Location: "/upload/" } });

        await expect(
            uploadWithProgress({ url: "/upload", body, headers: { "X-Api-Key": "secret" } }),
        ).rejects.toMatchObject({ status: 307, code: "REDIRECT_REFUSED" });
    });

    it("matches header names case-insensitively", async () => {
        await uploadWithProgress({ url: "/upload", body, headers: { "x-tenant": "acme" } });

        expect(calls).toHaveLength(1);
        expect(AnsweringXhr.created).toBe(0);
    });

    it("keeps XHR and its progress when onProgress is given", async () => {
        const onProgress = vi.fn();

        await expect(
            uploadWithProgress({
                url: "/upload",
                body,
                headers: { "X-Api-Key": "secret" },
                onProgress,
            }),
        ).resolves.toEqual({ via: "xhr" });
        expect(calls).toHaveLength(0);
    });

    it('lets an explicit redirect: "follow" win over the default', async () => {
        await expect(
            uploadWithProgress({
                url: "/upload",
                body,
                headers: { "X-Api-Key": "secret" },
                redirect: "follow",
            }),
        ).resolves.toEqual({ via: "xhr" });
        expect(calls).toHaveLength(0);
    });

    it("keeps XHR for the headers that do not leak a credential", async () => {
        await expect(
            uploadWithProgress({
                url: "/upload",
                body,
                headers: {
                    Authorization: "Bearer mine",
                    "X-Request-ID": "rid",
                    "Content-Type": "application/octet-stream",
                    "X-CSRF-Token": "csrf",
                },
            }),
        ).resolves.toEqual({ via: "xhr" });
        expect(calls).toHaveLength(0);
    });

    it("keeps XHR with no fixed headers, even with a token and the csrf option", async () => {
        document.cookie = "csrf_token=abc; path=/";

        await expect(
            uploadWithProgress({ url: "/upload", body, getToken: () => "tok", csrf: true }),
        ).resolves.toEqual({ via: "xhr" });
        expect(calls).toHaveLength(0);

        document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    });
});
