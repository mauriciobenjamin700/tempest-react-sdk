/**
 * @tempest-limits function-lines — the body resolves the active item from the
 * current path, owns the open submenu and the hover-intent delay, all of which
 * decide the same highlighted row.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { Portal } from "@/components/Portal";
import { useAnchorPosition } from "@/components/Portal/anchor-position";
import { useEscapeLayer } from "@/components/Portal/escape-layer";
import { usePortalTabOrder } from "@/components/Portal/tab-bridge";
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
    /**
     * Render the open panel in a portal, positioned under its trigger. Default
     * `true`.
     *
     * In flow, an ancestor with `overflow` other than `visible` clips the panel,
     * and the SDK's own `Navbar` is one: its `nav` slot scrolls horizontally, and
     * `overflow-x: auto` forces `overflow-y` to `auto` too — a submenu showed
     * 0% of its panel there (measured in Chrome at 1440 px). In a portal the
     * panel escapes the clip, flips at the viewport edge, stays in the tab order
     * right after its trigger, and follows it on scroll and resize.
     */
    portal?: boolean;
}

/** Gap between trigger and panel, in px — the in-flow CSS uses the same 4 px. */
const PANEL_OFFSET = 4;

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
export function NavigationMenu({ items, portal = true, className, ...props }: NavigationMenuProps) {
    const [clickedIndex, setClickedIndex] = useState<number>(-1);
    const [hovered, setHovered] = useState<number>(-1);
    const baseId = useId();
    const rootRef = useRef<HTMLElement>(null);

    const close = useCallback((): void => {
        setClickedIndex(-1);
        setHovered(-1);
    }, []);

    const openIndex = clickedIndex !== -1 ? clickedIndex : hovered;

    const [anchorNode, setAnchorNode] = useState<HTMLLIElement | null>(null);
    const [panelNode, setPanelNode] = useState<HTMLUListElement | null>(null);
    const floating = portal && openIndex !== -1;
    const floatingStyle = useAnchorPosition({
        anchor: anchorNode,
        floating: panelNode,
        side: "bottom",
        align: "start",
        offset: PANEL_OFFSET,
        enabled: floating,
    });
    usePortalTabOrder({ enabled: floating, anchor: anchorNode, panel: panelNode });

    useEscapeLayer(openIndex !== -1, close);

    /**
     * Close on a press outside both the menu and the open panel.
     *
     * The panel is checked on its own because in a portal it is not inside the
     * menu's root: a press on one of its entries would otherwise count as
     * outside, close the panel on `mousedown`, and swallow the entry's click.
     */
    useEffect(() => {
        if (openIndex === -1) return;
        const onDown = (event: MouseEvent): void => {
            const target = event.target as Node;
            if (rootRef.current?.contains(target) || panelNode?.contains(target)) return;
            close();
        };
        window.addEventListener("mousedown", onDown);
        return () => {
            window.removeEventListener("mousedown", onDown);
        };
    }, [openIndex, close, panelNode]);

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
                    const panel = (
                        <ul
                            ref={setPanelNode}
                            id={panelId}
                            role="menu"
                            className={cn(styles.panel, portal && styles.portalled)}
                            style={floatingStyle}
                        >
                            {item.children!.map((child, childIndex) => (
                                <li key={childIndex} role="none" className={styles.subItem}>
                                    {renderLeaf(child, "menuitem")}
                                </li>
                            ))}
                        </ul>
                    );
                    return (
                        <li
                            key={index}
                            ref={open ? setAnchorNode : undefined}
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
                            {open && (portal ? <Portal>{panel}</Portal> : panel)}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
