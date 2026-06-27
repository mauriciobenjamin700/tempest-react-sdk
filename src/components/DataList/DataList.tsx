import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./DataList.module.css";

export interface DataListProps<T> extends HTMLAttributes<HTMLUListElement> {
    /** The collection to render, one `<li>` per item. */
    items: readonly T[];
    /** Renders the contents of each list item. */
    renderItem: (item: T, index: number) => ReactNode;
    /** Derives a stable React key for each item (defaults to the index). */
    keyExtractor?: (item: T, index: number) => string | number;
    /** Node rendered in place of the list when `items` is empty. */
    empty?: ReactNode;
}

/**
 * Generic, typed list that renders a `<ul>` with one `<li>` per item.
 *
 * The component is generic over the item type so `renderItem` and
 * `keyExtractor` infer their argument types from `items`. When `items` is
 * empty it renders `empty` (or nothing) instead of an empty list.
 *
 * @param items - The collection to render.
 * @param renderItem - Renders the contents of each list item.
 * @param keyExtractor - Optional stable key derivation (defaults to index).
 * @param empty - Optional node shown when there are no items.
 * @returns The rendered list, or the `empty` node when there are no items.
 */
export function DataList<T>({
    items,
    renderItem,
    keyExtractor,
    empty,
    className,
    ...props
}: DataListProps<T>) {
    if (items.length === 0) {
        return <>{empty ?? null}</>;
    }

    return (
        <ul className={cn(styles.list, className)} {...props}>
            {items.map((item, index) => (
                <li key={keyExtractor ? keyExtractor(item, index) : index} className={styles.item}>
                    {renderItem(item, index)}
                </li>
            ))}
        </ul>
    );
}
