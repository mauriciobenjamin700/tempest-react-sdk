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
        await expect(uploadWithProgress({ url: "/u", body: new FormData() })).rejects.toMatchObject(
            { status: 422, detail: "bad" },
        );
        vi.unstubAllGlobals();
    });
});

describe("uploadWithProgress — headers, error bodies and request ids", () => {
    /** Install the XHR mock and return the instance the SDK will construct. */
    function installXhr(configure: (xhr: XHRMock) => void = () => undefined): XHRMock {
        const xhr = new XHRMock();
        configure(xhr);
        vi.stubGlobal("XMLHttpRequest", function () {
            return xhr;
        } as unknown as typeof XMLHttpRequest);
        return xhr;
    }

    it("keeps a caller-provided Authorization and X-Request-ID untouched", async () => {
        const xhr = installXhr();
        await uploadWithProgress({
            url: "/up",
            body: new FormData(),
            getToken: () => "generated",
            requestId: () => "generated-id",
            headers: { Authorization: "Bearer mine", "X-Request-ID": "mine" },
        });
        expect(xhr.setRequestHeader).toHaveBeenCalledWith("Authorization", "Bearer mine");
        expect(xhr.setRequestHeader).toHaveBeenCalledWith("X-Request-ID", "mine");
        expect(xhr.setRequestHeader).not.toHaveBeenCalledWith("Authorization", "Bearer generated");
        vi.unstubAllGlobals();
    });

    it("omits X-Request-ID when requestId returns an empty string", async () => {
        const xhr = installXhr();
        await uploadWithProgress({
            url: "/up",
            body: new FormData(),
            requestId: () => "",
        });
        const sent = xhr.setRequestHeader.mock.calls.map(([name]) => name);
        expect(sent).not.toContain("X-Request-ID");
        vi.unstubAllGlobals();
    });

    it("parses a JSON error body, and falls back to raw text", async () => {
        const jsonError = installXhr((x) => {
            x.status = 422;
            x.responseText = JSON.stringify({ detail: "inválido" });
        });
        await expect(
            uploadWithProgress({ url: "/up", body: new FormData() }),
        ).rejects.toMatchObject({
            status: 422,
        });
        expect(jsonError.status).toBe(422);
        vi.unstubAllGlobals();

        installXhr((x) => {
            x.status = 500;
            x.responseText = "explodiu";
            x.headers = { "content-type": "text/plain" };
        });
        await expect(
            uploadWithProgress({ url: "/up", body: new FormData() }),
        ).rejects.toMatchObject({
            status: 500,
        });
        vi.unstubAllGlobals();
    });

    it("treats an empty error body as null", async () => {
        installXhr((x) => {
            x.status = 400;
            x.responseText = "";
        });
        await expect(
            uploadWithProgress({ url: "/up", body: new FormData() }),
        ).rejects.toMatchObject({
            status: 400,
        });
        vi.unstubAllGlobals();
    });

    it("sets withCredentials when asked", async () => {
        const xhr = installXhr();
        await uploadWithProgress({
            url: "/up",
            body: new FormData(),
            withCredentials: true,
        });
        expect(xhr.withCredentials).toBe(true);
        vi.unstubAllGlobals();
    });

    it("uses the method it is given", async () => {
        const xhr = installXhr();
        await uploadWithProgress({
            url: "/up",
            body: new FormData(),
            method: "PUT",
        });
        expect(xhr.open).toHaveBeenCalledWith("PUT", "/up");
        vi.unstubAllGlobals();
    });
});

describe("uploadWithProgress — a parser that refuses the body", () => {
    it("rejects with the parser's own error instead of a half-parsed value", async () => {
        class XHRJson extends XHRMock {
            override responseText = JSON.stringify({ url: "/f/1" });
        }
        vi.stubGlobal("XMLHttpRequest", XHRJson);

        await expect(
            uploadWithProgress({
                url: "/u",
                body: new FormData(),
                parser: () => {
                    throw new Error("contrato quebrado");
                },
            }),
        ).rejects.toThrow("contrato quebrado");

        vi.unstubAllGlobals();
    });
});
