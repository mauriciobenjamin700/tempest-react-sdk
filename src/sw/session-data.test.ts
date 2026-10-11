import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installBackgroundSync } from "./background-sync";
import { clearSessionData } from "./session-data";

class FakeCacheStorage {
    names = new Set<string>();
    async keys(): Promise<string[]> {
        return [...this.names];
    }
    async delete(name: string): Promise<boolean> {
        return this.names.delete(name);
    }
}

let storage: FakeCacheStorage;

beforeEach(() => {
    storage = new FakeCacheStorage();
    vi.stubGlobal("caches", storage);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function countQueue(name: string): Promise<number> {
    return new Promise((resolve) => {
        const open = indexedDB.open(name, 1);
        open.onupgradeneeded = () =>
            open.result.createObjectStore("requests", { keyPath: "id", autoIncrement: true });
        open.onsuccess = () => {
            const db = open.result;
            const req = db.transaction("requests").objectStore("requests").count();
            req.onsuccess = () => {
                resolve(req.result);
                db.close();
            };
        };
    });
}

describe("clearSessionData", () => {
    it("deletes every runtime cache, whatever its name, and keeps the app-shell precache", async () => {
        storage.names = new Set(["api", "tempest-api", "media", "tempest-precache-abc123"]);
        const result = await clearSessionData();
        expect(result.caches.sort()).toEqual(["api", "media", "tempest-api"]);
        expect(await storage.keys()).toEqual(["tempest-precache-abc123"]);
        expect(result.queueCleared).toBe(true);
    });

    it("empties the background-sync queue a previous session filled", async () => {
        const listeners: ((event: unknown) => void)[] = [];
        vi.stubGlobal("addEventListener", (type: string, listener: (event: unknown) => void) => {
            if (type === "fetch") listeners.push(listener);
        });
        vi.stubGlobal("registration", {});
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
        installBackgroundSync({ queueName: "session-data-q" });

        let produced: Promise<Response> | undefined;
        listeners[0]?.({
            request: new Request("https://app.test/api/x", { method: "POST", body: "x" }),
            respondWith: (r: Promise<Response>) => (produced = r),
            waitUntil: () => undefined,
        });
        await produced?.catch(() => undefined);
        expect(await countQueue("session-data-q")).toBe(1);

        await clearSessionData({ queueName: "session-data-q" });
        expect(await countQueue("session-data-q")).toBe(0);
    });

    it("honours a narrower cache filter", async () => {
        storage.names = new Set(["tempest-api", "media"]);
        const result = await clearSessionData({ caches: "tempest-" });
        expect(result.caches).toEqual(["tempest-api"]);
        expect(await storage.keys()).toEqual(["media"]);
    });
});
