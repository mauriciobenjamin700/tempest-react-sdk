import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeByContentType, isJsonContentType, isTextualContentType } from "./decode-response";

const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe("isJsonContentType", () => {
    it.each([
        "application/json",
        "application/json; charset=utf-8",
        "application/problem+json",
        "application/vnd.tempest.v2+json",
    ])("treats %s as json", (contentType) => {
        expect(isJsonContentType(contentType)).toBe(true);
    });

    it.each(["text/plain", "image/jpeg", "application/octet-stream", ""])(
        "does not treat %s as json",
        (contentType) => {
            expect(isJsonContentType(contentType)).toBe(false);
        },
    );
});

describe("isTextualContentType", () => {
    it.each([
        "",
        "   ",
        "text/plain",
        "text/csv",
        "text/html; charset=utf-8",
        "application/xml",
        "application/javascript",
        "application/x-www-form-urlencoded",
    ])("reads %s as text", (contentType) => {
        expect(isTextualContentType(contentType)).toBe(true);
    });

    it.each(["image/jpeg", "application/pdf", "application/octet-stream", "audio/mpeg"])(
        "does not read %s as text",
        (contentType) => {
            expect(isTextualContentType(contentType)).toBe(false);
        },
    );
});

describe("decodeByContentType", () => {
    afterEach(() => vi.restoreAllMocks());

    it("reading a binary body as text destroys it, which is why the branch exists", () => {
        const roundTripped = new TextEncoder().encode(new TextDecoder().decode(JPEG_HEADER));
        expect(JPEG_HEADER.length).toBe(10);
        expect(roundTripped.length).toBe(18);
    });

    it("returns a Blob for a binary content type", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const response = new Response(JPEG_HEADER.slice().buffer, {
            status: 200,
            headers: { "content-type": "image/jpeg" },
        });

        const decoded = await decodeByContentType<Blob>(response);

        expect(typeof decoded.arrayBuffer).toBe("function");
        expect(new Uint8Array(await decoded.arrayBuffer())).toEqual(JPEG_HEADER);
    });

    it("names the content type when it warns about a binary body", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const response = new Response(JPEG_HEADER.slice().buffer, {
            status: 200,
            headers: { "content-type": "application/pdf" },
        });

        await decodeByContentType<Blob>(response);

        expect(warn).toHaveBeenCalledWith(expect.stringContaining("application/pdf"));
    });

    it("resolves a 204 to undefined even when it carries a content type", async () => {
        const response = new Response(null, {
            status: 204,
            headers: { "content-type": "application/json" },
        });

        await expect(decodeByContentType(response)).resolves.toBeUndefined();
    });
});
