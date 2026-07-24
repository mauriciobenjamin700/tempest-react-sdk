import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { persistQueryClientOffline } from "./offline-persistence";

function makeClient(): QueryClient {
    return new QueryClient();
}

describe("persistQueryClientOffline", () => {
    it("restores a flushed snapshot into a fresh client", async () => {
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const clientA = makeClient();
        clientA.setQueryData(["notes"], [{ id: "n1", text: "hi" }]);

        const persistA = persistQueryClientOffline({ queryClient: clientA, databaseName: dbName });
        await persistA.flush();
        persistA.unsubscribe();

        const clientB = makeClient();
        const persistB = persistQueryClientOffline({ queryClient: clientB, databaseName: dbName });
        await persistB.restore();
        persistB.unsubscribe();

        expect(clientB.getQueryData(["notes"])).toEqual([{ id: "n1", text: "hi" }]);
    });

    it("restore is a no-op when nothing was persisted", async () => {
        const client = makeClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: `qc-${Math.random().toString(36).slice(2)}`,
        });
        await persistence.restore();
        persistence.unsubscribe();
        expect(client.getQueryData(["missing"])).toBeUndefined();
    });

    it("clear removes the persisted snapshot", async () => {
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const clientA = makeClient();
        clientA.setQueryData(["x"], 1);
        const persistA = persistQueryClientOffline({ queryClient: clientA, databaseName: dbName });
        await persistA.flush();
        await persistA.clear();
        persistA.unsubscribe();

        const clientB = makeClient();
        const persistB = persistQueryClientOffline({ queryClient: clientB, databaseName: dbName });
        await persistB.restore();
        persistB.unsubscribe();
        expect(clientB.getQueryData(["x"])).toBeUndefined();
    });
});
