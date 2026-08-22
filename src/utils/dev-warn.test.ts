import { afterEach, describe, expect, it, vi } from "vitest";
import { isDev, resetDevWarnings, warnOnce } from "./dev-warn";

/**
 * What the shared dev-warning gate has to get right.
 *
 * Two properties, and both used to be wrong in one of the three call sites this
 * replaced: the mode has to be the *consumer's* (a gate resolved when the SDK
 * itself was built is frozen and never fires), and a warning has to print once
 * per key (an effect that re-runs on a dependency change would otherwise bury
 * the console in the same sentence).
 */
describe("dev-warn", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        vi.restoreAllMocks();
        resetDevWarnings();
    });

    it("reads the consumer's NODE_ENV, so a production build is not development", () => {
        process.env.NODE_ENV = "production";
        expect(isDev()).toBe(false);

        process.env.NODE_ENV = "development";
        expect(isDev()).toBe(true);
    });

    it("prints once per key, and again for a different key", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        warnOnce("a", "first");
        warnOnce("a", "first");
        warnOnce("b", "second");

        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenNthCalledWith(1, "first");
        expect(warn).toHaveBeenNthCalledWith(2, "second");
    });

    it("stays silent in production", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        process.env.NODE_ENV = "production";

        warnOnce("prod", "should not print");

        expect(warn).not.toHaveBeenCalled();
    });

    it("resets the latch, so a suite can assert the same warning twice", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        warnOnce("again", "message");
        resetDevWarnings();
        warnOnce("again", "message");

        expect(warn).toHaveBeenCalledTimes(2);
    });
});
