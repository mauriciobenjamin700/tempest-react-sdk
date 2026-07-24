import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryKey, UseMutationResult } from "@tanstack/react-query";
import type { OfflineSync, OutboxOp, SyncTrigger } from "../offline";

/** The outbox entry a mutation's variables map to. */
export interface OutboxDraft<TPayload> {
    /** The mutation kind. */
    op: OutboxOp;
    /** Primary key of the affected record. */
    recordId: string;
    /** Record snapshot for `create`/`update` (omit for `delete`). */
    payload?: TPayload;
}

/**
 * Configuration for {@link useOfflineMutation}.
 *
 * @typeParam TVariables - The `mutate(variables)` input shape.
 * @typeParam TData - The cached query data optimistically patched.
 * @typeParam TPayload - Record snapshot carried by outbox entries.
 */
export interface UseOfflineMutationOptions<TVariables, TData, TPayload> {
    /** The engine the mutation enqueues into. */
    sync: OfflineSync<TPayload>;
    /** Map `mutate` variables into an outbox entry. */
    toEntry: (variables: TVariables) => OutboxDraft<TPayload>;
    /**
     * Query key to optimistically patch and (optionally) invalidate. Omit to
     * only enqueue without touching the React Query cache.
     */
    queryKey?: QueryKey;
    /**
     * Produce the next cached value from the current one and the variables.
     * Runs in `onMutate`; the previous value is restored automatically if the
     * enqueue throws. Requires `queryKey`.
     */
    applyOptimistic?: (current: TData | undefined, variables: TVariables) => TData;
    /**
     * Trigger a flush after enqueueing. `true` (default) uses
     * `"after-mutation"`; pass a custom {@link SyncTrigger} string, or `false`
     * to leave flushing to the caller / auto-flush hooks.
     */
    flush?: boolean | SyncTrigger;
    /** Invalidate `queryKey` in `onSettled` so a later read refetches. Default `false`. */
    invalidate?: boolean;
}

interface MutationContext<TData> {
    previous: TData | undefined;
}

/**
 * Optimistic mutation that writes to an {@link OfflineSync} outbox instead of
 * hitting the network directly, bridging the sync engine and TanStack Query.
 *
 * On `mutate` it enqueues the entry, optimistically patches the given query
 * cache key and kicks a flush; if the enqueue itself throws, the cache is
 * rolled back to its previous value. Server delivery happens later inside the
 * engine's flush loop, so the UI updates instantly and survives reloads and
 * offline periods.
 *
 * @typeParam TVariables - The `mutate(variables)` input shape.
 * @typeParam TData - The cached query data optimistically patched.
 * @typeParam TPayload - Record snapshot carried by outbox entries.
 * @param options - Engine, variables→entry mapping and cache wiring.
 * @returns The TanStack {@link UseMutationResult}; the mutation resolves to the
 *   generated outbox entry id.
 *
 * @example
 * const addNote = useOfflineMutation({
 *     sync: notesSync,
 *     queryKey: ["notes"],
 *     toEntry: (note: Note) => ({ op: "create", recordId: note.id, payload: note }),
 *     applyOptimistic: (current: Note[] = [], note) => [...current, note],
 * });
 * addNote.mutate(newNote);
 */
export function useOfflineMutation<TVariables, TData = unknown, TPayload = unknown>(
    options: UseOfflineMutationOptions<TVariables, TData, TPayload>,
): UseMutationResult<string, Error, TVariables, MutationContext<TData>> {
    const { sync, toEntry, queryKey, applyOptimistic, flush = true, invalidate = false } = options;
    const client = useQueryClient();

    return useMutation<string, Error, TVariables, MutationContext<TData>>({
        mutationFn: async (variables) => {
            const draft = toEntry(variables);
            const id = await sync.enqueue(draft.op, draft.recordId, draft.payload);
            if (flush !== false) {
                const trigger: SyncTrigger = flush === true ? "after-mutation" : flush;
                void sync.flush(trigger);
            }
            return id;
        },
        onMutate: async (variables) => {
            if (!queryKey || !applyOptimistic) return { previous: undefined };
            await client.cancelQueries({ queryKey });
            const previous = client.getQueryData<TData>(queryKey);
            client.setQueryData<TData>(queryKey, (current) => applyOptimistic(current, variables));
            return { previous };
        },
        onError: (_error, _variables, context) => {
            if (queryKey && context) client.setQueryData(queryKey, context.previous);
        },
        onSettled: () => {
            if (invalidate && queryKey) void client.invalidateQueries({ queryKey });
        },
    });
}
