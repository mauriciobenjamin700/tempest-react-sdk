import { appErrorOwner } from "./app-error-owner";
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
     * Who is signed in right now — a stable, non-secret id such as the user id.
     * Read **when the error is reported**, and stored in the queue only as a
     * one-way fingerprint.
     *
     * The token is resolved when the queue drains, which can be after a logout
     * and somebody else's login on the same browser. A queued report goes out
     * with the current bearer only when its owner matches the current one;
     * otherwise {@link CreateAppErrorReporterOptions.foreignReports} decides.
     *
     * Without it, the owner is a fingerprint of the token read at report time:
     * just as safe, but a token refresh between the report and the send makes
     * the report anonymous. Give `getPrincipal` to keep attribution across
     * refreshes. A getter that throws counts as nobody signed in.
     */
    getPrincipal?: () => string | null | undefined;
    /**
     * What to do with a queued report whose owner is not the one signed in at
     * send time — or unknown, for entries queued before 0.77.0. Default
     * `"anonymous"`.
     *
     * - `"anonymous"` — send it without `Authorization`. The route is public,
     *   so the error still reaches the backend; it is only not attributed to
     *   anybody, which is the truth about it from the current session's view.
     * - `"drop"` — discard it. For apps where the previous user's error text
     *   (context, stack) must not leave the device after they signed out.
     *
     * Never is it sent with the current user's bearer: that would credit the
     * previous user's error to whoever signed in next.
     */
    foreignReports?: "anonymous" | "drop";
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
    /**
     * The waiting entries, oldest first. With an async `getToken` and no
     * `getPrincipal`, a report joins them once its token resolves — `flush()`
     * waits for that, `pending()` does not.
     */
    pending: () => AppErrorQueueEntry[];
    /**
     * Drop every waiting report. Call it on logout when reports raised in that
     * session should not outlive it; even without it, a report never leaves
     * with the next user's bearer.
     */
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
 * Fingerprint whoever `getPrincipal` says is signed in.
 *
 * @param getPrincipal - The app's principal getter.
 * @returns The owner, or `null` when nobody is signed in or the getter throws.
 */
function principalOwner(getPrincipal: () => string | null | undefined): string | null {
    try {
        return appErrorOwner("p", getPrincipal());
    } catch {
        return null;
    }
}

/**
 * Stamp the owner of a report being raised now.
 *
 * @param getPrincipal - The app's principal getter, which wins when given.
 * @param getToken - The app's token getter, fingerprinted otherwise.
 * @returns The owner, or a promise of it when the token getter is async.
 */
function ownerNow(
    getPrincipal: CreateAppErrorReporterOptions["getPrincipal"],
    getToken: CreateAppErrorReporterOptions["getToken"],
): string | null | Promise<string | null> {
    if (getPrincipal) return principalOwner(getPrincipal);
    try {
        const token = getToken?.();
        if (typeof token === "object" && token !== null) {
            return Promise.resolve(token).then(
                (value) => appErrorOwner("t", value),
                () => null,
            );
        }
        return appErrorOwner("t", token);
    } catch {
        return null;
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
 * Each report is stamped with who was signed in when it was raised (see
 * `getPrincipal`), and only goes out with the bearer of that same person. The
 * queue never stores a token — only a one-way fingerprint of the owner.
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
    const { endpoint, getToken, getPrincipal, device, autoFlush = true } = options;
    const foreign = options.foreignReports ?? "anonymous";
    const queue = createAppErrorQueue(
        options.storage === undefined ? defaultStorage() : options.storage,
        options.storageKey ?? "tempest:app-errors",
        options.maxEntries ?? 50,
    );
    let running: Promise<AppErrorFlushResult> | null = null;
    let pausedUntil = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stamping = new Set<Promise<void>>();

    const drain = async (): Promise<AppErrorFlushResult> => {
        const send = options.fetch ?? globalThis.fetch.bind(globalThis);
        await Promise.all(stamping);
        const token = await resolveToken(getToken);
        const current = getPrincipal ? principalOwner(getPrincipal) : appErrorOwner("t", token);
        const result: AppErrorFlushResult = { sent: 0, dropped: 0, pending: 0, retryAfterMs: null };
        for (const entry of queue.entries()) {
            const own = entry.owner !== null && entry.owner === current;
            if (!own && entry.owner !== null && foreign === "drop") {
                queue.remove(entry);
                result.dropped += 1;
                continue;
            }
            const outcome = await sendOne(send, endpoint, own ? token : null, entry);
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
            queue.remove(entry);
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
            const report = fitAppErrorReport({ ...readDevice(device), ...description });
            const owner = ownerNow(getPrincipal, getToken);
            if (typeof owner !== "object" || owner === null) {
                queue.push(report, owner);
                if (shouldSend()) void flush();
                return;
            }
            const stamped = owner.then((value) => {
                stamping.delete(stamped);
                queue.push(report, value);
                if (shouldSend()) void flush();
            });
            stamping.add(stamped);
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
