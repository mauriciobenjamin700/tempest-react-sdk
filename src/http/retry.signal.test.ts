import { describe, expect, it, vi } from "vitest";
import { retry } from "./retry";

describe("retry — signal", () => {
    it("rejects with AbortError when signal already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(
            retry(() => Promise.resolve(1), { signal: controller.signal }),
        ).rejects.toMatchObject({ name: "AbortError" });
    });

    it("invokes onRetry between attempts", async () => {
        const onRetry = vi.fn();
        let attempt = 0;
        await retry(
            async () => {
                attempt += 1;
                if (attempt < 2) throw new Error("again");
                return "ok";
            },
            { retries: 3, initialDelay: 1, onRetry },
        );
        expect(onRetry).toHaveBeenCalled();
    });
});
