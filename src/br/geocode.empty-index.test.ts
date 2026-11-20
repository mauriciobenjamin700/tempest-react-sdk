import { describe, expect, it, vi } from "vitest";

/**
 * The seat and centroid indexes are imported as JSON modules and cached in module
 * state, so these cases live in their own file: the mocks serve **empty** indexes, which
 * is the only way to reach the "nothing found" branches that real data can never
 * hit. Vitest requires a `default` export for JSON module mocks, so the
 * namespace-shaped interop path (`mod.default ?? mod`) stays uncovered here.
 */
vi.mock("./data/br-centroids.json", () => ({
    default: { states: {}, municipalities: [] },
}));
vi.mock("./data/br-seats.json", () => ({
    default: { centroidFallback: [], municipalities: [] },
}));

const {
    nearestMunicipality,
    reverseGeocode,
    geocodeMunicipality,
    municipalitySeat,
    stateCentroid,
} = await import("./geocode");

describe("geocode with an empty index", () => {
    it("nearestMunicipality returns null", async () => {
        expect(await nearestMunicipality({ latitude: -23.5, longitude: -46.6 })).toBeNull();
    });

    it("stateCentroid returns null for every UF", async () => {
        expect(await stateCentroid("SP")).toBeNull();
    });

    it("geocodeMunicipality returns an empty list, from either index", async () => {
        expect(await geocodeMunicipality("São Paulo")).toEqual([]);
        expect(await geocodeMunicipality("São Paulo", undefined, { point: "centroid" })).toEqual(
            [],
        );
    });

    it("municipalitySeat returns null", async () => {
        expect(await municipalitySeat("3550308")).toBeNull();
    });

    it("reverseGeocode returns null when no state can be inferred", async () => {
        expect(await reverseGeocode({ latitude: -23.5, longitude: -46.6 })).toBeNull();
    });

    /** A mid-Atlantic point is inside no AC municipality, and the empty index leaves no fallback. */
    it("reverseGeocode returns null when a forced UF contains the point in no polygon", async () => {
        expect(await reverseGeocode({ latitude: -20, longitude: -30 }, { uf: "AC" })).toBeNull();
    });
});
