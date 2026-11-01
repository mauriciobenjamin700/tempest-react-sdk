import { cn } from "@/utils/cn";
import { vettedHref } from "@/utils/safe-url";

import type { SidebarItem } from "./Sidebar";
import styles from "./Sidebar.module.css";

/**
 * One navigation entry: an anchor when it carries an `href`, a button otherwise.
 *
 * A link that navigates has to be a link — middle-click, "open in new tab" and
 * the status bar preview all come from the element, not from the handler. A
 * disabled entry falls back to the button, because a disabled anchor does not
 * exist in HTML.
 *
 * The `href` is vetted with `safeLinkUrl`'s allowlist; an entry whose URL uses another
 * scheme renders as the button, so a menu built from API data cannot put a
 * `javascript:` link in the sidebar on React 18.
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

    const href = vettedHref(item.href);
    if (href && !item.disabled) {
        return (
            <a
                href={href}
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
