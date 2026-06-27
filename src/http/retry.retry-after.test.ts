import { describe, it, expect, vi } from "vitest";

import { retry } from "./retry";

describe("retry — Retry-After", () => {
    it("uses error.retryAfter (seconds) as the delay, capped at maxDelay", async () => {
        const delays: number[] = [];
        let calls = 0;
        const factory = vi.fn(async () => {
            calls += 1;
            if (calls < 2) throw { status: 429, detail: "slow down", retryAfter: 5 };
            return "ok";
        });

        const result = await retry(factory, {
            retries: 3,
            maxDelay: 50,
            onRetry: ({ delay }) => delays.push(delay),
        });

        expect(result).toBe("ok");
        // 5s would be 5000ms but capped to maxDelay 50.
        expect(delays).toEqual([50]);
    });

    it("ignores retryAfter when respectRetryAfter is false", async () => {
        const delays: number[] = [];
        let calls = 0;
        const factory = vi.fn(async () => {
            calls += 1;
            if (calls < 2) throw { status: 429, detail: "slow", retryAfter: 5 };
            return "ok";
        });

        await retry(factory, {
            retries: 3,
            initialDelay: 10,
            maxDelay: 1000,
            respectRetryAfter: false,
            onRetry: ({ delay }) => delays.push(delay),
        });

        expect(delays).toEqual([10]); // exponential, not the 5s hint
    });
});
