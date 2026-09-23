/**
 * @tempest-limits props-count — header, items, footer are the three regions,
 * value/onChange/match the selection, and collapsed/width/collapsedWidth the two
 * layout modes it switches between.
 */
import { useId, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { activeNavIndex } from "./active-nav-key";
import styles from "./Sidebar.module.css";
import { SidebarEntry } from "./SidebarEntry";

export interface SidebarItem {
    key: string;
    label: ReactNode;
    icon?: ReactNode;
    badge?: ReactNode;
    disabled?: boolean;
    /**
     * Renders the entry as a link to this URL instead of a button.
     *
     * `onChange` still fires on click, so an app that tracks the active key keeps
     * working — the difference is that the entry now behaves like navigation:
     * middle-click, ctrl-click and "copy link address" do what the user expects,
     * and a screen reader announces a link rather than a button.
     *
     * A `disabled` entry ignores this and stays a `<button disabled>`: there is no
     * disabled state for an anchor, and dropping the `href` to fake one leaves a
     * link that announces itself as actionable and is not.
     */
    href?: string;
}

/**
 * A section heading. Every item after it belongs to the section, until the next
 * section or separator.
 */
export interface SidebarSection {
    type: "section";
    key: string;
    label: ReactNode;
}

/** A plain divider, for splitting the list without naming the parts. */
export interface SidebarSeparator {
    type: "separator";
    key: string;
}

/**
 * One entry of the navigation list.
 *
 * An entry with no `type` is an item, which is what keeps a plain
 * `SidebarItem[]` a valid `SidebarEntry[]`: adding sections to this component
 * needed no change at any existing call site.
 */
export type SidebarEntry = ({ type?: "item" } & SidebarItem) | SidebarSection | SidebarSeparator;

export interface SidebarProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
    /** Top slot — typically the logo + brand. */
    header?: ReactNode;
    /** Navigation entries. An entry with no `type` is an item. */
    items: SidebarEntry[];
    /**
     * The active item: its `key` by default, or the current route with
     * `match="route"`.
     */
    value?: string;
    /**
     * How `value` picks the active item.
     *
     * - `"key"` (default): the item whose `key` equals `value`.
     * - `"route"`: `value` is the current pathname, and the active item is the one
     *   whose `href` (or `key`, when it has no `href`) is the longest path covering
     *   it on a segment boundary — see `activeNavKey`. `/dashboard/tips/42` lights
     *   `/dashboard/tips`, not `/dashboard`, and `/users-admin` never lights
     *   `/users`. Sections and separators take no part.
     *
     * `"route"` is what lets the app pass `useLocation().pathname` and stop
     * computing a key: the component already holds the entries the resolution runs
     * against, so asking the app to repeat them is how the two drift apart. It
     * reads no router itself — the value comes in as a string — so the component
     * keeps working with no router mounted.
     */
    match?: "key" | "route";
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

/** A run of items, optionally under a section heading. */
interface ItemBlock {
    kind: "items";
    key: string;
    section?: SidebarSection;
    items: SidebarItem[];
}

/** A standalone divider between blocks. */
interface SeparatorBlock {
    kind: "separator";
    key: string;
}

type Block = ItemBlock | SeparatorBlock;

/**
 * Fold the flat entry list into the blocks that get rendered.
 *
 * A section opens a block that swallows every following item; a separator closes
 * whatever is open, so items after it are loose again. Items before the first
 * section are loose too — which is the whole existing behaviour, and why a list
 * with no sections comes out of here as one unnamed block.
 *
 * @param entries - The `items` prop, as given.
 * @returns Blocks in render order.
 */
function toBlocks(entries: readonly SidebarEntry[]): Block[] {
    const blocks: Block[] = [];
    let open: ItemBlock | undefined;

    for (const entry of entries) {
        if (entry.type === "separator") {
            blocks.push({ kind: "separator", key: entry.key });
            open = undefined;
            continue;
        }
        if (entry.type === "section") {
            open = { kind: "items", key: entry.key, section: entry, items: [] };
            blocks.push(open);
            continue;
        }
        if (!open) {
            open = { kind: "items", key: `loose-${entry.key}`, items: [] };
            blocks.push(open);
        }
        open.items.push(entry);
    }
    return blocks;
}

/**
 * The key of the item `value` selects, under the given `match` mode.
 *
 * @param entries - The `items` prop, as given.
 * @param value - The `value` prop.
 * @param match - The `match` prop.
 * @returns The active item's key, or `undefined` when no item is active.
 */
function resolveActiveKey(
    entries: readonly SidebarEntry[],
    value: string | undefined,
    match: "key" | "route",
): string | undefined {
    if (match === "key" || value === undefined) {
        return value;
    }
    const items = entries.filter(
        (entry): entry is { type?: "item" } & SidebarItem =>
            entry.type !== "section" && entry.type !== "separator",
    );
    return items[
        activeNavIndex(
            value,
            items.map((item) => item.href ?? item.key),
        )
    ]?.key;
}

/**
 * Desktop sidebar navigation. Pair with `<Show above="md">` and a `Drawer`
 * for mobile.
 *
 * Sixteen screens in one flat list is a wall, so `items` also takes section
 * headings and separators. A section renders as a labelled `role="group"`, which
 * is what tells a screen reader "Monitoring, group, 3 items" — the reason it is
 * not a styled `disabled` item, which would announce an unavailable button and
 * stay in the navigation order.
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
 *
 * @example
 * const { pathname } = useLocation();
 * <Sidebar
 *     match="route"
 *     value={pathname}
 *     items={[
 *         { key: "overview", label: "Overview", href: "/dashboard" },
 *         { key: "tips", label: "Tips", href: "/dashboard/tips" },
 *     ]}
 * />
 *
 * @example
 * <Sidebar
 *     items={[
 *         { type: "section", key: "monitoring", label: "Monitoring" },
 *         { key: "overview", label: "Overview", href: "/overview" },
 *         { key: "activity", label: "Activity", href: "/activity" },
 *         { type: "section", key: "admin", label: "Administration" },
 *         { key: "settings", label: "Settings", href: "/settings" },
 *     ]}
 *     value={tab}
 *     onChange={setTab}
 * />
 */
export function Sidebar({
    header,
    items,
    value,
    onChange,
    match = "key",
    footer,
    collapsed = false,
    width = 240,
    collapsedWidth = 64,
    className,
    style,
    ...props
}: SidebarProps) {
    const baseId = useId();
    const blocks = toBlocks(items);
    const activeKey = resolveActiveKey(items, value, match);
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
                {blocks.map((block) => {
                    if (block.kind === "separator") {
                        return <hr key={block.key} className={styles.separator} />;
                    }
                    if (!block.section) {
                        return (
                            <div key={block.key} className={styles.group}>
                                {block.items.map((item) => (
                                    <SidebarEntry
                                        key={item.key}
                                        item={item}
                                        active={item.key === activeKey}
                                        collapsed={collapsed}
                                        onSelect={onChange}
                                    />
                                ))}
                            </div>
                        );
                    }
                    const labelId = `${baseId}-${block.key}`;
                    return (
                        <div
                            key={block.key}
                            role="group"
                            aria-labelledby={labelId}
                            className={styles.group}
                        >
                            <div
                                id={labelId}
                                role="presentation"
                                className={cn(styles.section, collapsed && styles.sectionCollapsed)}
                            >
                                {block.section.label}
                            </div>
                            {block.items.map((item) => (
                                <SidebarEntry
                                    key={item.key}
                                    item={item}
                                    active={item.key === activeKey}
                                    collapsed={collapsed}
                                    onSelect={onChange}
                                />
                            ))}
                        </div>
                    );
                })}
            </nav>
            {footer && <div className={styles.footer}>{footer}</div>}
        </aside>
    );
}
