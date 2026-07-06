import { clampLatitude } from "./types";
import type { Coordinate, GeoBounds } from "./types";

/**
 * A point projected onto the unit Web Mercator plane. Both axes are in `[0, 1]`
 * — `x` grows east, `y` grows south (screen convention).
 */
export interface MercatorPoint {
    x: number;
    y: number;
}

/** A pixel coordinate inside the plotting viewport. */
export interface PixelPoint {
    x: number;
    y: number;
}

/**
 * Web Mercator (EPSG:3857) latitude clamp. Latitudes beyond this diverge to
 * infinity in the projection, so tile maps cap here.
 */
export const MERCATOR_MAX_LATITUDE = 85.05112878;

/**
 * Project a geographic coordinate onto the unit Web Mercator plane. This is the
 * same projection tile servers use, so a self-hosted tile layer and the
 * tile-free SVG plot line up pixel-for-pixel.
 *
 * @param coord - Coordinate to project.
 * @returns `{ x, y }` in `[0, 1]`.
 */
export function projectMercator(coord: Coordinate): MercatorPoint {
    const lat = Math.max(
        -MERCATOR_MAX_LATITUDE,
        Math.min(MERCATOR_MAX_LATITUDE, clampLatitude(coord.latitude)),
    );
    const latRad = (lat * Math.PI) / 180;
    const x = (coord.longitude + 180) / 360;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
    return { x, y };
}

/**
 * Inverse of {@link projectMercator}: recover a coordinate from a unit-plane
 * point.
 *
 * @param point - `{ x, y }` in `[0, 1]`.
 * @returns The geographic coordinate.
 */
export function unprojectMercator(point: MercatorPoint): Coordinate {
    const longitude = point.x * 360 - 180;
    const n = Math.PI * (1 - 2 * point.y);
    const latitude = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
    return { latitude, longitude };
}

/** A ready-to-use mapping from coordinates to viewport pixels. */
export interface FittedProjection {
    /** Project a coordinate to a pixel inside the viewport. */
    project: (coord: Coordinate) => PixelPoint;
    /** Uniform scale (unit-plane → pixels) actually used, after aspect fit. */
    scale: number;
    /** Viewport width in pixels. */
    width: number;
    /** Viewport height in pixels. */
    height: number;
}

/** Options for {@link fitProjection}. */
export interface FitProjectionOptions {
    /** Inner padding in pixels kept clear on every edge. Default: `16`. */
    padding?: number;
}

/**
 * Build a projection that fits `bounds` into a `width × height` viewport while
 * preserving aspect ratio (uniform scale, centered). This is what powers the
 * tile-free trajectory plot: project the bounds, scale to the SVG box, keep
 * shapes undistorted.
 *
 * @param bounds - Geographic extent to fit.
 * @param width - Viewport width in pixels.
 * @param height - Viewport height in pixels.
 * @param options - Padding tuning.
 * @returns A {@link FittedProjection} with a `project(coord)` mapper.
 */
export function fitProjection(
    bounds: GeoBounds,
    width: number,
    height: number,
    options: FitProjectionOptions = {},
): FittedProjection {
    const { padding = 16 } = options;

    const topLeft = projectMercator({
        latitude: bounds.maxLatitude,
        longitude: bounds.minLongitude,
    });
    const bottomRight = projectMercator({
        latitude: bounds.minLatitude,
        longitude: bounds.maxLongitude,
    });

    const spanX = bottomRight.x - topLeft.x || Number.EPSILON;
    const spanY = bottomRight.y - topLeft.y || Number.EPSILON;

    const innerWidth = Math.max(1, width - padding * 2);
    const innerHeight = Math.max(1, height - padding * 2);

    // Uniform scale keeps the trajectory undistorted; fit the tighter axis.
    const scale = Math.min(innerWidth / spanX, innerHeight / spanY);

    // Center the projected content within the padded box.
    const offsetX = padding + (innerWidth - spanX * scale) / 2;
    const offsetY = padding + (innerHeight - spanY * scale) / 2;

    const project = (coord: Coordinate): PixelPoint => {
        const projected = projectMercator(coord);
        return {
            x: offsetX + (projected.x - topLeft.x) * scale,
            y: offsetY + (projected.y - topLeft.y) * scale,
        };
    };

    return { project, scale, width, height };
}
