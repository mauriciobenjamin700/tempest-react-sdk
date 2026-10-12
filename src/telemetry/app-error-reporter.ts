import { ownerFingerprint } from "@/utils/owner-fingerprint";
import { createAppErrorQueue } from "./app-error-queue";
import type { AppErrorQueueEntry, AppErrorQueueStorage, AppErrorStamp } from "./app-error-queue";
import { fitAppErrorReport } from "./app-error-schema";
import type { AppErrorDeviceSchema } from "./app-error-schema";
import { readToken, sendOne } from "./app-error-transport";
import { describeAppError } from "./describe-app-error";
import { isDevBuild } from "../utils/dev-mode";

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
     * one-way fingerprint (`entry.owner`). A non-string (an `async` getter
     * from untyped JS, an object) or a getter that throws reads as nobody.
     *
     * It never grants the bearer. The bearer goes out only when the token at
     * send time is the very token that was in force at report time (its
     * fingerprint is `entry.session`): the principal and the token come from
     * two sources, and a principal store that lags behind a login would
     * otherwise send A's report with B's token. The principal only tells
     * {@link CreateAppErrorReporterOptions.foreignReports} `"drop"` whose
     * report is whose.
     */
    getPrincipal?: () => string | number | null | undefined;
    /**
     * What to do with a queued report that cannot go out with the current
     * bearer — raised under another token, or queued before 0.77.0. Default
     * `"anonymous"`.
     *
     * - `"anonymous"` — send it without `Authorization`. The route is public,
     *   so the error still reaches the backend; it is only not attributed to
     *   anybody. This includes the user's own reports raised before a token
     *   refresh: attribution is lost, never misplaced.
     * - `"drop"` — discard every report not proven to be the current
     *   principal's: another principal, nobody, or unknown (no principal at
     *   report time, a legacy entry, or nobody signed in now). For apps where
     *   a previous user's error text must not leave the device after they
     *   signed out. **Needs `getPrincipal`**: without it the only identity is
     *   the token fingerprint, and a refresh changes it, so a mismatch is no
     *   proof the report is someone else's — the reporter then sends
     *   anonymously instead of destroying the user's own reports.
     *
     * Never is a report sent with a bearer other than the one it was raised
     * under: that would credit the previous user's error to whoever signed in
     * next.
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
     *
     * It also stops a flush in flight before its next send (the one already on
     * the wire cannot be recalled), and discards reports still waiting for an
     * async `getToken` to stamp them — both would otherwise refill the queue or
     * keep sending what the logout meant to forget.
     */
    clear: () => void;
    /** Remove the `online` listener and the retry timer. */
    dispose: () => void;
}

/** Set once the warning has printed, so every reporter built after it stays quiet. */
let warnedDropWithoutPrincipal = false;

/**
 * Reset the warn-once latch. Test-only: the latch is module state, so a suite
 * asserting the warning more than once would otherwise see it only the first time.
 */
export function resetDropWithoutPrincipalWarning(): void {
    warnedDropWithoutPrincipal = false;
}

/**
 * Warn once, in development, that `foreignReports: "drop"` was asked for
 * without the `getPrincipal` it needs.
 *
 * Without a principal the only identity is the token fingerprint, which a
 * refresh changes, so the reporter cannot tell a foreign report from the
 * user's own and sends them anonymously instead of dropping them. The option
 * type-checks either way, so nothing else would tell the app its privacy
 * choice is not in force.
 *
 * @param options - The reporter's options.
 */
function warnOnDropWithoutPrincipal(options: CreateAppErrorReporterOptions): void {
    if (warnedDropWithoutPrincipal || options.foreignReports !== "drop") return;
    if (options.getPrincipal !== undefined || !isDevBuild()) return;
    warnedDropWithoutPrincipal = true;
    console.warn(
        '[tempest-react-sdk] createAppErrorReporter({ foreignReports: "drop" }) needs ' +
            "`getPrincipal`: without it the reporter cannot prove a queued report belongs " +
            "to someone else, so it drops nothing and those reports go out anonymously. " +
            'Pass `getPrincipal` to make "drop" take effect.',
    );
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
function principalOwner(getPrincipal: () => unknown): string | null {
    try {
        return ownerFingerprint("p", getPrincipal());
    } catch {
        return null;
    }
}

/**
 * Stamp a report being raised now with its session and, when given, principal.
 *
 * @param getPrincipal - The app's principal getter, read synchronously.
 * @param token - The token read now, or a promise of it.
 * @returns The stamp, or a promise of it when the token is still arriving.
 */
function stampNow(
    getPrincipal: CreateAppErrorReporterOptions["getPrincipal"],
    token: string | null | Promise<string | null>,
): AppErrorStamp | Promise<AppErrorStamp> {
    const owner = getPrincipal ? { owner: principalOwner(getPrincipal) } : {};
    if (typeof token === "string" || token === null) {
        return { session: ownerFingerprint("t", token), ...owner };
    }
    return token.then((value) => ({ session: ownerFingerprint("t", value), ...owner }));
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
 * Each report is stamped with a one-way fingerprint of the token in force when
 * it was raised, and goes out with a bearer only when the token at send time is
 * that same one — never with the token of whoever signed in next. The queue
 * never stores a token. `clear()` also stops a flush in flight and discards
 * reports still waiting for an async token.
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
    warnOnDropWithoutPrincipal(options);
    const strict = getPrincipal !== undefined && options.foreignReports === "drop";
    const queue = createAppErrorQueue(
        options.storage === undefined ? defaultStorage() : options.storage,
        options.storageKey ?? "tempest:app-errors",
        options.maxEntries ?? 50,
    );
    let running: Promise<AppErrorFlushResult> | null = null;
    let pausedUntil = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stamping = new Set<Promise<void>>();
    let generation = 0;

    const drain = async (): Promise<AppErrorFlushResult> => {
        const send = options.fetch ?? globalThis.fetch.bind(globalThis);
        await Promise.all(stamping);
        const token = await readToken(getToken);
        const session = ownerFingerprint("t", token);
        const current = getPrincipal ? principalOwner(getPrincipal) : null;
        const started = generation;
        const result: AppErrorFlushResult = { sent: 0, dropped: 0, pending: 0, retryAfterMs: null };
        for (const entry of queue.entries()) {
            if (!queue.has(entry)) continue;
            if (strict && (entry.owner == null || entry.owner !== current)) {
                queue.remove(entry);
                result.dropped += 1;
                continue;
            }
            const bearer = entry.session != null && entry.session === session ? token : null;
            const outcome = await sendOne(send, endpoint, bearer, entry);
            if (generation !== started) break;
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
            const stamp = stampNow(getPrincipal, readToken(getToken));
            if (!(stamp instanceof Promise)) {
                queue.push(report, stamp);
                if (shouldSend()) void flush();
                return;
            }
            const raisedIn = generation;
            const stamped = stamp.then((value) => {
                stamping.delete(stamped);
                if (generation !== raisedIn) return;
                queue.push(report, value);
                if (shouldSend()) void flush();
            });
            stamping.add(stamped);
        },
        flush,
        pending: () => queue.entries(),
        clear() {
            generation += 1;
            queue.clear();
        },
        dispose() {
            if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
            if (timer) clearTimeout(timer);
            timer = null;
        },
    };
}
