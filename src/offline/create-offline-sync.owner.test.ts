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

function makeSync(principal: { current: unknown }, databaseName?: string) {
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
});
