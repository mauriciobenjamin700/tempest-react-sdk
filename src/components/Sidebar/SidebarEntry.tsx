import { cn } from "@/utils/cn";

import type { SidebarItem } from "./Sidebar";
import styles from "./Sidebar.module.css";

/**
 * One navigation entry: an anchor when it carries an `href`, a button otherwise.
 *
 * A link that navigates has to be a link — middle-click, "open in new tab" and
 * the status bar preview all come from the element, not from the handler. A
 * disabled entry falls back to the button, because a disabled anchor does not
 * exist in HTML.
 */
export function SidebarEntry({
    item,
    active,
    collapsed,
    onSelect,
}: {
    item: SidebarItem;
    active: boolean;
    collapsed: boolean;
    onSelect?: (key: string) => void;
}) {
    const title = collapsed && typeof item.label === "string" ? item.label : undefined;
    const body = (
        <>
            {item.icon && <span className={styles.icon}>{item.icon}</span>}
            {!collapsed && <span className={styles.label}>{item.label}</span>}
            {!collapsed && item.badge !== undefined && (
                <span className={styles.badge}>{item.badge}</span>
            )}
        </>
    );

    if (item.href && !item.disabled) {
        return (
            <a
                href={item.href}
                className={cn(styles.item, active && styles.active)}
                aria-current={active ? "page" : undefined}
                onClick={() => onSelect?.(item.key)}
                title={title}
            >
                {body}
            </a>
        );
    }

    return (
        <button
            type="button"
            className={cn(styles.item, active && styles.active)}
            aria-current={active ? "page" : undefined}
            disabled={item.disabled}
            onClick={() => onSelect?.(item.key)}
            title={title}
        >
            {body}
        </button>
    );
}
