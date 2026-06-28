import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./NavigationRail.module.css";

export interface NavigationRailItem {
    /** Unique identifier — used as React key and for value matching. */
    key: string;
    /** Visible label. */
    label: ReactNode;
    /** Icon rendered above the label. */
    icon?: ReactNode;
    /** Optional badge content rendered over the icon. */
    badge?: ReactNode;
    /** When true, the item is not selectable. */
    disabled?: boolean;
}

export type NavigationRailLabelVisibility = "all" | "selected" | "none";

export interface NavigationRailProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
    items: NavigationRailItem[];
    /** Selected key. */
    value: string;
    /** Called with the new selected key on click. */
    onChange: (key: string) => void;
    /** Top slot — e.g. a FAB or logo. */
    header?: ReactNode;
    /** Bottom slot — pushed to the bottom of the rail. */
    footer?: ReactNode;
    /** Which item labels to show. Default `"all"`. */
    labelVisibility?: NavigationRailLabelVisibility;
    /** Extra class names merged onto the root. */
    className?: string;
}

/**
 * Vertical, compact navigation column for desktop and tablet layouts. Each item
 * stacks an icon over its label, with the active item flagged via
 * `aria-current="page"`. Use `labelVisibility="selected"` to show only the
 * active item's label, or `"none"` for an icon-only rail.
 *
 * @example
 * <NavigationRail
 *     header={<FloatingActionButton icon={<Plus />} position="none" />}
 *     items={[
 *         { key: "home", label: "Início", icon: <Home /> },
 *         { key: "inbox", label: "Caixa", icon: <Inbox />, badge: 3 },
 *     ]}
 *     value={tab}
 *     onChange={setTab}
 * />
 */
export function NavigationRail({
    items,
    value,
    onChange,
    header,
    footer,
    labelVisibility = "all",
    className,
    ...props
}: NavigationRailProps) {
    return (
        <nav className={cn(styles.rail, className)} aria-label="Navegação lateral" {...props}>
            {header !== undefined && <div className={styles.header}>{header}</div>}
            <ul className={styles.list}>
                {items.map((item) => {
                    const active = item.key === value;
                    const showLabel =
                        labelVisibility === "all" || (labelVisibility === "selected" && active);
                    return (
                        <li key={item.key}>
                            <button
                                type="button"
                                className={cn(styles.item, active && styles.active)}
                                aria-current={active ? "page" : undefined}
                                disabled={item.disabled}
                                onClick={() => onChange(item.key)}
                            >
                                <span className={styles.iconWrap}>
                                    {item.icon && <span className={styles.icon}>{item.icon}</span>}
                                    {item.badge !== undefined && (
                                        <span className={styles.badge}>{item.badge}</span>
                                    )}
                                </span>
                                {showLabel && <span className={styles.label}>{item.label}</span>}
                            </button>
                        </li>
                    );
                })}
            </ul>
            {footer !== undefined && <div className={styles.footer}>{footer}</div>}
        </nav>
    );
}
