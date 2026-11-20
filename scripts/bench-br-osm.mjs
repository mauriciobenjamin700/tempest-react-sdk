/**
 * Brazil validation of #667: phases 0 and 2 were measured on the Kubicka et
 * al. dataset, where 1 of 100 drives is in Brazil. This bench runs the same
 * questions on public OpenStreetMap GPS traces from Brazilian cities — dense
 * capitals with urban canyons, a mid-size capital and smaller cities — against
 * the OSM road network of the same box.
 *
 * Data © OpenStreetMap contributors, ODbL 1.0
 * (https://www.openstreetmap.org/copyright):
 *
 * - traces: `GET https://api.openstreetmap.org/api/0.6/trackpoints?bbox=…&page=N`
 *   (GPX, 5000 points per page). Only "identifiable"/"trackable" traces carry
 *   timestamps; untimed points are dropped. At most {@link MAX_PAGES} pages per
 *   city, {@link PAGE_PAUSE_MS} between pages, a generic User-Agent, and every
 *   page cached on disk — the OSM API usage policy asks for low volume.
 * - roads: one Overpass query per city
 *   (`way[highway~"^(motorway|…|tertiary_link)$"]`, box widened by
 *   {@link ROAD_MARGIN_DEG}), cached. `oneway=yes|-1`, roundabouts and
 *   motorways become one-way edges; everything else is two-way.
 *
 * Downloads are untrusted: read with a byte cap, parsed with regular
 * expressions (GPX) and `JSON.parse` (Overpass), numbers range-checked, never
 * evaluated. Only the cache dir is written.
 *
 * There is no ground-truth route, so the indicators are proxies, each
 * explained where it is printed:
 *
 * - distance from each fix to the nearest road of any kind (the phase-0
 *   comparison: Kubicka gives 85.8% / 90.6% within 10 / 20 m of any road);
 * - `matchToRoads` with `ROAD_MATCH_DEFAULTS`: matched share, breaks per 1000
 *   fixes, fix → snapped point distance, inferred share;
 * - the sampling interval of the traces, and the effect of sparse sampling
 *   measured by thinning the ~1 Hz runs to 5/10/30 s and comparing against the
 *   dense match of the same run, with the detour bound swept;
 * - zigzag: on straight stretches of the raw track, how often the matched
 *   road jumps to a parallel road and back, per km;
 * - the forward Kalman of phase 0, scored by matching its output and by the
 *   distance to any road — the question is whether the Brazilian error
 *   profile reopens that decision.
 *
 * Runs are split at gaps over {@link GAP_S}; a run whose median speed is under
 * {@link VEHICLE_MIN_SPEED_MS} is walking or cycling and is left out of the
 * indicators (counted in the header).
 *
 * Needs the built package (`npm run build`): it imports `dist/geo/*.js`.
 *
 * Run:
 *
 *     npm run build && node scripts/bench-br-osm.mjs [cache-dir]
 *
 * `cache-dir` defaults to a fresh dir under the OS temp dir; pass the same dir
 * again to rerun without touching the network. OSM is live data — the first
 * trackpoints page holds the newest uploads — so a run with an empty cache on
 * another day sees other traces: the numbers reproduce from the same cache,
 * and the published ones carry the date they were measured.
 *
 * Breaks are also counted on a copy of the graph with every road two-way:
 * when they vanish there, the chain broke on a one-way street driven against
 * its direction (a bicycle, or a wrong `oneway` tag), not on the model.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createRoadGraph } from "../dist/geo/road-graph.js";
import { matchToRoads, ROAD_MATCH_DEFAULTS } from "../dist/geo/map-matching.js";

const USER_AGENT = "tempest-gps-bench/1.0 (map-matching benchmark; low volume)";
const TRACKPOINTS_URL = "https://api.openstreetmap.org/api/0.6/trackpoints";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const HIGHWAY_RE =
    "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$";
const MAX_PAGES = 6;
const PAGE_POINTS = 5000;
const PAGE_PAUSE_MS = 2000;
const OVERPASS_RETRY_MS = 30_000;
const MAX_GPX_BYTES = 8 * 2 ** 20;
const MAX_OVERPASS_BYTES = 64 * 2 ** 20;
const ROAD_MARGIN_DEG = 0.004;
const EARTH_RADIUS_M = 6_371_008.8;
const CELL_M = 25;
const SEARCH_M = 200;
const GAP_S = 30;
const TELEPORT_MS = 70;
const MIN_FIXES = 30;
const MIN_LENGTH_M = 300;
const VEHICLE_MIN_SPEED_MS = 3;
const FAST_MIN_SPEED_MS = 6;
const DENSE_MAX_INTERVAL_S = 1.5;
const THIN_STEPS_S = [5, 10, 30];
const DETOURS_M = [100, 300, 1000];
const STRAIGHT_HALF_M = 75;
const STRAIGHT_MAX_TURN_DEG = 10;
const PARALLEL_MAX_DEG = 20;
const PARALLEL_MIN_OFFSET_M = 8;
const PING_PONG_MAX_FIXES = 5;
const RANDOM_POINTS = 20_000;
const GAP_RESET_S = 30;
const MEASUREMENT_SIGMAS_M = [5, 10, 20];
const ACCEL_SIGMAS = [0.5, 1, 2, 4];
const KUBICKA =
    "Kubicka (phase 0/2): any road <=10/20 m 85.8% / 90.6%; raw -> true route median 3.7 m";

/**
 * Boxes as `[minLon, minLat, maxLon, maxLat]`, each ~2–4 km on a side, picked
 * for profile: two capitals with dense high-rise centres (urban canyon), a
 * mid-size capital, and two smaller cities.
 */
