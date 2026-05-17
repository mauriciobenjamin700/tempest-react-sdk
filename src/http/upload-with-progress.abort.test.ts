import { describe, expect, it, vi } from "vitest";
import { uploadWithProgress } from "./upload-with-progress";

class XHRMock {
    upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 0;
    responseText = "";
    headers: Record<string, string> = {};
    open = vi.fn();
    setRequestHeader = vi.fn();
    abort = vi.fn(() => {
        this.onabort?.();
    });
    send = vi.fn();
    getResponseHeader(name: string): string | null {
        return this.headers[name.toLowerCase()] ?? null;
    }
    withCredentials = false;
}

describe("uploadWithProgress — abort", () => {
    it("rejects with AbortError when signal aborted before send", async () => {
        vi.stubGlobal("XMLHttpRequest", XHRMock);
        const controller = new AbortController();
        controller.abort();
        await expect(
            uploadWithProgress({
                url: "/u",
                body: new FormData(),
                signal: controller.signal,
            }),
        ).rejects.toBeInstanceOf(DOMException);
        vi.unstubAllGlobals();
    });

    it("rejects with network error on xhr.onerror", async () => {
        class XHRError extends XHRMock {
            override send = vi.fn(() => {
                setTimeout(() => this.onerror?.(), 0);
            });
        }
        vi.stubGlobal("XMLHttpRequest", XHRError);
        await expect(uploadWithProgress({ url: "/u", body: new FormData() })).rejects.toMatchObject(
            { status: 0 },
        );
        vi.unstubAllGlobals();
    });
});
