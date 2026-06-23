import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Portal } from "@/components/Portal";
import styles from "./ContextMenu.module.css";

export type ContextMenuItem =
    | {
          label: ReactNode;
          onSelect?: () => void;
          disabled?: boolean;
          danger?: boolean;
      }
    | { separator: true };

export interface ContextMenuProps {
    /** Menu entries — selectable items and separators. */
    items: ContextMenuItem[];
    /** Trigger area. Right-clicking anywhere within opens the menu at the cursor. */
    children: ReactNode;
    /** Extra class names forwarded to the menu element. */
    className?: string;
}

interface Position {
    x: number;
    y: number;
}

function isSeparator(item: ContextMenuItem): item is { separator: true } {
    return "separator" in item && item.separator === true;
}

/**
 * Right-click context menu.
 *
 * - Opens at the cursor position on `onContextMenu` (default browser menu suppressed).
 * - Rendered through a {@link Portal} so it escapes parent overflow/stacking contexts.
 * - Closes on outside click, Escape, or item selection.
 * - Arrow Up/Down move focus across selectable items; Enter activates the focused item.
 *
 * @param props - The context menu props.
 * @returns The trigger wrapper plus the portalled menu when open.
 */
export function ContextMenu({ items, children, className }: ContextMenuProps) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const id = useId();
    const menuRef = useRef<HTMLUListElement>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const selectableIndexes = items
        .map((item, index) => (!isSeparator(item) && !item.disabled ? index : -1))
        .filter((i) => i !== -1);

    const close = useCallback((): void => {
        setOpen(false);
        setActiveIndex(-1);
    }, []);

    const handleContextMenu = (event: React.MouseEvent): void => {
        event.preventDefault();
        setPosition({ x: event.clientX, y: event.clientY });
        setActiveIndex(-1);
        setOpen(true);
    };

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
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) close();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("mousedown", onDown);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown);
        };
    }, [open, activeIndex, selectableIndexes, close]);

    const handleSelect = (item: Extract<ContextMenuItem, { label: ReactNode }>): void => {
        item.onSelect?.();
        close();
    };

    return (
        <>
            <span className={styles.root} onContextMenu={handleContextMenu}>
                {children}
            </span>
            {open && (
                <Portal>
                    <ul
                        ref={menuRef}
                        id={id}
                        role="menu"
                        className={cn(styles.menu, className)}
                        style={{ top: position.y, left: position.x }}
                    >
                        {items.map((item, index) => {
                            if (isSeparator(item)) {
                                return (
                                    <li
                                        key={`separator-${index}`}
                                        role="separator"
                                        className={styles.separator}
                                        aria-hidden
                                    />
                                );
                            }
                            return (
                                <li key={`item-${index}`} role="none">
                                    <button
                                        ref={(el) => {
                                            itemRefs.current[index] = el;
                                        }}
                                        type="button"
                                        role="menuitem"
                                        className={cn(
                                            styles.item,
                                            item.danger && styles.danger,
                                            activeIndex === index && styles.active,
                                        )}
                                        disabled={item.disabled}
                                        onClick={() => handleSelect(item)}
                                        onMouseEnter={() => setActiveIndex(index)}
                                    >
                                        {item.label}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </Portal>
            )}
        </>
    );
}
