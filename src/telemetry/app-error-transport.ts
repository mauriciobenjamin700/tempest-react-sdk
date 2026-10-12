import type { AppErrorQueueEntry } from "./app-error-queue";
import { fitAppErrorReport } from "./app-error-schema";
import type { AppErrorReportSchema } from "./app-error-schema";

/** What the backend's answer to one send means for the queue. */
export type SendOutcome = { kind: "sent" | "drop" | "stop" } | { kind: "wait"; ms: number };

/**
 * Read a `Retry-After` header as milliseconds.
 *
 * @param header - The header value: delay-seconds or an HTTP date.
 * @returns The delay, at least one second.
 */
export function retryAfterMs(header: string | null): number {
    const seconds = Number(header);
    if (header !== null && Number.isFinite(seconds)) return Math.max(seconds, 1) * 1000;
    const date = header ? Date.parse(header) : Number.NaN;
    return Number.isNaN(date) ? 60_000 : Math.max(date - Date.now(), 1000);
}

/**
 * Build the body for one queued entry, marking how often it repeated.
 *
 * @param entry - The queued entry.
 * @returns The report to send.
 */
export function bodyFor(entry: AppErrorQueueEntry): AppErrorReportSchema {
    if (entry.count <= 1) return entry.report;
    const message = `[repeated ${entry.count}×]\n${entry.report.message}`;
    return fitAppErrorReport({ ...entry.report, message });
}

/**
 * Send one entry and classify what the backend answered.
 *
 * @param send - The `fetch` to use.
 * @param endpoint - Route URL.
 * @param token - Bearer token, or `null`.
 * @param entry - What to send.
 * @returns `sent` (2xx), `wait` (429), `drop` (other 4xx) or `stop` (5xx, 408, network).
 *   Anything unexpected — a rejected `fetch`, a wrapper that resolves without a
 *   `Response` — is `stop`: the report stays queued, and the flush that
 *   `report()` fires in the background never becomes an unhandled rejection.
 */
export async function sendOne(
    send: typeof fetch,
    endpoint: string,
    token: string | null,
    entry: AppErrorQueueEntry,
): Promise<SendOutcome> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
        const response = await send(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(bodyFor(entry)),
        });
        if (response.ok) return { kind: "sent" };
        if (response.status === 429) {
            return { kind: "wait", ms: retryAfterMs(response.headers.get("Retry-After")) };
        }
        if (response.status === 408 || response.status >= 500) return { kind: "stop" };
        return { kind: "drop" };
    } catch {
        return { kind: "stop" };
    }
}

/**
 * How long a report or a flush waits for an async `getToken` before giving up
 * and going without a token.
 *
 * A getter that never settles — a refresh stuck on a dead network, a promise
 * nobody resolves — must not hold the report out of the queue, nor the flush
 * (and every later one, which shares its run) forever. Five seconds covers a
 * slow refresh round trip on a weak connection; past it the report is stamped
 * with no session and leaves anonymously, which never misattributes.
 */
export const APP_ERROR_TOKEN_TIMEOUT_MS = 5_000;

/** The token getter's shape, as {@link readToken} accepts it. */
export type AppErrorTokenGetter = () =>
    string | null | undefined | Promise<string | null | undefined>;

/**
 * Keep only a usable token: a non-empty string.
 *
 * @param value - Whatever the getter produced, possibly from untyped JS.
 * @returns The token, or `null`.
 */
function asToken(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Read the token, synchronously when the getter is synchronous.
 *
 * Staying synchronous for a synchronous getter is what lets `report()` queue
 * the report before it returns; an async getter is bounded by
 * {@link APP_ERROR_TOKEN_TIMEOUT_MS}. A getter that throws, rejects, times out
 * or produces anything but a non-empty string reads as no token.
 *
 * @param getToken - The caller's token getter.
 * @returns The token or `null`, directly or as a promise that always settles.
 */
export function readToken(
    getToken: AppErrorTokenGetter | undefined,
): string | null | Promise<string | null> {
    let value: unknown;
    try {
        value = getToken?.();
    } catch {
        return null;
    }
    if (typeof value !== "object" || value === null) return asToken(value);
    return new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), APP_ERROR_TOKEN_TIMEOUT_MS);
        Promise.resolve(value).then(
            (token) => {
                clearTimeout(timer);
                resolve(asToken(token));
            },
            () => {
                clearTimeout(timer);
                resolve(null);
            },
        );
    });
}
