import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import {
    createPositionTracker,
    type CreatePositionTrackerOptions,
    type PositionTracker,
    type TrackerStatus,
} from "./create-position-tracker";
import type { TrackPoint } from "./types";

/**
 * Options of {@link usePositionTracker}: the tracker's, minus the two callbacks
 * the hook turns into state. `onPoint` and `onError` are read from the latest
 * render, so an inline arrow sees the current props and state.
 */
export interface UsePositionTrackerOptions extends Omit<
    CreatePositionTrackerOptions,
    "onUpdate" | "onStatusChange"
> {
    /** Start tracking automatically on mount. Default: `false`. */
    autoStart?: boolean;
}

export interface UsePositionTrackerResult {
    /** Recorded trajectory (newest last). */
    points: readonly TrackPoint[];
    /** Most recent point, or `null` before the first fix. */
    lastPoint: TrackPoint | null;
    /** Total distance of the trajectory in kilometers. */
    distanceKm: number;
    /** Current tracker status. */
    status: TrackerStatus;
    /**
     * The error behind the current `"error"` status — mirrors
     * {@link PositionTracker.lastError}. `code === 1` (`PERMISSION_DENIED`) is
     * terminal; `2`/`3` clear on the next reading. `null` otherwise.
     */
    lastError: GeolocationPositionError | null;
    /** True while `status === "tracking"`. */
    isTracking: boolean;
    /** Begin watching position. */
    start: () => void;
    /** Stop watching, keeping the trajectory. */
    stop: () => void;
    /** Stop and discard the trajectory. */
    clear: () => void;
}

/**
 * React hook wrapping {@link createPositionTracker}. Records a live GPS
 * trajectory tied to the component lifecycle — the watch is torn down on
 * unmount. Fully browser-side; no external service.
 *
 * `status` recovers from `"error"` to `"tracking"` on the next reading after a
 * lost signal; `lastError` tells that case apart from a refusal.
 *
 * To forward every position (to a socket, say), pass `onPoint` rather than
 * watching `lastPoint` in an effect: two readings that arrive before one render
 * become one `lastPoint`, and the effect never sees the first.
 *
 * @example
 * const { points, distanceKm, isTracking, start, stop } = usePositionTracker({
 *   minDistanceKm: 0.01,
 * });
 * return (
 *   <>
 *     <button onClick={isTracking ? stop : start}>{isTracking ? "Parar" : "Rastrear"}</button>
 *     <TrajectoryMap points={points} />
 *     <span>{distanceKm.toFixed(2)} km</span>
 *   </>
 * );
 */
export function usePositionTracker(
    options: UsePositionTrackerOptions = {},
): UsePositionTrackerResult {
    const { autoStart = false, onError, onPoint, ...trackerOptions } = options;

    const [points, setPoints] = useState<readonly TrackPoint[]>([]);
    const [distanceKm, setDistanceKm] = useState<number>(0);
    const [status, setStatus] = useState<TrackerStatus>("idle");
    const [lastError, setLastError] = useState<GeolocationPositionError | null>(null);

    const trackerRef = useRef<PositionTracker | null>(null);
    const onErrorRef = useLatestRef(onError);
    const onPointRef = useLatestRef(onPoint);

    useEffect(() => {
        const tracker = createPositionTracker({
            ...trackerOptions,
            onUpdate: (next) => {
                setPoints([...next]);
                setDistanceKm(tracker.distanceKm);
            },
            onPoint: (point) => onPointRef.current?.(point),
            onStatusChange: (next) => {
                setStatus(next);
                setLastError(tracker.lastError);
            },
            onError: (error) => {
                setLastError(error);
                onErrorRef.current?.(error);
            },
        });
        trackerRef.current = tracker;
        if (autoStart) tracker.start();

        return () => {
            tracker.stop();
            trackerRef.current = null;
        };
        // Tracker options are read once at creation; changing them mid-track
        // would drop the recorded trajectory, so they are intentionally omitted.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const start = useCallback((): void => trackerRef.current?.start(), []);
    const stop = useCallback((): void => trackerRef.current?.stop(), []);
    const clear = useCallback((): void => {
        trackerRef.current?.clear();
        setDistanceKm(0);
    }, []);

    return {
        points,
        lastPoint: points.length > 0 ? points[points.length - 1] : null,
        distanceKm,
        status,
        lastError,
        isTracking: status === "tracking",
        start,
        stop,
        clear,
    };
}
