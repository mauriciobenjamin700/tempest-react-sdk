#!/usr/bin/env node
/**
 * Regenerates `src/br/data/br-seats.json`: the coordinate of each municipality's
 * **seat** (the town hall's city), next to the territory centroid that
 * `gen-br-geodata.mjs` writes into `br-centroids.json` (issue #677).
 *
 * A centroid is the middle of the territory, and in a large municipality that is
 * nowhere near the town: median 5.6 km over 5570 municipalities, 3067 of them
 * farther than 5 km, Altamira (PA) 410 km. A marker, a distance or a "nearest to
 * me" built on it lands in the wrong place.
 *
 * Source: kelvins/municipios-brasileiros (MIT), the same file the backend
 * (`tempest-fastapi-sdk`, `scripts/regen_br_municipalities.py`) reads, so both
 * sides give the same point. Pinned by commit **and** by SHA-256: the download is
 * untrusted input, so it is size-capped, parsed as strict CSV (no quoting, nine
 * columns, numeric ranges checked) and never evaluated.
 *
 * Names and UFs come from the committed IBGE roster (`br-locations.json`), joined
 * on the 7-digit code; the source's own spelling is ignored. A seat that falls
 * outside its own municipality's boundary by more than `MAX_OUTSIDE_KM` is a
 * source error, not a seat: those rows ship the centroid instead and are listed
 * in `centroidFallback`, and `SEAT_REJECTED` pins exactly which ones, so a new
 * one fails the run instead of shipping.
 *
 * Run after `gen-br-geodata.mjs` (it reads that script's output).
 *
 * Usage:  node scripts/gen-br-seats.mjs
 * The download is cached under scripts/.geodata-cache/ (git-ignored) and the
 * hash is checked on the cached copy too.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "src/br/data");
const MUN_DIR = resolve(DATA_DIR, "mun");
const CACHE_DIR = resolve(__dirname, ".geodata-cache");

/** The pinned source: repository, commit and the SHA-256 of each file read. */
const SOURCE = {
    name: "kelvins/municipios-brasileiros",
    url: "https://github.com/kelvins/municipios-brasileiros",
    commit: "503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861",
    file: "csv/municipios.csv",
    sha256: "22bd03d004361329f69ddfa3f6c99cd53012aa53972a172e10b141288ad0b1fe",
    license: "MIT",
    licenseFile: "LICENSE",
    licenseSha256: "c8254a78fe3edcb841e0df79bcd217e2626c2a13f9374dd8a51729d88dc0bc88",
};

/** Upper bound on a download; the pinned CSV is 390 KB. */
const MAX_BYTES = 2_000_000;

/** The CSV header the parser accepts, column for column. */
const EXPECTED_HEADER =
    "codigo_ibge,nome,latitude,longitude,capital,codigo_uf,siafi_id,ddd,fuso_horario";

/**
 * How far outside its own (simplified) boundary a seat may sit and still count.
 *
 * The boundaries are Douglas-Peucker-simplified at 0.02° (~2.2 km), so a real
 * seat on a river bank or a coast can fall a little outside: 51 of the 56 seats
 * outside their outline are within 1 km of it. The next one is 6.8 km out, and
 * the worst 749 km — a gap wide enough that 3 km separates the two cleanly.
 */
const MAX_OUTSIDE_KM = 3;

/**
 * Seats the source places outside their own municipality, measured against the
 * IBGE 2022 mesh at the pinned commit. Each ships its centroid instead.
 *
 * - 1505551 Pau d'Arco (PA): source puts it 750 km away, near Belém.
 * - 4105201 Cerro Azul (PR): 360 km away, in the west of the state.
 * - 4128625 Alto Paraíso (PR): 288 km away.
 * - 3164431 São Sebastião da Vargem Alegre (MG): 157 km away.
 * - 2613107 São Caetano (PE): 6.8 km outside its boundary.
 */
const SEAT_REJECTED = ["1505551", "2613107", "3164431", "4105201", "4128625"];

const EARTH_RADIUS_KM = 6371.0088;

async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * Fetch one file of the pinned commit (or read the cached copy) and verify it.
 *
 * @param {string} path - Path inside the repository.
 * @param {string} sha256 - Expected hex digest.
 * @returns {Promise<string>} The file, decoded as UTF-8.
 */
async function pinnedFile(path, sha256) {
    const cachePath = resolve(CACHE_DIR, `kelvins-${SOURCE.commit}-${path.replaceAll("/", "_")}`);
    let bytes;
    if (await exists(cachePath)) {
        bytes = await readFile(cachePath);
    } else {
        const url = `https://raw.githubusercontent.com/${SOURCE.name}/${SOURCE.commit}/${path}`;
        process.stdout.write(`↓ ${url}\n`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
        const declared = Number(res.headers.get("content-length") ?? 0);
        if (declared > MAX_BYTES) throw new Error(`${path}: ${declared} bytes, cap ${MAX_BYTES}`);
        bytes = Buffer.from(await res.arrayBuffer());
    }
    if (bytes.length > MAX_BYTES)
        throw new Error(`${path}: ${bytes.length} bytes, cap ${MAX_BYTES}`);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== sha256) throw new Error(`${path}: sha256 ${digest}, pinned ${sha256}`);
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath, bytes);
    return bytes.toString("utf8");
}

