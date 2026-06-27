// Load an OpenAPI spec from a local file path or an http(s) URL → parsed object.
import { readFile } from "node:fs/promises";

/**
 * @param {string} source - File path or http(s) URL to an openapi.json.
 * @returns {Promise<object>} The parsed OpenAPI document.
 */
export async function loadSpec(source) {
    let raw;
    if (/^https?:\/\//.test(source)) {
        const res = await fetch(source);
        if (!res.ok) throw new Error(`Failed to fetch ${source} — HTTP ${res.status}`);
        raw = await res.text();
    } else {
        raw = await readFile(source, "utf8");
    }
    try {
        return JSON.parse(raw);
    } catch {
        throw new Error(
            `Could not parse ${source} as JSON. Only openapi.json (JSON) is supported for now — point at the FastAPI /openapi.json endpoint.`,
        );
    }
}
