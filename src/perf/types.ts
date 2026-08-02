/**
 * Shapes describing what an on-device inference run cost.
 *
 * The browser exposes no energy counter and no FLOP counter, so "cost" here
 * is assembled from what a page can actually observe: how long each stage
 * took, how much parallelism and memory the device reports, and how large the
 * cached model weights are. Anything the platform does not expose stays
 * `null` — a UI can then render "—" instead of a fabricated number.
 */

/**
 * Device capabilities as reported by the browser.
 *
 * Every field is best-effort. `deviceMemoryGb` and `jsHeapUsedMb` come from
 * Chromium-only APIs (`navigator.deviceMemory`, `performance.memory`) and are
 * `null` everywhere else, including Firefox and Safari.
 */
export interface DeviceProfile {
    /** Logical cores available to workers, or `null` when unreported. */
    hardwareConcurrency: number | null;
    /** Approximate device RAM in GiB (coarse, Chromium-only), or `null`. */
    deviceMemoryGb: number | null;
    /** Used JS heap in MiB (Chromium-only), or `null`. */
    jsHeapUsedMb: number | null;
}

/** A model whose cached size should appear in the report. */
export interface ProfiledModel {
    /** Label for the report row, e.g. `"detector"`. */
    name: string;
    /** Cache Storage bucket holding the response, e.g. `"app-models"`. */
    cacheName: string;
    /** Request URL the model was cached under. */
    url: string;
}

/** A model's size as found in the cache. */
export interface ProfiledModelSize {
    name: string;
    /** Size in bytes, or `null` when uncached or the size is unreported. */
    bytes: number | null;
}

/** Options for {@link InferenceProfiler.report}. */
export interface InferenceReportOptions {
    /** Models to measure in Cache Storage. Omit to report none. */
    models?: readonly ProfiledModel[];
}

/** What one profiled run cost. */
export interface InferenceReport {
    /** Duration in milliseconds per stage name, in the order first recorded. */
    timings: Readonly<Record<string, number>>;
    /** Milliseconds from profiler creation to the `report()` call. */
    totalMs: number;
    device: DeviceProfile;
    models: readonly ProfiledModelSize[];
    /** Epoch millis at which the report was assembled. */
    measuredAt: number;
}

/**
 * Records how long each stage of a pipeline took.
 *
 * Stages are measured **independently**, not as a tiling of the whole run:
 * two stages started concurrently are each charged their full wall-clock
 * span, so the sum can exceed {@link InferenceReport.totalMs}. That is the
 * honest reading for a pipeline that decodes an image while the model
 * sessions are still loading.
 */
export interface InferenceProfiler {
    /**
     * Run an async stage and record its duration.
     *
     * @param name Stage label used as the key in the report.
     * @param run The work to time.
     * @returns Whatever `run` resolved to.
     */
    stage<T>(name: string, run: () => Promise<T>): Promise<T>;
    /**
     * Run a synchronous stage and record its duration.
     *
     * @param name Stage label used as the key in the report.
     * @param run The work to time.
     * @returns Whatever `run` returned.
     */
    stageSync<T>(name: string, run: () => T): T;
    /**
     * Record a duration measured elsewhere — a `speed` breakdown returned by
     * `tempest-react-sdk/vision`, for instance.
     *
     * Repeated names accumulate, so folding two passes of the same kind into
     * one row is a matter of calling `mark` twice.
     *
     * @param name Stage label used as the key in the report.
     * @param durationMs How long it took, in milliseconds.
     */
    mark(name: string, durationMs: number): void;
    /**
     * Assemble the report for everything recorded so far.
     *
     * @param options Which models to size up in Cache Storage.
     * @returns The finished report.
     */
    report(options?: InferenceReportOptions): Promise<InferenceReport>;
}
