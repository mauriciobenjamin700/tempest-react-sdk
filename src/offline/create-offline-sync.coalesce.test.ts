import { describe, expect, it, vi } from "vitest";
import {
    createOfflineSync,
    type OfflineSyncConfig,
    type OutboxEntry,
    type PullPage,
} from "./create-offline-sync";

interface Visit {
    id: string;
    notes?: string;
    status?: string;
}

function makeSync(overrides: Partial<OfflineSyncConfig<Visit, never>> = {}) {
    const deliver = vi.fn(async (_entry: OutboxEntry<Visit>) => undefined);
    const config: OfflineSyncConfig<Visit, never> = {
        databaseName: `coalesce-${Math.random().toString(36).slice(2)}`,
        watermark: { get: () => null, set: () => undefined, clear: () => undefined },
        deliver,
        pullPage: async (): Promise<PullPage<never>> => ({
            items: [],
            nextCursor: null,
            serverTime: null,
        }),
        applyRemote: async () => undefined,
        ...overrides,
    };
    return { sync: createOfflineSync(config), deliver: config.deliver as typeof deliver };
}

describe("createOfflineSync coalesce", () => {
    it("still delivers one request per entry when coalesce is off", async () => {
        const { sync, deliver } = makeSync();
        await sync.enqueue("create", "v1", { id: "v1", notes: "0" });
        for (let edit = 1; edit <= 9; edit += 1) {
            await sync.enqueue("update", "v1", { id: "v1", notes: String(edit) });
        }

        const summary = await sync.flush();

        expect(deliver).toHaveBeenCalledTimes(10);
        expect(summary.succeeded).toBe(10);
        expect(summary.coalesced).toBeUndefined();
    });

    it("sends ten edits of one record as a single create carrying the newest snapshot", async () => {
        const { sync, deliver } = makeSync({ coalesce: true });
        const firstId = await sync.enqueue("create", "v1", { id: "v1", notes: "0" });
        for (let edit = 1; edit <= 9; edit += 1) {
            await sync.enqueue("update", "v1", { id: "v1", notes: String(edit) });
        }

        const summary = await sync.flush();

        expect(deliver).toHaveBeenCalledTimes(1);
        const sent = deliver.mock.calls[0][0];
        expect(sent.op).toBe("create");
        expect(sent.id).toBe(firstId);
        expect(sent.payload).toEqual({ id: "v1", notes: "9" });
        expect(summary).toMatchObject({ succeeded: 1, coalesced: 9, failed: 0, deferred: 0 });
        expect(await sync.pendingCount()).toBe(0);
    });

    it("keeps update as the op when the record was already on the server", async () => {
        const { sync, deliver } = makeSync({ coalesce: true });
        await sync.enqueue("update", "v1", { id: "v1", notes: "a" });
        await sync.enqueue("update", "v1", { id: "v1", notes: "b" });

        await sync.flush();

        expect(deliver).toHaveBeenCalledTimes(1);
        expect(deliver.mock.calls[0][0]).toMatchObject({ op: "update", payload: { notes: "b" } });
    });

    it("folds partial patches with a merge function, oldest first", async () => {
        const merge = vi.fn((folded: Visit, next: Visit): Visit => ({ ...folded, ...next }));
        const { sync, deliver } = makeSync({ coalesce: merge });
        await sync.enqueue("update", "v1", { id: "v1", notes: "n" });
        await sync.enqueue("update", "v1", { id: "v1", status: "done" });
        await sync.enqueue("update", "v1");

        await sync.flush();

        expect(merge).toHaveBeenCalledTimes(1);
        expect(deliver.mock.calls[0][0].payload).toEqual({ id: "v1", notes: "n", status: "done" });
    });

    it("never folds across a delete, so the delete still reaches the server after the create", async () => {
        const { sync, deliver } = makeSync({ coalesce: true });
        await sync.enqueue("create", "v1", { id: "v1", notes: "a" });
        await sync.enqueue("update", "v1", { id: "v1", notes: "b" });
        await sync.enqueue("delete", "v1");
        await sync.enqueue("create", "v1", { id: "v1", notes: "c" });
        await sync.enqueue("update", "v1", { id: "v1", notes: "d" });

        const summary = await sync.flush();

        expect(
            deliver.mock.calls.map(([entry]) => [entry.op, entry.payload?.notes ?? null]),
        ).toEqual([
            ["create", "b"],
            ["delete", null],
            ["create", "d"],
        ]);
        expect(summary).toMatchObject({ succeeded: 3, coalesced: 2 });
    });

    it("folds each record on its own and delivers each group at its oldest entry's position", async () => {
        const { sync, deliver } = makeSync({ coalesce: true });
        await sync.enqueue("create", "a", { id: "a", notes: "a1" });
        await sync.enqueue("create", "b", { id: "b", notes: "b1" });
        await sync.enqueue("update", "a", { id: "a", notes: "a2" });
        await sync.enqueue("update", "b", { id: "b", notes: "b2" });

        await sync.flush();

        expect(deliver.mock.calls.map(([entry]) => entry.payload?.notes)).toEqual(["a2", "b2"]);
    });

    it("keeps the folded entries queued when the delivery fails, bumping only the oldest", async () => {
        const deliver = vi.fn(async () => {
            throw new Error("offline");
        });
        const { sync } = makeSync({ coalesce: true, deliver });
        await sync.enqueue("create", "v1", { id: "v1", notes: "a" });
        await sync.enqueue("update", "v1", { id: "v1", notes: "b" });
        await sync.enqueue("update", "v1", { id: "v1", notes: "c" });

        const summary = await sync.flush();

        expect(deliver).toHaveBeenCalledTimes(1);
        expect(summary).toMatchObject({ succeeded: 0, failed: 1, deferred: 2 });
        expect(summary.coalesced).toBeUndefined();
        const pending = await sync.listPending();
        expect(pending.map((entry) => entry.attempts)).toEqual([1, 0, 0]);
    });

    it("leaves an edit queued during the delivery for the next run instead of deleting it", async () => {
        let enqueueDuringDelivery: (() => Promise<void>) | null = null;
        const deliver = vi.fn(async () => {
            if (enqueueDuringDelivery) {
                const run = enqueueDuringDelivery;
                enqueueDuringDelivery = null;
                await run();
            }
        });
        const { sync } = makeSync({ coalesce: true, deliver });
        await sync.enqueue("create", "v1", { id: "v1", notes: "a" });
        await sync.enqueue("update", "v1", { id: "v1", notes: "b" });
        enqueueDuringDelivery = async () => {
            await sync.enqueue("update", "v1", { id: "v1", notes: "late" });
        };

        await sync.flush();

        const pending = await sync.listPending();
        expect(pending.map((entry) => entry.payload?.notes)).toEqual(["late"]);
        await sync.flush();
        expect(deliver).toHaveBeenLastCalledWith(
            expect.objectContaining({ op: "update", payload: { id: "v1", notes: "late" } }),
        );
        expect(await sync.pendingCount()).toBe(0);
    });

    it("does not fold entries stamped by different principals", async () => {
        let principal: string | null = "ana";
        const { sync, deliver } = makeSync({ coalesce: true, getPrincipal: () => principal });
        await sync.enqueue("update", "v1", { id: "v1", notes: "ana" });
        principal = "carlos";
        await sync.enqueue("update", "v1", { id: "v1", notes: "carlos" });

        const summary = await sync.flush();

        expect(summary.dropped).toBe(1);
        expect(deliver).toHaveBeenCalledTimes(1);
        expect(deliver.mock.calls[0][0].payload?.notes).toBe("carlos");
    });

    it("holds every folded entry while nobody is signed in", async () => {
        let principal: string | null = "ana";
        const { sync, deliver } = makeSync({ coalesce: true, getPrincipal: () => principal });
        await sync.enqueue("update", "v1", { id: "v1", notes: "a" });
        await sync.enqueue("update", "v1", { id: "v1", notes: "b" });
        principal = null;

        const summary = await sync.flush();

        expect(deliver).not.toHaveBeenCalled();
        expect(summary.held).toBe(2);
        expect(await sync.pendingCount()).toBe(2);
    });

    it("skips a folded group another tab cleared while the run was delivering", async () => {
        const databaseName = `coalesce-${Math.random().toString(36).slice(2)}`;
        const other = makeSync({ databaseName }).sync;
        const deliver = vi.fn(async (entry: OutboxEntry<Visit>) => {
            if (entry.recordId === "a") await other.clearOutbox();
        });
        const { sync } = makeSync({ databaseName, coalesce: true, deliver });
        await sync.enqueue("update", "a", { id: "a" });
        await sync.enqueue("update", "v1", { id: "v1", notes: "a" });
        await sync.enqueue("update", "v1", { id: "v1", notes: "b" });

        const summary = await sync.flush();

        expect(deliver).toHaveBeenCalledTimes(1);
        expect(summary).toMatchObject({ succeeded: 1, failed: 0, deferred: 0 });
        expect(summary.coalesced).toBeUndefined();
    });
});
