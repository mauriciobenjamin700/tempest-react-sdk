import { afterEach, describe, expect, it, vi } from "vitest";
import { TempestApiError } from "./errors";
import { uploadPresignedPost, type PresignedPost } from "./presigned-post";

/**
 * Error bodies captured from MinIO `RELEASE.2025-04-22T22-12-26Z`, posted from
 * Chrome on another origin with a policy of 10–100 bytes, `Content-Type`
 * `image/jpeg` and a fixed key. Statuses: 400, 400, 403, 403.
 */
const MINIO = {
    tooLarge:
        '<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>EntityTooLarge</Code><Message>Your proposed upload exceeds the maximum allowed object size.</Message><BucketName>uploads</BucketName><Resource>/uploads</Resource><RequestId>18E21BA4A831714A</RequestId><HostId>dd90</HostId></Error>',
    tooSmall:
        '<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>EntityTooSmall</Code><Message>Your proposed upload is smaller than the minimum allowed object size.</Message><BucketName>uploads</BucketName><Resource>/uploads</Resource><RequestId>18E21BA4A8C7B6C2</RequestId><HostId>dd90</HostId></Error>',
    wrongType:
        '<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>AccessDenied</Code><Message>Access Denied. (Invalid according to Policy: Policy Condition failed)</Message><BucketName>uploads</BucketName><Resource>/uploads</Resource><RequestId>18E21BA4A91AFCFC</RequestId><HostId>dd90</HostId></Error>',
    expired:
        '<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>AccessDenied</Code><Message>Access Denied. (Invalid according to Policy: Policy expired)</Message><BucketName>uploads</BucketName><Resource>/uploads</Resource><RequestId>18E21BA4A93A0AB8</RequestId><HostId>dd90</HostId></Error>',
};

const POST: PresignedPost = {
    url: "https://storage.example.com/uploads",
    fields: {
        key: "avatars/1.jpg",
        "Content-Type": "image/jpeg",
        "x-amz-algorithm": "AWS4-HMAC-SHA256",
        policy: "eyJ...",
        "x-amz-signature": "abc",
    },
    max_bytes: 100,
};

class XHRMock {
    static last: XHRMock | null = null;
    upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 204;
    responseText = "";
    headers: Record<string, string> = {};
    withCredentials = false;
    method = "";
    url = "";
    sent: FormData | null = null;
    requestHeaders: Record<string, string> = {};
    constructor() {
        XHRMock.last = this;
    }
    open(method: string, url: string): void {
        this.method = method;
        this.url = url;
    }
    setRequestHeader(name: string, value: string): void {
        this.requestHeaders[name] = value;
    }
    send(body: FormData): void {
        this.sent = body;
        setTimeout(() => this.onload?.(), 0);
    }
    abort(): void {
        this.onabort?.();
    }
    getResponseHeader(name: string): string | null {
        return this.headers[name.toLowerCase()] ?? null;
    }
}

function respond(status: number, body: string, contentType: string): void {
    vi.stubGlobal(
        "XMLHttpRequest",
        class extends XHRMock {
            override status = status;
            override responseText = body;
            override headers = { "content-type": contentType };
        },
    );
}

function bytes(size: number): Blob {
    return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
}

afterEach(() => {
    vi.unstubAllGlobals();
    XHRMock.last = null;
    document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

describe("uploadPresignedPost — the form", () => {
    it("posts every field in order and the file last, in the file part", async () => {
        vi.stubGlobal("XMLHttpRequest", XHRMock);
        await uploadPresignedPost(POST, bytes(50), { fileName: "a.jpg" });

        const xhr = XHRMock.last!;
        expect(xhr.method).toBe("POST");
        expect(xhr.url).toBe(POST.url);
        const entries = [...xhr.sent!.entries()];
        expect(entries.map(([name]) => name)).toEqual([...Object.keys(POST.fields), "file"]);
        expect(entries.slice(0, -1).map(([, value]) => value)).toEqual(Object.values(POST.fields));
        expect((entries.at(-1)![1] as File).name).toBe("a.jpg");
    });

    it("sends no credential and no custom header, even with a CSRF cookie set", async () => {
        document.cookie = "csrf_token=leak-me";
        vi.stubGlobal("XMLHttpRequest", XHRMock);
        await uploadPresignedPost(POST, bytes(50));

        const xhr = XHRMock.last!;
        expect(xhr.requestHeaders).toEqual({});
        expect(xhr.withCredentials).toBe(false);
    });

    it("treats a 204 with an empty body as success", async () => {
        vi.stubGlobal("XMLHttpRequest", XHRMock);
        await expect(uploadPresignedPost(POST, bytes(50))).resolves.toBeUndefined();
    });

    it("reports progress and honours the abort signal", async () => {
        vi.stubGlobal(
            "XMLHttpRequest",
            class extends XHRMock {
                override send(body: FormData): void {
                    this.sent = body;
                    this.upload.onprogress?.({
                        loaded: 25,
                        total: 50,
                        lengthComputable: true,
                    } as ProgressEvent);
                }
            },
        );
        const onProgress = vi.fn();
        const controller = new AbortController();
        const pending = uploadPresignedPost(POST, bytes(50), {
            onProgress,
            signal: controller.signal,
        });
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ fraction: 0.5 }));
    });
});

