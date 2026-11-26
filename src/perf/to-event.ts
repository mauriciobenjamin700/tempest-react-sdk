import type { TelemetryEvent } from "@/telemetry/types";
import type { InteractionReport } from "./monitor-types";

/**
 * Turn an {@link InteractionReport} into a flat telemetry event.
 *
 * Analytics backends (PostHog, Amplitude, Sentry tags) filter and chart flat
 * properties, not nested arrays, so each step becomes its own
 * `span.<path>.ms` property and every scalar is lifted to the top. Values the
 * browser withheld stay `null`, which those backends treat as "not set" —
 * averaging them in as `0` would make Safari look infinitely fast.
 *
 * Steps that ran more than once under the same path are summed.
 *
 * @param report The finished report.
 * @param eventName Event name. Default `"perf.interaction"`.
 * @returns The event, ready for `TelemetryAdapter.track`.
 *
 * @example
 * ```typescript
 * import { createPerfMonitor, perfReportToEvent } from "tempest-react-sdk";
 *
 * const perf = createPerfMonitor({
 *     sampleRate: 0.1,
 *     onReport: (report) => console.log(perfReportToEvent(report)),
 * });
 * perf.trace("search");
 * ```
 */
export function perfReportToEvent(
    report: InteractionReport,
    eventName: string = "perf.interaction",
): TelemetryEvent {
    const properties: Record<string, unknown> = {
        interaction: report.name,
        totalMs: Math.round(report.totalMs),
        failed: report.failed,
        longFrameMs: report.cpu.longFrameMs === null ? null : Math.round(report.cpu.longFrameMs),
        longFrames: report.cpu.longFrames,
        peakPressure: report.cpu.peakPressure,
        batteryLevel: report.battery.end?.level ?? null,
        charging: report.battery.end?.charging ?? null,
        inputType: report.input?.type ?? null,
        inputDelayMs: report.input?.inputDelayMs ?? null,
        processingMs: report.input?.processingMs ?? null,
        presentationMs: report.input?.presentationMs ?? null,
        hardwareConcurrency: report.device.hardwareConcurrency,
        deviceMemoryGb: report.device.deviceMemoryGb,
    };
    const steps = new Map<string, number>();
    for (const span of report.spans) {
        steps.set(span.path, (steps.get(span.path) ?? 0) + span.durationMs);
    }
    for (const [path, ms] of steps) properties[`span.${path}.ms`] = Math.round(ms);
    return { name: eventName, properties };
}
