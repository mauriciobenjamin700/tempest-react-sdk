import type { TelemetryAdapter } from "./types";

/**
 * Dev-friendly adapter that logs every call to `console`. Use as a default
 * before plugging the real provider (Sentry / Datadog / PostHog).
 */
export const consoleTelemetryAdapter: TelemetryAdapter = {
    identify(user) {
        // eslint-disable-next-line no-console
        console.info("[telemetry] identify", user);
    },
    track(event) {
        // eslint-disable-next-line no-console
        console.info("[telemetry] track", event.name, event.properties);
    },
    captureException(error, context) {
        // eslint-disable-next-line no-console
        console.error("[telemetry] exception", error, context);
    },
};
