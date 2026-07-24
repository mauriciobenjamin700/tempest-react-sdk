/**
 * Conflict-resolution helpers for the `applyRemote` callback of
 * {@link createOfflineSync}. Each takes the current local record (or
 * `undefined` when the record is new locally) and the incoming remote record,
 * and returns the winner. Ties resolve to the remote copy, treating the server
 * as authoritative.
 */

/** Normalise a timestamp-ish value to epoch milliseconds. */
function toMillis(value: number | string | Date): number {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Resolve a conflict by keeping whichever record was written last, comparing a
 * timestamp field. The remote record wins ties.
 *
 * @typeParam T - The record shape.
 * @param local - The current local record, or `undefined` when new.
 * @param remote - The incoming remote record.
 * @param getTimestamp - Reads the comparison timestamp (epoch ms, ISO string or `Date`).
 * @returns The winning record.
 *
 * @example
 * applyRemote: async (dto) => {
 *     const local = await store.get(dto.id);
 *     await store.save(lastWriteWins(local, dto, (r) => r.updatedAt));
 * }
 */
export function lastWriteWins<T>(
    local: T | undefined,
    remote: T,
    getTimestamp: (record: T) => number | string | Date,
): T {
    if (local === undefined) return remote;
    return toMillis(getTimestamp(remote)) >= toMillis(getTimestamp(local)) ? remote : local;
}

/**
 * Resolve a conflict by keeping whichever record carries the higher version
 * number (monotonic counter / row version). The remote record wins ties.
 *
 * @typeParam T - The record shape.
 * @param local - The current local record, or `undefined` when new.
 * @param remote - The incoming remote record.
 * @param getVersion - Reads the monotonic version number.
 * @returns The winning record.
 *
 * @example
 * applyRemote: async (dto) => {
 *     const local = await store.get(dto.id);
 *     await store.save(higherVersionWins(local, dto, (r) => r.version));
 * }
 */
export function higherVersionWins<T>(
    local: T | undefined,
    remote: T,
    getVersion: (record: T) => number,
): T {
    if (local === undefined) return remote;
    return getVersion(remote) >= getVersion(local) ? remote : local;
}
