import { describe, expect, it, vi } from "vitest";
import { createRefreshQueue } from "./refresh-queue";

describe("createRefreshQueue error", () => {
    it("clears the in-flight promise after rejection", async () => {
        let attempts = 0;
        const refresh = vi.fn(async () => {
            attempts += 1;
            if (attempts === 1) throw new Error("boom");
        });
        const queue = createRefreshQueue(refresh);
        await expect(queue()).rejects.toThrow("boom");
        // next call should fire refresh again, not reuse the previous one
        await queue();
        expect(refresh).toHaveBeenCalledTimes(2);
    });
});
