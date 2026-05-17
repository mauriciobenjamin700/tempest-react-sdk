import { useEffect, useRef } from "react";

type AnyEventTarget = EventTarget | { current: EventTarget | null } | null | undefined;

/**
 * Subscribe to a DOM event with React-friendly semantics.
 *
 * - Handler is stored in a ref so callers can pass inline functions without
 *   resubscribing on every render.
 * - `target` defaults to `window`. Accepts a raw `EventTarget` (window, document,
 *   element) OR a ref pointing at one.
 * - Returns nothing — cleanup is automatic on unmount or when `eventName`/`target` change.
 */
export function useEventListener<K extends keyof WindowEventMap>(
    eventName: K,
    handler: (event: WindowEventMap[K]) => void,
    target?: AnyEventTarget,
    options?: AddEventListenerOptions | boolean,
): void;
export function useEventListener<K extends keyof DocumentEventMap>(
    eventName: K,
    handler: (event: DocumentEventMap[K]) => void,
    target?: AnyEventTarget,
    options?: AddEventListenerOptions | boolean,
): void;
export function useEventListener<K extends keyof HTMLElementEventMap>(
    eventName: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    target?: AnyEventTarget,
    options?: AddEventListenerOptions | boolean,
): void;
export function useEventListener(
    eventName: string,
    handler: (event: Event) => void,
    target?: AnyEventTarget,
    options?: AddEventListenerOptions | boolean,
): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const resolvedTarget: EventTarget | null =
            target === undefined
                ? typeof window === "undefined"
                    ? null
                    : window
                : "current" in (target as { current: unknown })
                  ? ((target as { current: EventTarget | null }).current ?? null)
                  : (target as EventTarget | null);

        if (!resolvedTarget?.addEventListener) return;

        const listener: EventListener = (event) => handlerRef.current(event);
        resolvedTarget.addEventListener(eventName, listener, options);
        return () => resolvedTarget.removeEventListener(eventName, listener, options);
    }, [eventName, target, options]);
}
