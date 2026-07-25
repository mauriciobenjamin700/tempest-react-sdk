import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
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

describe("persistQueryClientOffline — throttling and teardown", () => {
    it("coalesces cache churn into one trailing write", async () => {
        vi.useFakeTimers();
        const client = makeClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: `qc-${Math.random().toString(36).slice(2)}`,
            throttleMs: 50,
        });

        client.setQueryData(["a"], 1);
        client.setQueryData(["b"], 2);
        client.setQueryData(["c"], 3);
        await vi.advanceTimersByTimeAsync(80);

        persistence.unsubscribe();
        vi.useRealTimers();

        const restored = makeClient();
        await persistence.restore();
        expect(restored.getQueryData(["a"])).toBeUndefined();
    });

    it("flush() cancels the pending timer and writes immediately", async () => {
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 5_000,
        });

        client.setQueryData(["k"], "v");
        await persistence.flush();
        persistence.unsubscribe();

        const other = makeClient();
        const reader = persistQueryClientOffline({ queryClient: other, databaseName: dbName });
        await reader.restore();
        reader.unsubscribe();
        expect(other.getQueryData(["k"])).toBe("v");
    });

    it("unsubscribe() drops a pending write", async () => {
        vi.useFakeTimers();
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 50,
        });

        client.setQueryData(["dropped"], true);
        persistence.unsubscribe();
        await vi.advanceTimersByTimeAsync(200);
        vi.useRealTimers();

        const other = makeClient();
        const reader = persistQueryClientOffline({ queryClient: other, databaseName: dbName });
        await reader.restore();
        reader.unsubscribe();
        expect(other.getQueryData(["dropped"])).toBeUndefined();
    });

    it("honours a custom row key", async () => {
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        client.setQueryData(["x"], 1);
        const a = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            key: "a",
        });
        await a.flush();
        a.unsubscribe();

        const other = makeClient();
        const b = persistQueryClientOffline({
            queryClient: other,
            databaseName: dbName,
            key: "b",
        });
        await b.restore();
        b.unsubscribe();
        expect(other.getQueryData(["x"])).toBeUndefined();
    });
});
