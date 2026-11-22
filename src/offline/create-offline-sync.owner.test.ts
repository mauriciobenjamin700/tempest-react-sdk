import { describe, expect, it, vi } from "vitest";
import {
    createOfflineSync,
    type OfflineSyncConfig,
    type OutboxEntry,
    type PullPage,
} from "./create-offline-sync";

interface Note {
    text: string;
}

function makeSync(
    principal: { current: unknown },
    databaseName?: string,
    foreignEntries?: OfflineSyncConfig<Note, unknown>["foreignEntries"],
) {
    const deliver = vi.fn(async (_entry: OutboxEntry<Note>) => undefined);
    const config: OfflineSyncConfig<Note, unknown> = {
        databaseName: databaseName ?? `sync-owner-${Math.random().toString(36).slice(2)}`,
        watermark: {
            get: () => null,
            set: () => undefined,
            clear: () => undefined,
        },
        deliver,
        pullPage: async (): Promise<PullPage<unknown>> => ({
            items: [],
            nextCursor: null,
            serverTime: null,
        }),
        applyRemote: async () => undefined,
        isOnline: () => true,
        getPrincipal: () => principal.current as string | null,
        foreignEntries,
    };
    return { sync: createOfflineSync(config), deliver, databaseName: config.databaseName };
}

describe("createOfflineSync — outbox bound to its owner", () => {
    it("never delivers the previous user's mutation under the next user's session", async () => {
        const principal = { current: "user-a" as unknown };
        const { sync, deliver } = makeSync(principal);
        await sync.enqueue("update", "n1", { text: "A's draft" });

        principal.current = "user-b";
        const summary = await sync.flush();

        expect(deliver).not.toHaveBeenCalled();
        expect(summary.dropped).toBe(1);
        expect(await sync.pendingCount()).toBe(0);
        sync.dispose();
    });

    it("holds the user's mutations while nobody is signed in and delivers them after they sign back in", async () => {
        const principal = { current: "user-a" as unknown };
        const { sync, deliver } = makeSync(principal);
        await sync.enqueue("create", "n1", { text: "offline edit" });

        principal.current = null;
        const signedOut = await sync.flush();
        expect(deliver).not.toHaveBeenCalled();
        expect(signedOut.held).toBe(1);
        expect(await sync.pendingCount()).toBe(1);

        principal.current = "user-a";
        const back = await sync.flush();
        expect(deliver).toHaveBeenCalledTimes(1);
        expect(back.succeeded).toBe(1);
        sync.dispose();
    });

    it("stamps each entry with a fingerprint of the principal, never the id itself", async () => {
        const { sync } = makeSync({ current: "ada@example.com" });
        await sync.enqueue("create", "n1", { text: "x" });

        const [entry] = await sync.listPending();

        expect(entry?.owner).toMatch(/^p:[0-9a-f]{16}$/);
        expect(JSON.stringify(entry)).not.toContain("ada@example.com");
        sync.dispose();
    });

    it("delivers an entry queued before getPrincipal existed, as it did before", async () => {
        const databaseName = `sync-owner-legacy-${Math.random().toString(36).slice(2)}`;
        const legacy = createOfflineSync<Note, unknown>({
            databaseName,
            watermark: { get: () => null, set: () => undefined, clear: () => undefined },
            deliver: async () => {
                throw new Error("offline");
            },
            pullPage: async () => ({ items: [], nextCursor: null, serverTime: null }),
            applyRemote: async () => undefined,
            isOnline: () => true,
        });
        await legacy.enqueue("create", "n1", { text: "legacy" });
        legacy.dispose();

        const { sync, deliver } = makeSync({ current: "user-b" }, databaseName);
        const summary = await sync.flush();

        expect(deliver).toHaveBeenCalledTimes(1);
        expect(summary.succeeded).toBe(1);
        sync.dispose();
    });

    it("drops an entry queued while signed out once somebody signs in", async () => {
        const principal = { current: null as unknown };
        const { sync, deliver } = makeSync(principal);
        await sync.enqueue("create", "n1", { text: "anonymous" });

        principal.current = "user-b";
        const summary = await sync.flush();

        expect(deliver).not.toHaveBeenCalled();
        expect(summary.dropped).toBe(1);
        sync.dispose();
    });

    it("reports no held or dropped counts on a run where every entry was the user's own", async () => {
        const { sync } = makeSync({ current: "user-a" });
        await sync.enqueue("create", "n1", { text: "mine" });

        const summary = await sync.flush();

        expect(summary.succeeded).toBe(1);
        expect(summary).not.toHaveProperty("held");
        expect(summary).not.toHaveProperty("dropped");
        sync.dispose();
    });

    it("does not deliver a signed-out edit ahead of the owner's held edit of the same record", async () => {
        const principal = { current: "user-a" as unknown };
        const { sync, deliver } = makeSync(principal);
        await sync.enqueue("update", "n1", { text: "A's edit" });
        principal.current = null;
        await sync.enqueue("update", "n1", { text: "edited while signed out" });

        const summary = await sync.flush();

        expect(deliver).not.toHaveBeenCalled();
        expect(summary.held).toBe(1);
        expect(summary.deferred).toBe(1);
        expect(await sync.pendingCount()).toBe(2);
        sync.dispose();
    });
});

