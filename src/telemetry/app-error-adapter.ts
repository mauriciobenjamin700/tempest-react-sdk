import type { AppErrorReporter } from "./app-error-reporter";
import type { TelemetryAdapter } from "./types";

/** Options for {@link createAppErrorTelemetryAdapter}. */
export interface CreateAppErrorTelemetryAdapterOptions {
    /** The reporter built by `createAppErrorReporter`. */
    reporter: AppErrorReporter;
}

/**
 * Build a {@link TelemetryAdapter} that sends exceptions to a Tempest backend's
 * `/api/app-errors`, so `useTelemetry().captureException` and an
 * `ErrorBoundary` wired to it reach the same table.
 *
 * Only exceptions travel. `identify` is a no-op because the backend takes the
 * user from the bearer token, never from the client; `track` is a no-op because
 * the route stores errors, not product events — pair this adapter with an
 * analytics one if you need both.
 *
 * Mapping:
 * - `captureException(err, ctx)` → `reporter.report(err, ctx)`
 * - `flush()` → `reporter.flush()`
 *
 * @example
 * import {
 *     createAppErrorReporter,
 *     createAppErrorTelemetryAdapter,
 *     TelemetryProvider,
 * } from "tempest-react-sdk";
 *
 * const reporter = createAppErrorReporter({ endpoint: "/api/app-errors" });
 * const adapter = createAppErrorTelemetryAdapter({ reporter });
 *
 * <TelemetryProvider adapter={adapter}><App /></TelemetryProvider>;
 *
 * @param options - The reporter to forward to.
 * @returns The adapter.
 */
export function createAppErrorTelemetryAdapter(
    options: CreateAppErrorTelemetryAdapterOptions,
): TelemetryAdapter {
    const { reporter } = options;
    return {
        identify() {},
        track() {},
        captureException(error, context) {
            reporter.report(error, context);
        },
        async flush() {
            await reporter.flush();
        },
    };
}
