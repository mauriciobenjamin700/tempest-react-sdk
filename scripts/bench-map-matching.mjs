/**
 * Phase 2 of #667: HMM map-matching (`matchToRoads`, `createRoadMatcher`)
 * measured on the same Kubicka et al. dataset as phase 0
 * (`scripts/bench-gps-map.mjs`), against the 85.7% that snapping each fix to
 * the nearest road gets.
 *
 * Metrics, per configuration, over every fix of the 100 drives:
 *
 * - **right road**: the fix's matched edge is a road of the ground-truth route,
 *   compared as an undirected node pair — the same metric as phase 0's naive
 *   snap. A `null` match counts as wrong.
 * - **route length**: share of the ground-truth route's length (undirected,
 *   each road once) that appears in the matched route.
 * - **extra**: share of the matched route's length that is not in the truth.
 * - breaks, dropped and unmatched fixes, and the time spent matching (graph
 *   build excluded — it is reported once, apart).
 *
 * The sweep is staged — σ×β, then radius×k, then the detour bound, then the
 * live matcher's lag — and every row is printed, so the default is visible
 * against what it beat.
 *
 * Needs the built package (`npm run build`): it imports `dist/geo/*.js`
 * directly, which are plain modules with no stylesheet.
 *
 * Run:
 *
 *     npm run build && node --expose-gc scripts/bench-map-matching.mjs [cache-dir]
 *
 * `cache-dir` defaults to the OS temp dir.
 */
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { unzipSync } from "fflate";
import { loadZip, recordTags, records, table } from "./kubicka-dataset.mjs";
import { createRoadGraph } from "../dist/geo/road-graph.js";
import { createRoadMatcher, matchToRoads, ROAD_MATCH_DEFAULTS } from "../dist/geo/map-matching.js";

const SIGMAS = [3, 5, 7, 10];
const BETAS = [1, 3, 10];
const RADII = [50, 100, 200, 300];
const KS = [4, 8, 16, 32];
const DETOURS = [100, 300, 1000];
const LAGS = [0, 1, 2, 5, 10, 20];
const HOUR_FIXES = 3600;

/**
 * Haversine distance between two `[lon, lat]` pairs.
 *
 * @param {number[]} a - First point.
 * @param {number[]} b - Second point.
 * @returns {number} Metres.
 */
function metres(a, b) {
    const k = Math.PI / 180;
    const dLat = (b[1] - a[1]) * k;
    const dLon = (b[0] - a[0]) * k;
    const h =
        Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * k) * Math.cos(b[1] * k) * Math.sin(dLon / 2) ** 2;
    return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
}

/**
 * Undirected key of an arc.
 *
 * @param {number[]} arc - `[from, to]` node indices.
 * @returns {string} The key, smaller index first.
 */
