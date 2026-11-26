import type { DeviceProfile } from "./types";

/**
 * Shapes produced by {@link createPerfMonitor}: per-step timing of an
 * interaction, main-thread cost, CPU pressure, input latency and battery.
 *
 * Every field the platform may withhold is `null` rather than a guess, so a
 * dashboard can render "—" and an aggregate can skip the sample instead of
 * averaging in a fabricated zero.
 */

/**
 * CPU pressure as reported by the Compute Pressure API, ordered from idle to
 * throttling.
 */
export type CpuPressureState = "nominal" | "fair" | "serious" | "critical";

/** A battery reading. */
export interface BatterySnapshot {
    /** Charge level in `[0, 1]`. Browsers round it to 1 % steps. */
    level: number;
    /** Whether the device is plugged in. */
    charging: boolean;
    /** `performance.now()` at which the reading was taken. */
    at: number;
}

/**
 * Latency of one user gesture, from the input event to the frame that showed
 * its result — the three parts Interaction to Next Paint is made of.
 */
export interface InputTiming {
    /** `PerformanceEventTiming.interactionId`, shared by every event of a gesture. */
    interactionId: number;
    /** Event type of the slowest event in the gesture, e.g. `"click"`. */
    type: string;
    /** `performance.now()` at which the input happened. */
    startTime: number;
    /** Input to handler start: the main thread was busy with something else. */
    inputDelayMs: number;
    /** Time spent inside the event handlers. */
    processingMs: number;
    /** Handler end to the next paint: rendering, layout and compositing. */
    presentationMs: number;
    /** Whole gesture, input to paint. Rounded by the browser to 8 ms. */
    durationMs: number;
}

/** One timed step of an {@link InteractionTrace}. */
export interface TraceSpan {
    /** Name given to `span()`, e.g. `"upload"`. */
    name: string;
    /** Names from the root down, joined by `/`, e.g. `"upload/sign"`. */
    path: string;
    /** Nesting level, `0` for a step started on the trace itself. */
    depth: number;
    /** Start, in milliseconds since the trace began. */
    startMs: number;
    /** Wall-clock duration in milliseconds. */
    durationMs: number;
    /**
     * Milliseconds of long animation frames (≥ 50 ms) overlapping this step:
     * main-thread time the user could not interact. `null` when the browser
     * reports neither `long-animation-frame` nor `longtask`.
     */
    longFrameMs: number | null;
    /** Whether the step threw or rejected. */
    failed: boolean;
}

/** Main-thread and CPU cost of a trace. */
export interface TraceCpuCost {
    /** Long-frame milliseconds over the whole trace, or `null` when unobservable. */
    longFrameMs: number | null;
    /** Number of long frames overlapping the trace, or `null` when unobservable. */
    longFrames: number | null;
    /** Worst CPU pressure seen during the trace, or `null` without Compute Pressure. */
    peakPressure: CpuPressureState | null;
}

/** What one interaction cost, step by step. */
export interface InteractionReport {
    /** Name given to `monitor.trace()`. */
    name: string;
    /** `performance.now()` at which the trace began. */
    startTime: number;
    /** Milliseconds from `trace()` to `end()`. */
    totalMs: number;
    /** Every step, in the order it started. */
    spans: readonly TraceSpan[];
    cpu: TraceCpuCost;
    /** Battery at the start and end of the trace; `null` where unsupported. */
    battery: { start: BatterySnapshot | null; end: BatterySnapshot | null };
    /**
     * The gesture whose handler started this trace, when the browser reported
     * it by the time `end()` ran. `null` for traces not started from an input
     * handler, gestures faster than 16 ms, and browsers without Event Timing.
     */
    input: InputTiming | null;
    device: DeviceProfile;
    /** Whether any step failed. */
    failed: boolean;
    /** Epoch millis at which the report was assembled. */
    measuredAt: number;
}

