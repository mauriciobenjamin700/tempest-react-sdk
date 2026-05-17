import { describe, expect, it, vi } from "vitest";
import { retry } from "./retry";

describe("retry", () => {
    it("returns the resolved value on first attempt", async () => {
        const fn = vi.fn().mockResolvedValue(42);
        await expect(retry(fn, { retries: 3 })).resolves.toBe(42);
        expect(fn).toHaveBeenCalledOnce();
    });

    it("retries until success", async () => {
        let attempt = 0;
        const fn = vi.fn(async () => {
            attempt += 1;
            if (attempt < 3) throw new Error("boom");
            return "ok";
        });
        await expect(retry(fn, { retries: 5, initialDelay: 1 })).resolves.toBe("ok");
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it("throws the last error when retries are exhausted", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("nope"));
        await expect(retry(fn, { retries: 3, initialDelay: 1 })).rejects.toThrow("nope");
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it("stops when shouldRetry returns false", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("4xx"));
        await expect(
            retry(fn, { retries: 5, initialDelay: 1, shouldRetry: () => false }),
        ).rejects.toThrow("4xx");
        expect(fn).toHaveBeenCalledOnce();
    });
});
