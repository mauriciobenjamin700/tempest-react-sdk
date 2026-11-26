import { createBatteryRecorder } from "./battery";
import { createInputLatencyRecorder } from "./input-latency";
import { createLongFrameRecorder } from "./long-frames";
import type {
    InteractionReport,
    InteractionTrace,
    PerfMonitor,
    PerfMonitorOptions,
    PerfSnapshot,
} from "./monitor-types";
import { createPressureRecorder } from "./pressure";
import { startTrace } from "./trace";

/**
 * Session-wide performance, CPU and battery monitor.
 */

const LONG_FRAME_CAPACITY = 500;

/**
 * Create a monitor and start observing.
 *
 * Create it **once, at app start**, outside React: the observers only see what
 * happens after they exist (plus the browser's small replay buffer), and a
 * monitor re-created on every render would lose its history and leak
 * observers. The same instance serves development (DevTools track,
 * `<PerfHud>`) and production (`onReport` + `sampleRate` to telemetry).
 *
 * What each number means, and what the browser cannot tell:
 *
 * - **Time per step** — wall clock from `performance.now()`, exact.
 * - **CPU cost** — long-frame milliseconds on the main thread, the time the UI
 *   was frozen. Work in Workers and WASM threads is not in it, and no browser
 *   exposes CPU time or FLOPs. Plus the Compute Pressure state (Chromium).
 * - **Input latency** — Event Timing: input delay, handler time, presentation.
 * - **Battery** — level and session drain rate in %/h (Chromium). The level
 *   moves in 1 % steps, so one interaction never registers on its own.
 *
 * Everything unsupported comes back `null`; nothing throws on Safari, Firefox
 * or during SSR.
 *
 * @param options Reporting and history settings.
 * @returns The monitor.
 *
 * @example
 * ```typescript
 * import { createPerfMonitor, perfReportToEvent } from "tempest-react-sdk";
 *
 * export const perf = createPerfMonitor({
 *     sampleRate: import.meta.env.PROD ? 0.1 : 1,
 *     onReport: (report) => console.log(perfReportToEvent(report)),
 * });
 *
 * async function onCheckout(): Promise<void> {
 *     const trace = perf.trace("checkout");
 *     await trace.span("validate", async () => true);
 *     await trace.span("pay", async (step) => {
 *         await step.span("tokenize", async () => "tok");
 *         await step.span("charge", async () => "ok");
 *     });
 *     const report = await trace.end();
 *     console.log(report.spans, report.cpu, report.input);
 * }
 * ```
 */
export function createPerfMonitor(options: PerfMonitorOptions = {}): PerfMonitor {
    const {
        onReport,
        sampleRate = 1,
        devtools = true,
        historySize = 20,
        pressureIntervalMs = 1000,
    } = options;
    const listeners = new Set<() => void>();
    let reports: InteractionReport[] = [];
    let snapshot: PerfSnapshot | null = null;

    const changed = (): void => {
        snapshot = null;
        for (const listener of listeners) listener();
    };

    const longFrames = createLongFrameRecorder(LONG_FRAME_CAPACITY);
    const pressure = createPressureRecorder(pressureIntervalMs, changed);
    const battery = createBatteryRecorder(changed);
    const inputs = createInputLatencyRecorder(historySize, changed);

    const finished = (report: InteractionReport): void => {
        reports = [report, ...reports].slice(0, historySize);
        if (onReport && Math.random() < sampleRate) onReport(report);
        changed();
    };

    return {
        trace(name: string): InteractionTrace {
            return startTrace(name, { longFrames, pressure, battery, inputs, devtools }, finished);
        },
        getSnapshot(): PerfSnapshot {
            snapshot ??= {
                battery: battery.status(),
                pressure: pressure.current(),
                inputs: inputs.recent(),
                reports,
                support: {
                    battery: battery.supported,
                    pressure: pressure.supported,
                    longFrames: longFrames.source,
                    eventTiming: inputs.supported,
                },
            };
            return snapshot;
        },
        subscribe(listener: () => void): () => void {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        stop(): void {
            longFrames.stop();
            pressure.stop();
            battery.stop();
            inputs.stop();
        },
    };
}
