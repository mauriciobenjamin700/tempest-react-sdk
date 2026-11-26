/**
 * Main-thread cost, read from the frames the browser flags as long.
 */

/** A frame (or task) that kept the main thread for 50 ms or more. */
interface LongFrame {
    start: number;
    end: number;
}

/** Long-frame time overlapping a window. */
export interface LongFrameCost {
    ms: number;
    count: number;
}

/** Keeps the recent long frames and answers how much of a window they took. */
export interface LongFrameRecorder {
    /** Entry type observed, or `null` when the browser exposes neither. */
    readonly source: "long-animation-frame" | "longtask" | null;
    /**
     * Long-frame time overlapping `[from, to]`, counting only the overlapping
     * part of a frame that straddles an edge.
     *
     * @param from Window start, `performance.now()` scale.
     * @param to Window end, `performance.now()` scale.
     * @returns The cost, or `null` when `source` is `null`.
     */
    costBetween(from: number, to: number): LongFrameCost | null;
    stop(): void;
}

/**
 * Whether `PerformanceObserver` accepts an entry type here.
 *
 * @param type Entry type, e.g. `"long-animation-frame"`.
 * @returns `true` when observable.
 */
export function supportsEntryType(type: string): boolean {
    if (typeof PerformanceObserver === "undefined") return false;
    return (PerformanceObserver.supportedEntryTypes ?? []).includes(type);
}

/**
 * Start recording long frames.
 *
 * Prefers `long-animation-frame` (Chromium 123+), which covers the rendering
 * work after a task too, and falls back to `longtask`, which sees only the
 * script task. Both stop at the main thread: work in a Worker or in
 * onnxruntime's WASM threads never shows up here, which is the point — it is
 * the cost the user feels as a frozen screen, not the CPU total.
 *
 * Observes with `buffered: true`, so frames from before the recorder existed
 * (up to the browser's buffer) still count.
 *
 * @param capacity Frames kept; older ones are dropped first.
 * @returns The recorder.
 */
export function createLongFrameRecorder(capacity: number): LongFrameRecorder {
    const source: LongFrameRecorder["source"] = supportsEntryType("long-animation-frame")
        ? "long-animation-frame"
        : supportsEntryType("longtask")
          ? "longtask"
          : null;
    const frames: LongFrame[] = [];
    let observer: PerformanceObserver | null = null;

    const ingest = (entries: readonly PerformanceEntry[]): void => {
        for (const entry of entries) {
            frames.push({ start: entry.startTime, end: entry.startTime + entry.duration });
        }
        if (frames.length > capacity) frames.splice(0, frames.length - capacity);
    };

    if (source) {
        observer = new PerformanceObserver((list) => ingest(list.getEntries()));
        observer.observe({ type: source, buffered: true });
    }

    return {
        source,
        costBetween(from: number, to: number): LongFrameCost | null {
            if (!source) return null;
            if (observer) ingest(observer.takeRecords());
            let ms = 0;
            let count = 0;
            for (const frame of frames) {
                const overlap = Math.min(frame.end, to) - Math.max(frame.start, from);
                if (overlap > 0) {
                    ms += overlap;
                    count += 1;
                }
            }
            return { ms, count };
        },
        stop(): void {
            observer?.disconnect();
            observer = null;
        },
    };
}
