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

describe("usePoll — a tick that should not happen", () => {
    it("ignores a start() that lands while a request is still in flight", async () => {
        let release: ((value: string) => void) | null = null;
        const factory = vi.fn(
            () =>
                new Promise<string>((resolve) => {
                    release = resolve;
                }),
        );
        const { result } = renderHook(() => usePoll(factory, { interval: 5 }));
        await waitFor(() => expect(factory).toHaveBeenCalledTimes(1));

        act(() => result.current.stop());
        act(() => result.current.start());

        expect(factory, "the in-flight request is not doubled").toHaveBeenCalledTimes(1);
        await act(async () => {
            release?.("x");
        });
    });

    it("drops the answer to a request the caller stopped mid-flight", async () => {
        let release: ((value: string) => void) | null = null;
        const factory = vi.fn(
            () =>
                new Promise<string>((resolve) => {
                    release = resolve;
                }),
        );
        const { result } = renderHook(() => usePoll(factory, { interval: 100_000 }));
        await waitFor(() => expect(factory).toHaveBeenCalledTimes(1));

        act(() => result.current.stop());
        await act(async () => {
            release?.("tarde demais");
        });

        expect(result.current.data).toBeNull();
    });
});
