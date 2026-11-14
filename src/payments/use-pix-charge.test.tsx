import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PixCharge } from "./types";
import { usePixCharge } from "./use-pix-charge";

const CHARGE: PixCharge = {
    provider: "mercado_pago",
    provider_charge_id: "ORDTST01",
    reference: "order-1042",
    amount_cents: 10964,
    currency: "BRL",
    status: "pending",
    provider_status: "action_required",
    br_code: "00020101021226...6304ABCD",
    qr_code_base64: null,
    qr_code_image_url: null,
    end_to_end_id: null,
    expires_at: null,
    paid_at: null,
};

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

async function advance(ms: number): Promise<void> {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

describe("usePixCharge", () => {
    it("polls the app's refresh until the backend says paid, then stops", async () => {
        const answers: PixCharge[] = [
            CHARGE,
            { ...CHARGE, status: "paid", provider_status: "processed" },
        ];
        const refresh = vi.fn(() => Promise.resolve(answers.shift() ?? CHARGE));
        const { result } = renderHook(() => usePixCharge(CHARGE, { refresh, intervalMs: 1000 }));
        expect(refresh).not.toHaveBeenCalled();
        await advance(1000);
        expect(result.current.charge.status).toBe("pending");
        await advance(1000);
        expect(result.current.charge.status).toBe("paid");
        await advance(5000);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("never starts the next read before the previous one settled", async () => {
        let inflight = 0;
        let peak = 0;
        const refresh = vi.fn(async () => {
            inflight += 1;
            peak = Math.max(peak, inflight);
            await new Promise((resolve) => setTimeout(resolve, 3000));
            inflight -= 1;
            return CHARGE;
        });
        renderHook(() => usePixCharge(CHARGE, { refresh, intervalMs: 1000 }));
        await advance(10_000);
        expect(peak).toBe(1);
        expect(refresh.mock.calls.length).toBeGreaterThan(1);
    });

    it("keeps the last charge on a failed read, exposes the error, and keeps polling", async () => {
        const refresh = vi
            .fn<(signal: AbortSignal) => Promise<PixCharge>>()
            .mockRejectedValueOnce(new Error("502"))
            .mockResolvedValueOnce({ ...CHARGE, status: "expired" });
        const { result } = renderHook(() => usePixCharge(CHARGE, { refresh, intervalMs: 1000 }));
        await advance(1000);
        expect(result.current.error?.message).toBe("502");
        expect(result.current.charge.status).toBe("pending");
        await advance(1000);
        expect(result.current.error).toBeNull();
        expect(result.current.charge.status).toBe("expired");
    });

    it("wraps a non-Error rejection", async () => {
        const refresh = vi.fn(() => Promise.reject("boom"));
        const { result } = renderHook(() => usePixCharge(CHARGE, { refresh, intervalMs: 1000 }));
        await advance(1000);
        expect(result.current.error?.message).toBe("boom");
    });

    it("ignores an update for another charge", async () => {
        const refresh = vi.fn(() =>
            Promise.resolve({ ...CHARGE, provider_charge_id: "OTHER", status: "paid" as const }),
        );
        const { result } = renderHook(() => usePixCharge(CHARGE, { refresh, intervalMs: 1000 }));
        await advance(1000);
        expect(result.current.charge.status).toBe("pending");
    });

    it("does not move a paid charge back to pending on an out-of-order delivery", () => {
        let emit: (charge: PixCharge) => void = () => undefined;
        const subscribe = (next: (charge: PixCharge) => void) => {
            emit = next;
            return () => undefined;
        };
        const { result } = renderHook(() => usePixCharge(CHARGE, { subscribe }));
        act(() => emit({ ...CHARGE, status: "paid" }));
        act(() => emit({ ...CHARGE, status: "pending" }));
        expect(result.current.charge.status).toBe("paid");
        act(() => emit({ ...CHARGE, status: "refunded" }));
        expect(result.current.charge.status).toBe("refunded");
    });

    it("unsubscribes and aborts the in-flight read on unmount", async () => {
        const unsubscribe = vi.fn();
        let seen: AbortSignal | undefined;
        const refresh = vi.fn((signal: AbortSignal) => {
            seen = signal;
            return new Promise<PixCharge>(() => undefined);
        });
        const { unmount } = renderHook(() =>
            usePixCharge(CHARGE, { refresh, subscribe: () => unsubscribe, intervalMs: 1000 }),
        );
        await advance(1000);
        unmount();
        expect(unsubscribe).toHaveBeenCalledOnce();
        expect(seen?.aborted).toBe(true);
    });

    it("does not poll a charge that is already final", async () => {
        const refresh = vi.fn(() => Promise.resolve(CHARGE));
        renderHook(() =>
            usePixCharge({ ...CHARGE, status: "paid" }, { refresh, intervalMs: 1000 }),
        );
        await advance(5000);
        expect(refresh).not.toHaveBeenCalled();
    });

    it("restarts from the new charge when the app passes another one", async () => {
        const refresh = vi.fn(() => Promise.resolve({ ...CHARGE, status: "expired" as const }));
        const { result, rerender } = renderHook(
            ({ charge }) => usePixCharge(charge, { refresh, intervalMs: 1000 }),
            {
                initialProps: { charge: CHARGE },
            },
        );
        await advance(1000);
        expect(result.current.charge.status).toBe("expired");
        const next: PixCharge = { ...CHARGE, provider_charge_id: "ORDTST02" };
        rerender({ charge: next });
        expect(result.current.charge).toEqual(next);
        expect(result.current.error).toBeNull();
    });

    it("drops a read that resolves after unmount", async () => {
        let resolve: (charge: PixCharge) => void = () => undefined;
        const refresh = vi.fn(
            () =>
                new Promise<PixCharge>((done) => {
                    resolve = done;
                }),
        );
        const { result, unmount } = renderHook(() =>
            usePixCharge(CHARGE, { refresh, intervalMs: 1000 }),
        );
        await advance(1000);
        unmount();
        await act(async () => {
            resolve({ ...CHARGE, status: "paid" });
            await Promise.resolve();
        });
        expect(result.current.charge.status).toBe("pending");
    });

    it("stops polling when the app drops refresh, and drops a failure that lands after unmount", async () => {
        let reject: (reason: unknown) => void = () => undefined;
        const refresh = vi.fn(
            () =>
                new Promise<PixCharge>((_resolve, fail) => {
                    reject = fail;
                }),
        );
        const { result, unmount } = renderHook(() =>
            usePixCharge(CHARGE, { refresh, intervalMs: 1000 }),
        );
        await advance(1000);
        unmount();
        await act(async () => {
            reject(new Error("late"));
            await Promise.resolve();
        });
        expect(result.current.error).toBeNull();

        const once = vi.fn(() => Promise.resolve(CHARGE));
        const { rerender } = renderHook(
            ({ source }: { source?: (signal: AbortSignal) => Promise<PixCharge> }) =>
                usePixCharge(CHARGE, { refresh: source, intervalMs: 1000 }),
            {
                initialProps: { source: once } as {
                    source?: (signal: AbortSignal) => Promise<PixCharge>;
                },
            },
        );
        rerender({ source: undefined });
        await advance(3000);
        expect(once).not.toHaveBeenCalled();
    });
});
