/**
 * Phase 0 of #667 (street map from device GPS): how far raw GPS sits from the
 * road actually driven, how much a forward Kalman filter closes that gap, and
 * how often snapping each fix to the nearest road picks the right road.
 *
 * Data: Kubicka et al., "Dataset for testing and training of map-matching
 * algorithms" (IEEE IV 2015), Zenodo record 57731, CC BY-SA 4.0 — 100 real
 * drives worldwide, each with the GPS track (`lon lat t`), an OpenStreetMap
 * road excerpt (`.nodes` as `lon lat`, `.arcs` as node pairs) and the
 * ground-truth route (arc indices). The zip is downloaded once, its MD5
 * checked against the record, and read in memory with `fflate`: nothing from
 * the archive is written to disk.
 *
 * Geometry runs in a local equirectangular plane around each track's first
 * fix (metres), with a 25 m grid over the road segments. The Kalman filter is
 * a constant-velocity model over `[x, y, vx, vy]`, forward only (a live map
 * cannot look ahead), reset after a gap longer than 30 s; its two knobs are
 * swept and every row is printed, so the choice is visible, not tuned away.
 *
 * Run:
 *
 *     node scripts/bench-gps-map.mjs [cache-dir]
 *
 * `cache-dir` defaults to the OS temp dir.
 */
import { tmpdir } from "node:os";
import { unzipSync } from "fflate";
import { loadZip, records, table } from "./kubicka-dataset.mjs";

const EARTH_RADIUS_M = 6_371_008.8;
const CELL_M = 25;
const GAP_RESET_S = 30;
const MEASUREMENT_SIGMAS_M = [5, 10, 20];
const ACCEL_SIGMAS = [0.5, 1, 2, 4];
const BRAZIL_BOX = { minLon: -74, maxLon: -34.8, minLat: -33.8, maxLat: 5.3 };

/**
 * Build the local plane projection around an origin.
 *
 * @param {number} lon0 - Origin longitude, degrees.
 * @param {number} lat0 - Origin latitude, degrees.
 * @returns {(lon: number, lat: number) => [number, number]} Degrees to metres.
 */
function planeAround(lon0, lat0) {
    const k = Math.PI / 180;
    const cos0 = Math.cos(lat0 * k);
    return (lon, lat) => [
        EARTH_RADIUS_M * (lon - lon0) * k * cos0,
        EARTH_RADIUS_M * (lat - lat0) * k,
    ];
}

/**
 * Distance from a point to a segment, in the plane.
 *
 * @param {number} px - Point x.
 * @param {number} py - Point y.
 * @param {number[]} s - Segment as `[ax, ay, bx, by]`.
 * @returns {number} The distance, in metres.
 */
