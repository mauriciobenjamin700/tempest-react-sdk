import { describe, expect, it, vi } from "vitest";

import type { ApiClient } from "@/http/types";
import type { OffsetPage } from "@/query/pagination";

import { createDataProvider } from "./create-data-provider";

interface User {
    id: number;
    name: string;
}

function emptyPage(): OffsetPage<User> {
    return { items: [], total: 0, page: 1, size: 20, pages: 0 };
}

function mockClient(): ApiClient {
    return {
        request: vi.fn(async () => ({}) as never),
        get: vi.fn(async () => emptyPage() as never),
        post: vi.fn(async () => ({ id: 1, name: "Ada" }) as never),
        put: vi.fn(async () => ({ id: 1, name: "Ada" }) as never),
        patch: vi.fn(async () => ({ id: 1, name: "Ada" }) as never),
        delete: vi.fn(async () => ({ id: 1, name: "Ada" }) as never),
        upload: vi.fn(async () => ({}) as never),
    };
}

describe("createDataProvider", () => {
    it("getList builds path and page/size/order_by/ascending params + filters", async () => {
        const client = mockClient();
        const provider = createDataProvider(client);

        await provider.getList<User>("users", {
            pagination: { page: 2, pageSize: 25 },
            sort: { field: "created_at", order: "desc" },
            filters: { active: true, search: "ada" },
        });

        expect(client.get).toHaveBeenCalledWith("/users", {
            params: {
                page: 2,
                size: 25,
                order_by: "created_at",
                ascending: false,
                active: true,
                search: "ada",
            },
        });
    });

    it("getList defaults sort order to ascending true", async () => {
        const client = mockClient();
        const provider = createDataProvider(client);

        await provider.getList<User>("users", { sort: { field: "name" } });

        expect(client.get).toHaveBeenCalledWith("/users", {
            params: { order_by: "name", ascending: true },
        });
    });

    it("getList emits literal asc/desc when sortOrderAsBoolean is false", async () => {
        const client = mockClient();
        const provider = createDataProvider(client, { sortOrderAsBoolean: false });

        await provider.getList<User>("users", { sort: { field: "name", order: "desc" } });

        expect(client.get).toHaveBeenCalledWith("/users", {
            params: { order_by: "name", ascending: "desc" },
        });
    });

    it("getList sends an empty params object when nothing is provided", async () => {
        const client = mockClient();
        const provider = createDataProvider(client);

        await provider.getList<User>("users");

        expect(client.get).toHaveBeenCalledWith("/users", { params: {} });
    });

    it("getList honors custom param names", async () => {
        const client = mockClient();
        const provider = createDataProvider(client, {
            pageParam: "p",
            sizeParam: "page_size",
            sortFieldParam: "sort",
            sortOrderParam: "dir",
            sortOrderAsBoolean: false,
        });

        await provider.getList<User>("users", {
            pagination: { page: 3, pageSize: 10 },
            sort: { field: "name", order: "asc" },
        });

        expect(client.get).toHaveBeenCalledWith("/users", {
            params: { p: 3, page_size: 10, sort: "name", dir: "asc" },
        });
    });

    it("getOne fetches /resource/id", async () => {
        const client = mockClient();
        const provider = createDataProvider(client);

        await provider.getOne<User>("users", 7);

        expect(client.get).toHaveBeenCalledWith("/users/7");
    });

    it("getMany fetches each id in parallel via getOne", async () => {
        const client = mockClient();
        (client.get as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => ({
            id: Number(path.split("/").pop()),
            name: "x",
        }));
        const provider = createDataProvider(client);

        const result = await provider.getMany<User>("users", [1, 2, 3]);

        expect(client.get).toHaveBeenCalledTimes(3);
        expect(result.map((u) => u.id)).toEqual([1, 2, 3]);
    });

    it("create posts the body to /resource", async () => {
        const client = mockClient();
        const provider = createDataProvider(client);

        await provider.create<User>("users", { name: "Ada" });

        expect(client.post).toHaveBeenCalledWith("/users", { body: { name: "Ada" } });
    });

    it("update uses PATCH by default", async () => {
        const client = mockClient();
        const provider = createDataProvider(client);

        await provider.update<User>("users", 1, { name: "Grace" });

        expect(client.patch).toHaveBeenCalledWith("/users/1", { body: { name: "Grace" } });
        expect(client.put).not.toHaveBeenCalled();
    });

    it("update uses PUT when updateMethod is put", async () => {
        const client = mockClient();
        const provider = createDataProvider(client, { updateMethod: "put" });

        await provider.update<User>("users", 1, { name: "Grace" });

        expect(client.put).toHaveBeenCalledWith("/users/1", { body: { name: "Grace" } });
        expect(client.patch).not.toHaveBeenCalled();
    });

    it("deleteOne deletes /resource/id", async () => {
        const client = mockClient();
        const provider = createDataProvider(client);

        await provider.deleteOne<User>("users", 9);

        expect(client.delete).toHaveBeenCalledWith("/users/9");
    });

    it("buildPath override controls the request path", async () => {
        const client = mockClient();
        const provider = createDataProvider(client, {
            buildPath: (resource, id) =>
                id == null ? `/api/${resource}` : `/api/${resource}/${id}`,
        });

        await provider.getOne<User>("users", 4);

        expect(client.get).toHaveBeenCalledWith("/api/users/4");
    });
});
