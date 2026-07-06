import { haversineKm } from "@/geo/distance";
import type { Coordinate } from "@/geo/types";
import type { BrUfGeometry, Ring } from "./br-geo";
import type { UF } from "./locations";
import { loadStateMunicipalities } from "./state-geo";

/** A municipality with its representative coordinate (IBGE centroid). */
export interface MunicipalityCentroid {
    /** 7-digit IBGE code. */
    id: string;
    /** Municipality name. */
    name: string;
    /** Federative unit. */
    uf: UF;
    latitude: number;
    longitude: number;
}

/** {@link MunicipalityCentroid} plus the distance from the query point. */
export interface NearestMunicipality extends MunicipalityCentroid {
    /** Great-circle distance from the query coordinate, in kilometers. */
    distanceKm: number;
}

/** A municipality identified by point-in-polygon (see {@link reverseGeocode}). */
export interface ReverseGeocodeResult {
    id: string;
    name: string;
    uf: UF;
}

interface RawIndex {
    states: Record<string, [number, number]>;
    municipalities: [string, string, string, number, number][];
}

interface CentroidIndex {
    states: Partial<Record<UF, Coordinate>>;
    municipalities: MunicipalityCentroid[];
}

let cache: CentroidIndex | null = null;
let pending: Promise<CentroidIndex> | null = null;

/** Strip accents and lowercase, for accent-insensitive name matching. */
function normalizeName(value: string): string {
    return value
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .trim()
        .toLowerCase();
}

/**
 * Lazily load and cache the compact centroid index (~97 KB gzip). Kept out of
 * the synchronous barrel so importing `/br` for data/maps never pulls it — only
 * a geocode call fetches it, and only once.
 */
async function loadIndex(): Promise<CentroidIndex> {
    if (cache) return cache;
    if (!pending) {
        pending = import("./data/br-centroids.json").then((mod) => {
            const raw = (mod.default ?? mod) as unknown as RawIndex;
            const states: Partial<Record<UF, Coordinate>> = {};
            for (const [uf, [lon, lat]] of Object.entries(raw.states)) {
                states[uf as UF] = { latitude: lat, longitude: lon };
            }
            cache = {
                states,
                municipalities: raw.municipalities.map(([id, name, uf, lon, lat]) => ({
                    id,
                    name,
                    uf: uf as UF,
                    latitude: lat,
                    longitude: lon,
                })),
            };
            return cache;
        });
    }
    return pending;
}

/**
 * Nearest Brazilian municipality to a coordinate by **centroid distance** —
 * fast and geometry-free (only the small centroid index loads). Approximate:
 * near borders or inside large municipalities a neighbor's centroid can be
 * closer. For an exact containing municipality use {@link reverseGeocode}.
 *
 * @param coord - Query coordinate.
 * @returns The nearest municipality with `distanceKm`, or `null` if the index
 *   is somehow empty.
 *
 * @example
 * const near = await nearestMunicipality({ latitude: -23.55, longitude: -46.63 });
 * // { id, name, uf: "SP", …, distanceKm }
 */
export async function nearestMunicipality(coord: Coordinate): Promise<NearestMunicipality | null> {
    const { municipalities } = await loadIndex();
    let best: MunicipalityCentroid | null = null;
    let bestDistance = Infinity;
    for (const m of municipalities) {
        const d = haversineKm(coord, m);
        if (d < bestDistance) {
            bestDistance = d;
            best = m;
        }
    }
    return best ? { ...best, distanceKm: bestDistance } : null;
}

/**
 * Forward-geocode a municipality by name (accent-insensitive), optionally scoped
 * to a UF. Returns every exact-name match — the same name can occur in several
 * states (e.g. "Bonito").
 *
 * @param name - Municipality name.
 * @param uf - Optional UF to restrict the search.
 * @returns Matching municipalities (empty array when none match).
 */
export async function geocodeMunicipality(name: string, uf?: UF): Promise<MunicipalityCentroid[]> {
    const { municipalities } = await loadIndex();
    const target = normalizeName(name);
    return municipalities.filter((m) => (!uf || m.uf === uf) && normalizeName(m.name) === target);
}

