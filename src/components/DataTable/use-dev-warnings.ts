import { useEffect } from "react";

import { isDevBuild } from "../../utils/dev-mode";

/** What {@link useDevWarnings} needs to judge the prop combination. */
export interface DataTableDevWarningsInput {
    /** Whether `totalItems` was passed. */
    serverMode: boolean;
    /** The controlled `page`, if any. */
    controlledPage: number | undefined;
    /** The page callback, if any. */
    onPageChange: ((page: number) => void) | undefined;
    /** Whether sorting is delegated. */
    sortIsManual: boolean;
    /** The sort callback, if any. */
    onSortChange: ((sort: never) => void) | undefined;
    /** Whether a search box is rendered at all. */
    searchable: boolean;
    /** The search callback, if any. */
    onSearchChange: ((term: string) => void) | undefined;
}

/**
 * Warn, in development only, about prop combinations that render a table which
 * silently lies.
 *
 * Each of these produces a screen that looks like it works: the header sorts and
 * nothing moves, the pager renders and clicking it does nothing.
 *
 * Three of them **are** type errors now — `DataTablePagingProps`,
 * `DataTableSortProps` and `DataTableSearchProps` reject them at the call site —
 * so those warnings only reach a caller the types cannot: plain JavaScript, or
 * props arriving through an `any`-typed spread.
 *
 * The fourth is the one the types genuinely cannot afford. `totalItems` *implies*
 * `manualSearch`, so `searchable` with no `onSearchChange` is an inert search box
 * in server mode without anybody writing `manualSearch`. Expressing that means
 * the search axis has to read the paging axis, crossing two three-member unions
 * into nine — so it stays here, which is what "runtime is the cheaper check"
 * actually looks like when it is true.
 *
 * @param input - The resolved prop combination.
 */
export function useDevWarnings({
    serverMode,
    controlledPage,
    onPageChange,
    sortIsManual,
    onSortChange,
    searchable,
    onSearchChange,
}: DataTableDevWarningsInput): void {
    useEffect(() => {
        if (!isDevBuild()) return;

        if (serverMode && controlledPage === undefined) {
            console.warn(
                "[tempest] <DataTable totalItems> is server mode, which needs a controlled `page`. " +
                    "Without it the pager moves the internal page while `data` keeps showing page 1.",
            );
        }
        if (controlledPage !== undefined && !onPageChange) {
            console.warn(
                "[tempest] <DataTable page> is controlled but `onPageChange` is missing, so the pager cannot do anything.",
            );
        }
        if (serverMode && searchable && !onSearchChange) {
            console.warn(
                "[tempest] <DataTable totalItems searchable> delegates searching, so the box needs " +
                    "`onSearchChange`. Without it the user types and nothing filters and nothing is reported.",
            );
        }
        if (sortIsManual && !onSortChange) {
            console.warn(
                "[tempest] <DataTable> is sorting manually but `onSortChange` is missing: clicking a sortable header changes the arrow and nothing else.",
            );
        }
    }, [
        serverMode,
        controlledPage,
        onPageChange,
        sortIsManual,
        onSortChange,
        searchable,
        onSearchChange,
    ]);
}
