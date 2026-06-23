import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce, memoizeOne, once, throttle } from "./functions";

describe("debounce", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("runs only once after the wait with the latest args", () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced("a");
        debounced("b");
        debounced("c");
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith("c");
    });

    it("resets the timer on each call", () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced("x");
        vi.advanceTimersByTime(80);
        debounced("y");
        vi.advanceTimersByTime(80);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(20);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith("y");
    });

    it("cancel clears the pending call", () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced("a");
        debounced.cancel();
        vi.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();
    });
});

describe("throttle", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("invokes immediately on the leading edge", () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled("a");
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith("a");
    });

    it("fires a trailing call with the latest args", () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled("a"); // leading
        throttled("b");
        throttled("c");
        expect(fn).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith("c");
    });

    it("allows another leading call after the window elapses", () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled("a");
        vi.advanceTimersByTime(100);
        throttled("b");
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith("b");
    });

    it("cancel drops the pending trailing call", () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled("a"); // leading
        throttled("b"); // pending trailing
        throttled.cancel();
        vi.advanceTimersByTime(200);
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

describe("once", () => {
    it("runs the function only once and caches the result", () => {
        const fn = vi.fn((n: number) => n * 2);
        const wrapped = once(fn);

        expect(wrapped(5)).toBe(10);
        expect(wrapped(99)).toBe(10);
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

describe("memoizeOne", () => {
    it("returns the cached result for equal args", () => {
        const fn = vi.fn((a: number, b: number) => a + b);
        const memo = memoizeOne(fn);

        expect(memo(1, 2)).toBe(3);
        expect(memo(1, 2)).toBe(3);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("recomputes when args change", () => {
        const fn = vi.fn((a: number, b: number) => a + b);
        const memo = memoizeOne(fn);

        expect(memo(1, 2)).toBe(3);
        expect(memo(2, 2)).toBe(4);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("recomputes when arity changes", () => {
        const fn = vi.fn((...args: number[]) => args.reduce((a, b) => a + b, 0));
        const memo = memoizeOne(fn);

        expect(memo(1, 2)).toBe(3);
        expect(memo(1, 2, 3)).toBe(6);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("uses Object.is semantics for comparison", () => {
        const fn = vi.fn((n: number) => n);
        const memo = memoizeOne(fn);

        expect(Number.isNaN(memo(NaN))).toBe(true);
        memo(NaN); // Object.is(NaN, NaN) === true → cached
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
