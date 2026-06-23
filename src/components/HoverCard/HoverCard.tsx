import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./HoverCard.module.css";

export type HoverCardPlacement = "top" | "bottom" | "left" | "right";

export interface HoverCardProps extends HTMLAttributes<HTMLDivElement> {
    /** Element the user hovers/focuses to reveal the card. */
    trigger: ReactNode;
    /** Card content shown while hovering/focusing the trigger or the card itself. */
    children: ReactNode;
    /** Delay in ms before opening on mouseenter/focus. Default 300. */
    openDelay?: number;
    /** Delay in ms before closing on mouseleave/blur. Default 150. */
    closeDelay?: number;
    /** Where the card is anchored relative to the trigger. Default "bottom". */
    placement?: HoverCardPlacement;
}

/**
 * Content preview shown when the trigger is hovered or focused.
 *
 * - Opens after `openDelay` on `mouseenter`/`focus`.
 * - Closes after `closeDelay` on `mouseleave`/`blur`.
 * - Positioned relative to the trigger via `placement`.
 * - The card is rendered as a labelled `role="dialog"` region; the trigger stays keyboard focusable.
 *
 * @param props - The hover card props.
 * @returns The trigger wrapper and the anchored card when open.
 */
export function HoverCard({
    trigger,
    children,
    openDelay = 300,
    closeDelay = 150,
    placement = "bottom",
    className,
    ...rest
}: HoverCardProps) {
    const [open, setOpen] = useState(false);
    const id = useId();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimer = useCallback((): void => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const scheduleOpen = useCallback((): void => {
        clearTimer();
        timerRef.current = setTimeout(() => setOpen(true), openDelay);
    }, [clearTimer, openDelay]);

    const scheduleClose = useCallback((): void => {
        clearTimer();
        timerRef.current = setTimeout(() => setOpen(false), closeDelay);
    }, [clearTimer, closeDelay]);

    useEffect(() => clearTimer, [clearTimer]);

    return (
        <span
            className={styles.root}
            onMouseEnter={scheduleOpen}
            onMouseLeave={scheduleClose}
            onFocus={scheduleOpen}
            onBlur={scheduleClose}
        >
            <span aria-describedby={open ? id : undefined} className={styles.trigger}>
                {trigger}
            </span>
            {open && (
                <div
                    id={id}
                    role="dialog"
                    className={cn(styles.card, styles[placement], className)}
                    {...rest}
                >
                    {children}
                </div>
            )}
        </span>
    );
}
