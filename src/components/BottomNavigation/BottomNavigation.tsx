/**
 * @tempest-limits props-count — items/value/onChange/match are the selection, the
 * same contract as `Sidebar`, and showLabels the one layout switch.
 */
import type { HTMLAttributes, ReactNode } from "react";
import { activeNavIndex } from "@/components/Sidebar/active-nav-key";
import { NAVIGATION_MESSAGES } from "@/i18n/messages/navigation";
import { useTempestText } from "@/i18n/use-tempest-text";
import { cn } from "@/utils/cn";
import { routeLinkClick } from "@/utils/link-click";
import { vettedHref } from "@/utils/safe-url";
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
    /**
     * Renders the item as a link to this URL instead of a button — the same
     * contract as `SidebarItem.href`, so one item list feeds both.
     *
     * With `onChange`, a plain primary click is the app's: the anchor's default is
     * prevented and `onChange` fires, so the router navigates without the browser
     * also reloading the document. Ctrl/meta/shift/alt and non-primary clicks stay
     * with the browser and do not fire `onChange`. Without `onChange`, the browser
     * follows the `href`. A `disabled` item stays a `<button disabled>`, and a URL
     * outside `http:`/`https:`/`mailto:`/`tel:`/`sms:` (see `safeLinkUrl`) makes
     * the item a button.
     */
    href?: string;
}

export interface BottomNavigationProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
    items: BottomNavigationItem[];
    /**
     * The active item: its `key` by default, or the current route with
     * `match="route"`.
     */
    value?: string;
    /**
     * How `value` picks the active item — the same rule as `Sidebar`.
     *
     * - `"key"` (default): the item whose `key` equals `value`.
     * - `"route"`: `value` is the current pathname, and the active item is the one
     *   whose `href` (or `key`, without `href`) is the longest path covering it on
     *   a segment boundary — see `activeNavKey`. `/pacientes/42?tab=2` lights
     *   `/pacientes`; `/` lights only on `/`.
     */
    match?: "key" | "route";
    /** Called with the selected item's key on click. */
    onChange?: (key: string) => void;
    /** Show label below each icon. Default `true`. */
    showLabels?: boolean;
}

/**
 * The key of the item `value` selects, under the given `match` mode.
 *
 * @param items - The `items` prop.
 * @param value - The `value` prop.
 * @param match - The `match` prop.
 * @returns The active item's key, or `undefined` when none is active.
 */
function resolveActiveKey(
    items: readonly BottomNavigationItem[],
    value: string | undefined,
    match: "key" | "route",
): string | undefined {
    if (match === "key" || value === undefined) return value;
    return items[
        activeNavIndex(
            value,
            items.map((item) => item.href ?? item.key),
        )
    ]?.key;
}

/**
 * Fixed-bottom mobile tab bar. 3–5 items recommended. Pair with
 * `<Show below="md">` to render only on mobile.
 *
 * Takes the same item contract as `Sidebar` (`href` and `match="route"`), so an
 * app shell passes one list to both and the phone gets real links — long-press
 * "open in new tab" and a screen reader announcing a link — instead of buttons.
 * The landmark's name comes from `tempest.bottomNavigation.label` in the active
 * i18n catalog; an `aria-label` prop replaces it.
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
 *
 * @example
 * const { pathname } = useLocation();
 * const navigate = useNavigate();
 * <BottomNavigation
 *     match="route"
 *     value={pathname}
 *     items={[
 *         { key: "home", label: "Painel", href: "/" },
 *         { key: "patients", label: "Pacientes", href: "/pacientes" },
 *     ]}
 *     onChange={(key) => navigate(key === "home" ? "/" : "/pacientes")}
 * />
 */
export function BottomNavigation({
    items,
    value,
    onChange,
    match = "key",
    showLabels = true,
    className,
    ...props
}: BottomNavigationProps) {
    const text = useTempestText(NAVIGATION_MESSAGES);
    const activeKey = resolveActiveKey(items, value, match);
    return (
        <nav
            className={cn(styles.bar, className)}
            aria-label={text.t("tempest.bottomNavigation.label")}
            {...props}
        >
            {items.map((item) => {
                const active = item.key === activeKey;
                const body = (
                    <>
                        <span className={styles.iconWrap}>
                            {item.icon && <span className={styles.icon}>{item.icon}</span>}
                            {item.badge !== undefined && (
                                <span className={styles.badge}>{item.badge}</span>
                            )}
                        </span>
                        {showLabels && <span className={styles.label}>{item.label}</span>}
                    </>
                );
                const href = vettedHref(item.href);
                if (href && !item.disabled) {
                    return (
                        <a
                            key={item.key}
                            href={href}
                            className={cn(styles.item, active && styles.active)}
                            aria-current={active ? "page" : undefined}
                            onClick={(event) =>
                                routeLinkClick(event, onChange && (() => onChange(item.key)))
                            }
                        >
                            {body}
                        </a>
                    );
                }
                return (
                    <button
                        key={item.key}
                        type="button"
                        className={cn(styles.item, active && styles.active)}
                        aria-current={active ? "page" : undefined}
                        disabled={item.disabled}
                        onClick={() => onChange?.(item.key)}
                    >
                        {body}
                    </button>
                );
            })}
        </nav>
    );
}
