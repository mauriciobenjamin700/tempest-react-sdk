import { useCallback, useId, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Collapsible.module.css";

export interface CollapsibleProps extends HTMLAttributes<HTMLDivElement> {
    /** Controlled open state. When provided the component is controlled. */
    open?: boolean;
    /** Initial open state for the uncontrolled variant. Default `false`. */
    defaultOpen?: boolean;
    /** Fired with the next open state whenever the trigger is activated. */
    onOpenChange?: (open: boolean) => void;
    /** Content rendered inside the trigger button. */
    trigger: ReactNode;
    /** Collapsible content, hidden while closed. */
    children: ReactNode;
}

/**
 * A single expand/collapse region — a lighter alternative to `Accordion` for
 * one toggleable block. The trigger is a `<button aria-expanded aria-controls>`
 * wired to a content region sharing the same id; the region is `hidden` while
 * closed. Works controlled (`open` + `onOpenChange`) or uncontrolled
 * (`defaultOpen`).
 *
 * @param props - {@link CollapsibleProps}.
 * @returns The collapsible container.
 */
export function Collapsible({
    open,
    defaultOpen = false,
    onOpenChange,
    trigger,
    className,
    children,
    ...props
}: CollapsibleProps) {
    const reactId = useId();
    const contentId = `${reactId}-content`;
    const triggerId = `${reactId}-trigger`;

    const isControlled = open !== undefined;
    const [internalOpen, setInternalOpen] = useState<boolean>(defaultOpen);
    const isOpen = isControlled ? open : internalOpen;

    const handleToggle = useCallback((): void => {
        const next = !isOpen;
        if (!isControlled) setInternalOpen(next);
        onOpenChange?.(next);
    }, [isOpen, isControlled, onOpenChange]);

    return (
        <div className={cn(styles.collapsible, isOpen && styles.open, className)} {...props}>
            <button
                type="button"
                id={triggerId}
                className={styles.trigger}
                aria-expanded={isOpen}
                aria-controls={contentId}
                onClick={handleToggle}
            >
                {trigger}
            </button>
            <div
                id={contentId}
                role="region"
                aria-labelledby={triggerId}
                hidden={!isOpen}
                className={styles.content}
            >
                {children}
            </div>
        </div>
    );
}
