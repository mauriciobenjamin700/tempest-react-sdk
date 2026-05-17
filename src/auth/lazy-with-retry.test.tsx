import { describe, expect, it, vi } from "vitest";
import { lazyWithRetry } from "./lazy-with-retry";

describe("lazyWithRetry", () => {
    it("returns a lazy component when factory succeeds", () => {
        const factory = vi.fn(() =>
            Promise.resolve({ default: function X() { return null; } }),
        );
        const Lazy = lazyWithRetry(factory);
        expect(typeof Lazy).toBe("object");
    });

    it("accepts options", () => {
        const factory = vi.fn(() =>
            Promise.resolve({ default: function X() { return null; } }),
        );
        const Lazy = lazyWithRetry(factory, {
            retries: 2,
            initialDelay: 10,
            reloadOnFinalFailure: false,
        });
        expect(typeof Lazy).toBe("object");
    });
});