const CITIES = [
    {
        id: "sao-paulo",
        name: "São Paulo — Centro/República",
        profile: "capital densa, cânion urbano",
        bbox: [-46.65, -23.56, -46.625, -23.538],
    },
    {
        id: "rio",
        name: "Rio de Janeiro — Centro",
        profile: "capital densa, cânion urbano",
        bbox: [-43.19, -22.912, -43.17, -22.895],
    },
    {
        id: "teresina",
        name: "Teresina — Centro",
        profile: "capital média",
        bbox: [-42.83, -5.11, -42.79, -5.075],
    },
    {
        id: "sao-carlos",
        name: "São Carlos (SP) — Centro",
        profile: "cidade menor (~250 mil hab.)",
        bbox: [-47.905, -22.03, -47.88, -22.005],
    },
    {
        id: "parnaiba",
        name: "Parnaíba (PI) — Centro",
        profile: "cidade menor (~150 mil hab.)",
        bbox: [-41.79, -2.92, -41.76, -2.895],
    },
];

/**
 * Fetch a URL and read the body with a byte cap, so a hostile or broken
 * server cannot fill the memory.
 *
 * @param {string} url - Address.
 * @param {RequestInit} init - Fetch options; the User-Agent is added.
 * @param {number} maxBytes - Abort above this many bytes.
 * @returns {Promise<{ status: number, text: string }>} Status and body.
 * @throws {Error} When the body exceeds the cap.
 */
async function fetchCapped(url, init, maxBytes) {
    const response = await fetch(url, {
        ...init,
        headers: { ...init.headers, "User-Agent": USER_AGENT },
    });
    const reader = response.body?.getReader();
    const chunks = [];
    let size = 0;
    while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
            await reader.cancel();
            throw new Error(`${url}: body over ${maxBytes} bytes`);
        }
        chunks.push(value);
    }
    return { status: response.status, text: Buffer.concat(chunks).toString("utf8") };
}

/**
 * One page of public GPS points in a box, from the cache or the OSM API.
 *
 * @param {string} dir - Cache dir.
 * @param {object} city - Entry of {@link CITIES}.
 * @param {number} page - Page number, from 0.
 * @returns {Promise<{ text: string, fetched: boolean }>} The GPX text and
 * whether it came from the network (the caller pauses after a fetch).
 * @throws {Error} On a non-200 answer.
 */
async function trackpointPage(dir, city, page) {
    const path = join(dir, `osm-trackpoints-${city.id}-${city.bbox.join("_")}-p${page}.gpx`);
    if (existsSync(path)) return { text: readFileSync(path, "utf8"), fetched: false };
    const url = `${TRACKPOINTS_URL}?bbox=${city.bbox.join(",")}&page=${page}`;
    const { status, text } = await fetchCapped(url, {}, MAX_GPX_BYTES);
    if (status !== 200) throw new Error(`${url}: HTTP ${status}`);
    writeFileSync(path, text);
    return { text, fetched: true };
}

/**
 * The road ways of a city box, from the cache or one Overpass query (retried
 * twice on 429/5xx, the server's "busy" answers).
 *
 * @param {string} dir - Cache dir.
 * @param {object} city - Entry of {@link CITIES}.
 * @returns {Promise<string>} Overpass JSON text.
 * @throws {Error} When every attempt fails.
 */
async function overpassRoads(dir, city) {
    const path = join(dir, `osm-roads-${city.id}-${city.bbox.join("_")}.json`);
    if (existsSync(path)) return readFileSync(path, "utf8");
    const [w, s, e, n] = city.bbox;
    const m = ROAD_MARGIN_DEG;
    const query = `[out:json][timeout:120];way["highway"~"${HIGHWAY_RE}"](${s - m},${w - m},${n + m},${e + m});(._;>;);out body;`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const { status, text } = await fetchCapped(
            OVERPASS_URL,
            {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `data=${encodeURIComponent(query)}`,
            },
            MAX_OVERPASS_BYTES,
        );
        if (status === 200) {
            writeFileSync(path, text);
            return text;
        }
        if (status !== 429 && status < 500) throw new Error(`overpass ${city.id}: HTTP ${status}`);
        await sleep(OVERPASS_RETRY_MS);
    }
    throw new Error(`overpass ${city.id}: gave up after 3 attempts`);
}

/**
 * Parse an OSM trackpoints GPX page into timed segments. Regular expressions
 * over the text, no XML engine: the file is data, nothing in it is resolved
 * or executed. Points without a `<time>` (private traces) are dropped.
 *
 * @param {string} text - GPX text.
 * @returns {{ trace: string | null, fixes: { lat: number, lon: number, t: number }[] }[]}
 * One entry per `<trkseg>`; `trace` is the trace URL when the trace is
 * identifiable.
 */
function parseGpx(text) {
    const segments = [];
    for (const trk of text.matchAll(/<trk>([\s\S]*?)<\/trk>/g)) {
        const trace = /<url>([^<]{1,200})<\/url>/.exec(trk[1])?.[1] ?? null;
        for (const seg of trk[1].matchAll(/<trkseg>([\s\S]*?)<\/trkseg>/g)) {
            const fixes = [];
            for (const pt of seg[1].matchAll(
                /<trkpt lat="(-?\d{1,3}(?:\.\d+)?)" lon="(-?\d{1,3}(?:\.\d+)?)"\s*(?:\/>|>([\s\S]*?)<\/trkpt>)/g,
            )) {
                const lat = Number(pt[1]);
                const lon = Number(pt[2]);
                const time = pt[3] ? /<time>([^<]{1,40})<\/time>/.exec(pt[3])?.[1] : undefined;
                const t = time ? Date.parse(time) / 1000 : NaN;
                if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isFinite(t)) continue;
                fixes.push({ lat, lon, t });
            }
            if (fixes.length > 0) segments.push({ trace, fixes });
        }
    }
    return segments;
}