function pointToSegment(px, py, s) {
    const [ax, ay, bx, by] = s;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * A grid index over segments that answers "nearest segment within R".
 *
 * @param {{ seg: number[], key: string }[]} segments - Segments with a road key.
 * @returns {(x: number, y: number, radius: number) => { d: number, key: string | null }}
 * The nearest segment's distance and key, or `Infinity` beyond the radius.
 */
function segmentIndex(segments) {
    const cells = new Map();
    const cellOf = (v) => Math.floor(v / CELL_M);
    segments.forEach((item, i) => {
        const [ax, ay, bx, by] = item.seg;
        for (let cx = cellOf(Math.min(ax, bx)); cx <= cellOf(Math.max(ax, bx)); cx += 1) {
            for (let cy = cellOf(Math.min(ay, by)); cy <= cellOf(Math.max(ay, by)); cy += 1) {
                const id = `${cx},${cy}`;
                const list = cells.get(id) ?? [];
                list.push(i);
                cells.set(id, list);
            }
        }
    });
    return (x, y, radius) => {
        const reach = Math.ceil(radius / CELL_M);
        const cx = cellOf(x);
        const cy = cellOf(y);
        let best = { d: Infinity, key: null };
        for (let i = cx - reach; i <= cx + reach; i += 1) {
            for (let j = cy - reach; j <= cy + reach; j += 1) {
                for (const k of cells.get(`${i},${j}`) ?? []) {
                    const d = pointToSegment(x, y, segments[k].seg);
                    if (d < best.d) best = { d, key: segments[k].key };
                }
            }
        }
        return best.d <= radius ? best : { d: Infinity, key: null };
    };
}

/**
 * Forward constant-velocity Kalman filter over planar fixes.
 *
 * @param {{ x: number, y: number, t: number }[]} fixes - Raw fixes in time order.
 * @param {number} sigmaM - Measurement noise standard deviation, metres.
 * @param {number} sigmaA - Process (acceleration) noise, m/s².
 * @returns {{ x: number, y: number }[]} The filtered position at each fix.
 */
function kalman(fixes, sigmaM, sigmaA) {
    const out = [];
    const r = sigmaM * sigmaM;
    const q = sigmaA * sigmaA;
    let axes = null;
    let last = 0;
    for (const f of fixes) {
        const dt = axes === null ? 0 : f.t - last;
        last = f.t;
        if (axes === null || dt <= 0 || dt > GAP_RESET_S) {
            axes = [f.x, f.y].map((z) => ({ pos: z, vel: 0, pp: r, pv: 0, vv: 100 }));
            out.push({ x: f.x, y: f.y });
            continue;
        }
        axes = axes.map((a, i) => {
            const z = i === 0 ? f.x : f.y;
            const pos = a.pos + a.vel * dt;
            const pp = a.pp + 2 * dt * a.pv + dt * dt * a.vv + (q * dt ** 4) / 4;
            const pv = a.pv + dt * a.vv + (q * dt ** 3) / 2;
            const vv = a.vv + q * dt * dt;
            const kp = pp / (pp + r);
            const kv = pv / (pp + r);
            const innovation = z - pos;
            return {
                pos: pos + kp * innovation,
                vel: a.vel + kv * innovation,
                pp: (1 - kp) * pp,
                pv: (1 - kp) * pv,
                vv: vv - kv * pv,
            };
        });
        out.push({ x: axes[0].pos, y: axes[1].pos });
    }
    return out;
}

/**
 * The q-th quantile of a numeric list.
 *
 * @param {number[]} values - Unsorted values.
 * @param {number} q - Quantile in `[0, 1]`.
 * @returns {number} The quantile, by nearest rank.
 */
function quantile(values, q) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/**
 * Format metres for the report.
 *
 * @param {number} v - Metres.
 * @returns {string} One decimal, or `>200` for points beyond the search radius.
 */
function m(v) {
    return Number.isFinite(v) ? v.toFixed(1) : ">200";
}

const cacheDir = process.argv[2] ?? tmpdir();
const all = records(unzipSync(await loadZip(cacheDir)));
const SEARCH_M = 200;
const raw = [];
const anyRoad = [];
const snapOk = [];
const filtered = new Map();
let brazil = 0;
let used = 0;

for (const [, rec] of [...all.entries()].sort()) {
    if (!rec.track || !rec.nodes || !rec.arcs || !rec.route) continue;
    const track = table(rec.track);
    const nodes = table(rec.nodes);
    const arcs = table(rec.arcs);
    const route = table(rec.route).map((row) => row[0]);
    if (track.length < 2 || nodes.length === 0) continue;
    used += 1;
    const [lon0, lat0] = track[0];
    const lonC = track.reduce((acc, p) => acc + p[0], 0) / track.length;
    const latC = track.reduce((acc, p) => acc + p[1], 0) / track.length;
    const box = BRAZIL_BOX;
    if (lonC >= box.minLon && lonC <= box.maxLon && latC >= box.minLat && latC <= box.maxLat) {
        brazil += 1;
    }
    const plane = planeAround(lon0, lat0);
    const xy = nodes.map(([lon, lat]) => plane(lon, lat));
    const roadKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    const segments = arcs.map(([a, b]) => ({
        seg: [...xy[a], ...xy[b]],
        key: roadKey(a, b),
    }));
    const routeKeys = new Set(route.map((i) => segments[i]?.key).filter(Boolean));
    const nearestAny = segmentIndex(segments);
    const nearestRoute = segmentIndex(segments.filter((s) => routeKeys.has(s.key)));
    const fixes = track.map(([lon, lat, t]) => {
        const [x, y] = plane(lon, lat);
        return { x, y, t };
    });
    for (const f of fixes) {
        raw.push(nearestRoute(f.x, f.y, SEARCH_M).d);
        const near = nearestAny(f.x, f.y, SEARCH_M);
        anyRoad.push(near.d);
        snapOk.push(near.key !== null && routeKeys.has(near.key));
    }
    for (const sm of MEASUREMENT_SIGMAS_M) {
        for (const sa of ACCEL_SIGMAS) {
            const id = `${sm}/${sa}`;
            const list = filtered.get(id) ?? [];
            for (const p of kalman(fixes, sm, sa)) list.push(nearestRoute(p.x, p.y, SEARCH_M).d);
            filtered.set(id, list);
        }
    }
}

const within = (list, limit) => list.filter((d) => d <= limit).length / list.length;
const pct = (v) => `${(v * 100).toFixed(1)}%`;

console.log(`records used: ${used} (centroid in Brazil: ${brazil}); fixes: ${raw.length}`);
console.log("");
console.log("distance to the ground-truth route (m)   median   p90    p99   <=10m   <=20m");
console.log(
    `raw GPS                                   ${m(quantile(raw, 0.5)).padStart(6)} ${m(quantile(raw, 0.9)).padStart(6)} ${m(quantile(raw, 0.99)).padStart(6)}  ${pct(within(raw, 10)).padStart(6)}  ${pct(within(raw, 20)).padStart(6)}`,
);
for (const [id, list] of filtered) {
    const [sm, sa] = id.split("/");
    console.log(
        `kalman sigmaM=${sm.padStart(2)} m sigmaA=${sa.padStart(3)} m/s2       ${m(quantile(list, 0.5)).padStart(6)} ${m(quantile(list, 0.9)).padStart(6)} ${m(quantile(list, 0.99)).padStart(6)}  ${pct(within(list, 10)).padStart(6)}  ${pct(within(list, 20)).padStart(6)}`,
    );
}
console.log("");
console.log(
    `raw fix within 10 m / 20 m of ANY road:   ${pct(within(anyRoad, 10))} / ${pct(within(anyRoad, 20))}`,
);
console.log(
    `nearest-road snap picks a route road:     ${pct(snapOk.filter(Boolean).length / snapOk.length)}`,
);
