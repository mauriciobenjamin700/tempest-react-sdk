import { useCallback, useId, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Accordion.module.css";

export interface AccordionItem {
    /** Stable identifier. */
    id: string;
    title: ReactNode;
    children: ReactNode;
    disabled?: boolean;
}

export interface AccordionProps {
    items: AccordionItem[];
    /** When `true` multiple items can be open simultaneously. Default `false`. */
    multiple?: boolean;
    /** Controlled open ids. */
    value?: string[];
    /** Uncontrolled default open ids. */
    defaultValue?: string[];
    onChange?: (openIds: string[]) => void;
    className?: string;
}

/**
 * Accessible accordion. Each item collapses/expands its content. Single-mode by
 * default — pass `multiple` to allow more than one item open at a time. Can be
 * controlled via `value` + `onChange`, or uncontrolled via `defaultValue`.
 */
export function Accordion({
    items,
    multiple = false,
    value,
    defaultValue = [],
    onChange,
    className,
}: AccordionProps) {
    const reactId = useId();
    const isControlled = value !== undefined;
    const [internalOpen, setInternalOpen] = useState<string[]>(defaultValue);
    const openIds = isControlled ? value : internalOpen;

    const toggle = useCallback(
        (id: string): void => {
            const isOpen = openIds.includes(id);
            const next = multiple
                ? isOpen
                    ? openIds.filter((x) => x !== id)
                    : [...openIds, id]
                : isOpen
                  ? []
                  : [id];
            if (!isControlled) setInternalOpen(next);
            onChange?.(next);
        },
        [openIds, multiple, isControlled, onChange],
    );

    return (
        <div className={cn(styles.accordion, className)}>
            {items.map((item) => {
                const open = openIds.includes(item.id);
                const panelId = `${reactId}-${item.id}-panel`;
                const triggerId = `${reactId}-${item.id}-trigger`;
                return (
                    <div key={item.id} className={cn(styles.item, open && styles.open)}>
                        <h3 className={styles.header}>
                            <button
                                type="button"
                                id={triggerId}
                                className={styles.trigger}
                                aria-expanded={open}
                                aria-controls={panelId}
                                disabled={item.disabled}
                                onClick={() => toggle(item.id)}
                            >
                                <span>{item.title}</span>
                                <ChevronIcon className={styles.chevron} />
                            </button>
                        </h3>
                        {open && (
                            <div
                                id={panelId}
                                role="region"
                                aria-labelledby={triggerId}
                                className={styles.panel}
                            >
                                {item.children}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function ChevronIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
        >
            <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
