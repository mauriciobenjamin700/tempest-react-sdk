import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDevBuild } from "../utils/dev-mode";
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

describe("persistQueryClientOffline — clear() ends the session (#440)", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    async function restoreInto(dbName: string): Promise<QueryClient> {
        const next = makeClient();
        const reader = persistQueryClientOffline({ queryClient: next, databaseName: dbName });
        await reader.restore();
        reader.unsubscribe();
        return next;
    }

    it("a write pending at clear() never lands, so the next boot restores nothing", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 50,
        });

        client.setQueryData(["me", "inbox"], { owner: "user-a", secret: "A" });
        await persistence.clear();
        await vi.advanceTimersByTimeAsync(200);
        vi.useRealTimers();

        const next = await restoreInto(dbName);
        expect(next.getQueryData(["me", "inbox"])).toBeUndefined();
    });

    it("cache activity after clear() does not re-persist the previous user's data", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        client.setQueryData(["me", "inbox"], { owner: "user-a", secret: "A" });
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 50,
        });
        await persistence.flush();

        await persistence.clear();
        client.setQueryData(["public"], "next user's first query");
        await vi.advanceTimersByTimeAsync(200);
        vi.useRealTimers();

        const next = await restoreInto(dbName);
        expect(next.getQueryData(["me", "inbox"])).toBeUndefined();
        expect(next.getQueryData(["public"])).toBeUndefined();
    });

    it("a save already in flight when clear() starts is deleted, not left behind", async () => {
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        client.setQueryData(["me"], "A");
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
        });

        const inFlight = persistence.flush();
        await persistence.clear();
        await inFlight;

        const next = await restoreInto(dbName);
        expect(next.getQueryData(["me"])).toBeUndefined();
    });

    it("flush() after clear() is a no-op and does not write the live cache back", async () => {
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        client.setQueryData(["me"], "A");
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
        });

        await persistence.clear();
        await persistence.flush();

        const next = await restoreInto(dbName);
        expect(next.getQueryData(["me"])).toBeUndefined();
    });

    it("clear() leaves the in-memory QueryClient untouched", async () => {
        const client = makeClient();
        client.setQueryData(["catalog"], [1, 2]);
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: `qc-${Math.random().toString(36).slice(2)}`,
        });

        await persistence.clear();
        expect(client.getQueryData(["catalog"])).toEqual([1, 2]);
    });

    it("clear({ resetClient: true }) also empties the in-memory QueryClient", async () => {
        const client = makeClient();
        client.setQueryData(["me", "inbox"], { owner: "user-a" });
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: `qc-${Math.random().toString(36).slice(2)}`,
        });

        await persistence.clear({ resetClient: true });
        expect(client.getQueryData(["me", "inbox"])).toBeUndefined();
        expect(client.getQueryCache().getAll()).toHaveLength(0);
    });

    it("clear({ resetClient: true }) leaves no snapshot row behind, not even an empty one", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        client.setQueryData(["me"], "A");
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
            throttleMs: 50,
        });

        await persistence.clear({ resetClient: true });
        await vi.advanceTimersByTimeAsync(200);
        vi.useRealTimers();

        const raw = indexedDB.open(dbName);
        const rows = await new Promise<number>((resolve) => {
            raw.onsuccess = () => {
                const request = raw.result.transaction("cache").objectStore("cache").count();
                request.onsuccess = () => {
                    raw.result.close();
                    resolve(request.result);
                };
            };
        });
        expect(rows).toBe(0);
    });

    it("clear() is idempotent and composes with unsubscribe() in any order", async () => {
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        client.setQueryData(["me"], "A");
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
        });
        await persistence.flush();

        persistence.unsubscribe();
        await Promise.all([persistence.clear(), persistence.clear()]);
        await persistence.clear();
        persistence.unsubscribe();

        const next = await restoreInto(dbName);
        expect(next.getQueryData(["me"])).toBeUndefined();
    });

    it("restore() after clear() does not hydrate a snapshot written by another handle", async () => {
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: dbName,
        });
        await persistence.clear();

        const other = makeClient();
        other.setQueryData(["other"], "B");
        const writer = persistQueryClientOffline({ queryClient: other, databaseName: dbName });
        await writer.flush();
        writer.unsubscribe();

        await persistence.restore();
        expect(client.getQueryData(["other"])).toBeUndefined();
    });

    it("a fresh handle after clear() persists the new session normally", async () => {
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        client.setQueryData(["me"], "A");
        const first = persistQueryClientOffline({ queryClient: client, databaseName: dbName });
        await first.clear();
        client.clear();

        const second = persistQueryClientOffline({ queryClient: client, databaseName: dbName });
        client.setQueryData(["me"], "B");
        await second.flush();
        second.unsubscribe();

        const next = await restoreInto(dbName);
        expect(next.getQueryData(["me"])).toBe("B");
    });

    it("a new handle's restore() waits for a clear() still running on the same key", async () => {
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        client.setQueryData(["me"], "A");
        const old = persistQueryClientOffline({ queryClient: client, databaseName: dbName });
        await old.flush();
        client.setQueryData(["me"], "A2");

        const oldWrite = old.flush();
        const clearing = old.clear();
        const next = makeClient();
        const fresh = persistQueryClientOffline({ queryClient: next, databaseName: dbName });
        await fresh.restore();
        await Promise.all([oldWrite, clearing]);
        fresh.unsubscribe();

        expect(next.getQueryData(["me"])).toBeUndefined();
    });

    it("a pending clear() never deletes the snapshot a new handle writes meanwhile", async () => {
        const dbName = `qc-${Math.random().toString(36).slice(2)}`;
        const client = makeClient();
        client.setQueryData(["me"], "A");
        const old = persistQueryClientOffline({ queryClient: client, databaseName: dbName });

        const oldWrite = old.flush();
        const clearing = old.clear();
        const next = makeClient();
        next.setQueryData(["me"], "B");
        const fresh = persistQueryClientOffline({ queryClient: next, databaseName: dbName });
        await fresh.flush();
        await Promise.all([oldWrite, clearing]);
        fresh.unsubscribe();

        const restored = await restoreInto(dbName);
        expect(restored.getQueryData(["me"])).toBe("B");
    });

    it("warns once in dev when the cache keeps changing on a cleared handle", async () => {
        const warn = vi.mocked(console.warn);
        const client = makeClient();
        const persistence = persistQueryClientOffline({
            queryClient: client,
            databaseName: `qc-${Math.random().toString(36).slice(2)}`,
        });

        await persistence.clear({ resetClient: true });
        expect(warn).not.toHaveBeenCalled();
        client.setQueryData(["me"], "B");
        client.setQueryData(["me"], "B2");
        await persistence.flush();
        persistence.unsubscribe();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain("persistQueryClientOffline");
    });

    it("stays silent on a cleared handle outside a dev build", async () => {
        setDevBuild(false);
        try {
            const client = makeClient();
            const persistence = persistQueryClientOffline({
                queryClient: client,
                databaseName: `qc-${Math.random().toString(36).slice(2)}`,
            });
            await persistence.clear();
            client.setQueryData(["me"], "B");
            await persistence.flush();
            expect(console.warn).not.toHaveBeenCalled();
        } finally {
            setDevBuild(undefined);
        }
    });
});