/**
 * Substring search over municipality names (accent-insensitive), for
 * autocomplete. Ranked prefix-first, then alphabetically.
 *
 * @param query - Partial name.
 * @param options - `uf` to scope, `limit` (default 20).
 * @returns Ranked matches.
 */
export async function searchMunicipalities(
    query: string,
    options: { uf?: UF; limit?: number } = {},
): Promise<MunicipalityCentroid[]> {
    const { uf, limit = 20 } = options;
    const q = normalizeName(query);
    if (!q) return [];
    const { municipalities } = await loadIndex();
    const hits = municipalities
        .filter((m) => (!uf || m.uf === uf) && normalizeName(m.name).includes(q))
        .sort((a, b) => {
            const ap = normalizeName(a.name).startsWith(q) ? 0 : 1;
            const bp = normalizeName(b.name).startsWith(q) ? 0 : 1;
            return ap - bp || a.name.localeCompare(b.name, "pt-BR");
        });
    return hits.slice(0, limit);
}

/**
 * Centroid of a municipality by IBGE code.
 *
 * @param id - 7-digit IBGE code.
 * @returns The municipality centroid, or `null` if unknown.
 */
export async function municipalityCentroid(id: string): Promise<MunicipalityCentroid | null> {
    const { municipalities } = await loadIndex();
    return municipalities.find((m) => m.id === id) ?? null;
}

/**
 * Centroid of a federative unit.
 *
 * @param uf - Federative unit acronym.
 * @returns The state centroid, or `null` if unknown.
 */
export async function stateCentroid(uf: UF): Promise<Coordinate | null> {
    const { states } = await loadIndex();
    return states[uf] ?? null;
}

/** Ray-casting point-in-ring test (`ring` is `[lon, lat]` pairs). */
function pointInRing(lon: number, lat: number, ring: Ring): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}

/** True when the point lies in a polygon's outer ring and not in a hole. */
function pointInPolygon(lon: number, lat: number, rings: Ring[]): boolean {
    if (rings.length === 0 || !pointInRing(lon, lat, rings[0])) return false;
    for (let i = 1; i < rings.length; i += 1) {
        if (pointInRing(lon, lat, rings[i])) return false; // inside a hole
    }
    return true;
}

/** True when the point lies inside a (multi)polygon geometry. */
function pointInGeometry(lon: number, lat: number, geom: BrUfGeometry): boolean {
    if (geom.type === "Polygon") {
        return pointInPolygon(lon, lat, geom.coordinates as Ring[]);
    }
    return (geom.coordinates as Ring[][]).some((poly) => pointInPolygon(lon, lat, poly));
}

/**
 * Exact reverse-geocode: the municipality whose (simplified) boundary
 * **contains** the coordinate, via point-in-polygon. Loads one state's geometry
 * chunk — pass `uf` when you know it to skip the centroid lookup that picks the
 * candidate state. Boundaries are simplified (~2 km), so points within ~1-2 km
 * of a border may resolve to the neighbor; offshore points return `null`.
 *
 * @param coord - Query coordinate.
 * @param options - `uf` to force the state searched.
 * @returns The containing municipality, or `null` (falls back to the nearest
 *   centroid municipality when the point is inside no polygon of the state).
 *
 * @example
 * const here = await reverseGeocode({ latitude: -23.5505, longitude: -46.6333 });
 * // { id: "3550308", name: "São Paulo", uf: "SP" }
 */
export async function reverseGeocode(
    coord: Coordinate,
    options: { uf?: UF } = {},
): Promise<ReverseGeocodeResult | null> {
    const nearest = options.uf ? null : await nearestMunicipality(coord);
    const uf = options.uf ?? nearest?.uf;
    if (!uf) return null;

    const state = await loadStateMunicipalities(uf);
    const hit = state?.features.find((f) =>
        pointInGeometry(coord.longitude, coord.latitude, f.geometry),
    );
    if (hit) return { id: hit.properties.id, name: hit.properties.name, uf };

    // Point inside no polygon (border/offshore) — fall back to nearest centroid.
    const fallback = nearest ?? (await nearestMunicipality(coord));
    return fallback ? { id: fallback.id, name: fallback.name, uf: fallback.uf } : null;
}