/**
 * Strict parse of the source CSV into `id → [lon, lat]`.
 *
 * The pinned file has no quoted field, so a quote, a wrong column count, a code
 * that is not seven digits, a duplicate or a coordinate outside Brazil's
 * bounding box is an error — anything else would be guessing at a format the
 * file does not use.
 *
 * @param {string} text - The CSV.
 * @returns {Map<string, [number, number]>} Seat per IBGE code.
 */
function parseSeats(text) {
    const lines = text
        .replace(/^﻿/, "")
        .split(/\r?\n/)
        .filter((line) => line !== "");
    if (lines[0] !== EXPECTED_HEADER) throw new Error(`unexpected header: ${lines[0]}`);
    const seats = new Map();
    for (const [index, line] of lines.slice(1).entries()) {
        const cells = line.split(",");
        if (line.includes('"') || cells.length !== 9) {
            throw new Error(`line ${index + 2}: not a plain 9-column row`);
        }
        const [id, , latText, lonText] = cells;
        const lat = Number(latText);
        const lon = Number(lonText);
        if (!/^\d{7}$/.test(id)) throw new Error(`line ${index + 2}: code ${id}`);
        if (!(lat >= -34 && lat <= 6 && lon >= -74 && lon <= -28)) {
            throw new Error(`line ${index + 2}: ${id} at ${lat}, ${lon} is outside Brazil`);
        }
        if (seats.has(id)) throw new Error(`line ${index + 2}: duplicate ${id}`);
        seats.set(id, [lon, lat]);
    }
    return seats;
}

function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function polygonsOf(geometry) {
    return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

function inGeometry([x, y], geometry) {
    return polygonsOf(geometry).some(
        (rings) => inRing(x, y, rings[0]) && !rings.slice(1).some((r) => inRing(x, y, r)),
    );
}

/**
 * Kilometres from a point to the nearest edge of a geometry (equirectangular,
 * which is exact enough at the few-kilometre scale this decides on).
 */
function kmToBoundary([px, py], geometry) {
    const k = Math.cos((py * Math.PI) / 180);
    let best = Infinity;
    for (const rings of polygonsOf(geometry)) {
        for (const ring of rings) {
            for (let i = 0; i < ring.length - 1; i += 1) {
                const ax = (ring[i][0] - px) * k;
                const ay = ring[i][1] - py;
                const dx = (ring[i + 1][0] - px) * k - ax;
                const dy = ring[i + 1][1] - py - ay;
                const len = dx * dx + dy * dy;
                const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
                best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
            }
        }
    }
    return (best * Math.PI * EARTH_RADIUS_KM) / 180;
}

async function main() {
    const csv = await pinnedFile(SOURCE.file, SOURCE.sha256);
    const licenseText = await pinnedFile(SOURCE.licenseFile, SOURCE.licenseSha256);
    const seats = parseSeats(csv);

    const locations = JSON.parse(await readFile(resolve(DATA_DIR, "br-locations.json"), "utf8"));
    const centroids = JSON.parse(await readFile(resolve(DATA_DIR, "br-centroids.json"), "utf8"));
    const centroidById = new Map(centroids.municipalities.map((r) => [r[0], [r[3], r[4]]]));
    const roster = locations.states.flatMap((s) =>
        s.cities.map(([id, name]) => ({ id, name, uf: s.uf })),
    );

    const rosterIds = new Set(roster.map((m) => m.id));
    const missing = roster.filter((m) => !seats.has(m.id)).map((m) => m.id);
    const extra = [...seats.keys()].filter((id) => !rosterIds.has(id));
    if (missing.length > 0 || extra.length > 0) {
        throw new Error(`source and roster disagree: missing ${missing}, extra ${extra}`);
    }

    const geometryById = new Map();
    for (const file of await readdir(MUN_DIR)) {
        const fc = JSON.parse(await readFile(resolve(MUN_DIR, file), "utf8"));
        for (const f of fc.features) geometryById.set(f.properties.id, f.geometry);
    }

    const rejected = roster
        .filter((m) => {
            const geometry = geometryById.get(m.id);
            if (!geometry) return false;
            const seat = seats.get(m.id);
            return !inGeometry(seat, geometry) && kmToBoundary(seat, geometry) > MAX_OUTSIDE_KM;
        })
        .map((m) => m.id)
        .sort();
    if (rejected.join() !== SEAT_REJECTED.join()) {
        throw new Error(
            `seats outside their municipality changed: found ${rejected}, pinned ${SEAT_REJECTED}`,
        );
    }

    const rows = roster
        .map((m) => [
            m.id,
            m.name,
            m.uf,
            ...(rejected.includes(m.id) ? centroidById.get(m.id) : seats.get(m.id)),
        ])
        .sort((a, b) => a[0].localeCompare(b[0]));

    await writeFile(
        resolve(DATA_DIR, "br-seats.json"),
        JSON.stringify({
            source: { ...SOURCE, licenseText },
            vintage: locations.vintage,
            centroidFallback: rejected,
            municipalities: rows,
        }),
        "utf8",
    );
    process.stdout.write(
        `✓ br-seats.json (${rows.length} municipalities, ${rejected.length} on centroid fallback)\n`,
    );
}

main().catch((err) => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
});
