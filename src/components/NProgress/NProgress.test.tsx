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
