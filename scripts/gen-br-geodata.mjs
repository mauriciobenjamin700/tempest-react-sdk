#!/usr/bin/env node
// scripts/gen-br-geodata.mjs
//
// Regenerates every bundled Brazilian dataset under `src/br/data/` from a
// single source — IBGE — so the four files cannot disagree with each other:
//
//   - br-locations.json       — the municipality roster, keyed by IBGE code
//   - br-centroids.json       — compact centroid index for offline geocoding
//   - mun/<UF>.json           — municipality boundaries per state (simplified)
//   - br-uf-geo.json          — 27 UF boundaries (simplified) + centroids
//
// Sources (IBGE, public):
//   - roster:   /api/v1/localidades/municipios          (names + 7-digit codes)
//   - DF RAs:   /api/v1/localidades/municipios/5300108/subdistritos
//   - UFs:      /api/v1/localidades/estados             (names)
//   - UF mesh:  /api/v3/malhas/paises/BR?intrarregiao=UF
//   - MUN mesh: /api/v3/malhas/estados/<UF>?intrarregiao=municipio
//
// The roster is the authority on which municipalities exist and what they are
// called; the mesh is the authority on where they are. Both are joined on the
// 7-digit IBGE code, which survives a rename — the previous generation joined
// on name and that is exactly why the shipped files drifted apart (issue #249).
//
// Geometry is simplified with Douglas-Peucker (~2 km tolerance) and rounded to
// 3 decimals — adequate for interactive overview maps, not precise analysis.
//
// Usage:  node scripts/gen-br-geodata.mjs
// Raw downloads are cached under scripts/.geodata-cache/ (git-ignored).

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "src/br/data");
const MUN_DIR = resolve(DATA_DIR, "mun");
const CACHE_DIR = resolve(__dirname, ".geodata-cache");

const IBGE = "https://servicodados.ibge.gov.br";
const GEOJSON = "formato=application/vnd.geo+json";

/**
 * The mesh vintage IBGE currently serves.
 *
 * Not a knob: `periodo=2023`, `2024` and `2025` all answer `500`, so 2022 is
 * simply what exists. It is written into every output because the gap between
 * it and the live roster is a real, checkable quantity — one municipality today
 * (see `PENDING_GEOMETRY`) — and a silent gap is how the files drifted before.
 */
const MESH_VINTAGE = "2022";

/**
 * Municipalities the roster lists and the mesh does not carry.
 *
 * Boa Esperança do Norte (MT) was installed in 2023, after the 2022 mesh, and
 * IBGE serves no geometry for it at any endpoint — `/malhas/municipios/5101837`
 * answers `500`. It ships in the roster (it exists, it is selectable) and stays
 * out of the centroid index (there is no honest coordinate to give it), and
 * `tests` pin exactly this list so the next one shows up as a failure rather
 * than as a municipality that quietly does not geocode.
 */
const PENDING_GEOMETRY = ["5101837"];

/**
 * Names the Federal District's administrative regions were shipped under before,
 * mapped to the IBGE subdistrict that covers them.
 *
 * IBGE names three subdistricts as composites of what GDF signposts separately
 * — `SCIA` is Estrutural, `Sudoeste/Octogonal` and `Sol Nascente/Pôr do Sol`
 * are each two neighbourhoods. An app that saved `"Octogonal"` in an address
 * field keeps resolving through these.
 */
const DF_REGION_ALIASES = {
    Estrutural: "SCIA",
    Octogonal: "Sudoeste/Octogonal",
    Sudoeste: "Sudoeste/Octogonal",
    "Sol Nascente": "Sol Nascente/Pôr do Sol",
    "Pôr do Sol": "Sol Nascente/Pôr do Sol",
};

const BRASILIA_ID = "5300108";

/**
 * The mesh detail to ask IBGE for, per layer.
 *
 * `minima` is not an option for municipalities: it draws Rio de Janeiro with 35
 * points in total, and downtown Rio falls *outside* that outline — so
 * `reverseGeocode` answers "Niterói" for a coordinate in Centro. `intermediaria`
 * keeps the coastline that decides such a point, and the Douglas-Peucker pass
 * below brings the file size back down. The UF layer has no point-in-polygon
 * consumer that fine, but it is the same request either way.
 */
const MUN_QUALITY = "intermediaria";

const TOL_UF = 0.02;
const TOL_MUN = 0.02;
const NDIGITS = 3;

