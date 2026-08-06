import { describe, expect, it, vi } from "vitest";
import { lazyWithRetry } from "./lazy-with-retry";

describe("lazyWithRetry final failure", () => {
    it("invokes window.location.reload after exhausting retries", async () => {
        const factory = vi.fn().mockRejectedValue(new Error("chunk"));
        const reload = vi.fn();
        const originalLocation = window.location;
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { reload, href: originalLocation.href },
        });
        const Lazy = lazyWithRetry(factory, {
            retries: 2,
            initialDelay: 1,
            reloadOnFinalFailure: true,
        });
        const inner = (Lazy as unknown as { _payload: { _result: () => Promise<unknown> } })
            ._payload;

        await expect(inner._result()).rejects.toThrow("chunk");

        expect(factory).toHaveBeenCalledTimes(2);
        expect(reload).toHaveBeenCalled();
        Object.defineProperty(window, "location", {
            configurable: true,
            value: originalLocation,
        });
    });
});
