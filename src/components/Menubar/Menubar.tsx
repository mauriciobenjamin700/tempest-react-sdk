import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Menubar.module.css";

export type MenubarItem =
    | {
          /** Visible label for the action. */
          label: ReactNode;
          /** Invoked when the action is selected. */
          onSelect?: () => void;
          /** Disable the action. */
          disabled?: boolean;
          /** Optional shortcut hint rendered right-aligned (e.g. `"⌘S"`). */
          shortcut?: string;
      }
    | { separator: true };

export interface MenubarMenu {
    /** Top-level menu label (e.g. `"File"`). */
    label: ReactNode;
    /** Items shown in the menu's dropdown. */
    items: MenubarItem[];
}

export interface MenubarProps extends HTMLAttributes<HTMLDivElement> {
    /** Top-level menus rendered left-to-right. */
    menus: MenubarMenu[];
}

function isSeparator(item: MenubarItem): item is { separator: true } {
    return "separator" in item;
}

/**
 * Application menubar (File / Edit-style).
 *
 * - `role="menubar"`; each menu is a button that opens a dropdown.
 * - Arrow Left/Right moves between menus (wrapping); opening one closes others.
 * - Closes on outside click, Escape, or selecting an item.
 * - Items may carry a `shortcut` (right-aligned) or be a `{ separator: true }`.
 *
 * @example
 * <Menubar
 *     menus={[
 *         {
 *             label: "File",
 *             items: [
 *                 { label: "New", shortcut: "⌘N", onSelect: () => create() },
 *                 { separator: true },
 *                 { label: "Quit", onSelect: () => quit() },
 *             ],
 *         },
 *     ]}
 * />
 */
export function Menubar({ menus, className, ...props }: MenubarProps) {
    const [openIndex, setOpenIndex] = useState<number>(-1);
    const baseId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const close = useCallback((): void => {
        setOpenIndex(-1);
    }, []);

    useEffect(() => {
        if (openIndex === -1) return;
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                close();
                triggerRefs.current[openIndex]?.focus();
                return;
            }
            if (event.key === "ArrowRight") {
                event.preventDefault();
                const next = (openIndex + 1) % menus.length;
                setOpenIndex(next);
                triggerRefs.current[next]?.focus();
            }
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                const prev = (openIndex - 1 + menus.length) % menus.length;
                setOpenIndex(prev);
                triggerRefs.current[prev]?.focus();
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
    }, [openIndex, menus.length, close]);

    return (
        <div ref={rootRef} role="menubar" className={cn(styles.root, className)} {...props}>
            {menus.map((menu, index) => {
                const open = openIndex === index;
                const panelId = `${baseId}-panel-${index}`;
                return (
                    <div key={index} className={styles.menu}>
                        <button
                            ref={(el) => {
                                triggerRefs.current[index] = el;
                            }}
                            type="button"
                            role="menuitem"
                            aria-haspopup="menu"
                            aria-expanded={open}
                            aria-controls={open ? panelId : undefined}
                            className={cn(styles.trigger, open && styles.triggerOpen)}
                            onClick={() => setOpenIndex((prev) => (prev === index ? -1 : index))}
                        >
                            {menu.label}
                        </button>
                        {open && (
                            <ul id={panelId} role="menu" className={styles.panel}>
                                {menu.items.map((item, itemIndex) => {
                                    if (isSeparator(item)) {
                                        return (
                                            <li
                                                key={itemIndex}
                                                role="separator"
                                                className={styles.separator}
                                                aria-hidden
                                            />
                                        );
                                    }
                                    return (
                                        <li key={itemIndex} role="none">
                                            <button
                                                type="button"
                                                role="menuitem"
                                                className={styles.item}
                                                disabled={item.disabled}
                                                onClick={() => {
                                                    item.onSelect?.();
                                                    close();
                                                }}
                                            >
                                                <span className={styles.itemLabel}>
                                                    {item.label}
                                                </span>
                                                {item.shortcut && (
                                                    <span className={styles.shortcut}>
                                                        {item.shortcut}
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
