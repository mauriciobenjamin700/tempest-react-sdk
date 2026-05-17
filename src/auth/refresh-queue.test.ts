import { describe, expect, it, vi } from "vitest";
import { createRefreshQueue } from "./refresh-queue";

describe("createRefreshQueue", () => {
    it("dedupes concurrent calls into a single in-flight promise", async () => {
        let resolveInner!: () => void;
        const refresh = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveInner = resolve;
                }),
        );
        const queue = createRefreshQueue(refresh);

        const a = queue();
        const b = queue();
        const c = queue();
        expect(refresh).toHaveBeenCalledOnce();

        resolveInner();
        await Promise.all([a, b, c]);
    });

    it("allows a new refresh after the previous one resolves", async () => {
        const refresh = vi.fn().mockResolvedValue(undefined);
        const queue = createRefreshQueue(refresh);
        await queue();
        await queue();
        expect(refresh).toHaveBeenCalledTimes(2);
    });
});
