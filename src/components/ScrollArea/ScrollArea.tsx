import { forwardRef, useCallback, useRef } from "react";
import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import { useScrollOverflow } from "@/hooks/use-scroll-overflow";
import styles from "./ScrollArea.module.css";

export type ScrollAreaOrientation = "vertical" | "horizontal" | "both";

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
    /** Caps the container height; numbers are treated as pixels. */
    maxHeight?: number | string;
    /** Which axis scrolls. Default `"vertical"`. */
    orientation?: ScrollAreaOrientation;
    /**
     * Accessible name used while the content actually overflows, when the area
     * takes a tab stop of its own. Defaults to a generic one; name it when the
     * page holds several scroll areas.
     */
    scrollLabel?: string;
}

/**
 * A styled scroll container that overflows on the chosen axis and renders a
 * thin custom scrollbar (WebKit) while staying fully functional in browsers
 * without scrollbar styling. Forwards `className`, `style` and the ref to the
 * underlying `<div>`.
 *
 * While the content overflows, the container becomes a named, focusable group.
 * A scroll area whose children are plain text holds nothing focusable, so
 * without that a keyboard user can see the scrollbar and has no way to move it.
 * The tab stop disappears again once the content fits, so an area that does not
 * scroll never adds one. Callers may still override `tabIndex` or `role`.
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
    {
        maxHeight,
        orientation = "vertical",
        scrollLabel = "Área rolável",
        className,
        style,
        children,
        ...props
    },
    ref,
) {
    const innerRef = useRef<HTMLDivElement>(null);
    const scrollable = useScrollOverflow(innerRef, orientation);

    /**
     * Keep the forwarded ref working while measuring internally: the caller's
     * ref is the public contract, the inner one is what the observer needs.
     */
    const setRefs = useCallback(
        (node: HTMLDivElement | null) => {
            innerRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
        },
        [ref],
    );

    const mergedStyle: CSSProperties = {
        overflowX: orientation === "vertical" ? "hidden" : "auto",
        overflowY: orientation === "horizontal" ? "hidden" : "auto",
        ...(maxHeight !== undefined ? { maxHeight } : {}),
        ...style,
    };

    return (
        <div
            ref={setRefs}
            className={cn(styles.root, className)}
            style={mergedStyle}
            tabIndex={scrollable ? 0 : undefined}
            role={scrollable ? "group" : undefined}
            aria-label={scrollable ? scrollLabel : undefined}
            {...props}
        >
            {children}
        </div>
    );
});
