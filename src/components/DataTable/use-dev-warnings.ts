import { useEffect } from "react";
import { warnOnce } from "@/utils/dev-warn";

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
}

/**
 * Warn, in development only, about prop combinations that render a table which
 * silently lies.
 *
 * Each of these produces a screen that looks like it works: the header sorts and
 * nothing moves, the pager renders and clicking it does nothing. They are not
 * type errors — every prop is optional on its own — so the only place to catch
 * them is at runtime, once, in dev. Each warning latches on its own key, so a
 * re-render or a dependency change does not reprint it.
 *
 * @param input - The resolved prop combination.
 */
export function useDevWarnings({
    serverMode,
    controlledPage,
    onPageChange,
    sortIsManual,
    onSortChange,
}: DataTableDevWarningsInput): void {
    useEffect(() => {
        if (serverMode && controlledPage === undefined) {
            warnOnce(
                "datatable-server-mode-uncontrolled-page",
                "[tempest-react-sdk] <DataTable totalItems> is server mode, which needs a controlled `page`. " +
                    "Without it the pager moves the internal page while `data` keeps showing page 1.",
            );
        }
        if (controlledPage !== undefined && !onPageChange) {
            warnOnce(
                "datatable-controlled-page-without-callback",
                "[tempest-react-sdk] <DataTable page> is controlled but `onPageChange` is missing, so the pager cannot do anything.",
            );
        }
        if (sortIsManual && !onSortChange) {
            warnOnce(
                "datatable-manual-sort-without-callback",
                "[tempest-react-sdk] <DataTable> is sorting manually but `onSortChange` is missing: clicking a sortable header changes the arrow and nothing else.",
            );
        }
    }, [serverMode, controlledPage, onPageChange, sortIsManual, onSortChange]);
}
