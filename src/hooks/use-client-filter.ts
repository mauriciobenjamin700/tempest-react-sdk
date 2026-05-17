import { useMemo } from "react";

export type FilterPredicate<T> = (item: T, search: string) => boolean;

/**
 * Client-side filter helper. Performs a case-insensitive match on the listed
 * keys when no custom predicate is provided.
 *
 * @param items - Source list.
 * @param search - Search string.
 * @param keysOrPredicate - Either a list of keys to match against or a custom predicate.
 * @returns Filtered list (referential identity preserved when search is empty).
 */
export function useClientFilter<T extends Record<string, unknown>>(
    items: T[],
    search: string,
    keysOrPredicate: (keyof T)[] | FilterPredicate<T>,
): T[] {
    return useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return items;
        if (typeof keysOrPredicate === "function") {
            return items.filter((item) => keysOrPredicate(item, term));
        }
        return items.filter((item) =>
            keysOrPredicate.some((key) => {
                const value = item[key];
                return value != null && String(value).toLowerCase().includes(term);
            }),
        );
    }, [items, search, keysOrPredicate]);
}