const UF_BY_CODE = {
    11: "RO",
    12: "AC",
    13: "AM",
    14: "RR",
    15: "PA",
    16: "AP",
    17: "TO",
    21: "MA",
    22: "PI",
    23: "CE",
    24: "RN",
    25: "PB",
    26: "PE",
    27: "AL",
    28: "SE",
    29: "BA",
    31: "MG",
    32: "ES",
    33: "RJ",
    35: "SP",
    41: "PR",
    42: "SC",
    43: "RS",
    50: "MS",
    51: "MT",
    52: "GO",
    53: "DF",
};
const REGION_BY_UF = {
    RO: "Norte",
    AC: "Norte",
    AM: "Norte",
    RR: "Norte",
    PA: "Norte",
    AP: "Norte",
    TO: "Norte",
    MA: "Nordeste",
    PI: "Nordeste",
    CE: "Nordeste",
    RN: "Nordeste",
    PB: "Nordeste",
    PE: "Nordeste",
    AL: "Nordeste",
    SE: "Nordeste",
    BA: "Nordeste",
    MG: "Sudeste",
    ES: "Sudeste",
    RJ: "Sudeste",
    SP: "Sudeste",
    PR: "Sul",
    SC: "Sul",
    RS: "Sul",
    MS: "Centro-Oeste",
    MT: "Centro-Oeste",
    GO: "Centro-Oeste",
    DF: "Centro-Oeste",
};

const UFS = Object.values(UF_BY_CODE).sort();

async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

