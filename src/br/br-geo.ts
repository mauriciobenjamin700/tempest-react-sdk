import rawGeo from "./data/br-uf-geo.json";
import type { BrRegion, UF } from "./locations";

/** A ring of `[longitude, latitude]` pairs. */
export type Ring = [number, number][];

/** GeoJSON geometry for a federative unit — always a (multi)polygon. */
export interface BrUfGeometry {
    type: "Polygon" | "MultiPolygon";
    /** `Polygon` → `Ring[]`; `MultiPolygon` → `Ring[][]`. */
    coordinates: Ring[] | Ring[][];
}

/** One federative unit feature. */
export interface BrUfFeature {
    type: "Feature";
    properties: {
        uf: UF;
        name: string;
        region: BrRegion;
    };
    geometry: BrUfGeometry;
}

/** The bundled, simplified GeoJSON of all 27 UF boundaries. */
export interface BrUfFeatureCollection {
    type: "FeatureCollection";
    features: BrUfFeature[];
}

/**
 * Simplified (Douglas-Peucker, ~2 km tolerance) public-domain GeoJSON of the 27
 * Brazilian federative-unit boundaries, derived from IBGE data. ~119 KB raw /
 * ~36 KB gzip — adequate for an interactive overview map, not for precise
 * geographic analysis. This module is loaded lazily by `BrazilMap`, so it lands
 * in its own chunk and never inflates a data-only import.
 */
export const BR_UF_GEOJSON = rawGeo as unknown as BrUfFeatureCollection;
