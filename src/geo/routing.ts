import { durationFactor } from "./estimate";
import type { Coordinate, TravelEstimate, TravelMode } from "./types";

/**
 * Pluggable routing backend. A backend turns two coordinates into a
 * {@link TravelEstimate}. Mirrors the `RoutingBackend` protocol from
 * `tempest-fastapi-sdk` so client and server share the same contract.
 *
 * Implement this to route against your own self-hosted engine (OSRM, Valhalla,
 * GraphHopper). The offline {@link estimateTravel} heuristic satisfies the same
 * shape without any network.
 */
export interface RoutingBackend {
    route: (
        origin: Coordinate,
        destination: Coordinate,
        options?: { mode?: TravelMode },
    ) => Promise<TravelEstimate>;
}

/** Options for {@link createOSRMBackend}. */
export interface OSRMBackendOptions {
    /**
     * Base URL of an **OSRM** HTTP server. There is no default on purpose — this
     * SDK ships no external endpoint. Point it at a routing engine **you host**.
     */
    baseUrl: string;
    /** `fetch` implementation. Default: the global `fetch`. */
    fetch?: typeof globalThis.fetch;
    /** Per-mode duration multipliers applied over the car profile. */
    modeDurationFactors?: Partial<Record<TravelMode, number>>;
}

interface OSRMRoute {
    distance: number;
    duration: number;
}

interface OSRMResponse {
    code?: string;
    routes?: OSRMRoute[];
}

/**
 * Build a {@link RoutingBackend} backed by an OSRM server **you host**. OSRM
 * only serves a driving profile, so motorcycle/bus durations are derived by
 * scaling the car duration through {@link durationFactor} — same approach as
 * the FastAPI SDK's `OSRMBackend`.
 *
 * !!! warning
 *     This makes a network request to `baseUrl`. It is opt-in: nothing in the
 *     SDK calls it unless you construct it and pass your own server URL. For a
 *     zero-network estimate, use {@link estimateTravel} instead.
 *
 * @param options - Server URL, optional `fetch`, per-mode factors.
 * @returns A backend whose `route()` queries OSRM.
 *
 * @example
 * const backend = createOSRMBackend({ baseUrl: "https://osrm.internal" });
 * const estimate = await backend.route(origin, destination, { mode: "car" });
 */
export function createOSRMBackend(options: OSRMBackendOptions): RoutingBackend {
    const { baseUrl, fetch = globalThis.fetch, modeDurationFactors } = options;
    const trimmedBaseUrl = baseUrl.replace(/\/+$/, "");

    return {
        async route(origin, destination, routeOptions = {}): Promise<TravelEstimate> {
            const mode = routeOptions.mode ?? "car";
            const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
            const url = `${trimmedBaseUrl}/route/v1/driving/${coords}?overview=false`;

            let payload: OSRMResponse;
            try {
                const response = await fetch(url);
                payload = (await response.json()) as OSRMResponse;
            } catch (cause) {
                throw new Error(`OSRM request failed: ${String(cause)}`, { cause });
            }

            const route = payload.routes?.[0];
            if (payload.code !== "Ok" || !route) {
                throw new Error(`OSRM returned no route (code: ${payload.code ?? "unknown"})`);
            }

            const distanceKm = route.distance / 1000.0;
            const carMinutes = route.duration / 60.0;
            const durationMinutes = carMinutes * durationFactor(mode, modeDurationFactors);

            return {
                mode,
                distance_km: distanceKm,
                duration_minutes: durationMinutes,
                source: "osrm",
            };
        },
    };
}