async function download(url, cacheFile) {
    const cachePath = resolve(CACHE_DIR, cacheFile);
    if (await exists(cachePath)) {
        return JSON.parse(await readFile(cachePath, "utf8"));
    }
    process.stdout.write(`↓ ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
    const text = await res.text();
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath, text);
    return JSON.parse(text);
}

async function readJsonIfPresent(path) {
    return (await exists(path)) ? JSON.parse(await readFile(path, "utf8")) : null;
}

// ── Douglas-Peucker simplification ─────────────────────────────────────────
function perpDistance([x, y], [x1, y1], [x2, y2]) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
    let t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
function dp(points, tol) {
    if (points.length < 3) return points;
    let dmax = 0;
    let idx = 0;
    for (let i = 1; i < points.length - 1; i += 1) {
        const d = perpDistance(points[i], points[0], points[points.length - 1]);
        if (d > dmax) {
            dmax = d;
            idx = i;
        }
    }
    if (dmax > tol) {
        return [...dp(points.slice(0, idx + 1), tol).slice(0, -1), ...dp(points.slice(idx), tol)];
    }
    return [points[0], points[points.length - 1]];
}
function round(coord) {
    return [Number(coord[0].toFixed(NDIGITS)), Number(coord[1].toFixed(NDIGITS))];
}
/**
 * The tolerance to simplify one ring with, never coarser than the ring itself.
 *
 * A fixed ~2 km tolerance erases a municipality that is only a couple of
 * kilometres across: every vertex falls inside it, the ring collapses below the
 * four points a polygon needs, and the municipality silently vanishes from the
 * output. That is how Santa Cruz de Minas (3.5 km², the smallest in Brazil),
 * Águas de São Pedro, Rio Grande da Serra and Taboão da Serra went missing from
 * the previously shipped mesh. Capping at a twentieth of the ring's bounding-box
 * diagonal keeps a small shape recognizable and leaves a state-sized ring at the
 * full tolerance.
 *
 * @param ring - The ring's `[lon, lat]` vertices.
 * @param tol - The layer's base tolerance, in degrees.
 * @returns The tolerance to hand Douglas-Peucker for this ring.
 */
function ringTolerance(ring, tol) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return Math.min(tol, Math.hypot(maxX - minX, maxY - minY) / 20);
}

function simplifyRing(ring, tol) {
    const s = dp(ring, ringTolerance(ring, tol)).map(round);
    const out = [s[0]];
    for (const p of s.slice(1)) {
        if (p[0] !== out[out.length - 1][0] || p[1] !== out[out.length - 1][1]) out.push(p);
    }
    if (
        out.length >= 3 &&
        (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])
    ) {
        out.push(out[0]);
    }
    return out.length >= 4 ? out : null;
}
function simplifyGeometry(geom, tol) {
    if (geom.type === "Polygon") {
        const rings = geom.coordinates.map((r) => simplifyRing(r, tol)).filter(Boolean);
        return rings.length ? { type: "Polygon", coordinates: rings } : null;
    }
    const polys = [];
    for (const poly of geom.coordinates) {
        const rings = poly.map((r) => simplifyRing(r, tol)).filter(Boolean);
        if (rings.length) polys.push(rings);
    }
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
}

// ── Centroid (area-weighted, over the largest ring) ─────────────────────────
function ringsOf(geom) {
    return geom.type === "MultiPolygon" ? geom.coordinates.flat() : geom.coordinates;
}
function centroidOf(geom) {
    const rings = ringsOf(geom);
    const outer = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0] ?? []);
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < outer.length - 1; i += 1) {
        const [x0, y0] = outer[i];
        const [x1, y1] = outer[i + 1];
        const cross = x0 * y1 - x1 * y0;
        area += cross;
        cx += (x0 + x1) * cross;
        cy += (y0 + y1) * cross;
    }
    if (Math.abs(area) < 1e-12) {
        const mean = outer.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
        const n = outer.length || 1;
        return [Number((mean[0] / n).toFixed(4)), Number((mean[1] / n).toFixed(4))];
    }
    area *= 0.5;
    return [Number((cx / (6 * area)).toFixed(4)), Number((cy / (6 * area)).toFixed(4))];
}

function byName(a, b) {
    return a.localeCompare(b, "pt-BR");
}

function writeJson(path, obj) {
    return writeFile(path, JSON.stringify(obj), "utf8");
}

/**
 * Every name a municipality has already shipped under, mapped to its IBGE code.
 *
 * Built by diffing the datasets already in the tree against the fresh roster on
 * the code they share, so a rename between vintages (`Presidente Juscelino` →
 * `Serra Caiada`) yields an alias without anyone writing one down. The result is
 * merged into what previous runs recorded, which is what makes the table
 * accumulate instead of resetting to whatever the last two vintages disagreed
 * about.
 *
 * @param roster - Fresh roster rows, `{ id, name, uf }`.
 * @param previousLocations - Parsed `br-locations.json` before this run, or null.
 * @param previousCentroids - Parsed `br-centroids.json` before this run, or null.
 * @param regionIdByName - IBGE subdistrict code for each DF region name.
 * @returns Alias name to code, sorted by name.
 */
function buildAliases(roster, previousLocations, previousCentroids, regionIdByName) {
    const nameById = new Map(roster.map((m) => [m.id, m.name]));
    const aliases = new Map(previousLocations?.aliases ?? []);

    for (const [id, name] of previousCentroids?.municipalities?.map((r) => [r[0], r[1]]) ?? []) {
        const current = nameById.get(id);
        if (current !== undefined && current !== name) aliases.set(name, id);
    }
    for (const [name, region] of Object.entries(DF_REGION_ALIASES)) {
        const id = regionIdByName.get(region);
        if (id !== undefined) aliases.set(name, id);
    }
    const live = new Set(roster.map((m) => `${m.uf}:${m.name}`));
    for (const [name, id] of [...aliases]) {
        const uf = UF_BY_CODE[Number(id.slice(0, 2))];
        if (live.has(`${uf}:${name}`)) aliases.delete(name);
    }

    return [...aliases.entries()].sort((a, b) => byName(a[0], b[0]));
}

async function main() {
    await mkdir(MUN_DIR, { recursive: true });

    const previousLocations = await readJsonIfPresent(resolve(DATA_DIR, "br-locations.json"));
    const previousCentroids = await readJsonIfPresent(resolve(DATA_DIR, "br-centroids.json"));

    // ── Roster: who exists and what they are called ─────────────────────────
    const rosterRaw = await download(`${IBGE}/api/v1/localidades/municipios`, "municipios.json");
    const roster = rosterRaw
        .map((m) => {
            const id = String(m.id);
            return { id, name: m.nome, uf: UF_BY_CODE[Number(id.slice(0, 2))] };
        })
        .filter((m) => m.uf !== undefined);

    const statesRaw = await download(`${IBGE}/api/v1/localidades/estados`, "estados.json");
    const stateName = new Map(statesRaw.map((s) => [s.sigla, s.nome]));

    const regionsRaw = await download(
        `${IBGE}/api/v1/localidades/municipios/${BRASILIA_ID}/subdistritos`,
        "df-subdistritos.json",
    );
    const regions = regionsRaw
        .map((r) => ({ id: String(r.id), name: r.nome }))
        .sort((a, b) => byName(a.name, b.name));
    const regionIdByName = new Map(regions.map((r) => [r.name, r.id]));

    // ── UF layer ────────────────────────────────────────────────────────────
    const ufRaw = await download(
        `${IBGE}/api/v3/malhas/paises/BR?${GEOJSON}&intrarregiao=UF&qualidade=intermediaria`,
        "malha-uf.json",
    );
    const ufFeatures = [];
    const stateCentroids = {};
    for (const f of ufRaw.features) {
        const uf = UF_BY_CODE[Number(f.properties.codarea)];
        const geom = simplifyGeometry(f.geometry, TOL_UF);
        if (uf === undefined || !geom) continue;
        const centroid = centroidOf(geom);
        stateCentroids[uf] = centroid;
        ufFeatures.push({
            type: "Feature",
            properties: { uf, name: stateName.get(uf), region: REGION_BY_UF[uf], centroid },
            geometry: geom,
        });
    }
    ufFeatures.sort((a, b) => a.properties.uf.localeCompare(b.properties.uf));
    await writeJson(resolve(DATA_DIR, "br-uf-geo.json"), {
        type: "FeatureCollection",
        features: ufFeatures,
    });
    process.stdout.write(`✓ br-uf-geo.json (${ufFeatures.length} UFs)\n`);

    // ── Municipality layer, one mesh request per UF ──────────────────────────
    const centroidById = new Map();
    let munCount = 0;
    for (const uf of UFS) {
        const raw = await download(
            `${IBGE}/api/v3/malhas/estados/${uf}?${GEOJSON}&intrarregiao=municipio&qualidade=${MUN_QUALITY}`,
            `malha-mun-${uf}-${MUN_QUALITY}.json`,
        );
        const nameById = new Map(roster.filter((m) => m.uf === uf).map((m) => [m.id, m.name]));
        const feats = [];
        for (const f of raw.features) {
            const id = String(f.properties.codarea);
            const name = nameById.get(id);
            const geom = simplifyGeometry(f.geometry, TOL_MUN);
            if (name === undefined || !geom) continue;
            const centroid = centroidOf(geom);
            centroidById.set(id, centroid);
            feats.push({ type: "Feature", properties: { id, name, centroid }, geometry: geom });
        }
        feats.sort((a, b) => byName(a.properties.name, b.properties.name));
        munCount += feats.length;
        await writeJson(resolve(MUN_DIR, `${uf}.json`), {
            type: "FeatureCollection",
            uf,
            features: feats,
        });
    }
    process.stdout.write(`✓ mun/<UF>.json (${munCount} municipalities across ${UFS.length} UFs)\n`);

    // ── The gap between roster and mesh, stated rather than absorbed ─────────
    const missing = roster.filter((m) => !centroidById.has(m.id));
    const unexpected = missing.filter((m) => !PENDING_GEOMETRY.includes(m.id));
    if (unexpected.length > 0) {
        throw new Error(
            `roster lists ${unexpected.length} municipalities the ${MESH_VINTAGE} mesh does not ` +
                `carry, and PENDING_GEOMETRY does not declare them: ` +
                unexpected.map((m) => `${m.id} ${m.name}/${m.uf}`).join(", "),
        );
    }

    const vintage = { roster: new Date().toISOString().slice(0, 10), mesh: MESH_VINTAGE };

    // ── Compact centroid index for offline geocoding ─────────────────────────
    const munIndex = roster
        .filter((m) => centroidById.has(m.id))
        .map((m) => {
            const [lon, lat] = centroidById.get(m.id);
            return [m.id, m.name, m.uf, lon, lat];
        })
        .sort((a, b) => a[0].localeCompare(b[0]));
    await writeJson(resolve(DATA_DIR, "br-centroids.json"), {
        vintage,
        states: stateCentroids,
        municipalities: munIndex,
    });
    process.stdout.write(`✓ br-centroids.json (${munIndex.length} centroids)\n`);

    // ── Roster file: what the selectors list ─────────────────────────────────
    const aliases = buildAliases(roster, previousLocations, previousCentroids, regionIdByName);
    const states = UFS.map((uf) => ({
        uf,
        name: stateName.get(uf),
        region: REGION_BY_UF[uf],
        cities: roster
            .filter((m) => m.uf === uf)
            .sort((a, b) => byName(a.name, b.name))
            .map((m) => [m.id, m.name]),
    })).sort((a, b) => byName(a.name, b.name));

    await writeJson(resolve(DATA_DIR, "br-locations.json"), {
        vintage,
        states,
        administrativeRegions: { [BRASILIA_ID]: regions.map((r) => [r.id, r.name]) },
        aliases,
        pendingGeometry: missing.map((m) => m.id),
    });
    process.stdout.write(
        `✓ br-locations.json (${roster.length} municipalities, ${regions.length} DF regions, ` +
            `${aliases.length} aliases, ${missing.length} pending geometry)\n`,
    );
}

main().catch((err) => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
});
