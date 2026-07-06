import { describe, expect, it, vi } from "vitest";
import { createOSRMBackend } from "./routing";
import type { Coordinate } from "./types";

const A: Coordinate = { latitude: -23.5505, longitude: -46.6333 };
const B: Coordinate = { latitude: -22.9068, longitude: -43.1729 };

function mockFetch(payload: unknown): typeof globalThis.fetch {
    return vi.fn(async () => ({ json: async () => payload }) as Response);
}

describe("createOSRMBackend", () => {
    it("maps an OSRM response to a TravelEstimate (source osrm)", async () => {
        const fetch = mockFetch({
            code: "Ok",
            routes: [{ distance: 360_000, duration: 18_000 }],
        });
        const backend = createOSRMBackend({ baseUrl: "https://osrm.internal/", fetch });
        const est = await backend.route(A, B, { mode: "car" });

        expect(est.source).toBe("osrm");
        expect(est.distance_km).toBeCloseTo(360, 6);
        expect(est.duration_minutes).toBeCloseTo(300, 6);
    });

    it("scales duration per mode (bus slower than car)", async () => {
        const fetch = mockFetch({ code: "Ok", routes: [{ distance: 10_000, duration: 600 }] });
        const backend = createOSRMBackend({ baseUrl: "https://osrm.internal", fetch });
        const bus = await backend.route(A, B, { mode: "bus" });
        expect(bus.duration_minutes).toBeCloseTo(10 * 1.6, 6);
    });

    it("builds the URL as lon,lat;lon,lat", async () => {
        const fetch = mockFetch({ code: "Ok", routes: [{ distance: 1, duration: 1 }] });
        const backend = createOSRMBackend({ baseUrl: "https://osrm.internal", fetch });
        await backend.route(A, B);
        expect(fetch).toHaveBeenCalledWith(
            "https://osrm.internal/route/v1/driving/-46.6333,-23.5505;-43.1729,-22.9068?overview=false",
        );
    });

    it("throws when OSRM returns a non-Ok code", async () => {
        const backend = createOSRMBackend({
            baseUrl: "https://osrm.internal",
            fetch: mockFetch({ code: "NoRoute", routes: [] }),
        });
        await expect(backend.route(A, B)).rejects.toThrow(/no route/i);
    });

    it("wraps transport failures", async () => {
        const backend = createOSRMBackend({
            baseUrl: "https://osrm.internal",
            fetch: vi.fn(async () => {
                throw new Error("network down");
            }) as unknown as typeof globalThis.fetch,
        });
        await expect(backend.route(A, B)).rejects.toThrow(/OSRM request failed/i);
    });
});
