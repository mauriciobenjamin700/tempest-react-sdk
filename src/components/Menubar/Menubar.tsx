/**
 * @tempest-limits function-lines — a menubar has two keyboard planes — arrow keys
 * move between menus, arrows inside one move between items — and the body owns both
 * because a key press is routed by which plane is open.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { Portal } from "@/components/Portal";
import { useAnchorPosition } from "@/components/Portal/anchor-position";
import { useEscapeLayer } from "@/components/Portal/escape-layer";
import { usePortalTabOrder } from "@/components/Portal/tab-bridge";
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
    /**
     * Render the open panel in a portal, positioned under its trigger. Default
     * `true`.
     *
     * In flow, an ancestor with `overflow` other than `visible` clips the panel,
     * and the SDK's own `Navbar` is one: its `nav` slot scrolls horizontally, and
     * `overflow-x: auto` forces `overflow-y` to `auto` too — a menu showed
     * 0% of its panel there (measured in Chrome at 1440 px). In a portal the
     * panel escapes the clip, flips at the viewport edge, stays in the tab order
     * right after its trigger, and follows it on scroll and resize.
     */
    portal?: boolean;
}

/** Gap between trigger and panel, in px — the in-flow CSS uses the same 4 px. */
const PANEL_OFFSET = 4;

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
export function Menubar({ menus, portal = true, className, ...props }: MenubarProps) {
    const [openIndex, setOpenIndex] = useState<number>(-1);
    const baseId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const close = useCallback((): void => {
        setOpenIndex(-1);
    }, []);

    const [anchorNode, setAnchorNode] = useState<HTMLDivElement | null>(null);
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

    useEscapeLayer(openIndex !== -1, () => {
        close();
        triggerRefs.current[openIndex]?.focus();
    });

    /**
     * Arrow keys move between menus while one is open; a press outside both the
     * menubar and the open panel closes it.
     *
     * The panel is checked on its own because in a portal it is not inside the
     * menubar's root: a press on one of its items would otherwise count as
     * outside, close the panel on `mousedown`, and swallow the item's click.
     */
    useEffect(() => {
        if (openIndex === -1) return;
        const onKey = (event: KeyboardEvent): void => {
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
            const target = event.target as Node;
            if (rootRef.current?.contains(target) || panelNode?.contains(target)) return;
            close();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("mousedown", onDown);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown);
        };
    }, [openIndex, menus.length, close, panelNode]);

    /**
     * The dropdown of one menu.
     *
     * @param menu - The menu whose items are listed.
     * @param panelId - The id the trigger's `aria-controls` points at.
     * @returns The panel element, in flow or for the portal.
     */
    const panel = (menu: MenubarMenu, panelId: string): ReactNode => (
        <ul
            ref={setPanelNode}
            id={panelId}
            role="menu"
            className={cn(styles.panel, portal && styles.portalled)}
            style={floatingStyle}
        >
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
                            <span className={styles.itemLabel}>{item.label}</span>
                            {item.shortcut && (
                                <span className={styles.shortcut}>{item.shortcut}</span>
                            )}
                        </button>
                    </li>
                );
            })}
        </ul>
    );

    return (
        <div ref={rootRef} role="menubar" className={cn(styles.root, className)} {...props}>
            {menus.map((menu, index) => {
                const open = openIndex === index;
                const panelId = `${baseId}-panel-${index}`;
                return (
                    <div key={index} ref={open ? setAnchorNode : undefined} className={styles.menu}>
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
                        {open &&
                            (portal ? (
                                <Portal>{panel(menu, panelId)}</Portal>
                            ) : (
                                panel(menu, panelId)
                            ))}
                    </div>
                );
            })}
        </div>
    );
}
