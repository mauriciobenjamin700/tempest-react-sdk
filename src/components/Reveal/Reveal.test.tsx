import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "./Reveal";
import { effectiveThreshold, reachableRatio } from "./reveal-threshold";

interface Observer {
    callback: IntersectionObserverCallback;
    options: IntersectionObserverInit | undefined;
    observe: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
}

let observers: Observer[] = [];

class IOMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    callback: IntersectionObserverCallback;
    options: IntersectionObserverInit | undefined;
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.callback = callback;
        this.options = options;
        observers.push(this);
    }
}

const VIEWPORT = { width: 1000, height: 800 };

/**
 * Build an observation of a box of `height` px whose top sits at `top` px in an
 * 800 px viewport, with the ratio a real browser would compute.
 */
function entryAt(top: number, height: number): IntersectionObserverEntry {
    const visible = Math.max(0, Math.min(top + height, VIEWPORT.height) - Math.max(top, 0));
    const rect = (y: number, h: number): DOMRectReadOnly =>
        ({
            x: 0,
            y,
            top: y,
            left: 0,
            width: VIEWPORT.width,
            height: h,
            right: VIEWPORT.width,
            bottom: y + h,
        }) as DOMRectReadOnly;
    return {
        isIntersecting: visible > 0,
        intersectionRatio: visible / height,
        boundingClientRect: rect(top, height),
        intersectionRect: rect(Math.max(top, 0), visible),
        rootBounds: rect(0, VIEWPORT.height),
        target: document.body,
        time: 0,
    } as IntersectionObserverEntry;
}

/** Deliver an observation to the newest live observer. */
function emit(entry: IntersectionObserverEntry): void {
    const live = observers.at(-1);
    if (!live) throw new Error("no observer");
    act(() => live.callback([entry], live as unknown as IntersectionObserver));
}

function stateOf(text: string): string | null {
    return screen.getByText(text).getAttribute("data-state");
}

