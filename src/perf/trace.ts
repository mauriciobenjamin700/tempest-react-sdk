import { readDeviceProfile } from "./device";
import type { BatteryRecorder } from "./battery";
import type { InputLatencyRecorder } from "./input-latency";
import type { LongFrameRecorder } from "./long-frames";
import type {
    BatterySnapshot,
    InteractionReport,
    InteractionTrace,
    TraceScope,
    TraceSpan,
} from "./monitor-types";
import type { PressureRecorder } from "./pressure";

/**
 * One interaction timed step by step.
 */

/** Recorders a trace reads from when it closes. */
export interface TraceSources {
    longFrames: LongFrameRecorder;
    pressure: PressureRecorder;
    battery: BatteryRecorder;
    inputs: InputLatencyRecorder;
    devtools: boolean;
}

/** A step as recorded, before the long-frame cost is attached. */
interface RawSpan {
    /** Opening order, so a parent and the child it starts in the same millisecond sort parent-first. */
    seq: number;
    name: string;
    path: string;
    depth: number;
    start: number;
    end: number;
    failed: boolean;
}

/**
 * The battery fields a report carries, without the session drain rate.
 *
 * @param battery The recorder.
 * @returns The snapshot, or `null` before the first reading.
 */
function batterySnapshot(battery: BatteryRecorder): BatterySnapshot | null {
    const status = battery.status();
    return status ? { level: status.level, charging: status.charging, at: status.at } : null;
}

/**
 * Write a step to the Chrome DevTools Performance panel.
 *
 * The `detail.devtools` object is the extensibility format Chrome reads to put
 * the measure on a custom track (here "Tempest", one lane per interaction);
 * other browsers keep it as an ordinary user-timing measure. The entry is
 * cleared right away so a long session does not grow the timeline buffer —
 * DevTools records it at creation and observers still receive it.
 *
 * @param trace Interaction name, used as the track.
 * @param span The step.
 */
function writeMeasure(trace: string, span: RawSpan): void {
    const label = `${trace} › ${span.path}`;
    try {
        performance.measure(label, {
            start: span.start,
            end: span.end,
            detail: {
                devtools: {
                    dataType: "track-entry",
                    track: trace,
                    trackGroup: "Tempest",
                    color: span.failed ? "error" : "primary",
                },
            },
        });
        performance.clearMeasures(label);
    } catch {
        return;
    }
}

/**
 * Start a trace.
 *
 * @param name Interaction name.
 * @param sources Recorders shared with the monitor.
 * @param onEnd Called once with the finished report.
 * @returns The running trace.
 */
export function startTrace(
    name: string,
    sources: TraceSources,
    onEnd: (report: InteractionReport) => void,
): InteractionTrace {
    const startTime = performance.now();
    const batteryStart = batterySnapshot(sources.battery);
    const spans: RawSpan[] = [];
    let opened = 0;
    let ended: Promise<InteractionReport> | null = null;

    const record = (span: RawSpan): void => {
        if (ended) return;
        spans.push(span);
        if (sources.devtools) writeMeasure(name, span);
    };

    const scope = (parent: string, depth: number): TraceScope => {
        const open = (step: string): { path: string; start: number; seq: number } => ({
            path: parent ? `${parent}/${step}` : step,
            start: performance.now(),
            seq: opened++,
        });
        const close = (
            step: string,
            started: { path: string; start: number; seq: number },
            failed: boolean,
        ): void => {
            record({ name: step, depth, failed, end: performance.now(), ...started });
        };
        return {
            async span<T>(step: string, run: (child: TraceScope) => Promise<T>): Promise<T> {
                const started = open(step);
                let failed = true;
                try {
                    const value = await run(scope(started.path, depth + 1));
                    failed = false;
                    return value;
                } finally {
                    close(step, started, failed);
                }
            },
            spanSync<T>(step: string, run: (child: TraceScope) => T): T {
                const started = open(step);
                let failed = true;
                try {
                    const value = run(scope(started.path, depth + 1));
                    failed = false;
                    return value;
                } finally {
                    close(step, started, failed);
                }
            },
            mark(step: string, durationMs: number): void {
                const end = performance.now();
                const path = parent ? `${parent}/${step}` : step;
                record({
                    seq: opened++,
                    name: step,
                    path,
                    depth,
                    start: end - durationMs,
                    end,
                    failed: false,
                });
            },
        };
    };

    const finish = async (): Promise<InteractionReport> => {
        const endTime = performance.now();
        const ordered = [...spans].sort((a, b) => a.start - b.start || a.seq - b.seq);
        const whole = sources.longFrames.costBetween(startTime, endTime);
        const report: InteractionReport = {
            name,
            startTime,
            totalMs: endTime - startTime,
            spans: ordered.map((span): TraceSpan => ({
                name: span.name,
                path: span.path,
                depth: span.depth,
                startMs: span.start - startTime,
                durationMs: span.end - span.start,
                longFrameMs: sources.longFrames.costBetween(span.start, span.end)?.ms ?? null,
                failed: span.failed,
            })),
            cpu: {
                longFrameMs: whole?.ms ?? null,
                longFrames: whole?.count ?? null,
                peakPressure: sources.pressure.peakBetween(startTime, endTime),
            },
            battery: { start: batteryStart, end: batterySnapshot(sources.battery) },
            input: sources.inputs.gestureAt(startTime),
            device: readDeviceProfile(),
            failed: ordered.some((span) => span.failed),
            measuredAt: Date.now(),
        };
        onEnd(report);
        return report;
    };

    return {
        ...scope("", 0),
        end(): Promise<InteractionReport> {
            ended ??= finish();
            return ended;
        },
    };
}
