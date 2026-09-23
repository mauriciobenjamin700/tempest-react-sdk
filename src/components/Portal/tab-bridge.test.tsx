import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePortalTabOrder } from "./tab-bridge";

interface Page {
    anchor: HTMLDivElement;
    trigger: HTMLButtonElement;
    next: HTMLButtonElement;
    panel: HTMLDivElement;
    first: HTMLInputElement;
    last: HTMLInputElement;
}

/**
 * Build a page shaped like a portalled overlay: the trigger's wrapper, the next
 * stop of the page after it, and the panel appended at the end of `body`.
 *
 * @param withNext - Whether the page has a tab stop after the anchor.
 * @returns The elements of the page.
 */
function buildPage(withNext = true): Page {
    const anchor = document.createElement("div");
    const trigger = document.createElement("button");
    trigger.textContent = "trigger";
    anchor.append(trigger);
    const next = document.createElement("button");
    next.textContent = "next";
    const panel = document.createElement("div");
    const first = document.createElement("input");
    const last = document.createElement("input");
    panel.append(first, last);
    document.body.append(anchor);
    if (withNext) document.body.append(next);
    document.body.append(panel);
    return { anchor, trigger, next, panel, first, last };
}

/**
 * Press `Tab` on an element and report whether the bridge consumed it.
 *
 * @param target - Where the key is pressed.
 * @param shiftKey - Whether `Shift` is held.
 * @returns Whether `preventDefault()` was called.
 */
function pressTab(target: HTMLElement, shiftKey = false): boolean {
    target.focus();
    const event = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey,
        bubbles: true,
        cancelable: true,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("usePortalTabOrder", () => {
    it("walks trigger → panel → next stop, and back with Shift+Tab", () => {
        const page = buildPage();
        renderHook(() =>
            usePortalTabOrder({ enabled: true, anchor: page.anchor, panel: page.panel }),
        );

        expect(pressTab(page.trigger)).toBe(true);
        expect(document.activeElement).toBe(page.first);

        expect(pressTab(page.last)).toBe(true);
        expect(document.activeElement).toBe(page.next);

        expect(pressTab(page.first, true)).toBe(true);
        expect(document.activeElement).toBe(page.trigger);

        expect(pressTab(page.next, true)).toBe(true);
        expect(document.activeElement).toBe(page.last);
    });

    it("leaves Tab between two stops of the panel to the browser", () => {
        const page = buildPage();
        renderHook(() =>
            usePortalTabOrder({ enabled: true, anchor: page.anchor, panel: page.panel }),
        );
        expect(pressTab(page.first)).toBe(false);
        expect(pressTab(page.last, true)).toBe(false);
    });

    it("lets Tab out of the panel go on when nothing follows the anchor", () => {
        const page = buildPage(false);
        renderHook(() =>
            usePortalTabOrder({ enabled: true, anchor: page.anchor, panel: page.panel }),
        );
        expect(pressTab(page.last)).toBe(false);
    });

    it("skips stops that are hidden, aria-hidden or out of the tab order", () => {
        const page = buildPage();
        page.first.style.display = "none";
        const invisible = document.createElement("input");
        invisible.style.visibility = "hidden";
        const muted = document.createElement("input");
        muted.setAttribute("aria-hidden", "true");
        const removed = document.createElement("input");
        removed.tabIndex = -1;
        page.panel.prepend(invisible, muted, removed);
        renderHook(() =>
            usePortalTabOrder({ enabled: true, anchor: page.anchor, panel: page.panel }),
        );

        expect(pressTab(page.trigger)).toBe(true);
        expect(document.activeElement).toBe(page.last);
    });

    it("does nothing for a panel with no tab stop", () => {
        const page = buildPage();
        page.panel.replaceChildren(document.createElement("span"));
        renderHook(() =>
            usePortalTabOrder({ enabled: true, anchor: page.anchor, panel: page.panel }),
        );
        expect(pressTab(page.trigger)).toBe(false);
    });

    it("ignores other keys and a Tab someone else already consumed", () => {
        const page = buildPage();
        renderHook(() =>
            usePortalTabOrder({ enabled: true, anchor: page.anchor, panel: page.panel }),
        );

        page.trigger.focus();
        const other = new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
        });
        page.trigger.dispatchEvent(other);
        expect(other.defaultPrevented).toBe(false);

        const consumed = new KeyboardEvent("keydown", {
            key: "Tab",
            bubbles: true,
            cancelable: true,
        });
        consumed.preventDefault();
        page.trigger.dispatchEvent(consumed);
        expect(document.activeElement).toBe(page.trigger);
    });

    it("stays out of the way while disabled and after unmount", () => {
        const page = buildPage();
        const { rerender, unmount } = renderHook(
            ({ enabled }: { enabled: boolean }) =>
                usePortalTabOrder({ enabled, anchor: page.anchor, panel: page.panel }),
            { initialProps: { enabled: false } },
        );
        expect(pressTab(page.trigger)).toBe(false);

        rerender({ enabled: true });
        expect(pressTab(page.trigger)).toBe(true);

        unmount();
        expect(pressTab(page.trigger)).toBe(false);
    });

    it("does nothing without an anchor or a panel", () => {
        const page = buildPage();
        renderHook(() => usePortalTabOrder({ enabled: true, anchor: null, panel: page.panel }));
        renderHook(() => usePortalTabOrder({ enabled: true, anchor: page.anchor, panel: null }));
        expect(pressTab(page.trigger)).toBe(false);
    });
});
