import type { TelemetryAdapter, TelemetryEvent, TelemetryUser } from "./types";

/**
 * Minimal subset of `posthog-js` used by the adapter. Pass either the real
 * default export (`import posthog from "posthog-js"`) or a stubbed object
 * in tests.
 */
export interface PostHogLike {
    init?: (apiKey: string, options?: Record<string, unknown>) => void;
    identify: (distinctId: string, properties?: Record<string, unknown>) => void;
    capture: (eventName: string, properties?: Record<string, unknown>) => void;
    captureException?: (error: unknown, properties?: Record<string, unknown>) => void;
    reset?: () => void;
}

export interface CreatePostHogTelemetryAdapterOptions {
    /** The PostHog JS client (the default export of `posthog-js`). Required. */
    posthog: PostHogLike;
    /** Project API key + options. When provided, `Provider.init` calls `posthog.init(apiKey, options)`. */
    init?: { apiKey: string; options?: Record<string, unknown> };
}

function userToProperties(user: TelemetryUser): Record<string, unknown> {
    const { email, name, traits } = user;
    return {
        ...(email !== undefined ? { email } : null),
        ...(name !== undefined ? { name } : null),
        ...(traits ?? null),
    };
}

/**
 * Build a [[TelemetryAdapter]] backed by [`posthog-js`](https://posthog.com/docs/libraries/js).
 * The PostHog client is supplied by the caller (not bundled).
 *
 * Mapping:
 * - `identify(user)` → `posthog.identify(user.id, { email, name, ...traits })` (or `posthog.reset()` when `null`)
 * - `track({ name, properties })` → `posthog.capture(name, properties)`
 * - `captureException(err, ctx)` → `posthog.captureException(err, ctx)` when available, otherwise `posthog.capture("$exception", { …err, …ctx })`
 * - `flush()` → no-op (PostHog batches automatically)
 *
 * @example
 * import posthog from "posthog-js";
 * import { createPostHogTelemetryAdapter, TelemetryProvider } from "tempest-react-sdk";
 *
 * const adapter = createPostHogTelemetryAdapter({
 *     posthog,
 *     init: { apiKey: import.meta.env.VITE_POSTHOG_KEY, options: { api_host: "https://us.i.posthog.com" } },
 * });
 *
 * <TelemetryProvider adapter={adapter}><App /></TelemetryProvider>;
 */
export function createPostHogTelemetryAdapter(
    options: CreatePostHogTelemetryAdapterOptions,
): TelemetryAdapter {
    const { posthog, init } = options;

    return {
        init() {
            if (init && posthog.init) {
                posthog.init(init.apiKey, init.options);
            }
        },
        identify(user: TelemetryUser | null) {
            if (user === null) {
                posthog.reset?.();
                return;
            }
            if (user.id === undefined) return;
            posthog.identify(user.id, userToProperties(user));
        },
        track(event: TelemetryEvent) {
            posthog.capture(event.name, event.properties);
        },
        captureException(error: unknown, context?: Record<string, unknown>) {
            if (posthog.captureException) {
                posthog.captureException(error, context);
                return;
            }
            const err = error instanceof Error ? error : new Error(String(error));
            posthog.capture("$exception", {
                $exception_message: err.message,
                $exception_type: err.name,
                $exception_stack_trace_raw: err.stack,
                ...context,
            });
        },
    };
}