function roadKey([a, b]) {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** @returns {{ fixes: number, right: number, truthM: number, foundM: number, matchedM: number, extraM: number, breaks: number, dropped: number, unmatched: number, ms: number }} */
function emptyStats() {
    return {
        fixes: 0,
        right: 0,
        truthM: 0,
        foundM: 0,
        matchedM: 0,
        extraM: 0,
        breaks: 0,
        dropped: 0,
        unmatched: 0,
        ms: 0,
    };
}

/**
 * Score one batch match against the ground truth.
 *
 * @param {object} stats - Accumulator.
 * @param {object} result - `matchToRoads` output.
 * @param {object} truth - `{ keys, lengthOf }` of the record.
 * @param {number} ms - Matching time.
 */
function score(stats, result, truth, ms) {
    stats.fixes += result.matches.length;
    for (const match of result.matches) {
        if (match !== null && truth.keys.has(match.edge.key)) stats.right += 1;
    }
    const seen = new Set();
    for (const route of result.routes) {
        for (const step of route.edges) {
            if (seen.has(step.edge.key)) continue;
            seen.add(step.edge.key);
            stats.matchedM += step.edge.lengthM;
            if (truth.keys.has(step.edge.key)) stats.foundM += step.edge.lengthM;
            else stats.extraM += step.edge.lengthM;
        }
    }
    stats.truthM += truth.lengthM;
    stats.breaks += result.breaks;
    stats.dropped += result.dropped;
    stats.unmatched += result.unmatched;
    stats.ms += ms;
}

/**
 * One row of the report.
 *
 * @param {string} label - Configuration.
 * @param {object} s - Accumulated stats, all records.
 * @param {object} clean - Accumulated stats, records not tagged `hives`.
 * @returns {string} The formatted row.
 */
function row(label, s, clean) {
    const pct = (v) => `${(v * 100).toFixed(2)}%`.padStart(7);
    return `${label.padEnd(34)} ${pct(s.right / s.fixes)} ${pct(clean.right / clean.fixes)} ${pct(s.foundM / s.truthM)} ${pct(s.extraM / Math.max(1, s.matchedM))} ${String(s.breaks).padStart(6)} ${String(s.dropped).padStart(7)} ${String(s.unmatched).padStart(6)} ${(s.ms / 1000).toFixed(1).padStart(7)} ${((s.ms * 1000) / s.fixes).toFixed(1).padStart(6)}`;
}

const HEADER = `${"configuration".padEnd(34)} ${"right".padStart(7)} ${"-hives".padStart(7)} ${"route".padStart(7)} ${"extra".padStart(7)} ${"breaks".padStart(6)} ${"dropped".padStart(7)} ${"unmatc".padStart(6)} ${"total s".padStart(7)} ${"µs/fix".padStart(6)}`;

const configs = [];
const D = ROAD_MATCH_DEFAULTS;
for (const radiusM of RADII) {
    for (const maxCandidates of KS) {
        configs.push({
            stage: "radius x k",
            label: `radius=${radiusM} k=${maxCandidates}`,
            options: { radiusM, maxCandidates },
        });
    }
}
for (const sigmaM of SIGMAS) {
    for (const betaM of BETAS) {
        configs.push({
            stage: "sigma x beta",
            label: `sigma=${sigmaM} beta=${betaM}`,
            options: { sigmaM, betaM },
        });
    }
}
for (const maxDetourM of DETOURS) {
    configs.push({ stage: "detour", label: `maxDetour=${maxDetourM}`, options: { maxDetourM } });
}
configs.push({
    stage: "spacing",
    label: "minSpacing=0 (no pre-filter)",
    options: { minSpacingM: 0 },
});
configs.push({ stage: "spacing", label: "minSpacing=2*sigma (default)", options: {} });

const stats = configs.map(() => emptyStats());
const cleanStats = configs.map(() => emptyStats());
const perRecord = [];
const lagStats = LAGS.map(() => ({ fixes: 0, right: 0, ms: 0 }));
let buildMs = 0;
let records_ = 0;
let totalArcs = 0;
const hour = {
    graphArcs: 0,
    graphMs: 0,
    graphHeapMB: 0,
    matchMs: 0,
    allocatedMB: 0,
    retainedMB: 0,
    liveMsPerFix: 0,
    fixes: 0,
    id: "",
};

const cacheDir = process.argv[2] ?? tmpdir();
const files = unzipSync(await loadZip(cacheDir));
const all = records(files);
const tags = recordTags(files);
const gc = globalThis.gc ?? (() => {});
const memoryMB = () => {
    const usage = process.memoryUsage();
    return (usage.heapUsed + usage.arrayBuffers) / 2 ** 20;
};
const largest = { arcs: 0, ms: 0, mb: 0, id: "" };

for (const [id, rec] of [...all.entries()].sort()) {
    if (!rec.track || !rec.nodes || !rec.arcs || !rec.route) continue;
    const track = table(rec.track);
    const rawNodes = table(rec.nodes);
    const arcs = table(rec.arcs);
    const route = table(rec.route).map((r) => r[0]);
    if (track.length < 2 || rawNodes.length === 0) continue;
    records_ += 1;
    totalArcs += arcs.length;

    const nodes = rawNodes.map(([longitude, latitude]) => ({ latitude, longitude }));
    const edges = arcs.map((arc) => ({
        from: arc[0],
        to: arc[1],
        key: roadKey(arc),
        lengthM: metres(rawNodes[arc[0]], rawNodes[arc[1]]),
    }));
    const keys = new Set(route.map((i) => edges[i].key));
    let lengthM = 0;
    const counted = new Set();
    for (const i of route) {
        if (counted.has(edges[i].key)) continue;
        counted.add(edges[i].key);
        lengthM += edges[i].lengthM;
    }
    const truth = { keys, lengthM };
    const fixes = track.map(([longitude, latitude]) => ({ latitude, longitude }));
    const hives = (tags.get(id) ?? []).includes("hives");

    gc();
    const heap0 = memoryMB();
    let t = performance.now();
    const graph = createRoadGraph({ nodes, edges });
    const graphMs = performance.now() - t;
    buildMs += graphMs;
    gc();
    const graphHeapMB = memoryMB() - heap0;
    if (arcs.length > largest.arcs)
        Object.assign(largest, { arcs: arcs.length, ms: graphMs, mb: graphHeapMB, id });

    configs.forEach((config, i) => {
        t = performance.now();
        const result = matchToRoads(fixes, graph, config.options);
        const ms = performance.now() - t;
        score(stats[i], result, truth, ms);
        if (!hives) score(cleanStats[i], result, truth, ms);
        if (i === configs.length - 1) {
            const one = emptyStats();
            score(one, result, truth, ms);
            perRecord.push({
                id,
                fixes: one.fixes,
                right: one.right / one.fixes,
                breaks: one.breaks,
                tags: tags.get(id) ?? [],
            });
        }
    });

    LAGS.forEach((lag, i) => {
        const matcher = createRoadMatcher(graph, { lag });
        const final = new Array(fixes.length).fill(null);
        t = performance.now();
        for (const fix of fixes)
            for (const c of matcher.push(fix).committed) final[c.index] = c.match;
        for (const c of matcher.flush()) final[c.index] = c.match;
        lagStats[i].ms += performance.now() - t;
        lagStats[i].fixes += fixes.length;
        for (const match of final)
            if (match !== null && keys.has(match.edge.key)) lagStats[i].right += 1;
    });

    if (fixes.length >= HOUR_FIXES && hour.fixes === 0) {
        const slice = fixes.slice(0, HOUR_FIXES);
        gc();
        const before = memoryMB();
        t = performance.now();
        const result = matchToRoads(slice, graph);
        hour.matchMs = performance.now() - t;
        hour.allocatedMB = memoryMB() - before;
        gc();
        hour.retainedMB = memoryMB() - before;
        const matcher = createRoadMatcher(graph);
        t = performance.now();
        for (const fix of slice) matcher.push(fix);
        hour.liveMsPerFix = (performance.now() - t) / HOUR_FIXES;
        hour.graphArcs = arcs.length;
        hour.graphMs = graphMs;
        hour.graphHeapMB = graphHeapMB;
        hour.fixes = result.matches.length;
        hour.id = id;
    }
}

console.log(
    `records: ${records_}; fixes: ${stats[0].fixes}; arcs: ${totalArcs}; graph build total ${(buildMs / 1000).toFixed(1)} s`,
);
console.log(`defaults: ${JSON.stringify(D)}; baseline (phase 0, nearest road): 85.7% right road`);
let stage = "";
configs.forEach((config, i) => {
    if (config.stage !== stage) {
        stage = config.stage;
        console.log("");
        console.log(`-- ${stage} (other knobs at default)`);
        console.log(HEADER);
    }
    console.log(row(config.label, stats[i], cleanStats[i]));
});
console.log("");
console.log("-- records below 97% right road with the defaults (every one, worst first)");
for (const r of perRecord.filter((x) => x.right < 0.97).sort((a, b) => a.right - b.right)) {
    console.log(
        `${r.id}  ${String(r.fixes).padStart(6)} fixes  ${(r.right * 100).toFixed(1).padStart(5)}%  breaks ${r.breaks}  ${r.tags.join(",")}`,
    );
}
const sortedRight = perRecord.map((r) => r.right).sort((a, b) => a - b);
console.log(
    `per-record right road: median ${(sortedRight[sortedRight.length >> 1] * 100).toFixed(1)}%; ${perRecord.filter((r) => r.right >= 0.97).length}/${perRecord.length} records at or above 97%`,
);
console.log("");
console.log("-- live matcher (createRoadMatcher, defaults), committed matches");
console.log(`${"lag".padEnd(10)} ${"right".padStart(7)} ${"µs/fix".padStart(7)}`);
LAGS.forEach((lag, i) => {
    const s = lagStats[i];
    console.log(
        `${String(lag).padEnd(10)} ${`${((s.right / s.fixes) * 100).toFixed(2)}%`.padStart(7)} ${((s.ms * 1000) / s.fixes).toFixed(1).padStart(7)}`,
    );
});
console.log("");
console.log(
    `one hour at 1 Hz (record ${hour.id}, first ${hour.fixes} fixes): graph ${hour.graphArcs} arcs built in ${hour.graphMs.toFixed(0)} ms, heap +${hour.graphHeapMB.toFixed(1)} MB; matchToRoads ${hour.matchMs.toFixed(0)} ms, ${hour.allocatedMB.toFixed(1)} MB allocated, ${hour.retainedMB.toFixed(1)} MB retained with the result; createRoadMatcher ${(hour.liveMsPerFix * 1000).toFixed(0)} µs/fix`,
);
console.log(
    `largest graph (record ${largest.id}): ${largest.arcs} arcs built in ${largest.ms.toFixed(0)} ms, ${largest.mb.toFixed(1)} MB (heap + typed arrays)`,
);
