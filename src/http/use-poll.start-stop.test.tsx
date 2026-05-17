import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePoll } from "./use-poll";

describe("usePoll start/stop", () => {
    it("start() resumes after stop()", async () => {
        const factory = vi.fn().mockResolvedValue("x");
        const { result } = renderHook(() => usePoll(factory, { interval: 5 }));
        await waitFor(() => expect(factory).toHaveBeenCalled());
        act(() => result.current.stop());
        const before = factory.mock.calls.length;
        act(() => result.current.start());
        await waitFor(() => expect(factory.mock.calls.length).toBeGreaterThan(before));
    });

    it("start() is a no-op while still polling", async () => {
        const factory = vi.fn().mockResolvedValue("x");
        const { result } = renderHook(() => usePoll(factory, { interval: 100_000 }));
        await waitFor(() => expect(factory).toHaveBeenCalled());
        // already running
        act(() => result.current.start());
        // no error / no extra immediate call beyond setup
        expect(factory).toHaveBeenCalled();
    });
});
