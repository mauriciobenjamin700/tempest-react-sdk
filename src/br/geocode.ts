import { haversineKm } from "@/geo/distance";
import type { Coordinate } from "@/geo/types";
import type { BrUfGeometry, Ring } from "./br-geo";
import type { UF } from "./locations";
import { loadStateMunicipalities } from "./state-geo";

/**
 * Which coordinate of a municipality a lookup answers with.
 *
 * - `"seat"` — the **seat** (*sede*): the city where the town hall is, i.e.
 *   where people are. The point to mark a city on a map, to measure a distance
 *   or an ETA to it, or to rank cities by "nearest to me". It is the point the
 *   backend (`tempest-fastapi-sdk`) and road routers like OSRM start and end at.
 * - `"centroid"` — the area-weighted **centroid of the territory**. The point to
 *   frame or label the whole municipality, or to anchor a choropleth. In a large
 *   municipality it can be far from any town: over the 5570 municipalities with
 *   both points the median gap is 5.6 km and 3067 are farther than 5 km apart.
 */
export type MunicipalityPointKind = "seat" | "centroid";

/** A municipality with one representative coordinate (see {@link MunicipalityPointKind}). */
export interface MunicipalityPoint {
    /** 7-digit IBGE code. */
    id: string;
    /** Municipality name, as the IBGE roster spells it. */
    name: string;
    /** Federative unit. */
    uf: UF;
    latitude: number;
    longitude: number;
    /**
     * What `latitude`/`longitude` are. A seat lookup answers `"centroid"` for
     * the five municipalities whose source seat lies outside their own boundary
     * (a source error, see `br-seats.json` → `centroidFallback`), so the field
     * is never a guess.
     */
    point: MunicipalityPointKind;
}

/**
 * @deprecated The lookups answer the seat by default since #677; the row is a
 * {@link MunicipalityPoint} whose `point` field says which coordinate it holds.
 */
export type MunicipalityCentroid = MunicipalityPoint;

/** Options shared by the lookups that can answer either coordinate. */
export interface MunicipalityPointOptions {
    /**
     * Which coordinate to answer with. Default `"seat"` — the city, which is
     * what a marker, a distance or "nearest to me" needs. Pass `"centroid"` to
     * frame or label the territory instead.
     */
    point?: MunicipalityPointKind;
}

/** {@link MunicipalityPoint} plus the distance from the query point. */
export interface NearestMunicipality extends MunicipalityPoint {
    /** Great-circle distance from the query coordinate, in kilometers. */
    distanceKm: number;
}

/** A municipality identified by point-in-polygon (see {@link reverseGeocode}). */
export interface ReverseGeocodeResult {
    id: string;
    name: string;
    uf: UF;
}

type RawRow = [string, string, string, number, number];

interface RawCentroids {
    states: Record<string, [number, number]>;
    municipalities: RawRow[];
}

interface RawSeats {
    centroidFallback: string[];
    municipalities: RawRow[];
}

interface PointIndex {
    states: Partial<Record<UF, Coordinate>>;
    municipalities: MunicipalityPoint[];
}

const CENTROID: MunicipalityPointOptions = { point: "centroid" };

const indexes: Partial<Record<MunicipalityPointKind, Promise<PointIndex>>> = {};

/** Strip accents and lowercase, for accent-insensitive name matching. */
function normalizeName(value: string): string {
    return value
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .trim()
        .toLowerCase();
}

/** Turn compact `[id, name, uf, lon, lat]` rows into {@link MunicipalityPoint}s. */
function toPoints(
    rows: RawRow[],
    kindOf: (id: string) => MunicipalityPointKind,
): MunicipalityPoint[] {
    return rows.map(([id, name, uf, lon, lat]) => ({
        id,
        name,
        uf: uf as UF,
        latitude: lat,
        longitude: lon,
        point: kindOf(id),
    }));
}

/**
 * Lazily load and cache one point index — seats (`br-seats.json`, ~78 KB br) or
 * centroids (`br-centroids.json`, ~77 KB br). Each is its own chunk, kept out of
 * the synchronous barrel so importing `/br` for data or maps never pulls either,
 * and a geocode call fetches only the index it asked for, once.
 *
 * @param kind - Which index to load.
 * @returns The index, shared by every later call.
 */
function loadIndex(kind: MunicipalityPointKind): Promise<PointIndex> {
    const cached = indexes[kind];
    if (cached) return cached;
    const pending =
        kind === "seat"
            ? import("./data/br-seats.json").then((mod) => {
                  const raw = (mod.default ?? mod) as unknown as RawSeats;
                  const fallback = new Set(raw.centroidFallback);
                  return {
                      states: {},
                      municipalities: toPoints(raw.municipalities, (id) =>
                          fallback.has(id) ? "centroid" : "seat",
                      ),
                  };
              })
            : import("./data/br-centroids.json").then((mod) => {
                  const raw = (mod.default ?? mod) as unknown as RawCentroids;
                  const states: Partial<Record<UF, Coordinate>> = {};
                  for (const [uf, [lon, lat]] of Object.entries(raw.states)) {
                      states[uf as UF] = { latitude: lat, longitude: lon };
                  }
                  return { states, municipalities: toPoints(raw.municipalities, () => "centroid") };
              });
    indexes[kind] = pending;
    return pending;
}

