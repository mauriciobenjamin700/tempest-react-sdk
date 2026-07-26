import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A shard whose network request fails.
 *
 * The chunk is fetched at runtime, so this is an ordinary outcome — an offline
 * tab, a deploy that rotated hashed filenames, a flaky connection. It must leave
 * the app rendering fallbacks rather than surfacing an unhandled rejection.
 */
vi.mock("./generated/loaders", () => ({
    shardLoaders: {
        s: () => Promise.reject(new Error("network")),
    },
}));

beforeEach(() => {
    vi.resetModules();
});

describe("shard-cache — a shard that fails to load", () => {
    it("resolves instead of rejecting", async () => {
        const { loadIcon } = await import("./shard-cache");
        await expect(loadIcon("save")).resolves.toBeUndefined();
    });

    it("leaves the slug unresolved so `Icon` keeps rendering its fallback", async () => {
        const { loadIcon, peekIcon } = await import("./shard-cache");
        await loadIcon("save");
        expect(peekIcon("save")).toBeUndefined();
    });

    it("stops reporting the slug as loading once the attempt settled", async () => {
        const { iconStatus, loadIcon } = await import("./shard-cache");
        expect(iconStatus("save")).toBe("loading");
        await loadIcon("save");
        expect(iconStatus("save")).toBe("missing");
    });

    it("notifies subscribers so a mounted Icon re-renders and shows its fallback", async () => {
        const { loadIcon, subscribeToIcons } = await import("./shard-cache");
        const listener = vi.fn();
        const unsubscribe = subscribeToIcons(listener);
        await loadIcon("save");
        expect(listener).toHaveBeenCalled();
        unsubscribe();
    });

    it("stops notifying after unsubscribe", async () => {
        const { loadIcon, subscribeToIcons } = await import("./shard-cache");
        const listener = vi.fn();
        subscribeToIcons(listener)();
        await loadIcon("save");
        expect(listener).not.toHaveBeenCalled();
    });
});
