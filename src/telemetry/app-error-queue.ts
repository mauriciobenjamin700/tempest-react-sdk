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
    /**
     * Who was signed in when the report was raised — a one-way fingerprint of
     * the principal (or, without `getPrincipal`, of the token), never the
     * credential itself. `null` means nobody was; the field is missing on
     * entries persisted before it existed (≤ 0.76.0), whose owner is unknown.
     *
     * The bearer is resolved when the queue drains, not when the error happens,
     * so this is what keeps a report user A raised offline from leaving with
     * user B's token after B signs in on the same browser.
     */
    owner?: string | null;
}

/** The persisted queue the reporter drains. */
export interface AppErrorQueue {
    /** Every waiting entry, oldest first. */
    entries: () => AppErrorQueueEntry[];
    /**
     * Add a report, folding it into an identical waiting one of the same owner.
     *
     * @param report - The fitted report.
     * @param owner - Fingerprint of who was signed in, or `null` for nobody.
     * @returns How many entries the size ceiling evicted (0 or 1).
     */
    push: (report: AppErrorReportSchema, owner: string | null) => number;
    /**
     * Drop `entry` — the one just sent, or refused for good.
     *
     * Matched by content and owner, not by position: a report raised while the
     * send was in flight may have evicted the head, and dropping "the first
     * entry" would then throw away a report nobody sent.
     */
    remove: (entry: AppErrorQueueEntry) => void;
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
 * Whether a waiting entry holds this report raised by this owner.
 *
 * The owner is part of the identity on purpose: folding B's report into A's
 * waiting one would send B's occurrences under A's name, which is the
 * misattribution the owner exists to prevent.
 *
 * @param entry - A waiting entry.
 * @param report - The report to match.
 * @param owner - The owner to match; `undefined` matches only legacy entries.
 * @returns `true` when report and owner both match.
 */
function holds(
    entry: AppErrorQueueEntry,
    report: AppErrorReportSchema,
    owner: string | null | undefined,
): boolean {
    return sameReport(entry.report, report) && entry.owner === owner;
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
 * - **Identical reports from the same owner fold.** A failure in a loop raises the same report a
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
        push(report, owner) {
            const existing = memory.find((entry) => holds(entry, report, owner));
            let evicted = 0;
            if (existing) {
                existing.count += 1;
            } else {
                memory.push({ report, count: 1, owner });
                if (memory.length > maxEntries) {
                    memory = memory.slice(memory.length - maxEntries);
                    evicted = 1;
                }
            }
            save();
            return evicted;
        },
        remove(target) {
            memory = memory.filter((entry) => !holds(entry, target.report, target.owner));
            save();
        },
        clear() {
            memory = [];
            save();
        },
    };
}
