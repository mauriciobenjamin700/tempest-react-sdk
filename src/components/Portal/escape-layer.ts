import { useEffect, useMemo, useRef } from "react";

/** One open layer that `Escape` can dismiss. */
interface EscapeLayer {
    /** Latest dismiss callback; `null` makes the layer swallow the key without closing. */
    current: (() => void) | null;
    /** Position in the stack: higher is more recently opened, or deeper in the tree. */
    order: number;
}

const stack: EscapeLayer[] = [];

let sequence = 0;

/**
 * The single `keydown` listener behind every layer.
 *
 * Dismisses only the top of the stack. Every overlay used to listen on `window`
 * and close on any `Escape`, so one key press closed everything open at once —
 * measured in Chrome, a `Modal` holding a `DropdownMenu`, `Combobox`,
 * `MultiSelect`, `Popover`, `ContextMenu`, editable `DataTable` cell or a second
 * `Modal` closed together with the inner layer in all seven cases, and a
 * `Drawer` closed with the `Popover` inside it.
 *
 * Two kinds of inner layer exist, and this covers both:
 *
 * - Layers that listen on `window` themselves can never see each other's
 *   events, so they register here and only the most recently opened one reacts.
 * - Layers that handle the key on their own element (a menu, a combobox input,
 *   an inline cell editor) run first — React's delegated listener sits below
 *   `window` — and call `preventDefault()`. A consumed key is left alone.
 *
 * A key pressed while an IME is composing belongs to the composition (it cancels
 * the candidate), so it is ignored too.
 *
 * @param event - The native keyboard event.
 * @returns Nothing.
 */
function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
    const top = stack.at(-1);
    if (!top) return;
    event.preventDefault();
    top.current?.();
}

/**
 * Register an overlay as an `Escape`-dismissable layer while it is open.
 *
 * Layers stack in the order they open, so the one opened last is dismissed
 * first, and a second `Escape` reaches the next one down. The callback is read
 * through a ref, so a new closure on every render does not move the layer in
 * the stack.
 *
 * Pass `null` as `onEscape` for a modal layer whose dismissal is turned off
 * (`closeOnEsc={false}`): it stays on the stack and swallows the key, instead of
 * letting it fall through and close the modal underneath.
 *
 * The position is taken when the layer **renders** open, not when its effect
 * runs. Effects run child-first, so a `Modal` that mounts already holding an open
 * inner `Modal` would register the inner one first and put the outer one on top —
 * `Escape` would close the wrong layer, or a locked inner modal would let the key
 * through to the outer one. Parents render before their children, so render
 * order is tree order within a commit and opening order across commits. A
 * discarded or doubled render (Strict Mode, concurrent rendering) only skips
 * numbers; the relative order stays.
 *
 * @param active - Whether the layer is currently open.
 * @param onEscape - What `Escape` does to this layer, or `null` to block only.
 * @returns Nothing.
 */
export function useEscapeLayer(active: boolean, onEscape: (() => void) | null): void {
    const order = useMemo(() => (active ? ++sequence : 0), [active]);
    const layer = useRef<EscapeLayer>({ current: onEscape, order });

    useEffect(() => {
        layer.current.current = onEscape;
    }, [onEscape]);

    useEffect(() => {
        if (!active) return;
        const entry = layer.current;
        entry.order = order;
        if (stack.length === 0) window.addEventListener("keydown", handleKeyDown);
        const index = stack.findIndex((other) => other.order > order);
        stack.splice(index === -1 ? stack.length : index, 0, entry);
        return () => {
            const index = stack.lastIndexOf(entry);
            if (index !== -1) stack.splice(index, 1);
            if (stack.length === 0) window.removeEventListener("keydown", handleKeyDown);
        };
    }, [active, order]);
}
