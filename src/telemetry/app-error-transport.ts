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
 * Resolve the token, sending anonymously when it cannot be had.
 *
 * @param getToken - The caller's token getter.
 * @returns The token, or `null`.
 */
export async function resolveToken(
    getToken: (() => string | null | undefined | Promise<string | null | undefined>) | undefined,
): Promise<string | null> {
    try {
        return (await getToken?.()) || null;
    } catch {
        return null;
    }
}
