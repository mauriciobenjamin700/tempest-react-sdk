/**
 * Every UF loader is exercised here, once.
 *
 * The loader table is 27 hand-written dynamic imports, and a wrong path or a
 * file saved under the wrong acronym is invisible until an app asks for that
 * state in production and gets a 404 (or, worse, another state's geometry
 * drawn under the right name). One import per UF is the only check that reaches
 * all 27 entries, so this test walks the whole table and asserts the collection
 * says it belongs to the state that asked for it.
 *
 * It reads ~2.3 MB of GeoJSON, which is why it lives in its own file and runs
 * the states sequentially — 27 parallel parses is the one way to make this the
 * slowest test in the suite.
 */
import { describe, expect, it } from "vitest";

import { listStates } from "./locations";
import { loadStateMunicipalities } from "./state-geo";

describe("loadStateMunicipalities — the whole loader table", () => {
    it("loads every federative unit, and each file belongs to the UF that asked", async () => {
        const states = listStates();
        expect(states).toHaveLength(27);

        for (const state of states) {
            const collection = await loadStateMunicipalities(state.uf);

            expect(collection, `${state.uf} has no municipality file`).not.toBeNull();
            expect(collection?.uf, `${state.uf} loaded another state's geometry`).toBe(state.uf);
            expect(collection?.type).toBe("FeatureCollection");
            expect(
                collection?.features.length,
                `${state.uf} loaded an empty collection`,
            ).toBeGreaterThan(0);

            const [first] = collection!.features;
            expect(first.properties.id).toMatch(/^\d{7}$/);
            expect(first.properties.name.length).toBeGreaterThan(0);
            expect(first.properties.centroid).toHaveLength(2);
        }
    }, 60_000);

    it("answers null for an acronym that is not a federative unit", async () => {
        expect(await loadStateMunicipalities("XX" as never)).toBeNull();
    });
});
