import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePortalHost } from "./portal-host";

export interface PortalProps {
    /** Content rendered through the portal. */
    children: ReactNode;
    /**
     * Target DOM node to render into.
     *
     * Defaults to the fullscreen element while one is presented, and to
     * `document.body` otherwise.
     */
    container?: Element | null;
}

/**
 * Renders its children into a different part of the DOM tree via a React portal.
 *
 * Useful for overlays (modals, tooltips, dropdowns) that must escape parent
 * overflow/stacking contexts.
 *
 * Without `container` the target is the element currently presented fullscreen,
 * and `document.body` the rest of the time. `body` alone would be wrong during
 * fullscreen: the browser paints only the fullscreen element's subtree, so an
 * overlay mounted outside it is invisible and unclickable while looking perfectly
 * healthy in the DOM. Passing `container` opts out of that and pins the target.
 *
 * SSR-safe: renders `null` on the server and on the first client render, then
 * mounts the portal after hydration (when `document` is available).
 *
 * @param props - The portal props.
 * @returns The portal node once mounted, otherwise `null`.
 */
export function Portal({ children, container }: PortalProps): ReactNode {
    const [mounted, setMounted] = useState(false);
    const host = usePortalHost();

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    const target = container ?? host;
    if (!mounted || !target) return null;

    return createPortal(children, target);
}
