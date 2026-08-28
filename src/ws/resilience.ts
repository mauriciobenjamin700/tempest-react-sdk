/** Why a socket stopped trying to come back. */
export type WebSocketLostReason = "rejected" | "exhausted";

/**
 * First close code in the range a server uses to refuse a peer outright.
 *
 * `tempest-fastapi-sdk` closes with 4400 (invalid room), 4401 (unauthorized),
 * 4403 (forbidden) and 4409 (full) — none of which get better by trying again,
 * so retrying only reproduces the rejection while the person watches a spinner.
 */
export const REJECTION_CLOSE_MIN = 4400;

/** Last close code in the rejection range. */
export const REJECTION_CLOSE_MAX = 4499;

/**
 * Heartbeat timeout, which sits inside the rejection range but is not one.
 *
 * `tempest-fastapi-sdk` closes with 4408 when no `pong` arrived within
 * `WS_HEARTBEAT_TIMEOUT_SECONDS`. That is the *link* failing, not the server
 * refusing the peer — exactly the case reconnection exists for. Treating the
 * whole 4400–4499 range as fatal, which is the obvious reading, makes one
 * missed pong permanent.
 */
export const HEARTBEAT_CLOSE_CODE = 4408;

/**
 * Clean close codes that still deserve a retry.
 *
 * A close is normally taken as final when the closing handshake completed
 * (`wasClean`), because that means the server said so on purpose. These four
 * say the opposite: the server is going away for a reason that ends —
 * 1001 going away, 1011 internal error, 1012 service restart (a deploy),
 * 1013 try again later — and the socket comes back if anyone asks again.
 */
const RETRYABLE_CLEAN_CLOSE_CODES: ReadonlySet<number> = new Set([1001, 1011, 1012, 1013]);

/**
 * Whether a close code means the server refused this client for good.
 *
 * @param code - The `CloseEvent.code`.
 * @returns `true` when reconnecting can only reproduce the refusal.
 *
 * @example
 * isRejectionCloseCode(4401); // true — unauthorized
 * isRejectionCloseCode(4408); // false — heartbeat timeout, retry it
 */
export function isRejectionCloseCode(code: number): boolean {
    return (
        code >= REJECTION_CLOSE_MIN && code <= REJECTION_CLOSE_MAX && code !== HEARTBEAT_CLOSE_CODE
    );
}

/**
 * Whether a closed socket should be reopened.
 *
 * An unclean close is always retried: the connection died rather than ended.
 * A clean one is retried only for the codes that describe a server which is
 * temporarily unavailable, plus the heartbeat timeout — a server that closes
 * cleanly with 1000 meant it.
 *
 * @param code - The `CloseEvent.code`.
 * @param wasClean - The `CloseEvent.wasClean` flag.
 * @returns `true` when the connection is worth reopening.
 */
export function shouldRetryClose(code: number, wasClean: boolean): boolean {
    if (isRejectionCloseCode(code)) return false;
    if (!wasClean) return true;
    return code === HEARTBEAT_CLOSE_CODE || RETRYABLE_CLEAN_CLOSE_CODES.has(code);
}

/** Shape of the backoff schedule. */
export interface BackoffOptions {
    /** Delay before the first retry (ms), doubled each attempt. */
    initialBackoff: number;
    /** Ceiling for the doubling (ms). */
    maxBackoff: number;
    /** Fraction of the delay added at random, 0–1. */
    jitter: number;
}

/**
 * Delay before retry number `attempt` (0-based), with jitter.
 *
 * The jitter matters when the *server* is what went down: every client that was
 * connected to it wakes on the same schedule and retries in the same
 * millisecond, so the box comes back up into a synchronized stampede and drops
 * the connections again. Spreading each delay by a fraction of itself breaks
 * the alignment, and it only ever adds time — the floor stays predictable.
 *
 * @param attempt - Zero-based retry index.
 * @param options - Schedule shape.
 * @param random - Source of randomness, injectable for tests. Defaults to `Math.random`.
 * @returns Delay in milliseconds.
 *
 * @example
 * backoffDelay(0, { initialBackoff: 1000, maxBackoff: 30000, jitter: 0.3 });
 * // 1000–1300
 */
export function backoffDelay(
    attempt: number,
    { initialBackoff, maxBackoff, jitter }: BackoffOptions,
    random: () => number = Math.random,
): number {
    const base = Math.min(initialBackoff * 2 ** attempt, maxBackoff);
    if (jitter <= 0) return base;
    return base + random() * base * jitter;
}
