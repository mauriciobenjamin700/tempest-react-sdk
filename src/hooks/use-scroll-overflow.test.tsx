import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useScrollOverflow, type ScrollOverflowAxis } from "./use-scroll-overflow";

const observers: ObserverMock[] = [];

class ObserverMock {
    observed: Element[] = [];

    constructor(public callback: ResizeObserverCallback) {
        observers.push(this);
    }

    observe(target: Element) {
        this.observed.push(target);
    }

    unobserve() {}

    disconnect() {}

    /** Fire the callback the way a real resize would. */
    fire() {
        this.callback([], this as unknown as ResizeObserver);
    }
}

/**
 * jsdom performs no layout, so `scrollWidth` and `clientWidth` are always 0 and
 * nothing ever looks overflowing. These stubs stand in for the measurement the
 * browser would do.
 */
function stubBox({
    scrollWidth = 400,
    clientWidth = 400,
    scrollHeight = 400,
    clientHeight = 400,
}: Partial<Record<"scrollWidth" | "clientWidth" | "scrollHeight" | "clientHeight", number>>) {
    for (const [name, value] of Object.entries({
        scrollWidth,
        clientWidth,
        scrollHeight,
        clientHeight,
    })) {
        Object.defineProperty(HTMLElement.prototype, name, {
            configurable: true,
            get: () => value,
        });
    }
}

function stubWidths(scroll: number, client: number) {
    stubBox({ scrollWidth: scroll, clientWidth: client });
}

function Probe({ axis }: { axis?: ScrollOverflowAxis }) {
    const ref = useRef<HTMLDivElement>(null);
    const overflowing = useScrollOverflow(ref, axis);
    return (
        <div ref={ref} data-testid="box">
            <span data-testid="state">{String(overflowing)}</span>
        </div>
    );
}

const state = () => screen.getByTestId("state").textContent;

beforeEach(() => {
    observers.length = 0;
    Object.defineProperty(globalThis, "ResizeObserver", {
        writable: true,
        configurable: true,
        value: ObserverMock,
    });
});

afterEach(() => {
    for (const name of ["scrollWidth", "clientWidth", "scrollHeight", "clientHeight"]) {
        Reflect.deleteProperty(HTMLElement.prototype, name);
    }
});

describe("useScrollOverflow", () => {
    it("reports false when the content fits", () => {
        stubWidths(400, 400);
        render(<Probe axis="horizontal" />);
        expect(state()).toBe("false");
    });

    it("reports true when the content is wider than the box", () => {
        stubWidths(900, 400);
        render(<Probe axis="horizontal" />);
        expect(state()).toBe("true");
    });

    it("ignores a sub-pixel difference, which is rounding and not real overflow", () => {
        stubWidths(401, 400);
        render(<Probe axis="horizontal" />);
        expect(state()).toBe("false");
    });

    it("watches the box and its content — either one can change alone", () => {
        stubWidths(900, 400);
        render(<Probe axis="horizontal" />);
        expect(observers).toHaveLength(1);
        expect(observers[0].observed).toHaveLength(2);
    });

    it("re-measures when a resize fires", () => {
        stubWidths(400, 400);
        render(<Probe axis="horizontal" />);
        expect(state()).toBe("false");

        stubWidths(900, 400);
        act(() => observers[0].fire());
        expect(state()).toBe("true");
    });

    it("does not throw where ResizeObserver is missing", () => {
        Reflect.deleteProperty(globalThis, "ResizeObserver");
        stubWidths(900, 400);
        expect(() => render(<Probe axis="horizontal" />)).not.toThrow();
        // The first measurement still runs, it just never updates again.
        expect(state()).toBe("true");
    });
});

describe("useScrollOverflow — the axis", () => {
    it("ignores vertical overflow when only the horizontal axis is asked for", () => {
        stubBox({ scrollHeight: 2000, clientHeight: 200 });
        render(<Probe axis="horizontal" />);
        expect(state()).toBe("false");
    });

    it("ignores horizontal overflow when only the vertical axis is asked for", () => {
        stubBox({ scrollWidth: 2000, clientWidth: 200 });
        render(<Probe axis="vertical" />);
        expect(state()).toBe("false");
    });

    it("reports vertical overflow on the vertical axis", () => {
        stubBox({ scrollHeight: 2000, clientHeight: 200 });
        render(<Probe axis="vertical" />);
        expect(state()).toBe("true");
    });

    it("defaults to either axis", () => {
        stubBox({ scrollHeight: 2000, clientHeight: 200 });
        render(<Probe />);
        expect(state()).toBe("true");
    });
});
