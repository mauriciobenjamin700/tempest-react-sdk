import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useQueue } from "./use-queue";

describe("useQueue", () => {
    it("starts empty by default", () => {
        const { result } = renderHook(() => useQueue<number>());
        expect(result.current.queue).toEqual([]);
        expect(result.current.size).toBe(0);
    });

    it("respects initial values and limit", () => {
        const { result } = renderHook(() =>
            useQueue<number>({ initialValues: [1, 2, 3], limit: 2 }),
        );
        expect(result.current.queue).toEqual([1, 2]);
        expect(result.current.size).toBe(2);
    });

    it("add appends in FIFO order", () => {
        const { result } = renderHook(() => useQueue<number>());
        act(() => result.current.add(1, 2));
        act(() => result.current.add(3));
        expect(result.current.queue).toEqual([1, 2, 3]);
    });

    it("holds overflow beyond limit and surfaces it on cleanQueue", () => {
        const { result } = renderHook(() => useQueue<number>({ limit: 2 }));
        act(() => result.current.add(1, 2, 3, 4));
        expect(result.current.queue).toEqual([1, 2]);
        act(() => result.current.cleanQueue());
        expect(result.current.queue).toEqual([3, 4]);
        act(() => result.current.cleanQueue());
        expect(result.current.queue).toEqual([]);
    });

    it("update maps the visible queue", () => {
        const { result } = renderHook(() => useQueue<number>({ initialValues: [1, 2] }));
        act(() => result.current.update((state) => state.map((n) => n * 10)));
        expect(result.current.queue).toEqual([10, 20]);
    });
});
