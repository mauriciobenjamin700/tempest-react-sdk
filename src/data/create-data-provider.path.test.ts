import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "@/http/api-client";

import { createDataProvider, encodeIdSegment } from "./create-data-provider";

interface Sent {
    method: string;
    url: string;
    auth: string | null;
}

function harness(): {
    provider: ReturnType<typeof createDataProvider>;
    sent: Sent[];
} {
    const sent: Sent[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        sent.push({
            method: init?.method ?? "GET",
            url: String(input),
            auth: headers.get("Authorization"),
        });
        return new Response("{}", {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }) as unknown as typeof fetch;
    const client = createApiClient({
        baseURL: "https://app.example.test/api",
        getToken: () => "DUMMY",
        fetcher,
    });
    return { provider: createDataProvider(client), sent };
}

describe("createDataProvider — the id stays inside its own path segment (#438)", () => {
    it("keeps a well-formed id unchanged, so the common case sends the same URL as before", async () => {
        const { provider, sent } = harness();

        await provider.getOne("posts", 42);
        await provider.getOne("posts", "8f14e45f-ceea-467a-9575-7d5b2b0f2a1c");

        expect(sent.map((s) => s.url)).toEqual([
            "https://app.example.test/api/posts/42",
            "https://app.example.test/api/posts/8f14e45f-ceea-467a-9575-7d5b2b0f2a1c",
        ]);
    });

    it("does not let a '../' id walk the authenticated GET out of the resource", async () => {
        const { provider, sent } = harness();

        await provider.getOne("posts", "../../admin/users");

        expect(sent[0]).toEqual({
            method: "GET",
            url: "https://app.example.test/api/posts/..%2F..%2Fadmin%2Fusers",
            auth: "Bearer DUMMY",
        });
    });

    it("does not let a '/' id reach a sibling resource on DELETE", async () => {
        const { provider, sent } = harness();

        await provider.deleteOne("posts", "../users/7");

        expect(sent[0]?.url).toBe("https://app.example.test/api/posts/..%2Fusers%2F7");
    });

    it("does not let a '?' id inject query params into PATCH", async () => {
        const { provider, sent } = harness();

        await provider.update("posts", "7?role=admin", { title: "x" });

        expect(sent[0]).toMatchObject({
            method: "PATCH",
            url: "https://app.example.test/api/posts/7%3Frole%3Dadmin",
        });
    });

    it("does not let a '#' id truncate the path", async () => {
        const { provider, sent } = harness();

        await provider.getOne("posts", "7#x");

        expect(sent[0]?.url).toBe("https://app.example.test/api/posts/7%23x");
    });

    it.each(["", ".", ".."])(
        "rejects the id %j before any request, since no encoding keeps it a record id",
        async (id) => {
            const { provider, sent } = harness();

            await expect(provider.getOne("posts", id)).rejects.toThrow(TypeError);
            await expect(provider.deleteOne("posts", id)).rejects.toThrow(TypeError);
            await expect(provider.update("posts", id, {})).rejects.toThrow(TypeError);
            expect(sent).toEqual([]);
        },
    );

    it("hands a custom buildPath the already-encoded segment, so overrides are safe without extra code", async () => {
        const buildPath = vi.fn((resource: string, id?: string | number) =>
            id == null ? `/v2/${resource}` : `/v2/${resource}/${id}`,
        );
        const sent: string[] = [];
        const client = createApiClient({
            baseURL: "https://app.example.test",
            fetcher: (async (input: RequestInfo | URL) => {
                sent.push(String(input));
                return new Response("{}", {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }) as typeof fetch,
        });
        const provider = createDataProvider(client, { buildPath });

        await provider.getOne("posts", "a/b?x=1");

        expect(buildPath).toHaveBeenCalledWith("posts", "a%2Fb%3Fx%3D1");
        expect(sent).toEqual(["https://app.example.test/v2/posts/a%2Fb%3Fx%3D1"]);
    });

    it("leaves the list and create paths alone, since they carry no id", async () => {
        const { provider, sent } = harness();

        await provider.getList("posts");
        await provider.create("posts", { title: "x" });

        expect(sent.map((s) => s.url)).toEqual([
            "https://app.example.test/api/posts",
            "https://app.example.test/api/posts",
        ]);
    });
});

describe("encodeIdSegment", () => {
    it("encodes every reserved character and keeps numbers as their decimal string", () => {
        expect(encodeIdSegment(7)).toBe("7");
        expect(encodeIdSegment("a/b?c#d%e")).toBe("a%2Fb%3Fc%23d%25e");
        expect(encodeIdSegment("...")).toBe("...");
    });

    it.each(["", ".", ".."])("throws a TypeError for %j", (id) => {
        expect(() => encodeIdSegment(id)).toThrow(TypeError);
    });
});
