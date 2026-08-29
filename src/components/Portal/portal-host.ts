import { useState } from "react";
import { useFullscreenElement } from "@/hooks/use-fullscreen-element";

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
 * the host is state rather than a one-time read. That subscription — the two
 * events, standard and WebKit-prefixed — lives in `useFullscreenElement`, because
 * `useFullscreen` needs the identical fact to answer a different question; this
 * module only asks it where to mount.
 */

/**
 * Resolve where a portal should mount, following fullscreen changes.
 *
 * The first value is resolved during render rather than in an effect, so an
 * overlay that opens still mounts in the same commit it used to — the
 * subscription only follows changes from there.
 *
 * @returns The fullscreen element while one is presented, otherwise
 * `document.body`; `null` in any environment without a `document`.
 */
export function usePortalHost(): Element | null {
    const fullscreen = useFullscreenElement();
    const [body] = useState<HTMLElement | null>(() =>
        typeof document === "undefined" ? null : document.body,
    );

    return fullscreen ?? body;
}
