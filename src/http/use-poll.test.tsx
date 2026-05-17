import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePoll } from "./use-poll";

describe("usePoll", () => {
    it("fetches on mount", async () => {
        const factory = vi.fn().mockResolvedValue(42);
        const { result } = renderHook(() => usePoll(factory, { interval: 100_000 }));
        await waitFor(() => expect(result.current.data).toBe(42));
        expect(factory).toHaveBeenCalled();
    });

    it("does not fetch when disabled", () => {
        const factory = vi.fn().mockResolvedValue(1);
        renderHook(() => usePoll(factory, { interval: 100_000, disabled: true }));
        expect(factory).not.toHaveBeenCalled();
    });

    it("calls onError on rejected factory", async () => {
        const factory = vi.fn().mockRejectedValue(new Error("boom"));
        const onError = vi.fn();
        renderHook(() =>
            usePoll(factory, { interval: 100_000, onError }),
        );
        await waitFor(() => expect(onError).toHaveBeenCalled());
    });
});
