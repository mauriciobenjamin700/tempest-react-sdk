import { useEffect } from "react";
import type { RefObject } from "react";

/** Elements that can take keyboard focus — shared with the portal tab order. */
export const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Trap keyboard focus inside `containerRef` while `active` is true. Cycles
 * Tab and Shift+Tab between the first and last focusable descendants. Pair
 * with Modal/Drawer for fully-accessible overlays.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
    useEffect(() => {
        if (!active) return;
        const container = containerRef.current;
        if (!container) return;

        const previouslyFocused = document.activeElement as HTMLElement | null;

        function getFocusable(): HTMLElement[] {
            return Array.from(
                container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
            ).filter((el) => {
                if (el.hasAttribute("aria-hidden")) return false;
                const style = typeof window !== "undefined" ? window.getComputedStyle(el) : null;
                if (style && (style.display === "none" || style.visibility === "hidden")) {
                    return false;
                }
                return true;
            });
        }

        /**
         * Keep `Tab` and `Shift+Tab` inside the container.
         *
         * A `Tab` already consumed is left alone: a portalled panel inside the
         * container (a `Popover`, say) routes its own `Tab` back next to its
         * trigger, and wrapping here as well would move focus a second time.
         */
        function handleKeydown(event: KeyboardEvent): void {
            if (event.key !== "Tab" || event.defaultPrevented) return;
            const elements = getFocusable();
            if (elements.length === 0) {
                event.preventDefault();
                return;
            }
            const first = elements[0]!;
            const last = elements[elements.length - 1]!;
            const current = document.activeElement as HTMLElement | null;
            if (event.shiftKey) {
                if (current === first || !current || !container?.contains(current)) {
                    event.preventDefault();
                    last.focus();
                }
            } else {
                if (current === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        }

        const focusable = getFocusable();
        focusable[0]?.focus();
        document.addEventListener("keydown", handleKeydown);
        return () => {
            document.removeEventListener("keydown", handleKeydown);
            previouslyFocused?.focus?.();
        };
    }, [containerRef, active]);
}
