import { useMemo } from "react";
import { foldText } from "@/utils/fold-text";

export type FilterPredicate<T> = (item: T, search: string) => boolean;

/**
 * Client-side filter helper. Matches the listed keys ignoring case **and
 * accents** ("joao" finds "João") when no custom predicate is provided. A
 * custom predicate receives the trimmed, lowercased term, as before.
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
        const folded = foldText(term);
        return items.filter((item) =>
            keysOrPredicate.some((key) => {
                const value = item[key];
                return value != null && foldText(String(value)).includes(folded);
            }),
        );
    }, [items, search, keysOrPredicate]);
}
