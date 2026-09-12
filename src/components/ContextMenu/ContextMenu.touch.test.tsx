import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

/**
 * The three ways this menu is reachable, and the geometry that keeps it on
 * screen.
 *
 * Touch has no right click. Measured in Chrome with touch emulation (Pixel 7 and
 * iPhone 13 profiles), a 900 ms hold on a plain element produces `pointerdown`,
 * `touchstart`, `pointerup`, `touchend`, `click` — and no `contextmenu`. So a
 * component that only listened for `contextmenu` put every action behind it out
 * of reach on a phone, silently: nothing errors, the menu simply never opens.
 */

const items = [
    { label: "Responder", onSelect: vi.fn() },
    { separator: true as const },
    { label: "Apagar", danger: true, onSelect: vi.fn() },
];

function renderMenu(props: Partial<Parameters<typeof ContextMenu>[0]> = {}) {
    return render(
        <ContextMenu items={items} {...props}>
            <div>alvo</div>
        </ContextMenu>,
    );
}

describe("ContextMenu — long press", () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("opens from a held touch, at the point that was held", () => {
        renderMenu();
        fireEvent.pointerDown(screen.getByText("alvo"), {
            pointerType: "touch",
            clientX: 40,
            clientY: 90,
        });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(500);
        });

        const menu = screen.getByRole("menu");
        expect(menu).toBeInTheDocument();
        expect(menu).toHaveStyle({ left: "40px", top: "90px" });
    });

    it("does not open from a held mouse button, which has its own gesture", () => {
        renderMenu();
        fireEvent.pointerDown(screen.getByText("alvo"), {
            pointerType: "mouse",
            clientX: 40,
            clientY: 90,
        });
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    /**
     * The detail that separates a usable long press from an infuriating one: a
     * scroll starts with a finger down on something, and every one of those
     * would open a menu without this.
     */
    it("cancels when the finger travels — that gesture is a scroll", () => {
        renderMenu();
        const target = screen.getByText("alvo");
        fireEvent.pointerDown(target, { pointerType: "touch", clientX: 40, clientY: 90 });
        fireEvent.pointerMove(target, { pointerType: "touch", clientX: 40, clientY: 130 });
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("survives a small wobble, which a finger always has", () => {
        renderMenu();
        const target = screen.getByText("alvo");
        fireEvent.pointerDown(target, { pointerType: "touch", clientX: 40, clientY: 90 });
        fireEvent.pointerMove(target, { pointerType: "touch", clientX: 43, clientY: 93 });
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("cancels when the finger lifts before the delay", () => {
        renderMenu();
        const target = screen.getByText("alvo");
        fireEvent.pointerDown(target, { pointerType: "touch", clientX: 40, clientY: 90 });
        fireEvent.pointerUp(target, { pointerType: "touch" });
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("is off when the delay is zero", () => {
        renderMenu({ longPressDelay: 0 });
        fireEvent.pointerDown(screen.getByText("alvo"), { pointerType: "touch" });
        act(() => {
            vi.advanceTimersByTime(3000);
        });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    /**
     * The hold fires while the finger is still down, so the browser goes on to
     * deliver the click to the same element. Opening the menu on a chat bubble
     * must not also open the bubble.
     */
    it("swallows the click the finger leaves behind", () => {
        const onClick = vi.fn();
        render(
            <ContextMenu items={items}>
                <button type="button" onClick={onClick}>
                    alvo
                </button>
            </ContextMenu>,
        );
        const target = screen.getByText("alvo");
        fireEvent.pointerDown(target, { pointerType: "touch", clientX: 10, clientY: 10 });
        act(() => {
            vi.advanceTimersByTime(500);
        });
        fireEvent.pointerUp(target, { pointerType: "touch" });
        fireEvent.click(target);
        expect(onClick).not.toHaveBeenCalled();

        fireEvent.click(target);
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});

describe("ContextMenu — trigger", () => {
    it("ignores a left click by default, which is the desktop behaviour", () => {
        renderMenu();
        fireEvent.click(screen.getByText("alvo"), { clientX: 10, clientY: 10 });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it('opens from a left click with trigger="click" — the ⋮ button case', () => {
        renderMenu({ trigger: "click" });
        fireEvent.click(screen.getByText("alvo"), { clientX: 12, clientY: 24 });
        expect(screen.getByRole("menu")).toHaveStyle({ left: "12px", top: "24px" });
    });

    it('trigger="click" drops the right click, so the gesture is unambiguous', () => {
        renderMenu({ trigger: "click" });
        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 10, clientY: 10 });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it('trigger="both" answers either button', () => {
        const { unmount } = renderMenu({ trigger: "both" });
        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 10, clientY: 10 });
        expect(screen.getByRole("menu")).toBeInTheDocument();
        unmount();

        renderMenu({ trigger: "both" });
        fireEvent.click(screen.getByText("alvo"), { clientX: 10, clientY: 10 });
        expect(screen.getByRole("menu")).toBeInTheDocument();
    });
});

describe("ContextMenu — viewport clamp", () => {
    /**
     * jsdom lays nothing out, so the size has to be supplied. The numbers are
     * the ones measured in a real browser before the clamp existed: a 180 px
     * menu opened at `x=235` in a 320 px window ran to 415 — 95 px off screen,
     * cutting the right edge off every label.
     *
     * It stubs `offsetWidth`/`offsetHeight` and not `getBoundingClientRect`
     * because that is what the clamp reads: the rect reports the transformed
     * box, and the menu enters at `scale(0.96)`.
     */
    function withMenuSize(width: number, height: number): () => void {
        const widthDescriptor = Object.getOwnPropertyDescriptor(
            HTMLElement.prototype,
            "offsetWidth",
        );
        const heightDescriptor = Object.getOwnPropertyDescriptor(
            HTMLElement.prototype,
            "offsetHeight",
        );
        const size = (value: number) => ({
            configurable: true,
            get(this: HTMLElement): number {
                return this.getAttribute("role") === "menu" ? value : 0;
            },
        });
        Object.defineProperty(HTMLElement.prototype, "offsetWidth", size(width));
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", size(height));
        return () => {
            if (widthDescriptor) {
                Object.defineProperty(HTMLElement.prototype, "offsetWidth", widthDescriptor);
            }
            if (heightDescriptor) {
                Object.defineProperty(HTMLElement.prototype, "offsetHeight", heightDescriptor);
            }
        };
    }

    let restore = (): void => {};

    beforeEach(() => {
        window.innerWidth = 320;
        window.innerHeight = 568;
        restore = withMenuSize(180, 200);
    });

    afterEach(() => {
        restore();
    });

    it("pulls a menu opened near the right edge back inside", () => {
        renderMenu();
        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 235, clientY: 100 });
        expect(screen.getByRole("menu")).toHaveStyle({ left: "132px" });
    });

    it("lifts a menu opened near the bottom edge", () => {
        renderMenu();
        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 10, clientY: 540 });
        expect(screen.getByRole("menu")).toHaveStyle({ top: "360px" });
    });

    it("leaves a menu that already fits exactly where it was opened", () => {
        renderMenu();
        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 20, clientY: 30 });
        expect(screen.getByRole("menu")).toHaveStyle({ left: "20px", top: "30px" });
    });

    it("keeps the margin when the menu is larger than the viewport", () => {
        restore();
        restore = withMenuSize(400, 900);
        renderMenu();
        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 300, clientY: 500 });
        expect(screen.getByRole("menu")).toHaveStyle({ left: "8px", top: "8px" });
    });
});

describe("ContextMenu — keyboard and dismissal", () => {
    it("takes focus when it opens, so a screen reader lands on the menu", () => {
        renderMenu();
        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 10, clientY: 10 });
        expect(document.activeElement).toBe(screen.getByRole("menu"));
    });

    it("jumps to the ends with Home and End", () => {
        renderMenu();
        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 10, clientY: 10 });
        fireEvent.keyDown(window, { key: "End" });
        expect(document.activeElement?.textContent).toContain("Apagar");
        fireEvent.keyDown(window, { key: "Home" });
        expect(document.activeElement?.textContent).toContain("Responder");
    });

    /**
     * The menu is positioned in viewport coordinates, so a page that scrolls
     * under it leaves it pointing at nothing.
     */
    it("closes on scroll and on resize", () => {
        renderMenu();
        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 10, clientY: 10 });
        fireEvent.scroll(window);
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();

        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 10, clientY: 10 });
        fireEvent(window, new Event("resize"));
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("does not trap arrow keys when every item is disabled", () => {
        render(
            <ContextMenu items={[{ label: "Só leitura", disabled: true }]}>
                <div>alvo</div>
            </ContextMenu>,
        );
        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 10, clientY: 10 });
        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(screen.getByRole("menu")).toBeInTheDocument();
    });
});
