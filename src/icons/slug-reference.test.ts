import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { iconAliases } from "./generated/aliases";
import { iconNames } from "./generated/icon-names";

const ASSET_DIR = join(process.cwd(), "docs", "assets");

/**
 * Read one of the published reference files as a list of non-empty lines.
 *
 * @param name - File name inside `docs/assets`.
 * @returns The lines, trailing newline dropped.
 */
function readAsset(name: string): string[] {
    return readFileSync(join(ASSET_DIR, name), "utf8").trimEnd().split("\n");
}

/**
 * The slug lists published with the docs site are what a backend validates
 * `icon_code` against, and nothing at build time reads them back — so a lucide
 * bump that regenerates the tables without regenerating the assets would ship a
 * reference that silently rejects icons the SDK renders fine.
 *
 * These tests are that read-back. They fail on drift in either direction, which
 * is the signal to re-run `npm run gen:icons`.
 */
describe("docs/assets slug reference", () => {
    const canonical = iconNames.filter((name) => !(name in iconAliases));

    it("lists every canonical slug in icon-slugs.txt, and nothing else", () => {
        expect(readAsset("icon-slugs.txt")).toEqual(
            [...canonical].sort((a, b) => a.localeCompare(b)),
        );
    });

    it("covers every slug in icon-slugs.csv with its status and canonical name", () => {
        const [header, ...rows] = readAsset("icon-slugs.csv");
        expect(header).toBe("slug,status,canonical");

        const expected = [
            ...canonical.map((slug) => `${slug},canonical,${slug}`),
            ...Object.entries(iconAliases).map(([from, to]) => `${from},deprecated,${to}`),
        ].sort((a, b) => a.localeCompare(b));

        expect(rows).toEqual(expected);
    });

    it("resolves every deprecated row to a slug that exists", () => {
        const rows = readAsset("icon-slugs.csv").slice(1);
        const known = new Set<string>(canonical);

        for (const row of rows) {
            const [, status, target] = row.split(",");
            if (status === "deprecated") expect(known.has(target)).toBe(true);
        }
    });
});
