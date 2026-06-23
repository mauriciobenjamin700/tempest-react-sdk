import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./NavigationMenu.module.css";

export interface NavigationMenuItem {
    /** Visible label for the entry. */
    label: ReactNode;
    /** When set, the entry renders as an anchor. */
    href?: string;
    /** Invoked when the entry is activated (click / Enter). */
    onSelect?: () => void;
    /** Nested entries — presence turns the item into a submenu trigger. */
    children?: NavigationMenuItem[];
}

export interface NavigationMenuProps extends HTMLAttributes<HTMLElement> {
    /** Top-level navigation entries. */
    items: NavigationMenuItem[];
}

/**
 * Horizontal navigation menu with hover/click/focus dropdown submenus.
 *
 * - Top-level items render in a `<nav><ul>`.
 * - Items with `children` open a submenu panel (`role="menu"`) on hover, focus,
 *   or click. Only one panel is open at a time.
 * - Closes on outside click, Escape, or selecting a leaf entry.
 *
 * @example
 * <NavigationMenu
 *     items={[
 *         { label: "Home", href: "/" },
 *         {
 *             label: "Products",
 *             children: [
 *                 { label: "Analytics", href: "/analytics" },
 *                 { label: "Billing", onSelect: () => openBilling() },
 *             ],
 *         },
 *     ]}
 * />
 */
export function NavigationMenu({ items, className, ...props }: NavigationMenuProps) {
    const [clickedIndex, setClickedIndex] = useState<number>(-1);
    const [hovered, setHovered] = useState<number>(-1);
    const baseId = useId();
    const rootRef = useRef<HTMLElement>(null);

    const close = useCallback((): void => {
        setClickedIndex(-1);
        setHovered(-1);
    }, []);

    const openIndex = clickedIndex !== -1 ? clickedIndex : hovered;

    useEffect(() => {
        if (openIndex === -1) return;
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") close();
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
    }, [openIndex, close]);

    const renderLeaf = (item: NavigationMenuItem, role: "none" | "menuitem"): ReactNode => {
        const handleClick = (): void => {
            item.onSelect?.();
            close();
        };
        if (item.href) {
            return (
                <a
                    href={item.href}
                    role={role === "menuitem" ? "menuitem" : undefined}
                    className={styles.link}
                    onClick={handleClick}
                >
                    {item.label}
                </a>
            );
        }
        return (
            <button
                type="button"
                role={role === "menuitem" ? "menuitem" : undefined}
                className={styles.link}
                onClick={handleClick}
            >
                {item.label}
            </button>
        );
    };

    return (
        <nav ref={rootRef} className={cn(styles.root, className)} {...props}>
            <ul className={styles.list}>
                {items.map((item, index) => {
                    const hasChildren = !!item.children && item.children.length > 0;
                    if (!hasChildren) {
                        return (
                            <li key={index} className={styles.item}>
                                {renderLeaf(item, "none")}
                            </li>
                        );
                    }
                    const open = openIndex === index;
                    const panelId = `${baseId}-panel-${index}`;
                    return (
                        <li
                            key={index}
                            className={styles.item}
                            onMouseEnter={() => setHovered(index)}
                            onMouseLeave={() => setHovered((prev) => (prev === index ? -1 : prev))}
                        >
                            <button
                                type="button"
                                className={styles.trigger}
                                aria-haspopup="menu"
                                aria-expanded={open}
                                aria-controls={panelId}
                                onClick={() =>
                                    setClickedIndex((prev) => (prev === index ? -1 : index))
                                }
                                onFocus={() => setHovered(index)}
                            >
                                {item.label}
                            </button>
                            {open && (
                                <ul id={panelId} role="menu" className={styles.panel}>
                                    {item.children!.map((child, childIndex) => (
                                        <li key={childIndex} role="none" className={styles.subItem}>
                                            {renderLeaf(child, "menuitem")}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
