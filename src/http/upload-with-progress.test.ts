import { describe, expect, it, vi } from "vitest";
import { uploadWithProgress } from "./upload-with-progress";

class XHRMock {
    upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 200;
    responseText = JSON.stringify({ ok: true });
    headers: Record<string, string> = { "content-type": "application/json" };
    aborted = false;
    open = vi.fn();
    setRequestHeader = vi.fn();
    send = vi.fn(() => {
        setTimeout(() => this.onload?.(), 0);
    });
    abort = vi.fn(() => {
        this.aborted = true;
        this.onabort?.();
    });
    getResponseHeader(name: string): string | null {
        return this.headers[name.toLowerCase()] ?? null;
    }
    withCredentials = false;
}

describe("uploadWithProgress", () => {
    it("resolves with parsed JSON on success", async () => {
        vi.stubGlobal("XMLHttpRequest", XHRMock);
        const form = new FormData();
        form.append("file", new Blob(["x"]));
        const result = await uploadWithProgress<{ ok: boolean }>({
            url: "/u",
            body: form,
        });
        expect(result.ok).toBe(true);
        vi.unstubAllGlobals();
    });

    it("rejects on non-2xx with ApiError", async () => {
        class XHRFail extends XHRMock {
            override status = 422;
            override responseText = JSON.stringify({ detail: "bad" });
            override send = vi.fn(() => {
                setTimeout(() => this.onload?.(), 0);
            });
        }
        vi.stubGlobal("XMLHttpRequest", XHRFail);
        await expect(
            uploadWithProgress({ url: "/u", body: new FormData() }),
        ).rejects.toMatchObject({ status: 422, detail: "bad" });
        vi.unstubAllGlobals();
    });
});