describe("Reveal", () => {
    beforeEach(() => {
        observers = [];
        vi.stubGlobal("IntersectionObserver", IOMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("starts hidden off-screen and reveals when it enters the viewport", () => {
        render(<Reveal>Card</Reveal>);
        expect(stateOf("Card")).toBe("hidden");
        emit(entryAt(900, 200));
        expect(stateOf("Card")).toBe("hidden");
        emit(entryAt(600, 200));
        expect(stateOf("Card")).toBe("shown");
    });

    it("stops observing after the first reveal by default", () => {
        render(<Reveal>Card</Reveal>);
        const first = observers.at(-1);
        emit(entryAt(600, 200));
        expect(first?.disconnect).toHaveBeenCalled();
        expect(stateOf("Card")).toBe("shown");
    });

    it("stays shown once revealed even if a stale observation arrives", () => {
        render(<Reveal>Card</Reveal>);
        const first = observers.at(-1);
        emit(entryAt(600, 200));
        act(() => first?.callback([entryAt(2000, 200)], first as unknown as IntersectionObserver));
        expect(stateOf("Card")).toBe("shown");
    });

    it("with once={false} hides again only when fully out of view", () => {
        render(<Reveal once={false}>Card</Reveal>);
        emit(entryAt(600, 200));
        expect(stateOf("Card")).toBe("shown");
        emit(entryAt(790, 200));
        expect(stateOf("Card")).toBe("shown");
        emit(entryAt(900, 200));
        expect(stateOf("Card")).toBe("hidden");
    });

    it("reveals an element taller than the viewport despite a high threshold", () => {
        render(<Reveal threshold={0.5}>Tall</Reveal>);
        expect(observers.at(-1)?.options?.threshold).toBe(0.5);
        emit(entryAt(900, 2400));
        const rescaled = observers.at(-1)?.options?.threshold as number;
        expect(rescaled).toBeCloseTo(0.5 * (800 / 2400), 5);
        emit(entryAt(500, 2400));
        expect(stateOf("Tall")).toBe("hidden");
        emit(entryAt(400, 2400));
        expect(stateOf("Tall")).toBe("shown");
    });

    it("a raw ratio check would never reveal that element", () => {
        const best = entryAt(-800, 2400);
        expect(best.intersectionRatio).toBeLessThan(0.5);
        expect(best.intersectionRatio).toBeGreaterThanOrEqual(effectiveThreshold(0.5, best));
    });

    it("keeps content visible when IntersectionObserver does not exist", () => {
        vi.stubGlobal("IntersectionObserver", undefined);
        render(<Reveal>Fallback</Reveal>);
        expect(stateOf("Fallback")).toBe("static");
        expect(observers).toHaveLength(0);
    });

    it("renders visible markup on the server", () => {
        const html = renderToString(<Reveal>Server</Reveal>);
        expect(html).toContain('data-state="static"');
    });

    it("renders the requested element with variant, delay and duration", () => {
        render(
            <ul>
                <Reveal as="li" variant="left" delay={160} duration={600} style={{ color: "red" }}>
                    Step
                </Reveal>
            </ul>,
        );
        const item = screen.getByText("Step");
        expect(item.tagName).toBe("LI");
        expect(item.getAttribute("data-variant")).toBe("left");
        expect(item.style.getPropertyValue("--tempest-reveal-delay")).toBe("160ms");
        expect(item.style.getPropertyValue("--tempest-reveal-duration")).toBe("600ms");
        expect(item.style.color).toBe("red");
    });

    it("leaves timing to the motion tokens when no delay or duration is given", () => {
        render(<Reveal>Plain</Reveal>);
        const element = screen.getByText("Plain");
        expect(element.style.getPropertyValue("--tempest-reveal-delay")).toBe("");
        expect(element.getAttribute("data-variant")).toBe("up");
    });

    it("forwards rootMargin to the observer", () => {
        render(<Reveal rootMargin="0px 0px -10% 0px">Margin</Reveal>);
        expect(observers.at(-1)?.options?.rootMargin).toBe("0px 0px -10% 0px");
    });

    it("rescales a changed threshold against the geometry already observed", () => {
        const { rerender } = render(<Reveal threshold={0.5}>Card</Reveal>);
        emit(entryAt(900, 2400));
        rerender(<Reveal threshold={0.2}>Card</Reveal>);
        expect(observers.at(-1)?.options?.threshold).toBeCloseTo(0.2 / 3, 5);
    });
});

describe("Reveal stylesheet", () => {
    const css = readFileSync(join(__dirname, "Reveal.module.css"), "utf8");

    it("pins every state visible and static under reduced motion", () => {
        const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
        expect(block).toMatch(/\.reveal\[data-state\]\[data-variant\]\s*\{/);
        expect(block).toContain("opacity: 1;");
        expect(block).toContain("transform: none;");
        expect(block).toContain("transition: none;");
    });

    it("animates only into the shown state, so hiding on mount is instant", () => {
        const hidden = css.match(/\[data-state="hidden"\][^{]*\{[^}]*\}/g) ?? [];
        expect(hidden.length).toBeGreaterThan(0);
        for (const rule of hidden) expect(rule).not.toContain("transition");
        expect(css).toMatch(/\[data-state="shown"\]\s*\{[^}]*transition:/);
    });

    it("defaults timing to the motion tokens", () => {
        expect(css).toContain("var(--tempest-duration-slower)");
        expect(css).toContain("var(--tempest-ease-out)");
    });
});

describe("reachableRatio", () => {
    it("is 1 for a box that fits and the viewport share for a taller one", () => {
        expect(reachableRatio(entryAt(0, 200))).toBe(1);
        expect(reachableRatio(entryAt(0, 1600))).toBe(0.5);
    });

    it("is 1 when the root geometry is unknown", () => {
        const entry = { ...entryAt(0, 1600), rootBounds: null } as IntersectionObserverEntry;
        expect(reachableRatio(entry)).toBe(1);
        expect(effectiveThreshold(0.4, null)).toBe(0.4);
    });
});
