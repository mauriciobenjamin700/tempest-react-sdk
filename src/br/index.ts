// Brazilian locations data (states + cities) — mirrors the `utils/locations`
// module of tempest-fastapi-sdk.
export {
    listStates,
    getState,
    citiesByUf,
    statesByRegion,
    isValidUf,
    normalizeUf,
    isValidCity,
    ufChoices,
    cityChoices,
} from "./locations";
export type { UF, BrRegion, BrazilState, Choice } from "./locations";

// UF GeoJSON types (the geometry itself is lazy-loaded by BrazilMap).
import type { BrUfFeatureCollection } from "./br-geo";
export type { BrUfFeature, BrUfFeatureCollection, BrUfGeometry, Ring } from "./br-geo";

/**
 * Lazily load the bundled simplified UF GeoJSON (~36 KB gzip). Kept out of the
 * synchronous barrel so a data-only import never pulls the geometry.
 */
export async function loadBrUfGeoJson(): Promise<BrUfFeatureCollection> {
    const mod = await import("./br-geo");
    return mod.BR_UF_GEOJSON;
}

// Components
export { BrazilMap } from "./BrazilMap";
export type { BrazilMapProps } from "./BrazilMap";
export { BrazilStateCitySelect } from "./BrazilStateCitySelect";
export type { BrazilStateCitySelectProps, BrazilStateCitySelection } from "./BrazilStateCitySelect";
