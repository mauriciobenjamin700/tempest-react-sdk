import { cachedResponseBytes } from "./cache-size";
import { readDeviceProfile } from "./device";
import type {
    InferenceProfiler,
    InferenceReport,
    InferenceReportOptions,
    ProfiledModelSize,
} from "./types";

/**
 * Timing and cost accounting for a pipeline that runs on the user's device.
 */

/**
 * Create a profiler for one run of a pipeline.
 *
 * Wrap each step in {@link InferenceProfiler.stage}, fold in durations you
 * already have (an SDK `speed` breakdown, say) with
 * {@link InferenceProfiler.mark}, then call `report()` once the run finishes.
 *
 * Stages are timed independently rather than as a tiling of the run, so
 * concurrent work is charged its real wall-clock span to each stage and the
 * timings can sum to more than `totalMs`. Surface that to users when you
 * render the breakdown — a bar chart implying a partition of the total would
 * be wrong for a pipeline that overlaps stages.
 *
 * @returns A profiler bound to the moment it was created.
 *
 * @example
 * ```typescript
 * import { createInferenceProfiler } from "tempest-react-sdk";
 * import { Detector } from "tempest-react-sdk/vision";
 *
 * const profiler = createInferenceProfiler();
 * const detector = await profiler.stage("load-model", () =>
 *     Detector.create("/models/detect.onnx"),
 * );
 * const results = await profiler.stage("detect", () => detector.predict(blob));
 * profiler.mark("forward-pass", results[0].speed.inference);
 *
 * const report = await profiler.report({
 *     models: [
 *         { name: "detector", cacheName: "app-models", url: "/models/detect.onnx" },
 *     ],
 * });
 * console.log(report.timings, report.totalMs, report.device, report.models);
 * ```
 */
export function createInferenceProfiler(): InferenceProfiler {
    const startedAt = performance.now();
    const timings = new Map<string, number>();

    const add = (name: string, durationMs: number): void => {
        timings.set(name, (timings.get(name) ?? 0) + durationMs);
    };

    return {
        async stage<T>(name: string, run: () => Promise<T>): Promise<T> {
            const from = performance.now();
            try {
                return await run();
            } finally {
                add(name, performance.now() - from);
            }
        },

        stageSync<T>(name: string, run: () => T): T {
            const from = performance.now();
            try {
                return run();
            } finally {
                add(name, performance.now() - from);
            }
        },

        mark(name: string, durationMs: number): void {
            add(name, durationMs);
        },

        async report(options: InferenceReportOptions = {}): Promise<InferenceReport> {
            const totalMs = performance.now() - startedAt;
            const models: ProfiledModelSize[] = await Promise.all(
                (options.models ?? []).map(async (model) => ({
                    name: model.name,
                    bytes: await cachedResponseBytes(model.cacheName, model.url),
                })),
            );

            return {
                timings: Object.fromEntries(timings),
                totalMs,
                device: readDeviceProfile(),
                models,
                measuredAt: Date.now(),
            };
        },
    };
}