/**
 * Direction of an OSM way from its tags.
 *
 * @param {Record<string, string>} tags - Way tags.
 * @returns {1 | -1 | 0} `1` one-way along the node order, `-1` against it,
 * `0` two-way. `oneway=reversible` (time-dependent) counts as two-way.
 */
function wayDirection(tags) {
    const oneway = tags.oneway;
    if (oneway === "-1" || oneway === "reverse") return -1;
    if (oneway === "yes" || oneway === "true" || oneway === "1") return 1;
    if (oneway === "no" || oneway === "false" || oneway === "0") return 0;
    if (tags.junction === "roundabout" || tags.junction === "circular") return 1;
    if (tags.highway === "motorway") return 1;
    return 0;
}

/**
 * Build `createRoadGraph` input from Overpass JSON: one edge per consecutive
 * node pair of each way, carrying the way id and class.
 *
 * @param {string} text - Overpass JSON.
 * @returns {{ nodes: { latitude: number, longitude: number }[], edges: object[], ways: number }}
 * Nodes, edges and the number of ways used.
 * @throws {Error} When the text is not an Overpass answer.
 */
function roadNetwork(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data?.elements)) throw new Error("overpass: no elements array");
    const index = new Map();
    const nodes = [];
    for (const el of data.elements) {
        if (el?.type !== "node") continue;
        const { id, lat, lon } = el;
        if (!Number.isInteger(id) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
        index.set(id, nodes.length);
        nodes.push({ latitude: lat, longitude: lon });
    }
    const edges = [];
    let ways = 0;
    for (const el of data.elements) {
        if (el?.type !== "way" || !Array.isArray(el.nodes)) continue;
        const tags = el.tags && typeof el.tags === "object" ? el.tags : {};
        const refs = el.nodes.map((ref) => index.get(ref));
        if (refs.length < 2 || refs.some((r) => r === undefined)) continue;
        ways += 1;
        const dir = wayDirection(tags);
        for (let i = 1; i < refs.length; i += 1) {
            const [a, b] = dir === -1 ? [refs[i], refs[i - 1]] : [refs[i - 1], refs[i]];
            if (a === b) continue;
            edges.push({
                from: a,
                to: b,
                twoWay: dir === 0,
                way: el.id,
                highway: String(tags.highway ?? ""),
                name: String(tags.name ?? ""),
            });
        }
    }
    return { nodes, edges, ways };
}

/**
 * Local equirectangular plane around an origin, in metres, both ways.
 *
 * @param {number} lon0 - Origin longitude.
 * @param {number} lat0 - Origin latitude.
 * @returns {{ to: (lon: number, lat: number) => [number, number], from: (x: number, y: number) => { latitude: number, longitude: number } }}
 * The projection and its inverse.
 */
function planeAround(lon0, lat0) {
    const k = Math.PI / 180;
    const cos0 = Math.cos(lat0 * k);
    return {
        to: (lon, lat) => [
            EARTH_RADIUS_M * (lon - lon0) * k * cos0,
            EARTH_RADIUS_M * (lat - lat0) * k,
        ],
        from: (x, y) => ({
            longitude: lon0 + x / (EARTH_RADIUS_M * k * cos0),
            latitude: lat0 + y / (EARTH_RADIUS_M * k),
        }),
    };
}

/**
 * Distance from a point to a segment, in the plane.
 *
 * @param {number} px - Point x.
 * @param {number} py - Point y.
 * @param {number[]} s - Segment as `[ax, ay, bx, by]`.
 * @returns {number} Metres.
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
 * Grid index answering "distance to the nearest segment within R" — the
 * same construction as phase 0, so the any-road numbers compare.
 *
 * @param {number[][]} segments - `[ax, ay, bx, by]` per segment.
 * @returns {(x: number, y: number) => number} Distance, `Infinity` beyond
 * {@link SEARCH_M}.
 */
function nearestRoad(segments) {
    const cells = new Map();
    const cellOf = (v) => Math.floor(v / CELL_M);
    const key = (cx, cy) => (cx + 1e5) * 2e5 + (cy + 1e5);
    segments.forEach(([ax, ay, bx, by], i) => {
        for (let cx = cellOf(Math.min(ax, bx)); cx <= cellOf(Math.max(ax, bx)); cx += 1) {
            for (let cy = cellOf(Math.min(ay, by)); cy <= cellOf(Math.max(ay, by)); cy += 1) {
                const list = cells.get(key(cx, cy)) ?? [];
                list.push(i);
                cells.set(key(cx, cy), list);
            }
        }
    });
    const reach = Math.ceil(SEARCH_M / CELL_M);
    return (x, y) => {
        const cx = cellOf(x);
        const cy = cellOf(y);
        let best = Infinity;
        for (let i = cx - reach; i <= cx + reach; i += 1) {
            for (let j = cy - reach; j <= cy + reach; j += 1) {
                for (const s of cells.get(key(i, j)) ?? []) {
                    const d = pointToSegment(x, y, segments[s]);
                    if (d < best) best = d;
                }
            }
        }
        return best <= SEARCH_M ? best : Infinity;
    };
}

