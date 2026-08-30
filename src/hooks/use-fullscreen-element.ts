import { useEffect, useState } from "react";

/**
 * Vendor-prefixed fullscreen member of `document`, still shipped by WebKit.
 *
 * Declared optional on purpose: the standard property is what every other engine
 * answers to, and Safari is the only reason the second read exists.
 */
interface WebkitFullscreenDocument {
    webkitFullscreenElement?: Element | null;
}

/**
 * Read the element the browser is presenting fullscreen, standard property first.
 *
 * A plain function rather than a hook, because two very different callers need
 * the answer: `useFullscreenElement` below, which turns it into state, and the
 * action callbacks of `useFullscreen`, which need the value *at call time* and
 * cannot wait for a render to have happened since the last change.
 *
 * @returns The element being presented fullscreen, or `null` — including in any
 * environment without a `document` (a service worker, a build plugin, a Node
 * test), where the SDK must not throw.
 */
export function getFullscreenElement(): Element | null {
    if (typeof document === "undefined") return null;
    const prefixed = document as Document & WebkitFullscreenDocument;
    return document.fullscreenElement ?? prefixed.webkitFullscreenElement ?? null;
}

/**
 * Track the element the browser is presenting fullscreen.
 *
 * The SDK's single subscription to `fullscreenchange` (and WebKit's
 * `webkitfullscreenchange`). Two features need exactly this fact and would
 * otherwise each carry their own copy of the prefix dance: `usePortalHost` asks
 * *where do I mount* — the fullscreen element paints its own subtree and nothing
 * else, so a dialog portalled to `document.body` is invisible while fullscreen is
 * on — and `useFullscreen` asks *is my element the one presented*. One
 * subscription, two questions.
 *
 * The event is the source of truth rather than the return of `requestFullscreen`
 * / `exitFullscreen`, because `Esc`, the browser's own exit affordance and F11
 * leave fullscreen without ever passing through those calls.
 *
 * The first value is resolved during render rather than in the effect, so a
 * consumer that mounts while fullscreen is already active is correct in its very
 * first commit instead of correcting itself one frame later.
 *
 * @returns The fullscreen element, or `null` when nothing is presented.
 */
export function useFullscreenElement(): Element | null {
    const [element, setElement] = useState<Element | null>(getFullscreenElement);

    useEffect(() => {
        const sync = (): void => setElement(getFullscreenElement());
        sync();
        document.addEventListener("fullscreenchange", sync);
        document.addEventListener("webkitfullscreenchange", sync);
        return () => {
            document.removeEventListener("fullscreenchange", sync);
            document.removeEventListener("webkitfullscreenchange", sync);
        };
    }, []);

    return element;
}
