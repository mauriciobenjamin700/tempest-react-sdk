import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NProgressBar, nprogress } from "./NProgress";

describe("nprogress controller", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        nprogress.set(0);
        nprogress.done();
        vi.advanceTimersByTime(400);
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it("start() makes state active with value > 0", () => {
        let captured = { value: 0, active: false };
        const unsubscribe = nprogress.subscribe((s) => (captured = s));
        act(() => nprogress.start());
        expect(captured.active).toBe(true);
        expect(captured.value).toBeGreaterThan(0);
        unsubscribe();
    });

    it("set(0.5) sets value to 0.5", () => {
        let captured = { value: 0, active: false };
        const unsubscribe = nprogress.subscribe((s) => (captured = s));
        act(() => nprogress.set(0.5));
        expect(captured.value).toBe(0.5);
        unsubscribe();
    });

    it("inc() raises value but never past the ceiling", () => {
        let captured = { value: 0, active: false };
        const unsubscribe = nprogress.subscribe((s) => (captured = s));
        act(() => nprogress.set(0.1));
        act(() => nprogress.inc(0.2));
        expect(captured.value).toBeCloseTo(0.3, 5);
        act(() => nprogress.set(0.85));
        act(() => nprogress.inc(0.2));
        expect(captured.value).toBeLessThanOrEqual(0.9);
        unsubscribe();
    });

    it("done() eventually becomes inactive", () => {
        let captured = { value: 0, active: false };
        const unsubscribe = nprogress.subscribe((s) => (captured = s));
        act(() => nprogress.start());
        act(() => nprogress.done());
        expect(captured.value).toBe(1);
        act(() => vi.advanceTimersByTime(400));
        expect(captured.active).toBe(false);
        unsubscribe();
    });
});

describe("NProgressBar", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        nprogress.set(0);
        nprogress.done();
        vi.advanceTimersByTime(400);
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it("renders nothing while inactive", () => {
        const { container } = render(<NProgressBar />);
        expect(container.querySelector('[role="progressbar"]')).toBeNull();
    });

    it("renders a bar when active", () => {
        render(<NProgressBar />);
        act(() => nprogress.set(0.5));
        const bar = screen.getByRole("progressbar");
        expect(bar).toBeInTheDocument();
        expect(bar).toHaveStyle({ width: "50%" });
        expect(bar).toHaveAttribute("aria-valuenow", "50");
    });
});

describe("nprogress controller — guards and clamping", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        nprogress.set(0);
        nprogress.done();
        vi.advanceTimersByTime(400);
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    /** Subscribe and expose the latest state plus the unsubscribe handle. */
    function watch() {
        let state = { value: 0, active: false };
        const unsubscribe = nprogress.subscribe((s) => (state = s));
        return { get: () => state, unsubscribe };
    }

    it("clamps set() into [0, 1]", () => {
        const w = watch();
        nprogress.set(-5);
        expect(w.get().value).toBe(0);
        nprogress.set(9);
        expect(w.get().value).toBe(1);
        w.unsubscribe();
    });

    it("set(1) leaves the bar inactive when it was not running", () => {
        const w = watch();
        nprogress.set(1);
        expect(w.get().active).toBe(false);
        w.unsubscribe();
    });

    it("set(<1) activates the bar", () => {
        const w = watch();
        nprogress.set(0.4);
        expect(w.get()).toEqual({ value: 0.4, active: true });
        w.unsubscribe();
    });

    it("a second start() is ignored while already running", () => {
        const w = watch();
        nprogress.start();
        const first = w.get().value;
        nprogress.start();
        expect(w.get().value).toBe(first);
        w.unsubscribe();
    });

    it("start() resumes from a value already set", () => {
        const w = watch();
        nprogress.set(0.5);
        nprogress.done();
        vi.advanceTimersByTime(400);
        nprogress.set(0.3);
        nprogress.start();
        expect(w.get().value).toBe(0.3);
        w.unsubscribe();
    });

    it("inc() is a no-op at the trickle ceiling and honours an explicit amount", () => {
        const w = watch();
        nprogress.set(0.95);
        nprogress.inc();
        expect(w.get().value).toBe(0.95);

        nprogress.set(0.1);
        nprogress.inc(0.2);
        expect(w.get().value).toBeCloseTo(0.3, 5);
        w.unsubscribe();
    });

    it("trickles automatically while running", () => {
        const w = watch();
        nprogress.start();
        const initial = w.get().value;
        vi.advanceTimersByTime(1000);
        expect(w.get().value).toBeGreaterThan(initial);
        w.unsubscribe();
    });

    it("done() cancels a pending hide when start() comes back first", () => {
        const w = watch();
        nprogress.start();
        nprogress.done();
        nprogress.start();
        vi.advanceTimersByTime(400);
        expect(w.get().active).toBe(true);
        w.unsubscribe();
    });

    it("stops notifying after unsubscribe", () => {
        const listener = vi.fn();
        const unsubscribe = nprogress.subscribe(listener);
        listener.mockClear();
        unsubscribe();
        nprogress.set(0.7);
        expect(listener).not.toHaveBeenCalled();
    });
});