/**
 * Uniform random points in a box, from a fixed-seed generator so the run
 * reproduces. They are the baseline of the any-road proxy: a dense downtown
 * grid puts a road within 10 m of much of the box, so "94% of fixes near a
 * road" means little until it is compared with where a point thrown at
 * random lands.
 *
 * @param {number[]} bbox - `[minLon, minLat, maxLon, maxLat]`.
 * @param {(lon: number, lat: number) => [number, number]} to - Plane projection.
 * @returns {[number, number][]} {@link RANDOM_POINTS} plane points.
 */
function randomPoints(bbox, to) {
    let state = 0x2545f491;
    const next = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
    const [w, s, e, n] = bbox;
    return Array.from({ length: RANDOM_POINTS }, () =>
        to(w + (e - w) * next(), s + (n - s) * next()),
    );
}

/**
 * Split timed segments into runs at gaps, time reversals and teleports, and
 * keep the runs long enough to say something.
 *
 * Many OSM traces (most of the São Paulo and Rio pages) are logged at ~10 Hz
 * with timestamps truncated to the second, so 90% of their intervals read as
 * zero. Only the first fix of each second is kept: that resamples them to the
 * 1 Hz the HMM was tuned at instead of splitting them into nothing.
 *
 * @param {{ fixes: { lat: number, lon: number, t: number }[] }[]} segments - Parsed GPX.
 * @param {(lon: number, lat: number) => [number, number]} to - Plane projection.
 * @param {{ count: number }} collapsed - Incremented per same-second fix dropped.
 * @returns {{ x: number, y: number, t: number, lat: number, lon: number }[][]}
 * Runs of fixes, each at least {@link MIN_FIXES} fixes and {@link MIN_LENGTH_M}.
 */
function splitRuns(segments, to, collapsed) {
    const runs = [];
    for (const seg of segments) {
        let run = [];
        let length = 0;
        const close = () => {
            if (run.length >= MIN_FIXES && length >= MIN_LENGTH_M) runs.push(run);
            run = [];
            length = 0;
        };
        for (const f of seg.fixes) {
            const [x, y] = to(f.lon, f.lat);
            const fix = { x, y, t: f.t, lat: f.lat, lon: f.lon };
            const last = run[run.length - 1];
            if (last && fix.t === last.t) {
                collapsed.count += 1;
                continue;
            }
            if (last) {
                const dt = fix.t - last.t;
                const d = Math.hypot(fix.x - last.x, fix.y - last.y);
                if (dt <= 0 || dt > GAP_S || d / dt > TELEPORT_MS) close();
                else length += d;
            }
            run.push(fix);
        }
        close();
    }
    return runs;
}

/**
 * The q-th quantile by nearest rank.
 *
 * @param {number[]} values - Unsorted values.
 * @param {number} q - Quantile in `[0, 1]`.
 * @returns {number} The quantile, `NaN` for an empty list.
 */
function quantile(values, q) {
    if (values.length === 0) return NaN;
    const sorted = Float64Array.from(values).sort();
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/**
 * Median speed of a run, from consecutive fixes.
 *
 * @param {{ x: number, y: number, t: number }[]} run - Fixes.
 * @returns {number} m/s.
 */
function medianSpeed(run) {
    const speeds = [];
    for (let i = 1; i < run.length; i += 1) {
        const dt = run[i].t - run[i - 1].t;
        speeds.push(Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y) / dt);
    }
    return quantile(speeds, 0.5);
}

/**
 * Forward constant-velocity Kalman filter over planar fixes — the filter of
 * phase 0 (`scripts/bench-gps-map.mjs`), unchanged.
 *
 * @param {{ x: number, y: number, t: number }[]} fixes - Raw fixes in time order.
 * @param {number} sigmaM - Measurement noise, metres.
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
 * Which fixes sit on a straight stretch of the raw track: the bearing over
 * the {@link STRAIGHT_HALF_M} before the fix and the one after differ by less
 * than {@link STRAIGHT_MAX_TURN_DEG}. Measured on the GPS itself, not on the
 * match, so the match cannot vouch for itself.
 *
 * @param {{ x: number, y: number }[]} run - Fixes.
 * @returns {boolean[]} One flag per fix.
 */
function straightFlags(run) {
    const cum = [0];
    for (let i = 1; i < run.length; i += 1) {
        cum.push(cum[i - 1] + Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y));
    }
    const flags = new Array(run.length).fill(false);
    let back = 0;
    let ahead = 0;
    for (let i = 0; i < run.length; i += 1) {
        while (back + 1 < i && cum[i] - cum[back + 1] >= STRAIGHT_HALF_M) back += 1;
        if (ahead < i) ahead = i;
        while (ahead < run.length - 1 && cum[ahead] - cum[i] < STRAIGHT_HALF_M) ahead += 1;
        if (cum[i] - cum[back] < STRAIGHT_HALF_M || cum[ahead] - cum[i] < STRAIGHT_HALF_M) continue;
        const b1 = Math.atan2(run[i].y - run[back].y, run[i].x - run[back].x);
        const b2 = Math.atan2(run[ahead].y - run[i].y, run[ahead].x - run[i].x);
        let turn = Math.abs(b1 - b2) * (180 / Math.PI);
        if (turn > 180) turn = 360 - turn;
        flags[i] = turn < STRAIGHT_MAX_TURN_DEG;
    }
    return flags;
}

/**
 * Edge and route geometry helpers bound to one city's plane.
 *
 * @param {{ latitude: number, longitude: number }[]} nodes - Graph nodes.
 * @param {object[]} edges - Graph edges.
 * @param {(lon: number, lat: number) => [number, number]} to - Plane projection.
 * @returns {{ seg: number[][], length: number[] }} Plane segment and length per edge.
 */
