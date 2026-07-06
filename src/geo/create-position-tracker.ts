import { haversineKm } from "./distance";
import type { TrackPoint } from "./types";

/** Lifecycle status of a {@link PositionTracker}. */
export type TrackerStatus = "idle" | "tracking" | "error";

/** Options for {@link createPositionTracker}. */
export interface CreatePositionTrackerOptions {
    /**
     * Discard a new sample when it is closer than this (in km) to the last
     * kept point — filters GPS jitter while standing still. Default: `0.005`
     * (5 meters). Pass `0` to keep every sample.
     */
    minDistanceKm?: number;
    /**
     * Cap the retained trajectory to the most recent N points (older points are
     * dropped, but their distance stays counted). Default: `Infinity`.
     */
    maxPoints?: number;
    /** Forwarded to `navigator.geolocation.watchPosition`. */
    positionOptions?: PositionOptions;
    /** Called with the full trajectory each time a point is added. */
    onUpdate?: (points: readonly TrackPoint[]) => void;
    /** Called on a `GeolocationPositionError`. */
    onError?: (error: GeolocationPositionError) => void;
    /** Called whenever the status changes. */
    onStatusChange?: (status: TrackerStatus) => void;
}

/** Imperative controller returned by {@link createPositionTracker}. */
export interface PositionTracker {
    /** Begin watching position. No-op if already tracking. */
    start: () => void;
    /** Stop watching. Retains the recorded trajectory. */
    stop: () => void;
    /** Stop and discard the recorded trajectory. */
    clear: () => void;
    /** Snapshot of the recorded trajectory (newest last). */
    readonly points: readonly TrackPoint[];
    /** Total distance of the recorded trajectory in kilometers. */
    readonly distanceKm: number;
    /** Current tracker status. */
    readonly status: TrackerStatus;
}

/**
 * Record a live GPS trajectory from `navigator.geolocation.watchPosition`.
 * Framework-free — the {@link usePositionTracker} hook wraps this for React.
 *
 * Jitter while stationary is filtered by `minDistanceKm`; distance is
 * accumulated across the *full* run even when `maxPoints` trims the retained
 * array. 100% browser-side: no network, no external service.
 *
 * @param options - Filtering, retention and callbacks.
 * @returns A controller with `start`/`stop`/`clear` and live getters.
 *
 * @example
 * const tracker = createPositionTracker({
 *   minDistanceKm: 0.01,
 *   onUpdate: (pts) => console.log(pts.length, "points"),
 * });
 * tracker.start();
 * // …later
 * tracker.stop();
 * console.log(tracker.distanceKm);
 */
export function createPositionTracker(options: CreatePositionTrackerOptions = {}): PositionTracker {
    const {
        minDistanceKm = 0.005,
        maxPoints = Infinity,
        positionOptions,
        onUpdate,
        onError,
        onStatusChange,
    } = options;

    let points: TrackPoint[] = [];
    let distanceKm = 0;
    let lastKept: TrackPoint | null = null;
    let watchId: number | null = null;
    let status: TrackerStatus = "idle";

    function setStatus(next: TrackerStatus): void {
        if (status === next) return;
        status = next;
        onStatusChange?.(next);
    }

    function handlePosition(position: GeolocationPosition): void {
        const point: TrackPoint = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: position.timestamp,
            accuracy: position.coords.accuracy,
        };

        if (lastKept) {
            const step = haversineKm(lastKept, point);
            if (step < minDistanceKm) return;
            distanceKm += step;
        }

        lastKept = point;
        points.push(point);
        if (points.length > maxPoints) {
            points = points.slice(points.length - maxPoints);
        }
        onUpdate?.(points);
    }

    function handleError(error: GeolocationPositionError): void {
        setStatus("error");
        onError?.(error);
    }

    function start(): void {
        if (watchId !== null) return;
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            setStatus("error");
            return;
        }
        setStatus("tracking");
        watchId = navigator.geolocation.watchPosition(handlePosition, handleError, positionOptions);
    }

    function stop(): void {
        if (watchId !== null && typeof navigator !== "undefined" && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchId);
        }
        watchId = null;
        setStatus("idle");
    }

    function clear(): void {
        stop();
        points = [];
        distanceKm = 0;
        lastKept = null;
        onUpdate?.(points);
    }

    return {
        start,
        stop,
        clear,
        get points() {
            return points;
        },
        get distanceKm() {
            return distanceKm;
        },
        get status() {
            return status;
        },
    };
}
