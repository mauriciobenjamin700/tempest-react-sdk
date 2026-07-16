import { useEffect, useRef, useSyncExternalStore } from "react";
import type {
    OfflineSync,
    OutboxOp,
    SyncRunSummary,
    SyncState,
    SyncTrigger,
} from "./create-offline-sync";

/**
 * Options for {@link useOfflineSync}. All auto-flush triggers are opt-in except
 * `flushOnOnline`, which defaults to `true` so the app catches up the moment
 * connectivity returns.
 */
export interface UseOfflineSyncOptions {
    /** Flush once when the component mounts (trigger `"boot"`). Default `false`. */
    flushOnMount?: boolean;
    /**
     * Flush when the browser fires the `online` event (trigger
     * `"online-event"`). Default `true`.
     */
    flushOnOnline?: boolean;
    /**
     * Flush on this interval in milliseconds (trigger `"interval"`). `0`
     * disables the timer. Default `0`.
     */
    intervalMs?: number;
}

/**
 * Reactive view of an {@link OfflineSync} engine, plus its imperative actions.
 * Extends {@link SyncState} so `phase`, `pending`, `lastSummary`, `lastError`
 * and `lastSyncedAt` are read directly off the result.
 *
 * @typeParam TPayload - Record snapshot carried by outbox entries.
 */
export interface UseOfflineSyncResult<TPayload> extends SyncState {
    /** `true` while a flush run is in progress (`phase === "syncing"`). */
    syncing: boolean;
    /** Queue a mutation. Mirrors {@link OfflineSync.enqueue}. */
    enqueue: (op: OutboxOp, recordId: string, payload?: TPayload) => Promise<string>;
    /** Trigger a flush run. Mirrors {@link OfflineSync.flush}. */
    flush: (trigger?: SyncTrigger) => Promise<SyncRunSummary>;
}

/**
 * Subscribe a React component to an {@link OfflineSync} engine.
 *
 * Re-renders whenever the engine's {@link SyncState} changes (enqueue, flush
 * transition, outbox clear) via `useSyncExternalStore`, and optionally wires
 * auto-flush on mount, on the `online` event and on an interval. The engine
 * itself is created once by the app and passed in — the hook never owns it, so
 * multiple components can observe the same queue.
 *
 * @typeParam TPayload - Record snapshot carried by outbox entries.
 * @param sync - The engine returned by `createOfflineSync`.
 * @param options - Auto-flush triggers.
 * @returns The reactive state merged with `enqueue`/`flush` actions.
 *
 * @example
 * const { pending, syncing, phase, flush } = useOfflineSync(notesSync, {
 *     flushOnMount: true,
 *     intervalMs: 30_000,
 * });
 * return <SyncStatusBadge pending={pending} syncing={syncing} phase={phase} />;
 */
export function useOfflineSync<TPayload>(
    sync: OfflineSync<TPayload>,
    options: UseOfflineSyncOptions = {},
): UseOfflineSyncResult<TPayload> {
    const { flushOnMount = false, flushOnOnline = true, intervalMs = 0 } = options;

    const state = useSyncExternalStore(sync.subscribe, sync.getState, sync.getState);

    const flushRef = useRef(sync.flush);
    flushRef.current = sync.flush;

    useEffect(() => {
        if (flushOnMount) void flushRef.current("boot");
    }, [flushOnMount]);

    useEffect(() => {
        if (!flushOnOnline || typeof window === "undefined") return;
        const handleOnline = (): void => {
            void flushRef.current("online-event");
        };
        window.addEventListener("online", handleOnline);
        return () => window.removeEventListener("online", handleOnline);
    }, [flushOnOnline]);

    useEffect(() => {
        if (intervalMs <= 0 || typeof window === "undefined") return;
        const id = window.setInterval(() => {
            void flushRef.current("interval");
        }, intervalMs);
        return () => window.clearInterval(id);
    }, [intervalMs]);

    return {
        ...state,
        syncing: state.phase === "syncing",
        enqueue: sync.enqueue,
        flush: sync.flush,
    };
}

/**
 * Presentation-ready tone for a sync status indicator. Collapses the engine's
 * {@link SyncState} into the single most relevant signal for a badge/pill.
 */
export type SyncTone = "idle" | "syncing" | "pending" | "offline" | "error";

/**
 * Compact status snapshot for a status badge/pill. Prefer this over
 * {@link useOfflineSync} when a component only needs to *display* status and
 * does not trigger flushes itself.
 */
export interface SyncStatus {
    /** The dominant tone to render. */
    tone: SyncTone;
    /** Number of mutations still queued. */
    pending: number;
    /** `true` while a flush run is in progress. */
    syncing: boolean;
    /** `true` when the last run was skipped for being offline. */
    offline: boolean;
    /** Message of the most recent delivery failure, or `null`. */
    lastError: string | null;
}

/**
 * Derive the dominant {@link SyncTone} from an engine snapshot.
 *
 * Precedence: syncing → offline → error → pending → idle. `syncing` wins so an
 * in-flight run always reads as active even while entries remain queued.
 *
 * @param state - The engine {@link SyncState}.
 * @returns The tone to render.
 */
function toneFromState(state: SyncState): SyncTone {
    if (state.phase === "syncing") return "syncing";
    if (state.phase === "offline") return "offline";
    if (state.phase === "error") return "error";
    if (state.pending > 0) return "pending";
    return "idle";
}

/**
 * Subscribe to an {@link OfflineSync} engine and return a display-only
 * {@link SyncStatus}. A thin read-only companion to {@link useOfflineSync},
 * intended to feed a `<SyncStatusBadge>` without exposing flush actions.
 *
 * @typeParam TPayload - Record snapshot carried by outbox entries.
 * @param sync - The engine returned by `createOfflineSync`.
 * @returns The compact status snapshot.
 */
export function useSyncStatus<TPayload>(sync: OfflineSync<TPayload>): SyncStatus {
    const state = useSyncExternalStore(sync.subscribe, sync.getState, sync.getState);
    return {
        tone: toneFromState(state),
        pending: state.pending,
        syncing: state.phase === "syncing",
        offline: state.phase === "offline",
        lastError: state.lastError,
    };
}
