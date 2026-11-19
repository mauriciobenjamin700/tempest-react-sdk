import { haversineKm } from "./distance";
import type { TrackPoint } from "./types";

/**
 * Lifecycle status of a {@link PositionTracker}.
 *
 * `"error"` is not necessarily final: after a `POSITION_UNAVAILABLE` or
 * `TIMEOUT` the watch stays alive and the next reading moves the status back to
 * `"tracking"`. Only `PERMISSION_DENIED` (and a missing Geolocation API) is
 * terminal until `start()` is called again.
 */
export type TrackerStatus = "idle" | "tracking" | "error";

/**
 * `GeolocationPositionError.PERMISSION_DENIED`. Read as a literal because the
 * error objects some environments (and test doubles) hand over do not carry the
 * static constants.
 */
const PERMISSION_DENIED = 1;

/**
 * Normalize an optional numeric reading from `GeolocationCoordinates`.
 *
 * @param value - The raw `speed` or `heading`.
 * @returns The value when it is a finite number, `null` otherwise — browsers
 * report `heading` as `NaN` while stationary.
 */
function finiteOrNull(value: number | null | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

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
    /**
     * Called on every `GeolocationPositionError`, including each repeated
     * `TIMEOUT` while the status is already `"error"`.
     */
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
    /**
     * The error behind the current `"error"` status, so a screen can tell a
     * refusal (`code === 1`, terminal) from a lost signal (`2`/`3`, recovers on
     * the next reading). `null` while tracking normally, after a recovery,
     * after `start()`/`stop()`/`clear()`, and when the Geolocation API is
     * missing.
     */
    readonly lastError: GeolocationPositionError | null;
}

/**
 * Record a live GPS trajectory from `navigator.geolocation.watchPosition`.
 * Framework-free — the {@link usePositionTracker} hook wraps this for React.
 *
 * Jitter while stationary is filtered by `minDistanceKm`; distance is
 * accumulated across the *full* run even when `maxPoints` trims the retained
 * array. 100% browser-side: no network, no external service.
 *
 * Error recovery: a `POSITION_UNAVAILABLE` or `TIMEOUT` (a tunnel, an area
 * without signal) sets the status to `"error"` but keeps the watch, and any
 * later reading — even one the jitter filter then discards, since it still
 * proves the signal is back — returns the status to `"tracking"` and clears
 * `lastError`. `PERMISSION_DENIED` is terminal: the browser sends no further
 * readings, so the dead watch is released and `start()` can retry once the
 * user grants access.
 *
 * Each kept point carries `speed` (m/s) and `heading` (degrees) from the
 * reading, `null` when the device reports none or a non-finite value.
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
    let watching = false;
    let status: TrackerStatus = "idle";
    let lastError: GeolocationPositionError | null = null;

    function setStatus(next: TrackerStatus): void {
        if (status === next) return;
        status = next;
        onStatusChange?.(next);
    }

    function releaseWatch(): void {
        watching = false;
        if (watchId !== null && typeof navigator !== "undefined" && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchId);
        }
        watchId = null;
    }

    function handlePosition(position: GeolocationPosition): void {
        if (!watching) return;
        lastError = null;
        setStatus("tracking");

        const point: TrackPoint = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: position.timestamp,
            accuracy: position.coords.accuracy,
            speed: finiteOrNull(position.coords.speed),
            heading: finiteOrNull(position.coords.heading),
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
        if (!watching) return;
        if (error.code === PERMISSION_DENIED) releaseWatch();
        lastError = error;
        setStatus("error");
        onError?.(error);
    }

    function start(): void {
        if (watching) return;
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            setStatus("error");
            return;
        }
        watching = true;
        lastError = null;
        setStatus("tracking");
        const id = navigator.geolocation.watchPosition(
            handlePosition,
            handleError,
            positionOptions,
        );
        if (watching) {
            watchId = id;
        } else {
            navigator.geolocation.clearWatch(id);
        }
    }

    function stop(): void {
        releaseWatch();
        lastError = null;
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
        get lastError() {
            return lastError;
        },
    };
}
