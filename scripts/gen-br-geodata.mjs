#!/usr/bin/env node
// scripts/gen-br-geodata.mjs
//
// Regenerates the bundled Brazilian geodata under `src/br/data/`:
//   - br-uf-geo.json          — 27 UF boundaries (simplified) + centroids
//   - mun/<UF>.json           — municipalities per state (simplified) + centroids
//   - br-centroids.json       — compact centroid index for offline geocoding
//
// Sources (public domain / open, IBGE-derived):
//   - UF:  codeforgermany/click_that_hood  (brazil-states.geojson)
//   - MUN: tbrugz/geodata-br               (geojs-100-mun.json)
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

const UF_URL =
    "https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/brazil-states.geojson";
const MUN_URL =
    "https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-100-mun.json";

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
    process.stdout.write(`↓ downloading ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
    const text = await res.text();
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath, text);
    return JSON.parse(text);
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
function simplifyRing(ring, tol) {
    const s = dp(ring, tol).map(round);
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
        // Degenerate — fall back to the vertex mean.
        const mean = outer.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
        const n = outer.length || 1;
        return [Number((mean[0] / n).toFixed(4)), Number((mean[1] / n).toFixed(4))];
    }
    area *= 0.5;
    return [Number((cx / (6 * area)).toFixed(4)), Number((cy / (6 * area)).toFixed(4))];
}

function writeJson(path, obj) {
    return writeFile(path, JSON.stringify(obj), "utf8");
}

async function main() {
    await mkdir(MUN_DIR, { recursive: true });

    // ── UF layer ───────────────────────────────────────────────────────────
    const ufRaw = await download(UF_URL, "brazil-states.geojson");
    const ufFeatures = [];
    const stateCentroids = {};
    for (const f of ufRaw.features) {
        const uf = f.properties.sigla;
        const geom = simplifyGeometry(f.geometry, TOL_UF);
        if (!geom) continue;
        const centroid = centroidOf(geom);
        stateCentroids[uf] = centroid;
        ufFeatures.push({
            type: "Feature",
            properties: { uf, name: f.properties.name, region: REGION_BY_UF[uf], centroid },
            geometry: geom,
        });
    }
    ufFeatures.sort((a, b) => a.properties.uf.localeCompare(b.properties.uf));
    await writeJson(resolve(DATA_DIR, "br-uf-geo.json"), {
        type: "FeatureCollection",
        features: ufFeatures,
    });
    process.stdout.write(`✓ br-uf-geo.json (${ufFeatures.length} UFs)\n`);

    // ── Municipality layer, split per UF ─────────────────────────────────────
    const munRaw = await download(MUN_URL, "geojs-100-mun.json");
    const byUf = {};
    const munIndex = [];
    for (const f of munRaw.features) {
        const code = String(f.properties.id);
        const uf = UF_BY_CODE[Number(code.slice(0, 2))];
        if (!uf) continue;
        const geom = simplifyGeometry(f.geometry, TOL_MUN);
        if (!geom) continue;
        const name = f.properties.name;
        const centroid = centroidOf(geom);
        (byUf[uf] ??= []).push({
            type: "Feature",
            properties: { id: code, name, centroid },
            geometry: geom,
        });
        // Compact index row: [id, name, uf, lon, lat]
        munIndex.push([code, name, uf, centroid[0], centroid[1]]);
    }
    let munCount = 0;
    for (const uf of Object.keys(byUf).sort()) {
        const feats = byUf[uf].sort((a, b) =>
            a.properties.name.localeCompare(b.properties.name, "pt-BR"),
        );
        munCount += feats.length;
        await writeJson(resolve(MUN_DIR, `${uf}.json`), {
            type: "FeatureCollection",
            uf,
            features: feats,
        });
    }
    process.stdout.write(
        `✓ mun/<UF>.json (${munCount} municipalities across ${Object.keys(byUf).length} states)\n`,
    );

    // ── Compact centroid index for offline geocoding ─────────────────────────
    munIndex.sort((a, b) => a[0].localeCompare(b[0]));
    await writeJson(resolve(DATA_DIR, "br-centroids.json"), {
        states: stateCentroids,
        municipalities: munIndex,
    });
    process.stdout.write(`✓ br-centroids.json (${munIndex.length} municipality centroids)\n`);
}

main().catch((err) => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
});
