import type { TelemetryAdapter } from "./types";

/**
 * Dev-friendly adapter that logs every call to `console`. Use as a default
 * before plugging the real provider (Sentry / Datadog / PostHog).
 */
export const consoleTelemetryAdapter: TelemetryAdapter = {
    identify(user) {
        console.info("[telemetry] identify", user);
    },
    track(event) {
        console.info("[telemetry] track", event.name, event.properties);
    },
    captureException(error, context) {
        console.error("[telemetry] exception", error, context);
    },
};
