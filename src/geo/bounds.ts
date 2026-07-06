import type { Coordinate, GeoBounds } from "./types";

/**
 * Compute the axis-aligned bounding box that contains every point. Returns
 * `null` for an empty list (there is nothing to bound).
 *
 * @param points - Coordinates to enclose.
 * @returns The bounds, or `null` when `points` is empty.
 */
export function boundingBox(points: readonly Coordinate[]): GeoBounds | null {
    if (points.length === 0) return null;

    let minLatitude = points[0].latitude;
    let maxLatitude = points[0].latitude;
    let minLongitude = points[0].longitude;
    let maxLongitude = points[0].longitude;

    for (const point of points) {
        if (point.latitude < minLatitude) minLatitude = point.latitude;
        if (point.latitude > maxLatitude) maxLatitude = point.latitude;
        if (point.longitude < minLongitude) minLongitude = point.longitude;
        if (point.longitude > maxLongitude) maxLongitude = point.longitude;
    }

    return { minLatitude, maxLatitude, minLongitude, maxLongitude };
}

/** Geometric center of a bounding box. */
export function boundsCenter(bounds: GeoBounds): Coordinate {
    return {
        latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
        longitude: (bounds.minLongitude + bounds.maxLongitude) / 2,
    };
}

/**
 * Grow a bounding box outward by `ratio` of its own span on every side, with a
 * small absolute floor so a single-point (zero-span) box still gets padding.
 * A `ratio` of `0.1` adds 10% margin — handy so a plotted trajectory does not
 * hug the edge of the viewport.
 *
 * @param bounds - The box to expand.
 * @param ratio - Fraction of the span to add per side. Default: `0.1`.
 * @returns A new, larger {@link GeoBounds}.
 */
export function expandBounds(bounds: GeoBounds, ratio = 0.1): GeoBounds {
    const latSpan = bounds.maxLatitude - bounds.minLatitude;
    const lonSpan = bounds.maxLongitude - bounds.minLongitude;
    const latPad = latSpan * ratio || 0.001;
    const lonPad = lonSpan * ratio || 0.001;

    return {
        minLatitude: bounds.minLatitude - latPad,
        maxLatitude: bounds.maxLatitude + latPad,
        minLongitude: bounds.minLongitude - lonPad,
        maxLongitude: bounds.maxLongitude + lonPad,
    };
}
