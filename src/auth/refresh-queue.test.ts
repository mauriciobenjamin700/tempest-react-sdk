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

describe("createRefreshQueue — already-refreshed detection", () => {
    it("skips a refresh whose work another caller already did", async () => {
        let token = "old";
        const refresh = vi.fn(async () => {
            token = "new";
        });
        const queue = createRefreshQueue(refresh, { getToken: () => token });

        await queue();
        expect(refresh).toHaveBeenCalledOnce();

        // Sequential call, nothing in flight to join. Without the guard this
        // would rotate a token that is already fresh.
        await queue();
        expect(refresh).toHaveBeenCalledOnce();
    });

    it("refreshes again once the token it issued is gone", async () => {
        let token = "old";
        let issued = 0;
        const refresh = vi.fn(async () => {
            token = `new-${++issued}`;
        });
        const queue = createRefreshQueue(refresh, { getToken: () => token });

        await queue();
        expect(refresh).toHaveBeenCalledOnce();

        token = "expired-again";
        await queue();
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("collapses a staggered burst of 401s into one refresh", async () => {
        // The failures do not arrive inside one window: each awaits a tick, so
        // the later ones find no in-flight promise to share. This is the case
        // in-flight dedup alone does not cover.
        let token = "old";
        const refresh = vi.fn(async () => {
            token = "new";
        });
        const queue = createRefreshQueue(refresh, { getToken: () => token });

        for (let i = 0; i < 20; i++) {
            await Promise.resolve();
            await queue();
        }

        expect(refresh).toHaveBeenCalledOnce();
    });

    it("keeps refreshing per call when no getToken is supplied", async () => {
        const refresh = vi.fn(async () => {});
        const queue = createRefreshQueue(refresh);

        await queue();
        await queue();

        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("treats a null token as absent rather than as an issued value", async () => {
        let token: string | null = null;
        const refresh = vi.fn(async () => {
            token = null;
        });
        const queue = createRefreshQueue(refresh, { getToken: () => token });

        await queue();
        await queue();

        // A refresh that installs nothing must not latch the queue shut.
        expect(refresh).toHaveBeenCalledTimes(2);
    });
});
