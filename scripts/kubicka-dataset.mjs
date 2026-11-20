/**
 * The Kubicka et al. map-matching dataset (IEEE IV 2015, Zenodo record 57731,
 * CC BY-SA 4.0), shared by the #667 benches: download once, check the MD5,
 * read in memory with `fflate`. Nothing from the archive touches the disk
 * except the zip itself, in the cache dir the caller picks.
 *
 * Per record: `.track` is `lon lat t` per fix, `.nodes` is `lon lat`, `.arcs`
 * is a directed node-index pair per line, `.route` is the ground-truth arc
 * index per line, in driving order.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8 } from "fflate";

const ZIP_URL = "https://zenodo.org/api/records/57731/files/map-matching-dataset.zip/content";
/** Zenodo answers 403 to a request without a User-Agent (measured 20/11/2026). */
const USER_AGENT = "tempest-gps-bench/1.0 (map-matching benchmark; low volume)";
const ZIP_MD5 = "38a224b5607ae3c1fca8534496a9680a";

/**
 * Load the dataset zip, from the cache or the network, and check its MD5.
 *
 * @param {string} cacheDir - Where the zip is cached between runs.
 * @returns {Promise<Uint8Array>} The verified archive bytes.
 * @throws {Error} When the download fails or the MD5 does not match.
 */
export async function loadZip(cacheDir) {
    const path = join(cacheDir, `kubicka-map-matching-${ZIP_MD5}.zip`);
    let bytes;
    if (existsSync(path)) {
        bytes = new Uint8Array(readFileSync(path));
    } else {
        const response = await fetch(ZIP_URL, { headers: { "User-Agent": USER_AGENT } });
        if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
        bytes = new Uint8Array(await response.arrayBuffer());
    }
    const md5 = createHash("md5").update(bytes).digest("hex");
    if (md5 !== ZIP_MD5) throw new Error(`MD5 mismatch: ${md5}`);
    if (!existsSync(path)) writeFileSync(path, bytes);
    return bytes;
}

/**
 * Parse a whitespace-separated numeric table.
 *
 * @param {string} text - File contents.
 * @returns {number[][]} One array of numbers per non-empty line.
 */
export function table(text) {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/\s+/).map(Number));
}

/**
 * Group the archive entries into records by their numeric folder.
 *
 * @param {Record<string, Uint8Array>} files - The unzipped archive.
 * @returns {Map<string, Record<string, string>>} Record id to extension to text.
 */
export function records(files) {
    const byId = new Map();
    for (const [name, data] of Object.entries(files)) {
        const match = /(\d{8})\/\d{8}\.(track|nodes|arcs|route)$/.exec(name);
        if (!match) continue;
        const entry = byId.get(match[1]) ?? {};
        entry[match[2]] = strFromU8(data);
        byId.set(match[1], entry);
    }
    return byId;
}

/**
 * Feature tags of every record, from the archive's `metadata.xml`: `gaps`,
 * `loops`, `u-turns`, `congruence-issues` (track and map disagree), `hives`
 * (the drive wanders where the excerpt has no road, e.g. a yard or a car
 * park).
 *
 * @param {Record<string, Uint8Array>} files - The unzipped archive.
 * @returns {Map<string, string[]>} Zero-padded record id to its tag values.
 */
export function recordTags(files) {
    const tags = new Map();
    const xml = files["metadata.xml"] ? strFromU8(files["metadata.xml"]) : "";
    for (const match of xml.matchAll(/<record id="(\d+)"[^>]*>([\s\S]*?)<\/record>/g)) {
        const values = [...match[2].matchAll(/<tag key="feature" value="([^"]+)"/g)].map(
            (m) => m[1],
        );
        tags.set(match[1].padStart(8, "0"), values);
    }
    return tags;
}