function edgeGeometry(nodes, edges, to) {
    const xy = nodes.map((n) => to(n.longitude, n.latitude));
    const seg = edges.map((e) => [...xy[e.from], ...xy[e.to]]);
    const length = seg.map(([ax, ay, bx, by]) => Math.hypot(bx - ax, by - ay));
    return { seg, length };
}

/**
 * Count matched-road switches on straight stretches: every change of OSM way,
 * the subset that lands on a *parallel* road (bearings within
 * {@link PARALLEL_MAX_DEG}, the new point more than
 * {@link PARALLEL_MIN_OFFSET_M} off the old edge's line — a collinear
 * continuation under a new way id is not one), and ping-pongs A → B → A where
 * B held for at most {@link PING_PONG_MAX_FIXES} fixes.
 *
 * @param {object[]} run - Fixes with plane coordinates.
 * @param {(object | null)[]} matches - `matchToRoads(...).matches` of the run.
 * @param {{ seg: number[][] }} geo - Edge geometry.
 * @param {(lon: number, lat: number) => [number, number]} to - Plane projection.
 * @returns {{ straightM: number, wayChanges: number, parallel: number, pingPong: number, jumps: string[] }}
 * Counts on the straight stretches, their length, and one line per parallel
 * jump (printed in full, so each can be checked on the map).
 */
