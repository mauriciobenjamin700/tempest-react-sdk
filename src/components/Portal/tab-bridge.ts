import { useEffect } from "react";
import { FOCUSABLE_SELECTOR } from "@/hooks/use-focus-trap";

/** Options of {@link usePortalTabOrder}. */
export interface PortalTabOrderOptions {
    /** Whether the panel is open and portalled. */
    enabled: boolean;
    /** Wrapper of the trigger — the spot in the page the panel belongs to. */
    anchor: HTMLElement | null;
    /** The portalled panel. */
    panel: HTMLElement | null;
}

/**
 * The elements `Tab` can stop on inside `root`, in document order.
 *
 * @param root - Where to look.
 * @returns The tabbable descendants that are not disabled, hidden or removed
 * from the tab order.
 */
function tabbables(root: ParentNode): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
        if (el.tabIndex < 0 || el.hasAttribute("aria-hidden")) return false;
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
    });
}

/**
 * Put a portalled panel back in the tab order, right after its trigger.
 *
 * A portal moves the panel to the end of `body`, so the browser's own order goes
 * from the trigger straight to whatever follows it in the page and reaches the
 * panel last, if ever. Measured in Chrome on a `Popover` holding two inputs:
 * in flow, `Tab` from the open trigger landed on the first input; in a portal it
 * skipped the panel and went to the next button of the page.
 *
 * While the panel is open, this restores the in-flow order:
 *
 * - `Tab` on the last stop of the anchor enters the panel's first stop.
 * - `Tab` on the panel's last stop leaves to the first stop after the anchor.
 * - `Shift+Tab` on the panel's first stop returns to the anchor.
 * - `Shift+Tab` on the first stop after the anchor enters the panel's last stop.
 *
 * Listened on `document` in the capture phase and marked consumed, so it runs
 * before an enclosing `Modal`'s focus trap, which skips a consumed `Tab`.
 *
 * @param options - Whether it is active, the anchor and the panel.
 * @returns Nothing.
 */
export function usePortalTabOrder({ enabled, anchor, panel }: PortalTabOrderOptions): void {
    useEffect(() => {
        if (!enabled || !anchor || !panel) return;

        const move = (event: KeyboardEvent, target: HTMLElement | undefined): void => {
            if (!target) return;
            event.preventDefault();
            target.focus();
        };

        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key !== "Tab" || event.defaultPrevented) return;
            const inPanel = tabbables(panel);
            if (inPanel.length === 0) return;
            const active = document.activeElement as HTMLElement | null;
            if (!active) return;
            const page = tabbables(document).filter((el) => !panel.contains(el));
            const inAnchor = page.filter((el) => anchor.contains(el));
            const lastOfAnchor = inAnchor.at(-1);
            const afterAnchor = lastOfAnchor ? page[page.indexOf(lastOfAnchor) + 1] : undefined;

            if (panel.contains(active)) {
                if (!event.shiftKey && active === inPanel.at(-1)) move(event, afterAnchor);
                if (event.shiftKey && active === inPanel[0]) move(event, lastOfAnchor);
                return;
            }
            if (!event.shiftKey && active === lastOfAnchor) move(event, inPanel[0]);
            if (event.shiftKey && afterAnchor && active === afterAnchor) {
                move(event, inPanel.at(-1));
            }
        };

        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, [enabled, anchor, panel]);
}
