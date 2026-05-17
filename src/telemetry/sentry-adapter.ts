import type { TelemetryAdapter, TelemetryEvent, TelemetryUser } from "./types";

/**
 * Minimal subset of `@sentry/browser` used by the adapter. Lets you pass
 * either the real SDK module (`import * as Sentry from "@sentry/browser"`)
 * or a stubbed object in tests.
 */
export interface SentryLike {
    init?: (options: Record<string, unknown>) => void;
    setUser: (user: Record<string, unknown> | null) => void;
    addBreadcrumb: (breadcrumb: {
        category?: string;
        message?: string;
        level?: string;
        data?: Record<string, unknown>;
    }) => void;
    captureException: (
        error: unknown,
        hint?: { extra?: Record<string, unknown>; contexts?: Record<string, unknown> },
    ) => void;
    flush?: (timeout?: number) => Promise<boolean>;
}

export interface CreateSentryTelemetryAdapterOptions {
    /** The Sentry browser SDK namespace. Required. */
    sentry: SentryLike;
    /** Optional init payload — passed verbatim to `Sentry.init` when the provider mounts. */
    initOptions?: Record<string, unknown>;
    /** Flush timeout in ms (default `2000`). */
    flushTimeout?: number;
    /** Breadcrumb category for `track` events (default `"app"`). */
    breadcrumbCategory?: string;
}

function userToSentry(user: TelemetryUser | null): Record<string, unknown> | null {
    if (user === null) return null;
    const { id, email, name, traits } = user;
    return {
        ...(id !== undefined ? { id } : null),
        ...(email !== undefined ? { email } : null),
        ...(name !== undefined ? { username: name } : null),
        ...(traits ?? null),
    };
}

/**
 * Build a [[TelemetryAdapter]] backed by `@sentry/browser`. The Sentry SDK
 * is supplied by the caller (not bundled) so apps that already initialise
 * Sentry at startup can share that instance — and apps that don't use
 * Sentry never pay for it.
 *
 * Mapping:
 * - `identify(user)` → `Sentry.setUser`
 * - `track(event)` → `Sentry.addBreadcrumb({ category, message: event.name, data })`
 * - `captureException(err, ctx)` → `Sentry.captureException(err, { extra: ctx })`
 * - `flush()` → `Sentry.flush(flushTimeout)`
 *
 * @example
 * import * as Sentry from "@sentry/browser";
 * import { createSentryTelemetryAdapter, TelemetryProvider } from "tempest-react-sdk";
 *
 * const adapter = createSentryTelemetryAdapter({
 *     sentry: Sentry,
 *     initOptions: { dsn: import.meta.env.VITE_SENTRY_DSN, tracesSampleRate: 0.1 },
 * });
 *
 * <TelemetryProvider adapter={adapter}><App /></TelemetryProvider>;
 */
export function createSentryTelemetryAdapter(
    options: CreateSentryTelemetryAdapterOptions,
): TelemetryAdapter {
    const { sentry, initOptions, flushTimeout = 2000, breadcrumbCategory = "app" } = options;

    return {
        init() {
            if (initOptions && sentry.init) {
                sentry.init(initOptions);
            }
        },
        identify(user: TelemetryUser | null) {
            sentry.setUser(userToSentry(user));
        },
        track(event: TelemetryEvent) {
            sentry.addBreadcrumb({
                category: breadcrumbCategory,
                message: event.name,
                level: "info",
                ...(event.properties ? { data: event.properties } : null),
            });
        },
        captureException(error: unknown, context?: Record<string, unknown>) {
            sentry.captureException(error, context ? { extra: context } : undefined);
        },
        async flush() {
            if (sentry.flush) {
                await sentry.flush(flushTimeout);
            }
        },
    };
}
