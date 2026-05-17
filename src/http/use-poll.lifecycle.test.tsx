import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePoll } from "./use-poll";

describe("usePoll lifecycle", () => {
    it("stop() halts further polling", async () => {
        const factory = vi.fn().mockResolvedValue(1);
        const { result } = renderHook(() => usePoll(factory, { interval: 5 }));
        await waitFor(() => expect(factory).toHaveBeenCalled());
        act(() => result.current.stop());
        const calls = factory.mock.calls.length;
        await new Promise((r) => setTimeout(r, 30));
        expect(factory.mock.calls.length).toBe(calls);
    });

    it("stopWhen halts polling when predicate is true", async () => {
        let counter = 0;
        const factory = vi.fn(async () => ++counter);
        renderHook(() =>
            usePoll(factory, { interval: 5, stopWhen: (n: number) => n >= 2 }),
        );
        await waitFor(() => expect(factory.mock.calls.length).toBeGreaterThanOrEqual(2));
        const last = factory.mock.calls.length;
        await new Promise((r) => setTimeout(r, 30));
        expect(factory.mock.calls.length - last).toBeLessThanOrEqual(1);
    });
});
