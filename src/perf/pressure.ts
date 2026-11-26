import type { CpuPressureState } from "./monitor-types";

/**
 * CPU pressure from the Compute Pressure API.
 */

const STATES: readonly CpuPressureState[] = ["nominal", "fair", "serious", "critical"];

/** One `PressureRecord`, the subset read here. */
interface PressureRecordLike {
    state: CpuPressureState;
    time: number;
}

/** `PressureObserver` is Chromium-only (125+) and absent from the DOM lib. */
interface PressureObserverLike {
    observe(source: "cpu", options?: { sampleInterval?: number }): Promise<void>;
    disconnect(): void;
}

type PressureObserverConstructor = new (
    callback: (records: PressureRecordLike[]) => void,
) => PressureObserverLike;

/** Tracks CPU pressure changes over time. */
export interface PressureRecorder {
    /** Whether the API exists here. Observation can still be refused later. */
    readonly supported: boolean;
    /** Latest state, or `null` before the first record or when refused. */
    current(): CpuPressureState | null;
    /**
     * Worst state in effect at any point of `[from, to]`, including the one
     * already in effect when the window opened.
     *
     * @param from Window start, `performance.now()` scale.
     * @param to Window end, `performance.now()` scale.
     * @returns The peak, or `null` when nothing was recorded.
     */
    peakBetween(from: number, to: number): CpuPressureState | null;
    stop(): void;
}

/**
 * Order two pressure states.
 *
 * @param a First state.
 * @param b Second state.
 * @returns The worse of the two.
 */
export function worsePressure(a: CpuPressureState, b: CpuPressureState): CpuPressureState {
    return STATES.indexOf(a) >= STATES.indexOf(b) ? a : b;
}

/**
 * Start observing CPU pressure.
 *
 * The API reports a coarse state, not a percentage: the browser maps CPU
 * utilisation and thermal throttling into four buckets so the value cannot be
 * used to fingerprint the machine. `serious` and `critical` mean the device is
 * slowing work down — the moment a heavy pipeline should back off.
 *
 * `observe()` rejects in insecure contexts and where the
 * `compute-pressure` permissions policy blocks it (cross-origin iframes by
 * default); the recorder then stays at `null` instead of throwing.
 *
 * @param intervalMs Sampling period requested from the browser.
 * @param onChange Called whenever the state changes.
 * @returns The recorder.
 */
export function createPressureRecorder(intervalMs: number, onChange: () => void): PressureRecorder {
    const Ctor = (globalThis as { PressureObserver?: PressureObserverConstructor })
        .PressureObserver;
    const history: PressureRecordLike[] = [];
    let observer: PressureObserverLike | null = null;

    if (Ctor) {
        observer = new Ctor((records) => {
            for (const record of records) {
                const last = history[history.length - 1];
                history.push({ state: record.state, time: record.time });
                if (history.length > 256) history.shift();
                if (last?.state !== record.state) onChange();
            }
        });
        observer.observe("cpu", { sampleInterval: intervalMs }).catch(() => {
            observer?.disconnect();
            observer = null;
        });
    }

    return {
        supported: Boolean(Ctor),
        current(): CpuPressureState | null {
            return history[history.length - 1]?.state ?? null;
        },
        peakBetween(from: number, to: number): CpuPressureState | null {
            let peak: CpuPressureState | null = null;
            for (const record of history) {
                if (record.time > to) break;
                if (record.time < from) {
                    peak = record.state;
                    continue;
                }
                peak = peak ? worsePressure(peak, record.state) : record.state;
            }
            return peak;
        },
        stop(): void {
            observer?.disconnect();
            observer = null;
        },
    };
}
