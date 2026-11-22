import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RelativeTime } from "./RelativeTime";

describe("RelativeTime", () => {
    it("renders a <time> element with dateTime and text", () => {
        const date = new Date(Date.now() - 90_000);
        const { container } = render(<RelativeTime date={date} />);
        const el = container.querySelector("time");

        expect(el).toBeTruthy();
        expect(el?.getAttribute("dateTime")).toBe(date.toISOString());
        expect(el?.textContent?.length).toBeGreaterThan(0);
    });

    it("respects the en locale", () => {
        const date = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const { container } = render(<RelativeTime date={date} locale="en" />);
        expect(container.querySelector("time")?.textContent).toContain("ago");
    });
});

describe("RelativeTime — keeping time", () => {
    const START = new Date("2026-11-22T10:00:00Z");

    afterEach(() => {
        vi.useRealTimers();
    });

    it("stays frozen without now or updateEvery, which is what the two props are for", () => {
        vi.useFakeTimers();
        vi.setSystemTime(START);
        const { container } = render(<RelativeTime date={START} />);
        act(() => {
            vi.advanceTimersByTime(5 * 60_000);
        });
        expect(container.textContent).toBe("agora há pouco");
    });

    it("counts on its own with updateEvery", () => {
        vi.useFakeTimers();
        vi.setSystemTime(START);
        const { container } = render(<RelativeTime date={START} updateEvery={15_000} />);
        expect(container.textContent).toBe("agora há pouco");
        act(() => {
            vi.advanceTimersByTime(4 * 60_000);
        });
        expect(container.textContent).toBe("4 min atrás");
    });

    it("renders against the app's now and runs no timer of its own", () => {
        vi.useFakeTimers();
        vi.setSystemTime(START);
        const { container, rerender } = render(
            <RelativeTime date={START} now={START.getTime() + 2 * 60_000} updateEvery={1_000} />,
        );
        expect(container.textContent).toBe("2 min atrás");
        expect(vi.getTimerCount()).toBe(0);
        rerender(<RelativeTime date={START} now={new Date(START.getTime() + 3 * 3_600_000)} />);
        expect(container.textContent).toBe("3 horas atrás");
    });

    it("stops its timer on unmount", () => {
        vi.useFakeTimers();
        const { unmount } = render(<RelativeTime date={START} updateEvery={10_000} />);
        expect(vi.getTimerCount()).toBe(1);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
        "treats updateEvery=%s as off",
        (updateEvery) => {
            vi.useFakeTimers();
            render(<RelativeTime date={START} updateEvery={updateEvery} />);
            expect(vi.getTimerCount()).toBe(0);
        },
    );
});
