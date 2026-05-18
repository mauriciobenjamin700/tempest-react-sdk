import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Sidebar.module.css";

export interface SidebarItem {
    key: string;
    label: ReactNode;
    icon?: ReactNode;
    badge?: ReactNode;
    disabled?: boolean;
    href?: string;
}

export interface SidebarProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
    /** Top slot — typically the logo + brand. */
    header?: ReactNode;
    /** Navigation items. */
    items: SidebarItem[];
    /** Active item key. */
    value?: string;
    /** Fires when an item is clicked. Receives the item's `key`. */
    onChange?: (key: string) => void;
    /** Bottom slot — typically settings/profile/logout. */
    footer?: ReactNode;
    /** Collapsed mode — only icons visible. Default `false`. */
    collapsed?: boolean;
    /** Width when expanded, in pixels or any CSS length. Default `240px`. */
    width?: number | string;
    /** Width when collapsed, in pixels or any CSS length. Default `64px`. */
    collapsedWidth?: number | string;
}

/**
 * Desktop sidebar navigation. Pair with `<Show above="md">` and a `Drawer`
 * for mobile.
 *
 * @example
 * const [tab, setTab] = useState("home");
 * <Show above="md">
 *     <Sidebar
 *         header={<Brand />}
 *         items={[{ key: "home", label: "Home", icon: <Home /> }]}
 *         value={tab}
 *         onChange={setTab}
 *     />
 * </Show>
 */
export function Sidebar({
    header,
    items,
    value,
    onChange,
    footer,
    collapsed = false,
    width = 240,
    collapsedWidth = 64,
    className,
    style,
    ...props
}: SidebarProps) {
    const finalWidth =
        typeof (collapsed ? collapsedWidth : width) === "number"
            ? `${collapsed ? collapsedWidth : width}px`
            : collapsed
              ? collapsedWidth
              : width;
    return (
        <aside
            className={cn(styles.sidebar, collapsed && styles.collapsed, className)}
            style={{ width: finalWidth, ...style }}
            {...props}
        >
            {header && <div className={styles.header}>{header}</div>}
            <nav className={styles.nav} aria-label="Navegação lateral">
                {items.map((item) => {
                    const active = item.key === value;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            className={cn(styles.item, active && styles.active)}
                            aria-current={active ? "page" : undefined}
                            disabled={item.disabled}
                            onClick={() => onChange?.(item.key)}
                            title={
                                collapsed && typeof item.label === "string" ? item.label : undefined
                            }
                        >
                            {item.icon && <span className={styles.icon}>{item.icon}</span>}
                            {!collapsed && <span className={styles.label}>{item.label}</span>}
                            {!collapsed && item.badge !== undefined && (
                                <span className={styles.badge}>{item.badge}</span>
                            )}
                        </button>
                    );
                })}
            </nav>
            {footer && <div className={styles.footer}>{footer}</div>}
        </aside>
    );
}