function zigzag(run, matches, geo, to) {
    const straight = straightFlags(run);
    let straightM = 0;
    let wayChanges = 0;
    let parallel = 0;
    let pingPong = 0;
    const jumps = [];
    for (let i = 1; i < run.length; i += 1) {
        if (straight[i] && straight[i - 1]) {
            straightM += Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
        }
    }
    const stints = [];
    let prev = null;
    for (let i = 0; i < run.length; i += 1) {
        const m = matches[i];
        if (m === null) continue;
        const way = m.edge.way;
        if (prev !== null && prev.match.edge.way !== way && straight[i] && straight[prev.i]) {
            wayChanges += 1;
            const [ax, ay, bx, by] = geo.seg[prev.match.edgeIndex];
            const [cx, cy, dx, dy] = geo.seg[m.edgeIndex];
            const lenA = Math.hypot(bx - ax, by - ay);
            const lenB = Math.hypot(dx - cx, dy - cy);
            if (lenA > 1 && lenB > 1) {
                const cos = Math.abs(
                    ((bx - ax) * (dx - cx) + (by - ay) * (dy - cy)) / (lenA * lenB),
                );
                const angle = Math.acos(Math.min(1, cos)) * (180 / Math.PI);
                const [px, py] = to(m.point.longitude, m.point.latitude);
                const offset = Math.abs((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / lenA;
                if (angle < PARALLEL_MAX_DEG && offset > PARALLEL_MIN_OFFSET_M) {
                    parallel += 1;
                    jumps.push(
                        `${prev.match.edge.highway} "${prev.match.edge.name}" -> ${m.edge.highway} "${m.edge.name}", ${offset.toFixed(0)} m apart, fix ${run[i].lat.toFixed(5)},${run[i].lon.toFixed(5)}`,
                    );
                }
            }
        }
        if (stints.length > 0 && stints[stints.length - 1].way === way) {
            stints[stints.length - 1].n += 1;
        } else {
            stints.push({ way, n: 1, straight: straight[i] });
        }
        prev = { i, match: m };
    }
    for (let s = 1; s + 1 < stints.length; s += 1) {
        const [a, b, c] = [stints[s - 1], stints[s], stints[s + 1]];
        if (a.way === c.way && b.n <= PING_PONG_MAX_FIXES && b.straight) pingPong += 1;
    }
    return { straightM, wayChanges, parallel, pingPong, jumps };
}

/**
 * Length and edge set of a matched route, each edge counted once.
 *
 * @param {object} result - `matchToRoads` output.
 * @param {{ length: number[] }} geo - Edge geometry.
 * @returns {{ edges: Set<number>, lengthM: number }} Edge indices and metres.
 */
function routeOf(result, geo) {
    const edges = new Set();
    let lengthM = 0;
    for (const route of result.routes) {
        for (const step of route.edges) {
            if (edges.has(step.edgeIndex)) continue;
            edges.add(step.edgeIndex);
            lengthM += geo.length[step.edgeIndex];
        }
    }
    return { edges, lengthM };
}

/**
 * Thin a run to one fix every `stepS` seconds.
 *
 * @param {{ t: number }[]} run - Fixes.
 * @param {number} stepS - Minimum interval kept.
 * @returns {number[]} Indices of the kept fixes.
 */
function thin(run, stepS) {
    const kept = [0];
    for (let i = 1; i < run.length; i += 1) {
        if (run[i].t - run[kept[kept.length - 1]].t >= stepS) kept.push(i);
    }
    return kept;
}

/** @returns {object} An empty per-city accumulator. */
function emptyCity() {
    return {
        trks: 0,
        traces: new Set(),
        timedFixes: 0,
        collapsed: { count: 0 },
        runs: 0,
        vehicleRuns: 0,
        fastRuns: 0,
        vehicleFixes: 0,
        vehicleKm: 0,
        intervals: [],
        anyRoad: [],
        fastAnyRoad: [],
        matched: 0,
        inferred: 0,
        unmatched: 0,
        breaks: 0,
        fastFixes: 0,
        fastBreaks: 0,
        twoWayBreaks: 0,
        snapDist: [],
        fastSnap: [],
        zz: { straightM: 0, wayChanges: 0, parallel: 0, pingPong: 0 },
        jumps: [],
        random: [],
        sparseFixes: 0,
        sparseBreaks: 0,
        sparseMatched: 0,
        denseFixes: 0,
        denseBreaks: 0,
        kalman: new Map(),
        thinned: new Map(),
    };
}

const fmt = {
    pct: (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "-"),
    m: (v) => (Number.isFinite(v) ? v.toFixed(1) : v === Infinity ? ">200" : "-"),
    n: (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "-"),
};
const within = (list, limit) => list.filter((d) => d <= limit).length / list.length;

const cacheDir = process.argv[2] ?? mkdtempSync(join(tmpdir(), "bench-br-osm-"));
mkdirSync(cacheDir, { recursive: true });
const results = [];

for (const city of CITIES) {
    const segments = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
        const { text, fetched } = await trackpointPage(cacheDir, city, page);
        const points = (text.match(/<trkpt /g) ?? []).length;
        segments.push(...parseGpx(text));
        if (fetched) await sleep(PAGE_PAUSE_MS);
        if (points < PAGE_POINTS) break;
    }
    const net = roadNetwork(await overpassRoads(cacheDir, city));
    const [w, s, e, n] = city.bbox;
    const plane = planeAround((w + e) / 2, (s + n) / 2);
    const graph = createRoadGraph({ nodes: net.nodes, edges: net.edges });
    const twoWayGraph = createRoadGraph({
        nodes: net.nodes,
        edges: net.edges.map((x) => ({ ...x, twoWay: true })),
    });
    const geo = edgeGeometry(net.nodes, net.edges, plane.to);
    const distAny = nearestRoad(geo.seg);
    const acc = emptyCity();
    acc.random = randomPoints(city.bbox, plane.to).map(([x, y]) => distAny(x, y));
    acc.ways = net.ways;
    acc.edges = net.edges.length;
    acc.oneWayShare = net.edges.filter((x) => !x.twoWay).length / Math.max(1, net.edges.length);

    let trkKey = "";
    for (const seg of segments) {
        acc.timedFixes += seg.fixes.length;
        const k = seg.trace ?? `anon-${seg.fixes[0].t}`;
        if (k !== trkKey) acc.trks += 1;
        trkKey = k;
        if (seg.trace) acc.traces.add(seg.trace);
    }

    for (const run of splitRuns(segments, plane.to, acc.collapsed)) {
        acc.runs += 1;
        const speed = medianSpeed(run);
        if (speed < VEHICLE_MIN_SPEED_MS) continue;
        acc.vehicleRuns += 1;
        acc.vehicleFixes += run.length;
        const fast = speed >= FAST_MIN_SPEED_MS;
        if (fast) acc.fastRuns += 1;
        const dts = [];
        for (let i = 1; i < run.length; i += 1) {
            dts.push(run[i].t - run[i - 1].t);
            acc.vehicleKm += Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y) / 1000;
        }
        acc.intervals.push(...dts);
        const dense = quantile(dts, 0.5) <= DENSE_MAX_INTERVAL_S;
        for (const f of run) {
            const d = distAny(f.x, f.y);
            acc.anyRoad.push(d);
            if (fast) acc.fastAnyRoad.push(d);
        }

        const coords = run.map((f) => ({ latitude: f.lat, longitude: f.lon }));
        const result = matchToRoads(coords, graph);
        for (const m of result.matches) {
            if (m === null) continue;
            acc.matched += 1;
            if (m.inferred) acc.inferred += 1;
            acc.snapDist.push(m.distanceM);
            if (fast) acc.fastSnap.push(m.distanceM);
        }
        acc.unmatched += result.unmatched;
        acc.breaks += result.breaks;
        acc.twoWayBreaks += matchToRoads(coords, twoWayGraph).breaks;
        if (fast) {
            acc.fastFixes += run.length;
            acc.fastBreaks += result.breaks;
        }
        if (dense) {
            acc.denseFixes += run.length;
            acc.denseBreaks += result.breaks;
        } else {
            acc.sparseFixes += run.length;
            acc.sparseBreaks += result.breaks;
            acc.sparseMatched += result.matches.filter((m) => m !== null).length;
        }
        const z = zigzag(run, result.matches, geo, plane.to);
        for (const key of Object.keys(acc.zz)) acc.zz[key] += z[key];
        acc.jumps.push(...z.jumps);

        for (const sm of MEASUREMENT_SIGMAS_M) {
            for (const sa of ACCEL_SIGMAS) {
                const id = `${sm}/${sa}`;
                const k = acc.kalman.get(id) ?? { any: [], snap: [], breaks: 0, fixes: 0 };
                const filtered = kalman(run, sm, sa);
                for (const p of filtered) k.any.push(distAny(p.x, p.y));
                const fr = matchToRoads(
                    filtered.map((p) => plane.from(p.x, p.y)),
                    graph,
                );
                for (const m of fr.matches) if (m !== null) k.snap.push(m.distanceM);
                k.breaks += fr.breaks;
                k.fixes += run.length;
                acc.kalman.set(id, k);
            }
        }

        if (!dense) continue;
        const denseRoute = routeOf(result, geo);
        for (const step of THIN_STEPS_S) {
            const kept = thin(run, step);
            if (kept.length < 3) continue;
            for (const maxDetourM of DETOURS_M) {
                const id = `${step}/${maxDetourM}`;
                const t = acc.thinned.get(id) ?? {
                    fixes: 0,
                    agree: 0,
                    sameWay: 0,
                    sameWay: 0,
                    breaks: 0,
                    denseM: 0,
                    foundM: 0,
                    extraM: 0,
                };
                const sparse = matchToRoads(
                    kept.map((i) => coords[i]),
                    graph,
                    { maxDetourM },
                );
                sparse.matches.forEach((m, j) => {
                    const ref = result.matches[kept[j]];
                    if (m === null || ref === null) return;
                    if (m.edgeIndex === ref.edgeIndex) t.agree += 1;
                    if (m.edge.way === ref.edge.way) t.sameWay += 1;
                });
                const r = routeOf(sparse, geo);
                t.fixes += kept.length;
                t.breaks += sparse.breaks;
                t.denseM += denseRoute.lengthM;
                for (const ei of r.edges) {
                    if (denseRoute.edges.has(ei)) t.foundM += geo.length[ei];
                    else t.extraM += geo.length[ei];
                }
                acc.thinned.set(id, t);
            }
        }
    }
    results.push({ city, acc });
}

