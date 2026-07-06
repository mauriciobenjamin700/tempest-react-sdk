import type { Coordinate } from "./types";

/**
 * Mean Earth radius in kilometers. Same value used by `tempest-fastapi-sdk`
 * (`geo/distance.py`) so client and server distances agree.
 */
export const EARTH_RADIUS_KM = 6371.0088;

/** Convert degrees to radians. */
export function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates using the haversine formula
 * (spherical Earth). Mirrors `haversine_km` from `tempest-fastapi-sdk`.
 *
 * @param origin - Start coordinate.
 * @param destination - End coordinate.
 * @returns Distance in kilometers (`>= 0`).
 *
 * @example
 * haversineKm(
 *   { latitude: -23.5505, longitude: -46.6333 }, // São Paulo
 *   { latitude: -22.9068, longitude: -43.1729 }, // Rio de Janeiro
 * ); // ≈ 360.9
 */
export function haversineKm(origin: Coordinate, destination: Coordinate): number {
    const lat1 = toRadians(origin.latitude);
    const lat2 = toRadians(destination.latitude);
    const deltaLat = toRadians(destination.latitude - origin.latitude);
    const deltaLon = toRadians(destination.longitude - origin.longitude);

    const a =
        Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Total length of a trajectory: the sum of haversine distances between each
 * consecutive pair of points. Returns `0` for an empty or single-point path.
 *
 * @param points - Ordered coordinates along the path.
 * @returns Cumulative distance in kilometers.
 */
export function pathLengthKm(points: readonly Coordinate[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
        total += haversineKm(points[i - 1], points[i]);
    }
    return total;
}

/**
 * Initial bearing (forward azimuth) from `origin` to `destination`, in degrees
 * clockwise from true north, normalized to `[0, 360)`. Useful for orienting a
 * heading arrow on a trajectory.
 *
 * @param origin - Start coordinate.
 * @param destination - End coordinate.
 * @returns Bearing in degrees, `[0, 360)`.
 */
export function bearingDeg(origin: Coordinate, destination: Coordinate): number {
    const lat1 = toRadians(origin.latitude);
    const lat2 = toRadians(destination.latitude);
    const deltaLon = toRadians(destination.longitude - origin.longitude);

    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x =
        Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
}
