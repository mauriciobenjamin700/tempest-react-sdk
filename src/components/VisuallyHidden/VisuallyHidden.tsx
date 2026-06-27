import type { HTMLAttributes, JSX } from "react";
import { createElement } from "react";
import { cn } from "@/utils/cn";
import styles from "./VisuallyHidden.module.css";

export interface VisuallyHiddenProps extends HTMLAttributes<HTMLElement> {
    /** Intrinsic element to render. Defaults to "span". */
    as?: keyof JSX.IntrinsicElements;
}

/**
 * Render content that is hidden visually but remains available to screen
 * readers — the standard "sr-only" pattern. Useful for accessible labels on
 * icon-only controls.
 *
 * @example
 * <button><Icon /><VisuallyHidden>Close</VisuallyHidden></button>
 */
export function VisuallyHidden({
    as = "span",
    className,
    children,
    ...props
}: VisuallyHiddenProps) {
    return createElement(as, { className: cn(styles.hidden, className), ...props }, children);
}
