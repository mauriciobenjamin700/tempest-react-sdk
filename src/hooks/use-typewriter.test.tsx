import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTypewriter } from "./use-typewriter";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useTypewriter", () => {
    it("starts empty and reveals one character per tick", () => {
        const { result } = renderHook(() => useTypewriter("abc", 10));
        expect(result.current.displayedText).toBe("");
        expect(result.current.isComplete).toBe(false);

        act(() => void vi.advanceTimersByTime(10));
        expect(result.current.displayedText).toBe("a");

        act(() => void vi.advanceTimersByTime(10));
        expect(result.current.displayedText).toBe("ab");
    });

    it("completes and stops ticking", () => {
        const { result } = renderHook(() => useTypewriter("ab", 10));

        act(() => void vi.advanceTimersByTime(50));
        expect(result.current.displayedText).toBe("ab");
        expect(result.current.isComplete).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("skip reveals the rest immediately", () => {
        const { result } = renderHook(() => useTypewriter("hello", 10));

        act(() => void vi.advanceTimersByTime(10));
        expect(result.current.displayedText).toBe("h");

        act(() => result.current.skip());
        expect(result.current.displayedText).toBe("hello");
        expect(result.current.isComplete).toBe(true);
    });

    it("renders instantly when speedMs is zero or negative", () => {
        const { result } = renderHook(() => useTypewriter("instant", 0));
        expect(result.current.displayedText).toBe("instant");
        expect(result.current.isComplete).toBe(true);

        const negative = renderHook(() => useTypewriter("instant", -1));
        expect(negative.result.current.displayedText).toBe("instant");
    });

    it("restarts from empty when the text changes, with no full-text flash", () => {
        const { result, rerender } = renderHook(({ text }) => useTypewriter(text, 10), {
            initialProps: { text: "one" },
        });

        act(() => void vi.advanceTimersByTime(50));
        expect(result.current.displayedText).toBe("one");

        rerender({ text: "two" });
        // The reset lands in the same render pass — never "two" in full first.
        expect(result.current.displayedText).toBe("");
        expect(result.current.isComplete).toBe(false);

        act(() => void vi.advanceTimersByTime(10));
        expect(result.current.displayedText).toBe("t");
    });

    it("treats an empty string as complete without scheduling a timer", () => {
        const { result } = renderHook(() => useTypewriter("", 10));
        expect(result.current.displayedText).toBe("");
        expect(result.current.isComplete).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("treats a nullish text as empty", () => {
        const { result } = renderHook(() => useTypewriter(undefined as unknown as string, 10));
        expect(result.current.displayedText).toBe("");
        expect(result.current.isComplete).toBe(true);
    });

    it("clears its interval on unmount", () => {
        const { unmount } = renderHook(() => useTypewriter("long enough", 10));
        expect(vi.getTimerCount()).toBe(1);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("picks up a new speed mid-reveal", () => {
        const { result, rerender } = renderHook(({ speed }) => useTypewriter("abcd", speed), {
            initialProps: { speed: 100 },
        });

        act(() => void vi.advanceTimersByTime(100));
        expect(result.current.displayedText).toBe("a");

        rerender({ speed: 0 });
        expect(result.current.displayedText).toBe("abcd");
    });
});
