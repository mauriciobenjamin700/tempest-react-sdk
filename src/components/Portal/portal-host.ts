import { useEffect, useState } from "react";

/**
 * The element a portal should render into.
 *
 * `document.body` is the obvious answer and the wrong one while the page is in
 * fullscreen: the browser paints only the subtree of the fullscreen element, and
 * `body` is outside it. An overlay portalled there exists in the DOM, has a
 * measured box, and is neither visible nor clickable — `elementFromPoint` at its
 * centre returns whatever sits behind it. Nothing throws and nothing logs, so the
 * app is left holding a dialog nobody can see.
 *
 * The fullscreen element can appear and disappear while a portal is mounted, so
 * the host is state rather than a one-time read.
 */

/** Vendor-prefixed fullscreen members, still shipped by WebKit. */
interface WebkitFullscreenDocument {
    webkitFullscreenElement?: Element | null;
}

/**
 * Read the current fullscreen element, standard property first.
 *
 * @returns The element being presented fullscreen, or `null`.
 */
function currentFullscreenElement(): Element | null {
    if (typeof document === "undefined") return null;
    const prefixed = document as Document & WebkitFullscreenDocument;
    return document.fullscreenElement ?? prefixed.webkitFullscreenElement ?? null;
}

/**
 * Resolve where a portal should mount, following fullscreen changes.
 *
 * The first value is resolved during render rather than in the effect, so an
 * overlay that opens still mounts in the same commit it used to — the effect only
 * follows changes from there.
 *
 * @returns The fullscreen element while one is presented, otherwise
 * `document.body`; `null` in any environment without a `document`.
 */
export function usePortalHost(): Element | null {
    const [host, setHost] = useState<Element | null>(() =>
        typeof document === "undefined" ? null : (currentFullscreenElement() ?? document.body),
    );

    useEffect(() => {
        const sync = (): void => setHost(currentFullscreenElement() ?? document.body);
        sync();
        document.addEventListener("fullscreenchange", sync);
        document.addEventListener("webkitfullscreenchange", sync);
        return () => {
            document.removeEventListener("fullscreenchange", sync);
            document.removeEventListener("webkitfullscreenchange", sync);
        };
    }, []);

    return host;
}
