import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type * as OfflineStoreModule from "../offline/create-offline-store";

vi.mock("../offline/create-offline-store", async (importOriginal) => {
    const actual = await importOriginal<typeof OfflineStoreModule>();
    return {
        ...actual,
        createOfflineStore: (...args: Parameters<typeof actual.createOfflineStore>) => {
            const store = actual.createOfflineStore(...args);
            return {
                ...store,
                delete: () => Promise.reject(new Error("quota exceeded")),
            };
        },
    };
});

const { persistQueryClientOffline } = await import("./offline-persistence");

describe("persistQueryClientOffline — clear() when the delete fails", () => {
    it("still resets the client with resetClient and rejects to the caller", async () => {
        const client = new QueryClient();
        client.setQueryData(["me", "inbox"], { owner: "user-a" });
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: `qc-${Math.random().toString(36).slice(2)}`,
        });

        await expect(persistence.clear({ resetClient: true })).rejects.toThrow("quota exceeded");
        expect(client.getQueryData(["me", "inbox"])).toBeUndefined();
    });
});
