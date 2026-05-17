import { cloneElement, useId, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Tooltip.module.css";

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
    /** Tooltip content. Plain text recommended; rich content also works. */
    content: ReactNode;
    /** Placement relative to the trigger. Default: `"top"`. */
    placement?: TooltipPlacement;
    /** Single React element to attach hover/focus listeners to. */
    children: ReactElement;
    /** Disable the tooltip without changing the trigger. */
    disabled?: boolean;
    /** Delay (ms) before showing the tooltip. Default: 150. */
    openDelay?: number;
}

/**
 * Lightweight tooltip. Shows on hover and on focus (keyboard-friendly). Wraps
 * a single child element via `cloneElement`, so the trigger keeps its own ref
 * and props.
 */
export function Tooltip({
    content,
    placement = "top",
    children,
    disabled = false,
    openDelay = 150,
}: TooltipProps) {
    const [open, setOpen] = useState<boolean>(false);
    const tooltipId = useId();
    let timer: ReturnType<typeof setTimeout> | null = null;

    function show(): void {
        if (disabled) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setOpen(true), openDelay);
    }

    function hide(): void {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        setOpen(false);
    }

    const trigger = cloneElement(children, {
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
        "aria-describedby": open ? tooltipId : undefined,
    } as Record<string, unknown>);

    return (
        <span className={styles.trigger}>
            {trigger}
            {open && (
                <span id={tooltipId} role="tooltip" className={cn(styles.bubble, styles[placement])}>
                    {content}
                </span>
            )}
        </span>
    );
}