console.log(
    "Data © OpenStreetMap contributors, ODbL 1.0 — traces from the OSM API, roads via Overpass",
);
console.log(`defaults: ${JSON.stringify(ROAD_MATCH_DEFAULTS)}`);
console.log(KUBICKA);
console.log("");
console.log("-- data per city (vehicle = run median speed >= 3 m/s; fast = >= 6 m/s)");
for (const { city, acc } of results) {
    console.log(
        `${city.name} [${city.bbox.join(", ")}] (${city.profile}): ways ${acc.ways}, edges ${acc.edges} (${fmt.pct(acc.oneWayShare)} one-way); trk fragments ${acc.trks} (${acc.traces.size} identifiable traces), timed fixes ${acc.timedFixes} (${acc.collapsed.count} same-second dropped); runs ${acc.runs}, vehicle ${acc.vehicleRuns} (fast ${acc.fastRuns}), vehicle fixes ${acc.vehicleFixes}, ${fmt.n(acc.vehicleKm)} km`,
    );
}

const all = emptyCity();
for (const { acc } of results) {
    for (const key of [
        "vehicleFixes",
        "vehicleKm",
        "matched",
        "inferred",
        "unmatched",
        "breaks",
        "fastFixes",
        "fastBreaks",
        "twoWayBreaks",
        "sparseFixes",
        "sparseBreaks",
        "sparseMatched",
        "denseFixes",
        "denseBreaks",
    ]) {
        all[key] += acc[key];
    }
    all.intervals.push(...acc.intervals);
    all.anyRoad.push(...acc.anyRoad);
    all.fastAnyRoad.push(...acc.fastAnyRoad);
    all.snapDist.push(...acc.snapDist);
    all.fastSnap.push(...acc.fastSnap);
    all.random.push(...acc.random);
    for (const key of Object.keys(all.zz)) all.zz[key] += acc.zz[key];
    for (const [id, k] of acc.kalman) {
        const t = all.kalman.get(id) ?? { any: [], snap: [], breaks: 0, fixes: 0 };
        t.any.push(...k.any);
        t.snap.push(...k.snap);
        t.breaks += k.breaks;
        t.fixes += k.fixes;
        all.kalman.set(id, t);
    }
    for (const [id, k] of acc.thinned) {
        const t = all.thinned.get(id) ?? {
            fixes: 0,
            agree: 0,
            sameWay: 0,
            breaks: 0,
            denseM: 0,
            foundM: 0,
            extraM: 0,
        };
        for (const key of Object.keys(t)) t[key] += k[key];
        all.thinned.set(id, t);
    }
}
const rows = [
    ...results.map(({ city, acc }) => ({ label: city.id, acc })),
    { label: "ALL", acc: all },
];

console.log("");
console.log(
    "-- sampling interval of vehicle runs (s); dense = run median <= 1.5 s, the rate the HMM was tuned at",
);
console.log(
    `${"city".padEnd(11)} ${"median".padStart(6)} ${"p90".padStart(6)} ${"<=1.5s".padStart(7)} ${"dense fixes".padStart(12)} ${"sparse fixes".padStart(12)}`,
);
for (const { label, acc } of rows) {
    console.log(
        `${label.padEnd(11)} ${fmt.n(quantile(acc.intervals, 0.5)).padStart(6)} ${fmt.n(quantile(acc.intervals, 0.9)).padStart(6)} ${fmt.pct(within(acc.intervals, DENSE_MAX_INTERVAL_S)).padStart(7)} ${String(acc.denseFixes).padStart(12)} ${String(acc.sparseFixes).padStart(12)}`,
    );
}

console.log("");
console.log(
    "-- raw fix -> nearest road of ANY class (m): no ground truth, so this is the phase-0 proxy (Kubicka: 85.8% / 90.6%)",
);
console.log(
    `${"city".padEnd(11)} ${"fixes".padStart(7)} ${"median".padStart(6)} ${"p90".padStart(6)} ${"p99".padStart(6)} ${"<=10m".padStart(6)} ${"<=20m".padStart(6)} ${"fast<=10".padStart(8)} ${"fast<=20".padStart(8)} ${"rand<=10".padStart(8)} ${"rand<=20".padStart(8)}`,
);
for (const { label, acc } of rows) {
    const a = acc.anyRoad;
    console.log(
        `${label.padEnd(11)} ${String(a.length).padStart(7)} ${fmt.m(quantile(a, 0.5)).padStart(6)} ${fmt.m(quantile(a, 0.9)).padStart(6)} ${fmt.m(quantile(a, 0.99)).padStart(6)} ${fmt.pct(within(a, 10)).padStart(6)} ${fmt.pct(within(a, 20)).padStart(6)} ${fmt.pct(within(acc.fastAnyRoad, 10)).padStart(8)} ${fmt.pct(within(acc.fastAnyRoad, 20)).padStart(8)} ${fmt.pct(within(acc.random, 10)).padStart(8)} ${fmt.pct(within(acc.random, 20)).padStart(8)}`,
    );
}

