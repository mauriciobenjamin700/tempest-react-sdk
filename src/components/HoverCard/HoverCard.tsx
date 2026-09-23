import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { Portal } from "@/components/Portal";
import { useAnchorPosition } from "@/components/Portal/anchor-position";
import { usePortalTabOrder } from "@/components/Portal/tab-bridge";
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
    /**
     * Render the card in a portal, positioned against the trigger. Default `true`.
     *
     * In flow, an ancestor with `overflow` other than `visible` clips the card — a
     * user handle in the last row of a `DataTable` showed 17% of it (measured in
     * Chrome at 1440 px). In a portal it escapes the clip and flips to the
     * opposite side at the viewport edge.
     */
    portal?: boolean;
}

/** Gap between trigger and card, in px — the in-flow CSS uses the same 8 px. */
const CARD_OFFSET = 8;

/**
 * Content preview shown when the trigger is hovered or focused.
 *
 * - Opens after `openDelay` on `mouseenter`/`focus`.
 * - Closes after `closeDelay` on `mouseleave`/`blur`.
 * - Positioned relative to the trigger via `placement`, in a portal by default.
 * - Moving the pointer from the trigger into the card keeps it open: React
 *   dispatches `mouseenter`/`mouseleave` along the component tree, and the
 *   portalled card is still inside the trigger's wrapper there.
 * - A link or button in the card is the next `Tab` stop after the trigger, as it
 *   was in flow.
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
    portal = true,
    className,
    style,
    ...rest
}: HoverCardProps) {
    const [open, setOpen] = useState(false);
    const [rootNode, setRootNode] = useState<HTMLSpanElement | null>(null);
    const [cardNode, setCardNode] = useState<HTMLDivElement | null>(null);
    const floatingStyle = useAnchorPosition({
        anchor: rootNode,
        floating: cardNode,
        side: placement,
        align: "center",
        offset: CARD_OFFSET,
        enabled: portal && open,
    });
    usePortalTabOrder({ enabled: portal && open, anchor: rootNode, panel: cardNode });
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

    const card = (
        <div
            ref={setCardNode}
            id={id}
            role="dialog"
            className={cn(styles.card, styles[placement], portal && styles.portalled, className)}
            style={{ ...style, ...floatingStyle }}
            {...rest}
        >
            {children}
        </div>
    );

    return (
        <span
            ref={setRootNode}
            className={styles.root}
            onMouseEnter={scheduleOpen}
            onMouseLeave={scheduleClose}
            onFocus={scheduleOpen}
            onBlur={scheduleClose}
        >
            <span aria-describedby={open ? id : undefined} className={styles.trigger}>
                {trigger}
            </span>
            {open && (portal ? <Portal>{card}</Portal> : card)}
        </span>
    );
}
