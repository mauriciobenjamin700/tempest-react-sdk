/**
 * Ready-made `applyOptimistic` builders for {@link useOfflineMutation} over a
 * list-shaped query cache (`TData = T[]`). They cover the two most common
 * optimistic edits — insert-or-update and remove — so callers stop hand-writing
 * the array spread. Both compare records by an id field (`"id"` by default) and
 * treat the mutation variables as the record itself.
 */

/**
 * Build an `applyOptimistic` that inserts the item when absent or shallow-merges
 * it into the existing entry (matched by `idField`). New items append to the end.
 *
 * @typeParam T - The list item shape.
 * @param idField - The identity field. Default `"id"`.
 * @returns An `(current, item) => T[]` patcher for a list cache.
 *
 * @example
 * useOfflineMutation<Note, Note[], Note>({
 *     sync, queryKey: ["notes"],
 *     toEntry: (n) => ({ op: "update", recordId: n.id, payload: n }),
 *     applyOptimistic: upsertById(),
 * });
 */
export function upsertById<T>(
    idField: keyof T = "id" as keyof T,
): (current: T[] | undefined, item: T) => T[] {
    return (current = [], item) => {
        const index = current.findIndex((entry) => entry[idField] === item[idField]);
        if (index === -1) return [...current, item];
        const next = current.slice();
        next[index] = { ...current[index], ...item };
        return next;
    };
}

/**
 * Build an `applyOptimistic` that removes the entry matching the item's id
 * (by `idField`) from the list. For `delete` mutations, pass variables carrying
 * at least the id field.
 *
 * @typeParam T - The list item shape.
 * @param idField - The identity field. Default `"id"`.
 * @returns An `(current, item) => T[]` patcher for a list cache.
 *
 * @example
 * useOfflineMutation<{ id: string }, Note[], Note>({
 *     sync, queryKey: ["notes"],
 *     toEntry: ({ id }) => ({ op: "delete", recordId: id }),
 *     applyOptimistic: removeById(),
 * });
 */
export function removeById<T, V extends Partial<Record<keyof T, unknown>> = T>(
    idField: keyof T = "id" as keyof T,
): (current: T[] | undefined, item: V) => T[] {
    return (current = [], item) => {
        const targetId = (item as Record<keyof T, unknown>)[idField];
        return current.filter((entry) => entry[idField] !== targetId);
    };
}
