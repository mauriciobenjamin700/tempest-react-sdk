import type { AppErrorReportSchema } from "./app-error-schema";

/**
 * The `localStorage` subset the queue needs, so a test or a non-browser host
 * can hand in its own.
 */
export interface AppErrorQueueStorage {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
}

/** One queued report and how many identical ones were folded into it. */
export interface AppErrorQueueEntry {
    report: AppErrorReportSchema;
    /** How many times this exact report was raised while it waited. */
    count: number;
}

/** The persisted queue the reporter drains. */
export interface AppErrorQueue {
    /** Every waiting entry, oldest first. */
    entries: () => AppErrorQueueEntry[];
    /**
     * Add a report, folding it into an identical waiting one.
     *
     * @returns How many entries the size ceiling evicted (0 or 1).
     */
    push: (report: AppErrorReportSchema) => number;
    /**
     * Drop the entry holding `report` — the one just sent, or refused for good.
     *
     * Matched by content, not by position: a report raised while the send was
     * in flight may have evicted the head, and dropping "the first entry" would
     * then throw away a report nobody sent.
     */
    remove: (report: AppErrorReportSchema) => void;
    /** Drop everything. */
    clear: () => void;
}

/**
 * Whether two reports describe the same failure on the same build.
 *
 * @param a - A waiting report.
 * @param b - The incoming report.
 * @returns `true` when `code`, `message` and `app_version` all match.
 */
function sameReport(a: AppErrorReportSchema, b: AppErrorReportSchema): boolean {
    return a.code === b.code && a.message === b.message && a.app_version === b.app_version;
}

/**
 * Read the queue back, treating anything unreadable as empty.
 *
 * @param storage - Where the queue lives.
 * @param key - Its storage key.
 * @returns The waiting entries.
 */
function load(storage: AppErrorQueueStorage | null, key: string): AppErrorQueueEntry[] {
    if (!storage) return [];
    try {
        const raw = storage.getItem(key);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? (parsed as AppErrorQueueEntry[]) : [];
    } catch {
        return [];
    }
}

/**
 * Build the persisted queue of error reports waiting to be sent.
 *
 * Two rules bound it, because it fills exactly when the device is offline and
 * something is failing repeatedly:
 *
 * - **Identical reports fold.** A failure in a loop raises the same report a
 *   hundred times; it is stored once with a `count`, instead of pushing every
 *   other failure out of the queue.
 * - **A ceiling evicts the oldest.** The newest report is the one closest to
 *   what the user is looking at.
 *
 * Every write is best-effort: with storage unavailable or full, the queue keeps
 * working in memory for the session.
 *
 * @param storage - Backing store, or `null` to keep the queue in memory only.
 * @param key - Storage key.
 * @param maxEntries - Ceiling on distinct waiting reports.
 * @returns The queue.
 *
 * @tempest-limits empty-catch — `setItem` throws on quota exhaustion and in
 * Safari private mode; the in-memory copy is the fallback, and a reporter has no
 * one to tell.
 */
export function createAppErrorQueue(
    storage: AppErrorQueueStorage | null,
    key: string,
    maxEntries: number,
): AppErrorQueue {
    let memory: AppErrorQueueEntry[] = load(storage, key);
    const save = (): void => {
        if (!storage) return;
        try {
            if (memory.length === 0) storage.removeItem(key);
            else storage.setItem(key, JSON.stringify(memory));
        } catch {
            return;
        }
    };
    return {
        entries: () => [...memory],
        push(report) {
            const existing = memory.find((entry) => sameReport(entry.report, report));
            let evicted = 0;
            if (existing) {
                existing.count += 1;
            } else {
                memory.push({ report, count: 1 });
                if (memory.length > maxEntries) {
                    memory = memory.slice(memory.length - maxEntries);
                    evicted = 1;
                }
            }
            save();
            return evicted;
        },
        remove(report) {
            memory = memory.filter((entry) => !sameReport(entry.report, report));
            save();
        },
        clear() {
            memory = [];
            save();
        },
    };
}
