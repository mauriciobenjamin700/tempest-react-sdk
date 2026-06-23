import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface PortalProps {
    /** Content rendered through the portal. */
    children: ReactNode;
    /** Target DOM node to render into. Defaults to `document.body`. */
    container?: Element | null;
}

/**
 * Renders its children into a different part of the DOM tree via a React portal.
 *
 * Useful for overlays (modals, tooltips, dropdowns) that must escape parent
 * overflow/stacking contexts. Defaults to `document.body` when no `container`
 * is provided.
 *
 * SSR-safe: renders `null` on the server and on the first client render, then
 * mounts the portal after hydration (when `document` is available).
 *
 * @param props - The portal props.
 * @returns The portal node once mounted, otherwise `null`.
 */
export function Portal({ children, container }: PortalProps): ReactNode {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted || typeof document === "undefined") {
        return null;
    }

    return createPortal(children, container ?? document.body);
}
