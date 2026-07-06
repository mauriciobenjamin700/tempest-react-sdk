import { useCallback, useEffect, useRef, useState } from "react";
import {
    createPositionTracker,
    type CreatePositionTrackerOptions,
    type PositionTracker,
    type TrackerStatus,
} from "./create-position-tracker";
import type { TrackPoint } from "./types";

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
    const { autoStart = false, onError, ...trackerOptions } = options;

    const [points, setPoints] = useState<readonly TrackPoint[]>([]);
    const [distanceKm, setDistanceKm] = useState<number>(0);
    const [status, setStatus] = useState<TrackerStatus>("idle");

    const trackerRef = useRef<PositionTracker | null>(null);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    useEffect(() => {
        const tracker = createPositionTracker({
            ...trackerOptions,
            onUpdate: (next) => {
                setPoints([...next]);
                setDistanceKm(tracker.distanceKm);
            },
            onStatusChange: setStatus,
            onError: (error) => onErrorRef.current?.(error),
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
        isTracking: status === "tracking",
        start,
        stop,
        clear,
    };
}
