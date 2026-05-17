import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Popover.module.css";

export type PopoverPlacement = "top" | "bottom" | "left" | "right";

export interface PopoverProps {
    /** Trigger element. Receives `onClick`/`aria-expanded`/`aria-controls`. */
    trigger: ReactElement<{
        onClick?: (e: React.MouseEvent) => void;
        "aria-expanded"?: boolean;
        "aria-controls"?: string;
    }>;
    children: ReactNode;
    placement?: PopoverPlacement;
    /** Controlled open state. */
    open?: boolean;
    /** Called when the user toggles or dismisses. */
    onOpenChange?: (open: boolean) => void;
    /** Default open state for uncontrolled usage. */
    defaultOpen?: boolean;
    /** Close on Escape. Default true. */
    closeOnEsc?: boolean;
    /** Close on outside click. Default true. */
    closeOnOutsideClick?: boolean;
    className?: string;
}

/**
 * Lightweight popover. Renders a positioned panel anchored to a trigger,
 * dismissed on outside click / Escape. Does NOT include collision detection
 * or smart positioning — pair with Floating UI if you need that.
 */
export function Popover({
    trigger,
    children,
    placement = "bottom",
    open,
    onOpenChange,
    defaultOpen = false,
    closeOnEsc = true,
    closeOnOutsideClick = true,
    className,
}: PopoverProps) {
    const isControlled = open !== undefined;
    const [internalOpen, setInternalOpen] = useState<boolean>(defaultOpen);
    const isOpen = isControlled ? open : internalOpen;
    const id = useId();
    const rootRef = useRef<HTMLSpanElement>(null);

    const setOpen = useCallback(
        (next: boolean): void => {
            if (!isControlled) setInternalOpen(next);
            onOpenChange?.(next);
        },
        [isControlled, onOpenChange],
    );

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (event: KeyboardEvent): void => {
            if (closeOnEsc && event.key === "Escape") setOpen(false);
        };
        const onDown = (event: MouseEvent): void => {
            if (!closeOnOutsideClick) return;
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("mousedown", onDown);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown);
        };
    }, [isOpen, closeOnEsc, closeOnOutsideClick, setOpen]);

    const handleTriggerClick = (event: React.MouseEvent): void => {
        trigger.props.onClick?.(event);
        setOpen(!isOpen);
    };

    const triggerClone = {
        ...trigger,
        props: {
            ...trigger.props,
            onClick: handleTriggerClick,
            "aria-expanded": isOpen,
            "aria-controls": id,
        },
    } as ReactElement;

    return (
        <span ref={rootRef} className={styles.root}>
            {triggerClone}
            {isOpen && (
                <div
                    id={id}
                    role="dialog"
                    className={cn(styles.popover, styles[placement], className)}
                >
                    {children}
                </div>
            )}
        </span>
    );
}
