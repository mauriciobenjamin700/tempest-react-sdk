import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A shard whose network request fails.
 *
 * The chunk is fetched at runtime, so this is an ordinary outcome — an offline
 * tab, a deploy that rotated hashed filenames, a flaky connection. It must leave
 * the app rendering fallbacks rather than surfacing an unhandled rejection.
 *
 * `attempts` counts calls so a test can prove the retries happened, and
 * `failUntil` lets one flip the shard from failing to healthy mid-test.
 */
const state = { attempts: 0, failUntil: Number.POSITIVE_INFINITY };

vi.mock("./generated/loaders", () => ({
    iconShards: [
        {
            id: "shard-00",
            from: "save",
            size: 1,
            load: () => {
                state.attempts += 1;
                if (state.attempts <= state.failUntil) {
                    return Promise.reject(new Error("network"));
                }
                return Promise.resolve({ default: { save: (() => null) as never } });
            },
        },
    ],
}));

/**
 * Drive one `loadIcon` to completion with the retry backoff faked out.
 *
 * The real delays are 100 ms and 400 ms; waiting them out in five tests would add
 * 2.5 s to the suite for no extra coverage.
 *
 * @param load - The module's `loadIcon`.
 * @param slug - Slug to load.
 */
async function settle(load: (slug: string) => Promise<void>, slug: string): Promise<void> {
    const promise = load(slug);
    await vi.runAllTimersAsync();
    await promise;
}

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    state.attempts = 0;
    state.failUntil = Number.POSITIVE_INFINITY;
});

afterEach(() => {
    vi.useRealTimers();
});

describe("shard-cache — a shard that fails to load", () => {
    it("resolves instead of rejecting", async () => {
        const { loadIcon } = await import("./shard-cache");
        const promise = loadIcon("save");
        await vi.runAllTimersAsync();
        await expect(promise).resolves.toBeUndefined();
    });

    it("leaves the slug unresolved so `Icon` keeps rendering its fallback", async () => {
        const { loadIcon, peekIcon } = await import("./shard-cache");
        await settle(loadIcon, "save");
        expect(peekIcon("save")).toBeUndefined();
    });

    it("retries twice before giving up", async () => {
        const { loadIcon } = await import("./shard-cache");
        await settle(loadIcon, "save");
        expect(state.attempts).toBe(3);
    });

    it("keeps the icon once a retry succeeds", async () => {
        state.failUntil = 1;
        const { loadIcon, iconStatus, peekIcon } = await import("./shard-cache");
        await settle(loadIcon, "save");
        expect(peekIcon("save")).toBeTypeOf("function");
        expect(iconStatus("save")).toBe("ready");
    });

    it("reports `error`, not `missing` — a 404 chunk is not a typo", async () => {
        const { iconStatus, loadIcon } = await import("./shard-cache");
        expect(iconStatus("save")).toBe("loading");
        await settle(loadIcon, "save");
        expect(iconStatus("save")).toBe("error");
    });

    it("hands the failure to a subscriber", async () => {
        const { loadIcon, subscribeToIconErrors } = await import("./shard-cache");
        const onError = vi.fn();
        const unsubscribe = subscribeToIconErrors(onError);
        await settle(loadIcon, "save");
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0]).toMatchObject({
            shard: "shard-00",
            slug: "save",
            attempts: 3,
        });
        expect(onError.mock.calls[0][0].error).toBeInstanceOf(Error);
        unsubscribe();
    });

    it("stops reporting after unsubscribe", async () => {
        const { loadIcon, subscribeToIconErrors } = await import("./shard-cache");
        const onError = vi.fn();
        subscribeToIconErrors(onError)();
        await settle(loadIcon, "save");
        expect(onError).not.toHaveBeenCalled();
    });

    it("warns in dev when nobody subscribed, so the failure is never silent", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { loadIcon } = await import("./shard-cache");
        await settle(loadIcon, "save");
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('icon shard "shard-00" failed to load');
        warn.mockRestore();
    });

    it("stays quiet on the console once an app subscribed", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { loadIcon, subscribeToIconErrors } = await import("./shard-cache");
        const unsubscribe = subscribeToIconErrors(() => undefined);
        await settle(loadIcon, "save");
        expect(warn).not.toHaveBeenCalled();
        unsubscribe();
        warn.mockRestore();
    });

    it("does not re-fetch during the cooldown, so a dead chunk cannot loop", async () => {
        const { loadIcon } = await import("./shard-cache");
        await settle(loadIcon, "save");
        expect(state.attempts).toBe(3);
        await settle(loadIcon, "save");
        expect(state.attempts).toBe(3);
    });

    it("tries again once the cooldown is over", async () => {
        const { loadIcon } = await import("./shard-cache");
        await settle(loadIcon, "save");
        vi.spyOn(performance, "now").mockReturnValue(performance.now() + 11_000);
        await settle(loadIcon, "save");
        expect(state.attempts).toBe(6);
        vi.mocked(performance.now).mockRestore();
    });

    it("notifies subscribers so a mounted Icon re-renders and shows its fallback", async () => {
        const { loadIcon, subscribeToIcons } = await import("./shard-cache");
        const listener = vi.fn();
        const unsubscribe = subscribeToIcons(listener);
        await settle(loadIcon, "save");
        expect(listener).toHaveBeenCalled();
        unsubscribe();
    });

    it("stops notifying after unsubscribe", async () => {
        const { loadIcon, subscribeToIcons } = await import("./shard-cache");
        const listener = vi.fn();
        subscribeToIcons(listener)();
        await settle(loadIcon, "save");
        expect(listener).not.toHaveBeenCalled();
    });
});
