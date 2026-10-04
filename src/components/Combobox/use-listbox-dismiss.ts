import { useCallback, useEffect, type FocusEvent, type MouseEvent, type RefObject } from "react";

/** Inputs of {@link useListboxDismiss}. */
export interface ListboxDismissOptions {
    /** Whether the list is open; nothing is listened to while it is closed. */
    open: boolean;
    /** The component's wrapper — a press inside it is not a press outside. */
    rootRef: RefObject<HTMLElement | null>;
    /** The list node, checked on its own because in a portal it lives outside `rootRef`. */
    listNode: HTMLElement | null;
    /** Closes the list. Keep it stable (`useCallback`), it is an effect dependency. */
    onDismiss: () => void;
}

/** Handlers {@link useListboxDismiss} hands back to wire on the input and the list. */
export interface ListboxDismissHandlers {
    /** `onBlur` of the combobox input. */
    onInputBlur: (event: FocusEvent<HTMLInputElement>) => void;
    /** `onMouseDown` of the list element. */
    onListMouseDown: (event: MouseEvent<HTMLElement>) => void;
}

/**
 * Keeps focus on the input when a press lands anywhere on the list — an option,
 * the empty message, the padding or the scrollbar.
 *
 * @param event - The `mousedown` on the list.
 */
function keepInputFocus(event: MouseEvent<HTMLElement>): void {
    event.preventDefault();
}

/**
 * Closes the list of an input-driven listbox (`Combobox`, `MultiSelect`) when the
 * user leaves it, by pointer or by keyboard.
 *
 * Pointer: a press outside both the wrapper and the list closes it. The list is
 * checked on its own because in a portal it is not inside the wrapper.
 *
 * Keyboard: the list closes when focus moves from the input to an element outside
 * the list. Before this (#430, measured in Chromium headless on `main`), `Tab` and
 * `Shift+Tab` took focus to the neighbouring control and left the list open on top
 * of it — `aria-expanded="true"` on a field that no longer had focus — until a
 * press outside or `Escape` on the input, which no longer received keys. A blur
 * whose `relatedTarget` is `null` (focus went to a non-focusable spot or out of
 * the page) is left to the pointer rule, so a press on the label or the helper
 * text keeps behaving as a press inside.
 *
 * A press on the list calls `preventDefault()`, so it never blurs the input: the
 * option's handler runs with focus still on the field, and a press on the empty
 * message or the scrollbar no longer drops focus to `<body>`.
 *
 * @param options - See {@link ListboxDismissOptions}.
 * @returns The input `onBlur` and the list `onMouseDown` handlers.
 */
export function useListboxDismiss({
    open,
    rootRef,
    listNode,
    onDismiss,
}: ListboxDismissOptions): ListboxDismissHandlers {
    useEffect(() => {
        if (!open) return;
        const onDown = (event: globalThis.MouseEvent): void => {
            const target = event.target as Node;
            if (rootRef.current?.contains(target) || listNode?.contains(target)) return;
            onDismiss();
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open, rootRef, listNode, onDismiss]);

    const onInputBlur = useCallback(
        (event: FocusEvent<HTMLInputElement>): void => {
            const next = event.relatedTarget;
            if (!open || !(next instanceof Node) || listNode?.contains(next)) return;
            onDismiss();
        },
        [open, listNode, onDismiss],
    );

    return { onInputBlur, onListMouseDown: keepInputFocus };
}
