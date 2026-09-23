import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { tabRegion, tabSequence } from "./tab-sequence";

export { FOCUSABLE_SELECTOR } from "./tab-sequence";

/** One armed trap; the identity is what the stack compares. */
interface TrapEntry {
    container: HTMLElement;
}

const stack: TrapEntry[] = [];

/**
 * Trap keyboard focus inside `containerRef` while `active` is true.
 *
 * - **On activation** focus moves to the first tab stop, or to the container
 *   itself when it has none (give it `tabIndex={-1}`). Content that already put
 *   focus inside — an `autoFocus` input — is left where it is.
 * - **`Tab` / `Shift+Tab`** wrap between the first and the last stop, and pull
 *   focus back in when it sits outside.
 * - **On release** focus returns to the element that held it when the trap
 *   armed. That element is read during the render that arms the trap, before
 *   React commits: an `autoFocus` child takes focus in the commit, ahead of any
 *   effect, and reading it there would "restore" to the child that is about to
 *   unmount — which dropped focus on `body` in `Command`.
 *
 * **Portalled panels stay reachable.** A `Popover` or `HoverCard` opened from
 * inside the container renders at the end of `body`, outside it. Those panels
 * register themselves (see `usePortalTabOrder`), and the trap treats them as
 * part of the container, spliced right after their trigger. A `Tab` another
 * layer already consumed is not moved again, unless it moved focus out of the
 * container and its panels — the portal bridge leaving the last panel stop for
 * whatever follows the trap in the page.
 *
 * **Traps stack.** Only the most recent active trap handles `Tab`, so a modal
 * opened over another owns the keyboard until it closes, and then hands focus
 * back to the element it was opened from, inside the one below.
 *
 * The listener is on `document` in the bubble phase, after React's own
 * handlers: a menu that closes on `Tab` and returns focus to its trigger has
 * already done so when the trap looks at where focus is.
 *
 * @param containerRef - The element focus is confined to.
 * @param active - Whether the trap is armed.
 * @returns Nothing.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
    const [armed, setArmed] = useState(false);
    const [opener, setOpener] = useState<HTMLElement | null>(null);
    if (active !== armed) {
        setArmed(active);
        if (active && typeof document !== "undefined") {
            setOpener(document.activeElement as HTMLElement | null);
        }
    }

    useEffect(() => {
        if (!active) return;
        const container = containerRef.current;
        if (!container) return;

        const entry: TrapEntry = { container };
        stack.push(entry);

        if (!container.contains(document.activeElement)) {
            (tabSequence(container)[0] ?? container).focus();
        }

        const handleKeydown = (event: KeyboardEvent): void => {
            if (event.key !== "Tab" || stack.at(-1) !== entry) return;
            const sequence = tabSequence(container);
            const first = sequence[0];
            const last = sequence.at(-1);
            const current = document.activeElement as HTMLElement | null;
            const inside =
                current !== null && tabRegion(container).some((root) => root.contains(current));

            if (event.defaultPrevented) {
                if (!inside) ((event.shiftKey ? last : first) ?? container).focus();
                return;
            }
            if (!first || !last) {
                event.preventDefault();
                container.focus();
                return;
            }
            const atEnd = event.shiftKey
                ? current === first || current === container
                : current === last;
            if (!inside || atEnd) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
        };

        document.addEventListener("keydown", handleKeydown);
        return () => {
            document.removeEventListener("keydown", handleKeydown);
            stack.splice(stack.indexOf(entry), 1);
            if (opener?.isConnected) opener.focus();
        };
    }, [containerRef, active, opener]);
}
