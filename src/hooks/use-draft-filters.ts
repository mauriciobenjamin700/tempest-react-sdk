import { useCallback, useRef, useState } from "react";

import { deepEqual } from "./use-deep-memo";
import { useLatestRef } from "./use-latest-ref";

/** An edit to the draft: a partial object merged over it, or an updater. */
export type DraftFiltersPatch<T> = Partial<T> | ((draft: T) => T);

export interface UseDraftFiltersOptions<T> {
    /**
     * Called with the applied value on every `apply()` and `clear()` — the place to
     * reset a page number you keep yourself. `usePaginatedQuery` does not need it:
     * it goes back to page 1 on its own when `applied` changes its `queryKey`.
     */
    onApply?: (applied: T) => void;
    /** Equality behind `isDirty` and the stable `applied`. Default: structural. */
    isEqual?: (a: T, b: T) => boolean;
}

export interface UseDraftFiltersResult<T> {
    /** What the filter controls edit. Changes on every keystroke. */
    draft: T;
    /**
     * What the query reads. Changes only on `apply()`/`clear()`, and keeps its
     * reference when the value applied is equal to the current one — safe to put
     * in a `queryKey`.
     */
    applied: T;
    /** Whether the draft differs from what is applied — enable the apply button on it. */
    isDirty: boolean;
    /** Edit the draft, merging a partial object or running an updater. Never applies. */
    set: (patch: DraftFiltersPatch<T>) => void;
    /**
     * Publish the draft. With a patch, merge it into the draft **and** publish the
     * result in the same call — "filter by this code" from a table row.
     */
    apply: (patch?: DraftFiltersPatch<T>) => void;
    /** Reset the draft and the applied value to the initial one, together. */
    clear: () => void;
}

/** Both halves, kept in one state so they can never be committed apart. */
interface DraftFiltersState<T> {
    draft: T;
    applied: T;
}

/**
 * Resolve a patch against a draft.
 *
 * @param draft - The current draft.
 * @param patch - A partial object to merge, or an updater.
 * @returns The next draft.
 */
function patchDraft<T>(draft: T, patch: DraftFiltersPatch<T>): T {
    return typeof patch === "function" ? patch(draft) : { ...draft, ...patch };
}

/**
 * Draft vs applied state for a server-side filter: the controls edit a draft
 * freely, and the query only sees it when the user applies (a click, or Enter).
 *
 * A server-side filter cannot react to every keystroke — each character typed in
 * a search box would be a request. Every admin screen then writes the same pair of
 * `useState`s, and gets the same three details wrong:
 *
 * - **Clearing moves both halves.** Resetting only the draft leaves a filtered
 *   list under an empty bar; resetting only the applied value leaves the opposite.
 * - **Applying a value that is not in state yet.** "Filter by this code" has to
 *   write the draft and publish it in one gesture; calling `setDraft(x)` and then
 *   publishing `draft` reads the previous value. `apply(patch)` computes the next
 *   draft from a ref that every call keeps current, so it never depends on the
 *   order React flushes state in.
 * - **Resetting the page.** Filtering while on page 7 of a result that now has two
 *   pages shows an empty table. `usePaginatedQuery` handles it by itself when
 *   `applied` is in its `queryKey`; a page kept elsewhere resets in `onApply`.
 *
 * There is no effect in here: applying happens inside the event that asked for it,
 * so one click is one request. `applied` keeps its reference while nothing new is
 * applied, so it can sit in a `queryKey` without a phantom refetch.
 *
 * Like `useState`, the initial value is read on the first render only; `clear()`
 * returns to it.
 *
 * @param initial - The empty filter form: what the screen shows and queries first.
 * @param options - `onApply` and `isEqual`.
 * @returns The draft, the applied value and the gestures between them.
 *
 * @example
 * const filters = useDraftFilters({ code: "", level: "all" });
 * const logs = usePaginatedQuery({
 *     queryKey: ["logs", filters.applied],
 *     queryFn: (params) => api.listLogs({ ...params, ...toQuery(filters.applied) }),
 * });
 * // <Input value={filters.draft.code} onChange={(e) => filters.set({ code: e.target.value })} />
 * // <Button disabled={!filters.isDirty} onClick={() => filters.apply()}>Filtrar</Button>
 */
export function useDraftFilters<T extends object>(
    initial: T,
    options: UseDraftFiltersOptions<T> = {},
): UseDraftFiltersResult<T> {
    const [state, setState] = useState<DraftFiltersState<T>>(() => ({
        draft: initial,
        applied: initial,
    }));
    const initialRef = useRef<T>(state.applied);
    const stateRef = useRef<DraftFiltersState<T>>(state);
    const optionsRef = useLatestRef(options);

    const equal = useCallback(
        (a: T, b: T): boolean => (optionsRef.current.isEqual ?? deepEqual)(a, b),
        [optionsRef],
    );

    const commit = useCallback((next: DraftFiltersState<T>): void => {
        stateRef.current = next;
        setState(next);
    }, []);

    const set = useCallback(
        (patch: DraftFiltersPatch<T>): void => {
            const current = stateRef.current;
            commit({ draft: patchDraft(current.draft, patch), applied: current.applied });
        },
        [commit],
    );

    const publish = useCallback(
        (next: T): void => {
            const current = stateRef.current;
            const applied = equal(next, current.applied) ? current.applied : next;
            commit({ draft: next, applied });
            optionsRef.current.onApply?.(applied);
        },
        [commit, equal, optionsRef],
    );

    const apply = useCallback(
        (patch?: DraftFiltersPatch<T>): void => {
            const draft = stateRef.current.draft;
            publish(patch === undefined ? draft : patchDraft(draft, patch));
        },
        [publish],
    );

    const clear = useCallback((): void => publish(initialRef.current), [publish]);

    return {
        draft: state.draft,
        applied: state.applied,
        isDirty: !(options.isEqual ?? deepEqual)(state.draft, state.applied),
        set,
        apply,
        clear,
    };
}
