/**
 * Distances the scale bar may show. A bar reading "137 m" is accurate and
 * useless; one reading "100 m" is read at a glance.
 */
export const NICE_KM_STEPS = [
    0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000,
] as const;

/**
 * Pick the largest "nice" distance whose bar fits within `maxPixels`.
 *
 * Shared by `TrajectoryMap` and `LiveRouteMap`, so both maps round the same way.
 *
 * @param kmPerPixel - Ground distance one pixel covers.
 * @param maxPixels - Longest bar the layout allows.
 * @returns The distance shown and the bar length in pixels.
 */
export function pickScaleKm(kmPerPixel: number, maxPixels: number): { km: number; pixels: number } {
    const maxKm = kmPerPixel * maxPixels;
    let chosen: number = NICE_KM_STEPS[0];
    for (const step of NICE_KM_STEPS) {
        if (step <= maxKm) chosen = step;
    }
    return { km: chosen, pixels: chosen / kmPerPixel };
}

/**
 * Format a distance in km for the scale bar, in meters below 1 km.
 *
 * @param km - Distance in kilometers.
 * @returns `"250 m"`, `"2 km"`, `"2.5 km"`.
 */
export function formatScale(km: number): string {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km % 1 === 0 ? km : km.toFixed(1)} km`;
}
