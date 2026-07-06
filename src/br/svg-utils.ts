import type { FittedProjection } from "@/geo/projection";
import type { GeoBounds } from "@/geo/types";
import type { BrUfGeometry, Ring } from "./br-geo";

/** Iterate every ring of a geometry (Polygon or MultiPolygon). */
export function ringsOf(geometry: BrUfGeometry): Ring[] {
    return geometry.type === "MultiPolygon"
        ? (geometry.coordinates as Ring[][]).flat()
        : (geometry.coordinates as Ring[]);
}

/** Bounding box across every coordinate of the given geometries. */
export function geometriesBounds(geometries: readonly BrUfGeometry[]): GeoBounds {
    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;
    for (const geometry of geometries) {
        for (const ring of ringsOf(geometry)) {
            for (const [lon, lat] of ring) {
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
            }
        }
    }
    return { minLatitude: minLat, maxLatitude: maxLat, minLongitude: minLon, maxLongitude: maxLon };
}

/** Build the SVG `d` path for a geometry (all rings, `evenodd` handles holes). */
export function geometryPath(geometry: BrUfGeometry, projection: FittedProjection): string {
    return ringsOf(geometry)
        .map((ring) => {
            const pts = ring.map(([lon, lat]) => {
                const p = projection.project({ latitude: lat, longitude: lon });
                return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            });
            return `M${pts.join("L")}Z`;
        })
        .join("");
}

/** Rough visual centroid of a geometry (mean of its largest ring's points). */
export function geometryCentroid(
    geometry: BrUfGeometry,
    projection: FittedProjection,
): { x: number; y: number } {
    const rings = ringsOf(geometry);
    const outer = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0] ?? []);
    let sx = 0;
    let sy = 0;
    for (const [lon, lat] of outer) {
        const p = projection.project({ latitude: lat, longitude: lon });
        sx += p.x;
        sy += p.y;
    }
    const n = outer.length || 1;
    return { x: sx / n, y: sy / n };
}

/** Linearly interpolate between two hex colors, returning an `rgb(...)` string. */
export function lerpColor(from: string, to: string, t: number): string {
    const parse = (c: string): [number, number, number] => {
        const hex = c.replace("#", "");
        const full =
            hex.length === 3
                ? hex
                      .split("")
                      .map((ch) => ch + ch)
                      .join("")
                : hex;
        return [
            parseInt(full.slice(0, 2), 16),
            parseInt(full.slice(2, 4), 16),
            parseInt(full.slice(4, 6), 16),
        ];
    };
    const [r1, g1, b1] = parse(from);
    const [r2, g2, b2] = parse(to);
    const mix = (a: number, b: number): number => Math.round(a + (b - a) * t);
    return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
}