console.log("");
console.log(
    "-- matchToRoads, defaults: matched share, breaks per 1000 fixes (all / dense runs / sparse runs / fast runs / every road two-way), fix -> snapped point (m), inferred share. Kubicka: 48 breaks in 247 251 fixes = 0.19/1000",
);
console.log(
    `${"city".padEnd(11)} ${"matched".padStart(7)} ${"brk/1k".padStart(6)} ${"dense".padStart(6)} ${"sparse".padStart(6)} ${"fast".padStart(6)} ${"2-way".padStart(6)} ${"snap med".padStart(8)} ${"snap p90".padStart(8)} ${"fast p90".padStart(8)} ${"inferred".padStart(8)}`,
);
for (const { label, acc } of rows) {
    console.log(
        `${label.padEnd(11)} ${fmt.pct(acc.matched / acc.vehicleFixes).padStart(7)} ${fmt.n((1000 * acc.breaks) / acc.vehicleFixes, 2).padStart(6)} ${fmt.n((1000 * acc.denseBreaks) / acc.denseFixes, 2).padStart(6)} ${fmt.n((1000 * acc.sparseBreaks) / acc.sparseFixes, 2).padStart(6)} ${fmt.n((1000 * acc.fastBreaks) / acc.fastFixes, 2).padStart(6)} ${fmt.n((1000 * acc.twoWayBreaks) / acc.vehicleFixes, 2).padStart(6)} ${fmt.m(quantile(acc.snapDist, 0.5)).padStart(8)} ${fmt.m(quantile(acc.snapDist, 0.9)).padStart(8)} ${fmt.m(quantile(acc.fastSnap, 0.9)).padStart(8)} ${fmt.pct(acc.inferred / acc.vehicleFixes).padStart(8)}`,
    );
}

console.log("");
console.log(
    "-- zigzag on straight stretches of the raw track (bearing over 75 m before vs after < 10 deg), per km of straight track",
);
console.log(
    `${"city".padEnd(11)} ${"straight km".padStart(11)} ${"way chg/km".padStart(10)} ${"parallel/km".padStart(11)} ${"ping-pong/km".padStart(12)}`,
);
for (const { label, acc } of rows) {
    const km = acc.zz.straightM / 1000;
    console.log(
        `${label.padEnd(11)} ${fmt.n(km).padStart(11)} ${fmt.n(acc.zz.wayChanges / km, 2).padStart(10)} ${fmt.n(acc.zz.parallel / km, 3).padStart(11)} ${fmt.n(acc.zz.pingPong / km, 3).padStart(12)}`,
    );
}
console.log("parallel jumps on straight stretches (every one):");
for (const { city, acc } of results) for (const j of acc.jumps) console.log(`  ${city.id}: ${j}`);

console.log("");
console.log(
    "-- sparse sampling: ~1 Hz runs thinned, matched with the detour bound swept, scored against the dense match of the same run",
);
console.log(
    `${"step/detour".padEnd(12)} ${"fixes".padStart(6)} ${"same edge".padStart(9)} ${"same way".padStart(8)} ${"brk/1k".padStart(7)} ${"route".padStart(6)} ${"extra".padStart(6)}`,
);
for (const [id, t] of [...all.thinned.entries()]) {
    const [step, detour] = id.split("/");
    console.log(
        `${`${step} s/${detour} m`.padEnd(12)} ${String(t.fixes).padStart(6)} ${fmt.pct(t.agree / t.fixes).padStart(9)} ${fmt.pct(t.sameWay / t.fixes).padStart(8)} ${fmt.n((1000 * t.breaks) / t.fixes, 1).padStart(7)} ${fmt.pct(t.foundM / t.denseM).padStart(6)} ${fmt.pct(t.extraM / Math.max(1, t.foundM + t.extraM)).padStart(6)}`,
    );
}

console.log("");
console.log(
    "-- forward Kalman (phase 0 filter), all cities: distance to any road, and the filtered track matched with the defaults",
);
console.log(
    `${"filter".padEnd(22)} ${"any med".padStart(7)} ${"<=10m".padStart(6)} ${"<=20m".padStart(6)} ${"snap med".padStart(8)} ${"snap p90".padStart(8)} ${"brk/1k".padStart(6)}`,
);
console.log(
    `${"raw".padEnd(22)} ${fmt.m(quantile(all.anyRoad, 0.5)).padStart(7)} ${fmt.pct(within(all.anyRoad, 10)).padStart(6)} ${fmt.pct(within(all.anyRoad, 20)).padStart(6)} ${fmt.m(quantile(all.snapDist, 0.5)).padStart(8)} ${fmt.m(quantile(all.snapDist, 0.9)).padStart(8)} ${fmt.n((1000 * all.breaks) / all.vehicleFixes, 2).padStart(6)}`,
);
for (const [id, k] of all.kalman) {
    const [sm, sa] = id.split("/");
    console.log(
        `${`sigmaM=${sm} sigmaA=${sa}`.padEnd(22)} ${fmt.m(quantile(k.any, 0.5)).padStart(7)} ${fmt.pct(within(k.any, 10)).padStart(6)} ${fmt.pct(within(k.any, 20)).padStart(6)} ${fmt.m(quantile(k.snap, 0.5)).padStart(8)} ${fmt.m(quantile(k.snap, 0.9)).padStart(8)} ${fmt.n((1000 * k.breaks) / k.fixes, 2).padStart(6)}`,
    );
}
console.log("");
console.log(`cache: ${cacheDir}`);
