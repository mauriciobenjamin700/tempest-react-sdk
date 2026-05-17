import { describe, expect, it, vi } from "vitest";
import { uploadWithProgress } from "./upload-with-progress";

class XHRMock {
    upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 200;
    responseText = "plain text";
    headers: Record<string, string> = { "content-type": "text/plain" };
    open = vi.fn();
    setRequestHeader = vi.fn();
    abort = vi.fn();
    send = vi.fn(() => {
        // synthetic progress events
        this.upload.onprogress?.({
            loaded: 50,
            total: 100,
            lengthComputable: true,
        } as ProgressEvent);
        this.upload.onprogress?.({
            loaded: 100,
            total: 0,
            lengthComputable: false,
        } as ProgressEvent);
        setTimeout(() => this.onload?.(), 0);
    });
    getResponseHeader(name: string): string | null {
        return this.headers[name.toLowerCase()] ?? null;
    }
    withCredentials = false;
}

describe("uploadWithProgress — progress + non-JSON", () => {
    it("invokes onProgress with computable + non-computable events", async () => {
        vi.stubGlobal("XMLHttpRequest", XHRMock);
        const events: { fraction: number | null; lengthComputable: boolean }[] = [];
        const result = await uploadWithProgress<string>({
            url: "/u",
            body: new FormData(),
            onProgress: (event) =>
                events.push({
                    fraction: event.fraction,
                    lengthComputable: event.lengthComputable,
                }),
        });
        expect(events[0]).toEqual({ fraction: 0.5, lengthComputable: true });
        expect(events[1]).toEqual({ fraction: null, lengthComputable: false });
        expect(result).toBe("plain text");
        vi.unstubAllGlobals();
    });

    it("uses bearer token from getToken", async () => {
        const instances: XHRMock[] = [];
        class XHRCapture extends XHRMock {
            constructor() {
                super();
                instances.push(this);
            }
        }
        vi.stubGlobal("XMLHttpRequest", XHRCapture);
        await uploadWithProgress({
            url: "/u",
            body: new FormData(),
            getToken: () => "tok",
            withCredentials: true,
        });
        const xhr = instances[0]!;
        expect(xhr.setRequestHeader).toHaveBeenCalledWith("Authorization", "Bearer tok");
        expect(xhr.withCredentials).toBe(true);
        vi.unstubAllGlobals();
    });

    it("returns empty body on 204", async () => {
        class XHR204 extends XHRMock {
            override status = 204;
            override responseText = "";
        }
        vi.stubGlobal("XMLHttpRequest", XHR204);
        const result = await uploadWithProgress<undefined>({
            url: "/u",
            body: new FormData(),
        });
        expect(result).toBeUndefined();
        vi.unstubAllGlobals();
    });

    it("rejects on signal abort during send", async () => {
        const instances: XHRMock[] = [];
        class XHRSlow extends XHRMock {
            constructor() {
                super();
                instances.push(this);
            }
            override send = vi.fn();
        }
        vi.stubGlobal("XMLHttpRequest", XHRSlow);
        const controller = new AbortController();
        const promise = uploadWithProgress({
            url: "/u",
            body: new FormData(),
            signal: controller.signal,
        });
        // wait a tick so listener is attached
        await Promise.resolve();
        controller.abort();
        // trigger onabort via the mock's abort()
        instances[0]?.onabort?.();
        await expect(promise).rejects.toBeInstanceOf(DOMException);
        vi.unstubAllGlobals();
    });
});
