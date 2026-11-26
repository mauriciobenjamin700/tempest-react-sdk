import { supportsEntryType } from "./long-frames";
import type { InputTiming } from "./monitor-types";

/**
 * Input-to-paint latency from the Event Timing API.
 */

/** Smallest threshold the spec allows; the default (104 ms) hides most gestures. */
const DURATION_THRESHOLD_MS = 16;

/** `PerformanceEventTiming`, the subset read here. */
interface EventTimingEntry extends PerformanceEntry {
    processingStart: number;
    processingEnd: number;
    interactionId?: number;
}

/** Records gestures and finds the one a trace was started from. */
export interface InputLatencyRecorder {
    readonly supported: boolean;
    /** Recorded gestures, newest first. */
    recent(): readonly InputTiming[];
    /**
     * The gesture whose handlers were running at `at`.
     *
     * @param at A `performance.now()` value taken inside an event handler.
     * @returns The gesture, or `null` when none was reported (yet).
     */
    gestureAt(at: number): InputTiming | null;
    stop(): void;
}

/**
 * Split one event entry into the three phases of Interaction to Next Paint.
 *
 * `duration` is rounded to 8 ms by the browser while the processing marks are
 * not, so the presentation phase can come out a few milliseconds negative; it
 * is clamped at zero rather than reported as time travel.
 *
 * @param entry The event entry.
 * @returns The timing.
 */
export function toInputTiming(entry: EventTimingEntry): InputTiming {
    const end = entry.startTime + entry.duration;
    return {
        interactionId: entry.interactionId ?? 0,
        type: entry.name,
        startTime: entry.startTime,
        inputDelayMs: Math.max(0, entry.processingStart - entry.startTime),
        processingMs: Math.max(0, entry.processingEnd - entry.processingStart),
        presentationMs: Math.max(0, end - entry.processingEnd),
        durationMs: entry.duration,
    };
}

/**
 * Whether `next` should stand for the gesture instead of `current`.
 *
 * The slowest event wins, as in INP. Events of one gesture handled in the same
 * frame share the same rounded `duration`, though — a `pointerdown` and the
 * `click` whose handler did all the work both read 136 ms — so a tie goes to
 * the event that spent longer in its handlers, the one the breakdown is about.
 *
 * @param next Candidate.
 * @param current Event standing for the gesture so far.
 * @returns `true` to replace.
 */
function outranks(next: InputTiming, current: InputTiming): boolean {
    if (next.durationMs !== current.durationMs) return next.durationMs > current.durationMs;
    return next.processingMs > current.processingMs;
}

/**
 * Start recording gestures.
 *
 * A gesture fires several events (`pointerdown`, `pointerup`, `click`) that
 * share an `interactionId`; the slowest one stands for the gesture, as INP
 * does (see `outranks` for ties). Gestures under 16 ms are never reported by the browser — they are not
 * the ones worth measuring.
 *
 * @param capacity Gestures kept.
 * @param onChange Called after a gesture is recorded or replaced.
 * @returns The recorder.
 */
export function createInputLatencyRecorder(
    capacity: number,
    onChange: () => void,
): InputLatencyRecorder {
    const supported = supportsEntryType("event");
    let gestures: InputTiming[] = [];
    const processingEnds = new Map<number, number>();
    let observer: PerformanceObserver | null = null;

    const ingest = (entries: readonly PerformanceEntry[]): void => {
        let changed = false;
        for (const raw of entries) {
            const entry = raw as EventTimingEntry;
            if (!entry.interactionId) continue;
            const existing = gestures.findIndex((g) => g.interactionId === entry.interactionId);
            const timing = toInputTiming(entry);
            if (existing === -1) {
                gestures = [timing, ...gestures];
                for (const dropped of gestures.splice(capacity)) {
                    processingEnds.delete(dropped.interactionId);
                }
            } else if (outranks(timing, gestures[existing] as InputTiming)) {
                gestures = gestures.map((g, i) => (i === existing ? timing : g));
            } else {
                continue;
            }
            processingEnds.set(timing.interactionId, entry.processingEnd);
            changed = true;
        }
        if (changed) onChange();
    };

    if (supported) {
        observer = new PerformanceObserver((list) => ingest(list.getEntries()));
        observer.observe({
            type: "event",
            buffered: true,
            durationThreshold: DURATION_THRESHOLD_MS,
        } as PerformanceObserverInit);
    }

    return {
        supported,
        recent(): readonly InputTiming[] {
            return gestures;
        },
        gestureAt(at: number): InputTiming | null {
            if (observer) ingest(observer.takeRecords());
            return (
                gestures.find(
                    (g) => g.startTime <= at && at <= (processingEnds.get(g.interactionId) ?? -1),
                ) ?? null
            );
        },
        stop(): void {
            observer?.disconnect();
            observer = null;
        },
    };
}
