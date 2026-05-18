import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./BottomNavigation.module.css";

export interface BottomNavigationItem {
    /** Unique identifier — used as React key and for value matching. */
    key: string;
    /** Visible label. */
    label: ReactNode;
    /** Icon rendered above the label. */
    icon?: ReactNode;
    /** Optional badge content rendered above the icon. */
    badge?: ReactNode;
    /** When true, the item is not selectable. */
    disabled?: boolean;
}

export interface BottomNavigationProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
    items: BottomNavigationItem[];
    /** Selected key. */
    value: string;
    /** Called with the new selected key on click. */
    onChange: (key: string) => void;
    /** Show label below each icon. Default `true`. */
    showLabels?: boolean;
}

/**
 * Fixed-bottom mobile tab bar. 3–5 items recommended. Pair with
 * `<Show below="md">` to render only on mobile.
 *
 * @example
 * <Show below="md">
 *     <BottomNavigation
 *         items={[
 *             { key: "home", label: "Início", icon: <Home /> },
 *             { key: "search", label: "Buscar", icon: <Search /> },
 *             { key: "profile", label: "Perfil", icon: <User /> },
 *         ]}
 *         value={tab}
 *         onChange={setTab}
 *     />
 * </Show>
 */
export function BottomNavigation({
    items,
    value,
    onChange,
    showLabels = true,
    className,
    ...props
}: BottomNavigationProps) {
    return (
        <nav className={cn(styles.bar, className)} aria-label="Navegação principal" {...props}>
            {items.map((item) => {
                const active = item.key === value;
                return (
                    <button
                        key={item.key}
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
                        {showLabels && <span className={styles.label}>{item.label}</span>}
                    </button>
                );
            })}
        </nav>
    );
}
