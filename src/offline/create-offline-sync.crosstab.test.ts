import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createOfflineSync,
    type OfflineSync,
    type OfflineSyncConfig,
    type PullPage,
    type WatermarkStore,
} from "./create-offline-sync";

interface Dto {
    id: string;
}

function memoryWatermark(): WatermarkStore {
    let value: string | null = null;
    return {
        get: () => value,
        set: (next) => {
            value = next;
        },
        clear: () => {
            value = null;
        },
    };
}

const engines: OfflineSync<unknown>[] = [];

function makeSync(
    channelName: string,
    overrides: Partial<OfflineSyncConfig<{ id: string }, Dto>> = {},
) {
    const config: OfflineSyncConfig<{ id: string }, Dto> = {
        databaseName: `db-${Math.random().toString(36).slice(2)}`,
        broadcastChannelName: channelName,
        watermark: memoryWatermark(),
        crossTab: true,
        deliver: vi.fn(async () => undefined),
        pullPage: vi.fn(
            async (): Promise<PullPage<Dto>> => ({
                items: [],
                nextCursor: null,
                serverTime: null,
            }),
        ),
        applyRemote: vi.fn(async () => undefined),
        ...overrides,
    };
    const sync = createOfflineSync(config);
    engines.push(sync as OfflineSync<unknown>);
    return sync;
}

function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = (): void => {
            if (predicate()) return resolve();
            if (Date.now() - start > timeoutMs) return reject(new Error("timeout"));
            setTimeout(tick, 5);
        };
        tick();
    });
}

afterEach(() => {
    for (const sync of engines.splice(0)) sync.dispose();
});

describe("createOfflineSync — cross-tab", () => {
    it("propagates state changes to another engine on the same channel", async () => {
        const channelName = `ch-${Math.random().toString(36).slice(2)}`;
        const tabA = makeSync(channelName);
        const tabB = makeSync(channelName);

        await tabA.enqueue("create", "r1", { id: "r1" });

        await waitFor(() => tabB.getState().pending === 1);
        expect(tabB.getState().pending).toBe(1);
    });

    it("stops receiving updates after dispose", async () => {
        const channelName = `ch-${Math.random().toString(36).slice(2)}`;
        const tabA = makeSync(channelName);
        const tabB = makeSync(channelName);

        tabB.dispose();
        await tabA.enqueue("create", "r1", { id: "r1" });
        await new Promise((r) => setTimeout(r, 50));
        expect(tabB.getState().pending).toBe(0);
    });
});