describe("uploadPresignedPost — the ceiling", () => {
    it("refuses a file above max_bytes before sending anything", async () => {
        vi.stubGlobal("XMLHttpRequest", XHRMock);
        const error = await uploadPresignedPost(POST, bytes(101)).catch((e: unknown) => e);

        expect(XHRMock.last).toBeNull();
        expect(error).toBeInstanceOf(TempestApiError);
        expect(error).toMatchObject({ status: 413, code: "FILE_TOO_LARGE" });
    });

    it("accepts a file exactly at max_bytes", async () => {
        vi.stubGlobal("XMLHttpRequest", XHRMock);
        await expect(uploadPresignedPost(POST, bytes(100))).resolves.toBeUndefined();
        expect(XHRMock.last).not.toBeNull();
    });
});

describe("uploadPresignedPost — one error shape for both backends", () => {
    it.each([
        ["EntityTooLarge", 400, MINIO.tooLarge, 413, "FILE_TOO_LARGE", "18E21BA4A831714A"],
        ["EntityTooSmall", 400, MINIO.tooSmall, 400, "FILE_TOO_SMALL", "18E21BA4A8C7B6C2"],
        ["a broken condition", 403, MINIO.wrongType, 403, "SIGNED_URL_INVALID", "18E21BA4A91AFCFC"],
        ["an expired policy", 403, MINIO.expired, 403, "SIGNED_URL_EXPIRED", "18E21BA4A93A0AB8"],
    ])("maps S3 %s to the local backend's code", async (_, status, xml, wantStatus, code, id) => {
        respond(status, xml, "application/xml");
        const error = await uploadPresignedPost(POST, bytes(50)).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(TempestApiError);
        expect(error).toMatchObject({ status: wantStatus, code, requestId: id, body: xml });
    });

    it.each([
        [413, "FILE_TOO_LARGE"],
        [400, "FILE_TOO_SMALL"],
        [403, "SIGNED_URL_INVALID"],
        [403, "SIGNED_URL_EXPIRED"],
    ])("passes the local backend's %i %s envelope through", async (status, code) => {
        respond(status, JSON.stringify({ detail: "local", code }), "application/json");
        const error = await uploadPresignedPost(POST, bytes(50)).catch((e: unknown) => e);
        expect(error).toMatchObject({ status, code, detail: "local" });
    });

    it("keeps an unknown S3 code with its message", async () => {
        respond(
            404,
            "<Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist</Message></Error>",
            "application/xml",
        );
        const error = await uploadPresignedPost(POST, bytes(50)).catch((e: unknown) => e);
        expect(error).toMatchObject({
            status: 404,
            code: "NoSuchBucket",
            detail: "The specified bucket does not exist",
        });
    });

    it("leaves a non-XML text error untouched", async () => {
        respond(502, "Bad Gateway", "text/plain");
        const error = await uploadPresignedPost(POST, bytes(50)).catch((e: unknown) => e);
        expect(error).toMatchObject({ status: 502, code: undefined });
    });

    it("leaves a network failure as status 0", async () => {
        vi.stubGlobal(
            "XMLHttpRequest",
            class extends XHRMock {
                override send(): void {
                    setTimeout(() => this.onerror?.(), 0);
                }
            },
        );
        await expect(uploadPresignedPost(POST, bytes(50))).rejects.toMatchObject({ status: 0 });
    });
});
