import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";

const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function binaryResponse(bytes: Uint8Array, contentType = "image/jpeg"): Response {
    return new Response(bytes.slice().buffer, {
        status: 200,
        headers: { "content-type": contentType },
    });
}

async function bytesOf(value: Blob | ArrayBuffer): Promise<Uint8Array> {
    const buffer = value instanceof Blob ? await value.arrayBuffer() : value;
    return new Uint8Array(buffer);
}

describe("createApiClient binary bodies", () => {
    afterEach(() => vi.restoreAllMocks());

    it("returns the exact bytes through blob()", async () => {
        const fetcher = vi.fn().mockResolvedValue(binaryResponse(JPEG_HEADER));
        const api = createApiClient({ baseURL: "https://api.example.com", fetcher });

        const blob = await api.blob("/analyses/1/image");

        expect(blob).toBeInstanceOf(Blob);
        expect(await bytesOf(blob)).toEqual(JPEG_HEADER);
    });

    it("returns the exact bytes through arrayBuffer()", async () => {
        const fetcher = vi.fn().mockResolvedValue(binaryResponse(JPEG_HEADER));
        const api = createApiClient({ baseURL: "https://api.example.com", fetcher });

        const buffer = await api.arrayBuffer("/analyses/1/image");

        expect(buffer.byteLength).toBe(JPEG_HEADER.length);
        expect(await bytesOf(buffer)).toEqual(JPEG_HEADER);
    });

    it("sends the bearer token on a download, so no call has to re-declare it", async () => {
        const fetcher = vi.fn().mockResolvedValue(binaryResponse(JPEG_HEADER));
        const api = createApiClient({
            baseURL: "https://api.example.com",
            getToken: () => "abc123",
            fetcher,
        });

        await api.blob("/analyses/1/image");

        const headers = fetcher.mock.calls[0][1].headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer abc123");
    });

    it("refreshes and replays a 401 download, which a hand-rolled fetch never did", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(binaryResponse(JPEG_HEADER));
        const refresh = vi.fn(() => Promise.resolve());
        const api = createApiClient({ baseURL: "https://api.example.com", refresh, fetcher });

        const blob = await api.blob("/analyses/1/image");

        expect(refresh).toHaveBeenCalledTimes(1);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(await bytesOf(blob)).toEqual(JPEG_HEADER);
    });

    it("throws the typed error with the status when a download fails", async () => {
        const fetcher = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ detail: "arquivo removido" }), {
                status: 404,
                headers: { "content-type": "application/json" },
            }),
        );
        const api = createApiClient({ baseURL: "https://api.example.com", fetcher });

        await expect(api.blob("/analyses/1/image")).rejects.toMatchObject({
            status: 404,
            detail: "arquivo removido",
        });
    });

    it("returns a Blob from request(), instead of the corrupted text it used to decode", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const fetcher = vi.fn().mockResolvedValue(binaryResponse(JPEG_HEADER));
        const api = createApiClient({ baseURL: "https://api.example.com", fetcher });

        const body = await api.get<Blob>("/analyses/1/image");

        expect(body).toBeInstanceOf(Blob);
        expect(await bytesOf(body)).toEqual(JPEG_HEADER);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("binary response"));
    });

    it("still decodes json, text and 204 the way it always did", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            )
            .mockResolvedValueOnce(
                new Response("pong", { status: 200, headers: { "content-type": "text/plain" } }),
            )
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const api = createApiClient({ baseURL: "https://api.example.com", fetcher });

        await expect(api.get("/json")).resolves.toEqual({ ok: true });
        await expect(api.get("/text")).resolves.toBe("pong");
        await expect(api.delete("/thing")).resolves.toBeUndefined();
    });

    it("decodes a problem+json error envelope as json, not as text", async () => {
        const fetcher = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ detail: "campo inválido" }), {
                status: 422,
                headers: { "content-type": "application/problem+json" },
            }),
        );
        const api = createApiClient({ baseURL: "https://api.example.com", fetcher });

        await expect(api.post("/users")).rejects.toMatchObject({
            status: 422,
            detail: "campo inválido",
        });
    });
});
