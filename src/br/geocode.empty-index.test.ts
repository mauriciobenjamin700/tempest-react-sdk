import { describe, expect, it, vi } from "vitest";

/**
 * The centroid index is imported as a JSON module and cached in module state, so
 * these cases live in their own file: the mock serves an **empty** index, which
 * is the only way to reach the "nothing found" branches that real data can never
 * hit. Vitest requires a `default` export for JSON module mocks, so the
 * namespace-shaped interop path (`mod.default ?? mod`) stays uncovered here.
 */
vi.mock("./data/br-centroids.json", () => ({
    default: { states: {}, municipalities: [] },
}));

const { nearestMunicipality, reverseGeocode, geocodeMunicipality, stateCentroid } =
    await import("./geocode");

describe("geocode with an empty index", () => {
    it("nearestMunicipality returns null", async () => {
        expect(await nearestMunicipality({ latitude: -23.5, longitude: -46.6 })).toBeNull();
    });

    it("stateCentroid returns null for every UF", async () => {
        expect(await stateCentroid("SP")).toBeNull();
    });

    it("geocodeMunicipality returns an empty list", async () => {
        expect(await geocodeMunicipality("São Paulo")).toEqual([]);
    });

    it("reverseGeocode returns null when no state can be inferred", async () => {
        expect(await reverseGeocode({ latitude: -23.5, longitude: -46.6 })).toBeNull();
    });

    it("reverseGeocode returns null when a forced UF contains the point in no polygon", async () => {
        // Mid-Atlantic: inside no AC municipality, and the empty index leaves no
        // nearest-centroid fallback either.
        expect(await reverseGeocode({ latitude: -20, longitude: -30 }, { uf: "AC" })).toBeNull();
    });
});
