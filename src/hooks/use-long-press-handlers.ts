import { useCallback, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";

/**
 * DOM event handlers produced by {@link useLongPressHandlers}, ready to spread
 * onto a JSX element (`<div {...handlers}>`).
 */
export interface LongPressHandlers {
    /** Starts the hold timer on mouse press. */
    onMouseDown: (event: ReactMouseEvent) => void;
    /** Cancels the pending hold when the mouse is released. */
    onMouseUp: () => void;
    /** Cancels the pending hold when the pointer leaves the element. */
    onMouseLeave: () => void;
    /** Starts the hold timer on touch start. */
    onTouchStart: (event: ReactTouchEvent) => void;
    /** Cancels the pending hold when the touch ends. */
    onTouchEnd: () => void;
    /** Cancels the pending hold when the finger moves. */
    onTouchMove: () => void;
    /** Fires the long-press immediately (desktop right-click parity). */
    onContextMenu: (event: ReactMouseEvent) => void;
}

/** Options accepted by {@link useLongPressHandlers}. */
export interface UseLongPressHandlersOptions {
    /** Hold duration in ms before `onLongPress` fires. Defaults to `500`. */
    delayMs?: number;
    /** When `true`, the hook is inert and every handler is a no-op. */
    disabled?: boolean;
}

/** Return shape of {@link useLongPressHandlers}. */
export type UseLongPressHandlersResult = LongPressHandlers & {
    /**
     * Reads whether the most recent interaction fired a long-press. Use it in
     * the element's `onClick` to suppress the click that follows a long-press.
     */
    wasLongPress: () => boolean;
};

/**
 * Returns DOM event handlers that detect a long press (touch or mouse hold)
 * and invoke `onLongPress` once after `delayMs`.
 *
 * Cancels on touch movement or pointer release. Also wires `contextmenu` to
 * fire `onLongPress` immediately so a right-click on desktop opens selection
 * mode the same way an Android long-press does on mobile.
 *
 * The hook does not `preventDefault` on the underlying click — the consumer
 * decides whether the subsequent click should still fire. Track that with the
 * returned `wasLongPress()` guard to tell "long-press fired" apart from a
 * "regular click".
 *
 * Unlike {@link useLongPress}, which attaches pointer listeners to a `ref`,
 * this variant returns handler props you spread directly onto an element and
 * exposes a `wasLongPress()` guard.
 *
 * @param onLongPress - Callback invoked once the hold threshold is reached.
 * @param options - Optional `delayMs` and `disabled` flags.
 * @returns The spreadable handlers plus a `wasLongPress()` guard.
 *
 * @example
 * const longPress = useLongPressHandlers(() => enterSelectionMode(), { delayMs: 600 });
 * <button {...longPress} onClick={() => { if (!longPress.wasLongPress()) navigate(); }}>
 *   Item
 * </button>
 */
export function useLongPressHandlers(
    onLongPress: () => void,
    options: UseLongPressHandlersOptions = {},
): UseLongPressHandlersResult {
    const { delayMs = 500, disabled = false } = options;
    const timerRef = useRef<number | null>(null);
    const firedRef = useRef<boolean>(false);
    const callbackRef = useRef<() => void>(onLongPress);
    callbackRef.current = onLongPress;

    const clear = useCallback((): void => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const start = useCallback((): void => {
        if (disabled) return;
        firedRef.current = false;
        clear();
        timerRef.current = window.setTimeout(() => {
            firedRef.current = true;
            callbackRef.current();
        }, delayMs);
    }, [disabled, clear, delayMs]);

    const onContextMenu = useCallback(
        (event: ReactMouseEvent): void => {
            if (disabled) return;
            event.preventDefault();
            firedRef.current = true;
            callbackRef.current();
        },
        [disabled],
    );

    return {
        onMouseDown: start,
        onMouseUp: clear,
        onMouseLeave: clear,
        onTouchStart: start,
        onTouchEnd: clear,
        onTouchMove: clear,
        onContextMenu,
        wasLongPress: () => firedRef.current,
    };
}
