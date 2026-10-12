import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../http";
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

/**
 * Wired into `createApiClient`, the queue is told which token each `401` came
 * back for. Before 0.77.0 it was not, and measured with the queue alone: once a
 * refresh had issued `new`, a later call with `new` still in the store — now
 * expired, but the same string — skipped the refresh (`1` refresh for `2`
 * expiries), so the replay failed and `onUnauthorized` ended a healthy session.
 */
describe("createRefreshQueue — told which token failed", () => {
    it("refreshes again when the token the last refresh issued has expired", async () => {
        let token = "old";
        let issued = 0;
        const refresh = vi.fn(async () => {
            token = `new-${++issued}`;
        });
        const queue = createRefreshQueue(refresh, { getToken: () => token });

        await queue({ token: "old" });
        await queue({ token: "new-1" });

        expect(refresh).toHaveBeenCalledTimes(2);
        expect(token).toBe("new-2");
    });

    it("skips the refresh when the failed request carried a token already replaced", async () => {
        let token = "old";
        const refresh = vi.fn(async () => {
            token = "new";
        });
        const queue = createRefreshQueue(refresh, { getToken: () => token });

        await queue({ token: "old" });
        await queue({ token: "old" });

        expect(refresh).toHaveBeenCalledOnce();
    });

    it("keeps a healthy session alive across two access-token lifetimes through the client", async () => {
        let token = "t0";
        let rotations = 0;
        const valid = new Set<string>();
        const onUnauthorized = vi.fn();
        const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const bearer = ((init?.headers ?? {}) as Record<string, string>).Authorization;
            return valid.has(bearer ?? "")
                ? new Response("{}", { headers: { "content-type": "application/json" } })
                : new Response("{}", {
                      status: 401,
                      headers: { "content-type": "application/json" },
                  });
        });
        const refresh = createRefreshQueue(
            async () => {
                token = `t${++rotations}`;
                valid.clear();
                valid.add(`Bearer ${token}`);
            },
            { getToken: () => token },
        );
        const api = createApiClient({
            baseURL: "https://api.test",
            fetcher,
            getToken: () => token,
            refresh,
            onUnauthorized,
        });

        await api.get("/a");
        valid.clear();
        await api.get("/a");

        expect(rotations).toBe(2);
        expect(onUnauthorized).not.toHaveBeenCalled();
    });
});