/** Steps can be nested: every span callback receives a scope of its own. */
export interface TraceScope {
    /**
     * Time an async step. Nested steps go through the scope handed to `run`.
     *
     * @param name Step label; must not contain `/`, which joins paths.
     * @param run The work to time.
     * @returns Whatever `run` resolved to.
     */
    span<T>(name: string, run: (scope: TraceScope) => Promise<T>): Promise<T>;
    /**
     * Time a synchronous step.
     *
     * @param name Step label; must not contain `/`, which joins paths.
     * @param run The work to time.
     * @returns Whatever `run` returned.
     */
    spanSync<T>(name: string, run: (scope: TraceScope) => T): T;
    /**
     * Record a step measured elsewhere — a server's `Server-Timing`, the
     * `speed` of a `tempest-react-sdk/vision` prediction. It is placed ending
     * now.
     *
     * @param name Step label.
     * @param durationMs How long it took.
     */
    mark(name: string, durationMs: number): void;
}

/** A running interaction. Close it with `end()`. */
export interface InteractionTrace extends TraceScope {
    /**
     * Close the trace and assemble its report. Calling it twice returns the
     * same report; steps recorded after the first call are ignored.
     *
     * @returns The report, also handed to `onReport` when sampled.
     */
    end(): Promise<InteractionReport>;
}

/** Battery state with the discharge rate measured so far. */
export interface BatteryStatus extends BatterySnapshot {
    /**
     * Percentage points lost per hour while unplugged, measured between two
     * level changes so the 1 % rounding does not skew it. `null` until two
     * changes were seen on battery, and again after every plug/unplug.
     */
    drainPerHour: number | null;
}

/** Everything a live view of the monitor needs, replaced on every change. */
export interface PerfSnapshot {
    /** `null` where the Battery Status API is missing (Safari, Firefox). */
    battery: BatteryStatus | null;
    /** `null` where Compute Pressure is missing or blocked. */
    pressure: CpuPressureState | null;
    /** Most recent gestures, newest first. */
    inputs: readonly InputTiming[];
    /** Most recent reports, newest first. */
    reports: readonly InteractionReport[];
    /** Which sources this browser exposes. */
    support: PerfSupport;
}

/** Which measurement sources the running browser exposes. */
export interface PerfSupport {
    battery: boolean;
    pressure: boolean;
    longFrames: "long-animation-frame" | "longtask" | null;
    eventTiming: boolean;
}

/** Options for {@link createPerfMonitor}. */
export interface PerfMonitorOptions {
    /**
     * Called with every finished report that wins the `sampleRate` draw —
     * typically `(r) => telemetry.track(perfReportToEvent(r))`.
     */
    onReport?: (report: InteractionReport) => void;
    /**
     * Share of reports, in `[0, 1]`, handed to `onReport`. Default `1`. Lower
     * it in production: every report is one telemetry event.
     */
    sampleRate?: number;
    /**
     * Also write each step as a `performance.measure()` on a "Tempest" track of
     * the Chrome DevTools Performance panel. Default `true`.
     */
    devtools?: boolean;
    /** How many reports and gestures the snapshot keeps. Default `20`. */
    historySize?: number;
    /**
     * CPU pressure sampling period in milliseconds. Default `1000`, the
     * shortest interval Chromium honours without a flag.
     */
    pressureIntervalMs?: number;
}

/** Collects performance, CPU and battery data for a whole app session. */
export interface PerfMonitor {
    /**
     * Start timing an interaction. Start it inside the input handler to pair
     * the report with the gesture's input latency.
     *
     * @param name Interaction label, e.g. `"checkout"`.
     * @returns The running trace.
     */
    trace(name: string): InteractionTrace;
    /**
     * The current state, stable between changes (safe for
     * `useSyncExternalStore`).
     *
     * @returns The latest snapshot.
     */
    getSnapshot(): PerfSnapshot;
    /**
     * Listen for snapshot changes.
     *
     * @param listener Called after every change.
     * @returns A function that removes the listener.
     */
    subscribe(listener: () => void): () => void;
    /** Disconnect every observer. Traces still run, without new CPU data. */
    stop(): void;
}