/**
 * Nearest Brazilian municipality to a coordinate — by distance to its **seat**
 * by default, so "which city is closest to me" ranks by where the towns are.
 * Fast and geometry-free (only one point index loads). Approximate as an answer
 * to "which municipality am I in": a neighbor's seat can be closer than your
 * own. For the containing municipality use {@link reverseGeocode}.
 *
 * @param coord - Query coordinate.
 * @param options - `point`: `"seat"` (default) or `"centroid"`.
 * @returns The nearest municipality with `distanceKm`, or `null` if the index
 *   is somehow empty.
 *
 * @example
 * const near = await nearestMunicipality({ latitude: -23.55, longitude: -46.63 });
 * // { id, name, uf: "SP", latitude, longitude, point: "seat", distanceKm }
 */
export async function nearestMunicipality(
    coord: Coordinate,
    options: MunicipalityPointOptions = {},
): Promise<NearestMunicipality | null> {
    const { municipalities } = await loadIndex(options.point ?? "seat");
    let best: MunicipalityPoint | null = null;
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
 * states (e.g. "Bonito"). Answers the **seat** by default: the point to mark the
 * city on a map.
 *
 * @param name - Municipality name.
 * @param uf - Optional UF to restrict the search.
 * @param options - `point`: `"seat"` (default) or `"centroid"`.
 * @returns Matching municipalities (empty array when none match).
 *
 * @example
 * const [picos] = await geocodeMunicipality("Picos", "PI");
 * // { id: "2208007", latitude: -7.07721, longitude: -41.467, point: "seat", … }
 */
export async function geocodeMunicipality(
    name: string,
    uf?: UF,
    options: MunicipalityPointOptions = {},
): Promise<MunicipalityPoint[]> {
    const { municipalities } = await loadIndex(options.point ?? "seat");
    const target = normalizeName(name);
    return municipalities.filter((m) => (!uf || m.uf === uf) && normalizeName(m.name) === target);
}

/**
 * Substring search over municipality names (accent-insensitive), for
 * autocomplete. Ranked prefix-first, then alphabetically. Each hit carries the
 * **seat** by default.
 *
 * @param query - Partial name.
 * @param options - `uf` to scope, `limit` (default 20), `point` (default
 *   `"seat"`).
 * @returns Ranked matches.
 */
export async function searchMunicipalities(
    query: string,
    options: { uf?: UF; limit?: number } & MunicipalityPointOptions = {},
): Promise<MunicipalityPoint[]> {
    const { uf, limit = 20, point = "seat" } = options;
    const q = normalizeName(query);
    if (!q) return [];
    const { municipalities } = await loadIndex(point);
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
 * Seat (*sede*) of a municipality by IBGE code — where the city is. Use it to
 * place a marker, measure a distance or seed a route. Covers all 5571
 * municipalities, including the one the 2022 mesh has no boundary for.
 *
 * @param id - 7-digit IBGE code.
 * @returns The municipality at its seat, or `null` if unknown.
 *
 * @example
 * await municipalitySeat("2208007");
 * // { id: "2208007", name: "Picos", uf: "PI", latitude: -7.07721, longitude: -41.467, point: "seat" }
 */
export async function municipalitySeat(id: string): Promise<MunicipalityPoint | null> {
    const { municipalities } = await loadIndex("seat");
    return municipalities.find((m) => m.id === id) ?? null;
}

/**
 * Centroid of a municipality's **territory** by IBGE code — the middle of the
 * area, not the city. Use it to frame or label the municipality; for a marker
 * or a distance use {@link municipalitySeat}.
 *
 * @param id - 7-digit IBGE code.
 * @returns The municipality at its centroid, or `null` if unknown.
 */
export async function municipalityCentroid(id: string): Promise<MunicipalityPoint | null> {
    const { municipalities } = await loadIndex("centroid");
    return municipalities.find((m) => m.id === id) ?? null;
}

/**
 * Centroid of a federative unit.
 *
 * @param uf - Federative unit acronym.
 * @returns The state centroid, or `null` if unknown.
 */
export async function stateCentroid(uf: UF): Promise<Coordinate | null> {
    const { states } = await loadIndex("centroid");
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

/** True when the point lies in a polygon's outer ring and in none of its holes. */
function pointInPolygon(lon: number, lat: number, rings: Ring[]): boolean {
    if (rings.length === 0 || !pointInRing(lon, lat, rings[0])) return false;
    for (let i = 1; i < rings.length; i += 1) {
        if (pointInRing(lon, lat, rings[i])) return false;
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
 * @returns The containing municipality, or `null`. A point inside no polygon of
 *   the state (a border sliver, offshore) falls back to the municipality with
 *   the nearest **centroid** — the territory, not the seat, is the better proxy
 *   for "which area is this", so this function is unchanged by the seat default.
 *
 * @example
 * const here = await reverseGeocode({ latitude: -23.5505, longitude: -46.6333 });
 * // { id: "3550308", name: "São Paulo", uf: "SP" }
 */
export async function reverseGeocode(
    coord: Coordinate,
    options: { uf?: UF } = {},
): Promise<ReverseGeocodeResult | null> {
    const nearest = options.uf ? null : await nearestMunicipality(coord, CENTROID);
    const uf = options.uf ?? nearest?.uf;
    if (!uf) return null;

    const state = await loadStateMunicipalities(uf);
    const hit = state?.features.find((f) =>
        pointInGeometry(coord.longitude, coord.latitude, f.geometry),
    );
    if (hit) return { id: hit.properties.id, name: hit.properties.name, uf };

    const fallback = nearest ?? (await nearestMunicipality(coord, CENTROID));
    return fallback ? { id: fallback.id, name: fallback.name, uf: fallback.uf } : null;
}
