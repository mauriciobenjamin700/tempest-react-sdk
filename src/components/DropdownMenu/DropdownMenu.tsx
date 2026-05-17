import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./DropdownMenu.module.css";

export type DropdownMenuPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

export type DropdownMenuEntry =
    | {
          type: "item";
          id: string;
          label: ReactNode;
          icon?: ReactNode;
          danger?: boolean;
          disabled?: boolean;
          onSelect: () => void;
      }
    | { type: "separator"; id: string }
    | { type: "label"; id: string; label: ReactNode };

export interface DropdownMenuProps {
    trigger: ReactElement<{
        onClick?: (e: React.MouseEvent) => void;
        "aria-expanded"?: boolean;
        "aria-controls"?: string;
        "aria-haspopup"?: boolean | "menu";
    }>;
    items: DropdownMenuEntry[];
    placement?: DropdownMenuPlacement;
    className?: string;
}

function placementClass(placement: DropdownMenuPlacement): string {
    switch (placement) {
        case "bottom-end":
            return styles.bottomEnd;
        case "top-start":
            return styles.topStart;
        case "top-end":
            return styles.topEnd;
        case "bottom-start":
        default:
            return styles.bottomStart;
    }
}

/**
 * Dropdown menu — list of selectable actions anchored to a trigger.
 *
 * - Toggle on trigger click.
 * - Close on outside click / Escape / item selection.
 * - Arrow keys navigate, Enter activates focused item.
 */
export function DropdownMenu({
    trigger,
    items,
    placement = "bottom-start",
    className,
}: DropdownMenuProps) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const id = useId();
    const rootRef = useRef<HTMLSpanElement>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const selectableIndexes = items
        .map((entry, index) => (entry.type === "item" && !entry.disabled ? index : -1))
        .filter((i) => i !== -1);

    const close = useCallback((): void => {
        setOpen(false);
        setActiveIndex(-1);
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                close();
                return;
            }
            if (event.key === "ArrowDown") {
                event.preventDefault();
                const current = selectableIndexes.indexOf(activeIndex);
                const next = selectableIndexes[(current + 1) % selectableIndexes.length] ?? -1;
                setActiveIndex(next);
                itemRefs.current[next]?.focus();
            }
            if (event.key === "ArrowUp") {
                event.preventDefault();
                const current = selectableIndexes.indexOf(activeIndex);
                const prev =
                    selectableIndexes[
                        (current - 1 + selectableIndexes.length) % selectableIndexes.length
                    ] ?? -1;
                setActiveIndex(prev);
                itemRefs.current[prev]?.focus();
            }
        };
        const onDown = (event: MouseEvent): void => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("mousedown", onDown);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown);
        };
    }, [open, activeIndex, selectableIndexes, close]);

    const handleTriggerClick = (event: React.MouseEvent): void => {
        trigger.props.onClick?.(event);
        setOpen((prev) => !prev);
    };

    const triggerClone = {
        ...trigger,
        props: {
            ...trigger.props,
            onClick: handleTriggerClick,
            "aria-expanded": open,
            "aria-controls": id,
            "aria-haspopup": "menu" as const,
        },
    } as ReactElement;

    const handleSelect = (entry: Extract<DropdownMenuEntry, { type: "item" }>): void => {
        entry.onSelect();
        close();
    };

    return (
        <span ref={rootRef} className={styles.root}>
            {triggerClone}
            {open && (
                <ul
                    id={id}
                    role="menu"
                    className={cn(styles.menu, placementClass(placement), className)}
                >
                    {items.map((entry, index) => {
                        if (entry.type === "separator") {
                            return (
                                <li
                                    key={entry.id}
                                    role="separator"
                                    className={styles.separator}
                                    aria-hidden
                                />
                            );
                        }
                        if (entry.type === "label") {
                            return (
                                <li key={entry.id} role="presentation" className={styles.label}>
                                    {entry.label}
                                </li>
                            );
                        }
                        return (
                            <li key={entry.id} role="none">
                                <button
                                    ref={(el) => {
                                        itemRefs.current[index] = el;
                                    }}
                                    type="button"
                                    role="menuitem"
                                    className={cn(
                                        styles.item,
                                        entry.danger && styles.danger,
                                        activeIndex === index && styles.active,
                                    )}
                                    disabled={entry.disabled}
                                    onClick={() => handleSelect(entry)}
                                    onMouseEnter={() => setActiveIndex(index)}
                                >
                                    {entry.icon && <span aria-hidden>{entry.icon}</span>}
                                    {entry.label}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </span>
    );
}
