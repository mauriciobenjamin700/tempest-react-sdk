import { createAppErrorQueue } from "./app-error-queue";
import type { AppErrorQueueEntry, AppErrorQueueStorage } from "./app-error-queue";
import { fitAppErrorReport } from "./app-error-schema";
import type { AppErrorDeviceSchema } from "./app-error-schema";
import { resolveToken, sendOne } from "./app-error-transport";
import { describeAppError } from "./describe-app-error";

/** Options for {@link createAppErrorReporter}. */
export interface CreateAppErrorReporterOptions {
    /** Full URL of the backend route, e.g. `${API_URL}/api/app-errors`. */
    endpoint: string;
    /**
     * Current access token, if any. Optional on purpose: the route is public,
     * and an error raised before login — or with a stale session — still has
     * to get through. A token that throws or resolves empty sends anonymously.
     */
    getToken?: () => string | null | undefined | Promise<string | null | undefined>;
    /**
     * Device facts, read **when the error is reported**, not when it is sent —
     * a report queued offline on `1.4.0` must not go out labelled `1.5.0`.
     */
    device?: () => AppErrorDeviceSchema;
    /** Where the queue persists. Defaults to `localStorage`; `null` keeps it in memory. */
    storage?: AppErrorQueueStorage | null;
    /** Storage key. Default `"tempest:app-errors"`. */
    storageKey?: string;
    /** Ceiling on distinct waiting reports; the oldest is evicted. Default `50`. */
    maxEntries?: number;
    /** `fetch` to send with. Defaults to the global one. */
    fetch?: typeof fetch;
    /** Send on every report and when the browser goes `online`. Default `true`. */
    autoFlush?: boolean;
}

/** What one {@link AppErrorReporter.flush} did. */
export interface AppErrorFlushResult {
    /** Reports the backend accepted. */
    sent: number;
    /** Reports the backend refused for good (a 4xx other than 408/429) and were dropped. */
    dropped: number;
    /** Reports still waiting. */
    pending: number;
    /** Milliseconds the backend asked to wait (429 `Retry-After`), or `null`. */
    retryAfterMs: number | null;
}

/** The reporter {@link createAppErrorReporter} returns. */
export interface AppErrorReporter {
    /** Queue an error with optional context, and try to send it. Never throws. */
    report: (error: unknown, context?: Record<string, unknown>) => void;
    /** Drain the queue now. Concurrent calls share one run. */
    flush: () => Promise<AppErrorFlushResult>;
    /** The waiting entries, oldest first. */
    pending: () => AppErrorQueueEntry[];
    /** Drop every waiting report. */
    clear: () => void;
    /** Remove the `online` listener and the retry timer. */
    dispose: () => void;
}

/**
 * Pick the default store, guarding hosts where touching `localStorage` throws.
 *
 * @returns `localStorage`, or `null` when there is none.
 */
function defaultStorage(): AppErrorQueueStorage | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}

/**
 * Read the device facts, reporting without them when the getter throws.
 *
 * @param device - The caller's getter.
 * @returns The facts, or an empty object.
 */
function readDevice(device: CreateAppErrorReporterOptions["device"]): AppErrorDeviceSchema {
    try {
        return device?.() ?? {};
    } catch {
        return {};
    }
}

/**
 * Report client errors to a Tempest backend's `POST /api/app-errors`, surviving
 * the offline stretches where field errors actually happen.
 *
 * The client half of `tempest-fastapi-sdk`'s `app_errors` module. An error is
 * described ({@link describeAppError}), stamped with the device facts of that
 * moment, fitted to the backend's column limits and queued in `localStorage`
 * before anything goes over the network — so a report raised with no signal is
 * sent when the browser comes back `online`, not lost.
 *
 * What each answer does to the queue:
 *
 * - **2xx** — removed.
 * - **429** — kept; sending pauses for `Retry-After`, then resumes on its own.
 * - **5xx, 408, network failure** — kept; the next report, `online` event or
 *   `flush()` retries.
 * - **any other 4xx** — dropped: the backend will refuse that body forever, and
 *   keeping it would block every report queued behind it.
 *
 * @example
 * import { createAppErrorReporter } from "tempest-react-sdk";
 *
 * const reporter = createAppErrorReporter({
 *     endpoint: `${import.meta.env.VITE_API_URL}/api/app-errors`,
 *     getToken: () => sessionStorage.getItem("access_token"),
 *     device: () => ({ platform: "web", app_version: "1.4.0" }),
 * });
 *
 * reporter.report(new Error("crop failed"), { step: "crop", size: 0 });
 *
 * @param options - Endpoint, token and device getters, storage and limits.
 * @returns The reporter.
 */
export function createAppErrorReporter(options: CreateAppErrorReporterOptions): AppErrorReporter {
    const { endpoint, getToken, device, autoFlush = true } = options;
    const queue = createAppErrorQueue(
        options.storage === undefined ? defaultStorage() : options.storage,
        options.storageKey ?? "tempest:app-errors",
        options.maxEntries ?? 50,
    );
    let running: Promise<AppErrorFlushResult> | null = null;
    let pausedUntil = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const drain = async (): Promise<AppErrorFlushResult> => {
        const send = options.fetch ?? globalThis.fetch.bind(globalThis);
        const token = await resolveToken(getToken);
        const result: AppErrorFlushResult = { sent: 0, dropped: 0, pending: 0, retryAfterMs: null };
        for (const entry of queue.entries()) {
            const outcome = await sendOne(send, endpoint, token, entry);
            if (outcome.kind === "stop") break;
            if (outcome.kind === "wait") {
                result.retryAfterMs = outcome.ms;
                pausedUntil = Date.now() + outcome.ms;
                timer ??= setTimeout(() => {
                    timer = null;
                    void flush();
                }, outcome.ms);
                break;
            }
            queue.remove(entry.report);
            result[outcome.kind === "sent" ? "sent" : "dropped"] += 1;
        }
        result.pending = queue.entries().length;
        return result;
    };

    const flush = (): Promise<AppErrorFlushResult> => {
        running ??= drain().finally(() => {
            running = null;
        });
        return running;
    };

    const shouldSend = (): boolean =>
        autoFlush &&
        Date.now() >= pausedUntil &&
        (typeof navigator === "undefined" || navigator.onLine !== false);

    const onOnline = (): void => {
        if (shouldSend()) void flush();
    };
    if (autoFlush && typeof window !== "undefined") window.addEventListener("online", onOnline);

    return {
        report(error, context) {
            const description = describeAppError(error, context);
            queue.push(fitAppErrorReport({ ...readDevice(device), ...description }));
            if (shouldSend()) void flush();
        },
        flush,
        pending: () => queue.entries(),
        clear: () => queue.clear(),
        dispose() {
            if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
            if (timer) clearTimeout(timer);
            timer = null;
        },
    };
}
