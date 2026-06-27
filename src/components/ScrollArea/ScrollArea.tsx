import { forwardRef } from "react";
import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import styles from "./ScrollArea.module.css";

export type ScrollAreaOrientation = "vertical" | "horizontal" | "both";

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
    /** Caps the container height; numbers are treated as pixels. */
    maxHeight?: number | string;
    /** Which axis scrolls. Default `"vertical"`. */
    orientation?: ScrollAreaOrientation;
}

/**
 * A styled scroll container that overflows on the chosen axis and renders a
 * thin custom scrollbar (WebKit) while staying fully functional in browsers
 * without scrollbar styling. Forwards `className`, `style` and the ref to the
 * underlying `<div>`.
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
    { maxHeight, orientation = "vertical", className, style, children, ...props },
    ref,
) {
    const mergedStyle: CSSProperties = {
        overflowX: orientation === "vertical" ? "hidden" : "auto",
        overflowY: orientation === "horizontal" ? "hidden" : "auto",
        ...(maxHeight !== undefined ? { maxHeight } : {}),
        ...style,
    };

    return (
        <div ref={ref} className={cn(styles.root, className)} style={mergedStyle} {...props}>
            {children}
        </div>
    );
});