describe('createOfflineSync — foreignEntries: "hold" on a shared device (#724)', () => {
    it("keeps the previous user's mutations when the next one syncs, and delivers them on their return", async () => {
        const principal = { current: "carlos" as unknown };
        const { sync, deliver } = makeSync(principal, undefined, "hold");
        for (const id of ["v1", "v2", "v3"]) await sync.enqueue("update", id, { text: "carlos" });

        principal.current = "ana";
        const ana = await sync.flush();
        expect(deliver).not.toHaveBeenCalled();
        expect(ana.held).toBe(3);
        expect(ana).not.toHaveProperty("dropped");
        expect(await sync.pendingCount()).toBe(3);

        principal.current = "carlos";
        const back = await sync.flush();
        expect(back.succeeded).toBe(3);
        expect(deliver.mock.calls.map(([entry]) => entry.recordId)).toEqual(["v1", "v2", "v3"]);
        expect(await sync.pendingCount()).toBe(0);
        sync.dispose();
    });

    it("delivers the signed-in user's own mutations while holding another user's", async () => {
        const principal = { current: "carlos" as unknown };
        const { sync, deliver } = makeSync(principal, undefined, "hold");
        await sync.enqueue("update", "v1", { text: "carlos" });
        principal.current = "ana";
        await sync.enqueue("update", "v2", { text: "ana" });

        const summary = await sync.flush();

        expect(summary.succeeded).toBe(1);
        expect(summary.held).toBe(1);
        expect(deliver.mock.calls.map(([entry]) => entry.payload?.text)).toEqual(["ana"]);
        sync.dispose();
    });

    it("keeps the per-record order: a later edit of a held record waits for the held one", async () => {
        const principal = { current: "carlos" as unknown };
        const { sync, deliver } = makeSync(principal, undefined, "hold");
        await sync.enqueue("update", "shared", { text: "carlos, older" });
        principal.current = "ana";
        await sync.enqueue("update", "shared", { text: "ana, newer" });

        const ana = await sync.flush();
        expect(deliver).not.toHaveBeenCalled();
        expect(ana.held).toBe(1);
        expect(ana.deferred).toBe(1);

        principal.current = "carlos";
        await sync.flush();
        principal.current = "ana";
        await sync.flush();

        expect(deliver.mock.calls.map(([entry]) => entry.payload?.text)).toEqual([
            "carlos, older",
            "ana, newer",
        ]);
        sync.dispose();
    });

    it("never delivers a held entry under another session, whichever user flushes", async () => {
        const principal = { current: "carlos" as unknown };
        const { sync, deliver } = makeSync(principal, undefined, "hold");
        await sync.enqueue("update", "v1", { text: "carlos" });

        for (const who of ["ana", null, "bia", "ana"]) {
            principal.current = who;
            await sync.flush();
        }

        expect(deliver).not.toHaveBeenCalled();
        expect(await sync.pendingCount()).toBe(1);
        sync.dispose();
    });

    it("holds an entry queued while signed out once somebody signs in", async () => {
        const principal = { current: null as unknown };
        const { sync, deliver } = makeSync(principal, undefined, "hold");
        await sync.enqueue("create", "n1", { text: "anonymous" });

        principal.current = "ana";
        const summary = await sync.flush();

        expect(deliver).not.toHaveBeenCalled();
        expect(summary.held).toBe(1);
        expect(await sync.pendingCount()).toBe(1);
        sync.dispose();
    });
});

/**
 * `coalesce` (#725) and `foreignEntries: "hold"` (#724) landed in parallel and meet
 * in the same loop: a held group must count every folded entry as held, and still
 * hold back the later entries of its record, as a single held entry does.
 */
describe('createOfflineSync — foreignEntries: "hold" with coalesce', () => {
    it("counts every folded entry of a held group and holds the record's later entries", async () => {
        const principal = { current: "user-a" as unknown };
        const deliver = vi.fn(async (_entry: OutboxEntry<Note>) => undefined);
        const sync = createOfflineSync<Note, unknown>({
            databaseName: `sync-owner-coalesce-${Math.random().toString(36).slice(2)}`,
            watermark: { get: () => null, set: () => undefined, clear: () => undefined },
            deliver,
            pullPage: async (): Promise<PullPage<unknown>> => ({
                items: [],
                nextCursor: null,
                serverTime: null,
            }),
            applyRemote: async () => undefined,
            isOnline: () => true,
            getPrincipal: () => principal.current as string | null,
            foreignEntries: "hold",
            coalesce: true,
        });
        await sync.enqueue("update", "n1", { text: "A first" });
        await sync.enqueue("update", "n1", { text: "A second" });
        principal.current = "user-b";
        await sync.enqueue("update", "n1", { text: "B edit" });

        const summary = await sync.flush();

        expect(deliver).not.toHaveBeenCalled();
        expect(summary.held).toBe(2);
        expect(summary.deferred).toBe(1);
        expect(await sync.pendingCount()).toBe(3);
        sync.dispose();
    });
});
