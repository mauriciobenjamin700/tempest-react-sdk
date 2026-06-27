import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import styles from "./Command.module.css";

export interface CommandItem {
    /** Stable unique identifier for the item. */
    id: string;
    /** Human-readable label shown in the list and matched against the query. */
    label: string;
    /** Optional group heading; items sharing a group are rendered together. */
    group?: string;
    /** Extra terms matched against the query in addition to `label`. */
    keywords?: string[];
    /** Invoked when the item is chosen (click or Enter on the active row). */
    onSelect: () => void;
    /** Optional leading icon. */
    icon?: ReactNode;
}

export interface CommandProps {
    /** Whether the palette is visible. */
    open: boolean;
    /** Called with the next open state (Escape, selection, backdrop click). */
    onOpenChange: (open: boolean) => void;
    /** Candidate items to filter and display. */
    items: CommandItem[];
    /** Placeholder for the search input. */
    placeholder?: string;
    /** Rendered when no item matches the current query. */
    emptyMessage?: ReactNode;
    /** Forwarded to the dialog element. */
    className?: string;
}

interface CommandGroup {
    name: string | undefined;
    items: CommandItem[];
}

/**
 * Case-insensitively test whether `item` matches `query` by substring against
 * its label and any keywords. An empty query matches everything.
 *
 * @param item - The candidate command item.
 * @param query - The lowercased search query.
 * @returns `true` when the item should be shown.
 */
function matchesQuery(item: CommandItem, query: string): boolean {
    if (query === "") return true;
    if (item.label.toLowerCase().includes(query)) return true;
    return (item.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(query));
}

/**
 * Partition a flat item list into ordered groups, preserving first-seen order
 * for both groups and the items within them.
 *
 * @param items - The (already filtered) items to group.
 * @returns An ordered list of groups.
 */
function groupItems(items: CommandItem[]): CommandGroup[] {
    const groups: CommandGroup[] = [];
    const indexByName = new Map<string | undefined, number>();
    for (const item of items) {
        const existing = indexByName.get(item.group);
        if (existing === undefined) {
            indexByName.set(item.group, groups.length);
            groups.push({ name: item.group, items: [item] });
        } else {
            groups[existing]!.items.push(item);
        }
    }
    return groups;
}

/**
 * A ⌘K-style command palette: an overlay dialog with a search input that
 * substring-filters items by label and keywords, groups results, and supports
 * full keyboard navigation (Arrow up/down, Enter, Escape). Traps focus while
 * open.
 */
export function Command({
    open,
    onOpenChange,
    items,
    placeholder = "Type a command…",
    emptyMessage = "No results",
    className,
}: CommandProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState<string>("");
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const listId = "tempest-command-list";

    useFocusTrap(dialogRef, open);

    const filtered = useMemo<CommandItem[]>(() => {
        const normalized = query.trim().toLowerCase();
        const visible = items.filter((item) => matchesQuery(item, normalized));
        return groupItems(visible).flatMap((group) => group.items);
    }, [items, query]);

    const groups = useMemo<CommandGroup[]>(() => groupItems(filtered), [filtered]);

    // Reset transient state whenever the palette opens.
    useEffect(() => {
        if (open) {
            setQuery("");
            setActiveIndex(0);
        }
    }, [open]);

    // Keep the active index within bounds as the filtered list shrinks/grows.
    useEffect(() => {
        setActiveIndex((index) => {
            if (filtered.length === 0) return 0;
            return Math.min(index, filtered.length - 1);
        });
    }, [filtered.length]);

    if (!open || typeof document === "undefined") return null;

    function selectItem(item: CommandItem): void {
        item.onSelect();
        onOpenChange(false);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
        if (event.key === "Escape") {
            event.preventDefault();
            onOpenChange(false);
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (filtered.length === 0) return;
            setActiveIndex((index) => (index + 1) % filtered.length);
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            if (filtered.length === 0) return;
            setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length);
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            const item = filtered[activeIndex];
            if (item) selectItem(item);
        }
    }

    let renderIndex = -1;

    return createPortal(
        <div className={styles.overlay} role="presentation" onClick={() => onOpenChange(false)}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
                className={cn(styles.dialog, className)}
                onClick={(event) => event.stopPropagation()}
            >
                <div className={styles.inputRow}>
                    <SearchIcon />
                    <input
                        type="text"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={listId}
                        aria-autocomplete="list"
                        autoFocus
                        className={styles.input}
                        placeholder={placeholder}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>
                <ul id={listId} role="listbox" className={styles.list}>
                    {filtered.length === 0 ? (
                        <li className={styles.empty}>{emptyMessage}</li>
                    ) : (
                        groups.map((group) => (
                            <li key={group.name ?? "__ungrouped__"} className={styles.group}>
                                {group.name && (
                                    <div className={styles.groupHeading}>{group.name}</div>
                                )}
                                <ul role="presentation" className={styles.groupList}>
                                    {group.items.map((item) => {
                                        renderIndex += 1;
                                        const isActive = renderIndex === activeIndex;
                                        const index = renderIndex;
                                        return (
                                            <li
                                                key={item.id}
                                                role="option"
                                                aria-selected={isActive}
                                                className={cn(
                                                    styles.option,
                                                    isActive && styles.active,
                                                )}
                                                onMouseMove={() => setActiveIndex(index)}
                                                onClick={() => selectItem(item)}
                                            >
                                                {item.icon && (
                                                    <span className={styles.icon}>{item.icon}</span>
                                                )}
                                                <span className={styles.label}>{item.label}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </li>
                        ))
                    )}
                </ul>
            </div>
        </div>,
        document.body,
    );
}

function SearchIcon() {
    return (
        <svg
            className={styles.searchIcon}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}
