import { haversineKm } from "./distance";
import type { Coordinate, TravelEstimate, TravelMode } from "./types";

/**
 * Multiplier applied to the great-circle distance to approximate real road
 * distance. Mirrors `DEFAULT_CIRCUITY_FACTOR` from `tempest-fastapi-sdk`.
 */
export const DEFAULT_CIRCUITY_FACTOR = 1.3;

/**
 * Default average car speed in km/h used to derive duration from distance.
 * Mirrors `DEFAULT_CAR_SPEED_KMH` from `tempest-fastapi-sdk`.
 */
export const DEFAULT_CAR_SPEED_KMH = 50.0;

/**
 * Per-mode multipliers applied to the car duration. Mirrors
 * `DEFAULT_MODE_DURATION_FACTORS` from `tempest-fastapi-sdk` — motorcycles are
 * a touch faster, buses considerably slower (stops + dedicated lanes).
 */
export const DEFAULT_MODE_DURATION_FACTORS: Record<TravelMode, number> = {
    car: 1.0,
    motorcycle: 0.95,
    bus: 1.6,
};

/**
 * Look up the duration multiplier for a travel mode, falling back to `1.0`
 * for unknown modes. Mirrors `duration_factor` from `tempest-fastapi-sdk`.
 *
 * @param mode - Travel mode.
 * @param factors - Optional override map (partial merges over the defaults).
 * @returns The multiplier for `mode`.
 */
export function durationFactor(
    mode: TravelMode,
    factors?: Partial<Record<TravelMode, number>>,
): number {
    return factors?.[mode] ?? DEFAULT_MODE_DURATION_FACTORS[mode] ?? 1.0;
}

/** Options for {@link estimateTravel}. */
export interface EstimateTravelOptions {
    /** Distance multiplier over the great-circle line. Default: `1.3`. */
    circuityFactor?: number;
    /** Average car speed in km/h. Default: `50`. */
    carSpeedKmh?: number;
    /** Per-mode duration multipliers (merged over the defaults). */
    modeDurationFactors?: Partial<Record<TravelMode, number>>;
}

/**
 * Offline travel estimate between two coordinates. No network — distance comes
 * from {@link haversineKm} scaled by circuity, duration from a mode-adjusted
 * average speed. Mirrors `estimate_travel` from `tempest-fastapi-sdk`.
 *
 * @param origin - Start coordinate.
 * @param destination - End coordinate.
 * @param mode - Travel mode. Default: `"car"`.
 * @param options - Tuning knobs (circuity, speed, per-mode factors).
 * @returns A `"heuristic"` {@link TravelEstimate}.
 * @throws {RangeError} If `carSpeedKmh <= 0` or `circuityFactor <= 0`.
 *
 * @example
 * estimateTravel(
 *   { latitude: -23.5505, longitude: -46.6333 },
 *   { latitude: -23.5629, longitude: -46.6544 },
 *   "car",
 * ); // { mode: "car", distance_km: …, duration_minutes: …, source: "heuristic" }
 */
export function estimateTravel(
    origin: Coordinate,
    destination: Coordinate,
    mode: TravelMode = "car",
    options: EstimateTravelOptions = {},
): TravelEstimate {
    const {
        circuityFactor = DEFAULT_CIRCUITY_FACTOR,
        carSpeedKmh = DEFAULT_CAR_SPEED_KMH,
        modeDurationFactors,
    } = options;

    if (carSpeedKmh <= 0) {
        throw new RangeError("carSpeedKmh must be greater than 0");
    }
    if (circuityFactor <= 0) {
        throw new RangeError("circuityFactor must be greater than 0");
    }

    const distanceKm = haversineKm(origin, destination) * circuityFactor;
    const carMinutes = (distanceKm / carSpeedKmh) * 60.0;
    const durationMinutes = carMinutes * durationFactor(mode, modeDurationFactors);

    return {
        mode,
        distance_km: distanceKm,
        duration_minutes: durationMinutes,
        source: "heuristic",
    };
}
