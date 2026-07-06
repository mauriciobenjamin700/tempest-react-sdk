/**
 * WGS84 geographic coordinate. Mirrors the `Coordinate` schema from
 * `tempest-fastapi-sdk` (`geo/schemas.py`) — `latitude` in `[-90, 90]`,
 * `longitude` in `[-180, 180]`, serialized snake_case on the wire.
 */
export interface Coordinate {
    /** WGS84 latitude in degrees, `[-90, 90]`. E.g. `-23.5505`. */
    latitude: number;
    /** WGS84 longitude in degrees, `[-180, 180]`. E.g. `-46.6333`. */
    longitude: number;
}

/**
 * A single sample in a recorded trajectory: a {@link Coordinate} stamped with
 * the epoch millisecond it was captured, plus the optional accuracy radius
 * reported by the Geolocation API.
 */
export interface TrackPoint extends Coordinate {
    /** Capture time in epoch milliseconds (`GeolocationPosition.timestamp`). */
    timestamp: number;
    /** Horizontal accuracy radius in meters, if the device reported one. */
    accuracy?: number;
}

/**
 * Travel mode. Mirrors the `TravelMode` string enum from `tempest-fastapi-sdk`
 * (`geo/enums.py`) — the on-the-wire value is the raw string.
 */
export type TravelMode = "car" | "motorcycle" | "bus";

/**
 * Estimated travel between two coordinates. Mirrors the `TravelEstimate`
 * schema from `tempest-fastapi-sdk` (`geo/schemas.py`), snake_case preserved so
 * a response deserializes straight into this type.
 */
export interface TravelEstimate {
    /** Travel mode the estimate was computed for. */
    mode: TravelMode;
    /** Great-circle distance scaled by circuity, in kilometers (`>= 0`). */
    distance_km: number;
    /** Estimated duration in minutes (`>= 0`). */
    duration_minutes: number;
    /** How the estimate was produced. `"heuristic"` (offline) or `"osrm"`. */
    source: "heuristic" | "osrm";
}

/**
 * Axis-aligned geographic bounding box. `min`/`max` follow the same degree
 * ranges as {@link Coordinate}.
 */
export interface GeoBounds {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
}

/** True when `value` is a finite latitude in `[-90, 90]`. */
export function isValidLatitude(value: number): boolean {
    return Number.isFinite(value) && value >= -90 && value <= 90;
}

/** True when `value` is a finite longitude in `[-180, 180]`. */
export function isValidLongitude(value: number): boolean {
    return Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * Type guard for {@link Coordinate}: an object with finite, in-range
 * `latitude` and `longitude`.
 */
export function isCoordinate(value: unknown): value is Coordinate {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.latitude === "number" &&
        typeof candidate.longitude === "number" &&
        isValidLatitude(candidate.latitude) &&
        isValidLongitude(candidate.longitude)
    );
}

/** Clamp a latitude into the valid `[-90, 90]` range. */
export function clampLatitude(latitude: number): number {
    return Math.min(90, Math.max(-90, latitude));
}

/**
 * Normalize a longitude into the `[-180, 180]` range, wrapping values that
 * cross the antimeridian (e.g. `190` → `-170`).
 */
export function normalizeLongitude(longitude: number): number {
    const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
    return wrapped;
}
