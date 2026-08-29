import { describe, expect, it } from "vitest";

import centroidsData from "./data/br-centroids.json";
import locationsData from "./data/br-locations.json";
import {
    administrativeRegionsByUf,
    datasetVintage,
    listStates,
    municipalitiesByUf,
    pendingGeometryIds,
    resolveMunicipality,
    type UF,
} from "./locations";
import { loadStateMunicipalities } from "./state-geo";

/**
 * The four bundled datasets have to describe the same country.
 *
 * They did not: the roster the selectors listed and the centroid index the
 * geocoder read came from different IBGE vintages joined on *name*, so 44
 * municipalities were present in both under two spellings and simply failed to
 * geocode, and the Federal District listed 35 administrative regions as if they
 * were municipalities. Everything is joined on the 7-digit IBGE code now, and
 * these are the assertions that keep it that way — a partial regeneration fails
 * here instead of shipping.
 */

interface RawLocations {
    vintage: { roster: string; mesh: string };
    states: { uf: string; name: string; cities: [string, string][] }[];
    administrativeRegions: Record<string, [string, string][]>;
    aliases: [string, string][];
    pendingGeometry: string[];
}

interface RawCentroids {
    vintage: { roster: string; mesh: string };
    states: Record<string, [number, number]>;
    municipalities: [string, string, string, number, number][];
}

const locations = locationsData as unknown as RawLocations;
const centroids = centroidsData as unknown as RawCentroids;

const rosterNameById = new Map(
    locations.states.flatMap((s) => s.cities.map(([id, name]) => [id, name] as const)),
);
const rosterUfById = new Map(
    locations.states.flatMap((s) => s.cities.map(([id]) => [id, s.uf] as const)),
);
const centroidIds = new Set(centroids.municipalities.map((row) => row[0]));

describe("bundled BR datasets agree", () => {
    it("declares one vintage, and the same one in every file", () => {
        expect(locations.vintage.mesh).toBe("2022");
        expect(locations.vintage.roster).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(centroids.vintage).toEqual(locations.vintage);
        expect(datasetVintage()).toEqual(locations.vintage);
    });

    it("carries the IBGE roster: 5571 municipalities across 27 UFs", () => {
        expect(rosterNameById.size).toBe(5571);
        expect(listStates()).toHaveLength(27);
    });

    it("gives every municipality a centroid, except the ones it declares pending", () => {
        const missing = [...rosterNameById.keys()].filter((id) => !centroidIds.has(id));
        expect(missing).toEqual(locations.pendingGeometry);
    });

    it("pins the pending list, so the next gap is a failure and not a surprise", () => {
        expect(pendingGeometryIds()).toEqual(["5101837"]);
        expect(rosterNameById.get("5101837")).toBe("Boa Esperança do Norte");
    });

    it("has no centroid for a municipality the roster does not list", () => {
        const orphans = [...centroidIds].filter((id) => !rosterNameById.has(id));
        expect(orphans).toEqual([]);
    });

    it("spells every municipality the same way in both files", () => {
        const disagreeing = centroids.municipalities
            .filter(
                ([id, name, uf]) => rosterNameById.get(id) !== name || rosterUfById.get(id) !== uf,
            )
            .map(([id, name]) => `${id} ${name}`);
        expect(disagreeing).toEqual([]);
    });

    it("matches the per-UF boundary files to the roster, id by id", async () => {
        const ufs = listStates().map((s) => s.uf);
        const problems: string[] = [];
        for (const uf of ufs) {
            const state = await loadStateMunicipalities(uf);
            const expected = municipalitiesByUf(uf)
                .map((m) => m.id)
                .filter((id) => !locations.pendingGeometry.includes(id))
                .sort();
            const actual = (state?.features ?? []).map((f) => f.properties.id).sort();
            if (actual.join() !== expected.join()) {
                problems.push(
                    `${uf}: ${actual.length} features for ${expected.length} municipalities`,
                );
            }
            for (const feature of state?.features ?? []) {
                const name = rosterNameById.get(feature.properties.id);
                if (name !== feature.properties.name) {
                    problems.push(
                        `${uf}: ${feature.properties.id} is "${feature.properties.name}", roster says "${name}"`,
                    );
                }
            }
        }
        expect(problems).toEqual([]);
    }, 30_000);
});

describe("the Federal District", () => {
    it("has one municipality and 35 administrative regions", () => {
        expect(municipalitiesByUf("DF").map((m) => m.name)).toEqual(["Brasília"]);
        expect(administrativeRegionsByUf("DF")).toHaveLength(35);
    });

    it("keeps every region inside Brasília, and nowhere else", () => {
        for (const region of administrativeRegionsByUf("DF")) {
            expect(region.municipalityId).toBe("5300108");
            expect(region.id.startsWith("5300108")).toBe(true);
        }
        const elsewhere = listStates()
            .filter((s) => s.uf !== "DF")
            .filter((s) => s.administrativeRegions.length > 0);
        expect(elsewhere).toEqual([]);
    });

    it("resolves a region to Brasília, under the name IBGE uses and the ones it used to ship", () => {
        expect(resolveMunicipality("DF", "Ceilândia")?.id).toBe("5300108");
        expect(resolveMunicipality("DF", "Sudoeste/Octogonal")?.id).toBe("5300108");
        expect(resolveMunicipality("DF", "Octogonal")?.id).toBe("5300108");
        expect(resolveMunicipality("DF", "Estrutural")?.id).toBe("5300108");
        expect(resolveMunicipality("DF", "Sol Nascente")?.id).toBe("5300108");
    });
});

describe("former names keep resolving", () => {
    it("maps every alias to a municipality that exists", () => {
        const dangling = locations.aliases.filter(([, id]) => !rosterNameById.has(id.slice(0, 7)));
        expect(dangling).toEqual([]);
    });

    it("never shadows a live municipality with a former name", () => {
        const shadowed = locations.aliases.filter(([name, id]) => {
            const uf = rosterUfById.get(id.slice(0, 7));
            return uf !== undefined && resolveMunicipality(uf, name)?.id !== id.slice(0, 7);
        });
        expect(shadowed).toEqual([]);
    });

    it("answers to the renames that broke geocoding before", () => {
        const renames: [UF, string, string][] = [
            ["RN", "Presidente Juscelino", "Serra Caiada"],
            ["PB", "Campo de Santana", "Tacima"],
            ["RN", "Augusto Severo", "Campo Grande"],
            ["SP", "Embu", "Embu das Artes"],
            ["CE", "Itapagé", "Itapajé"],
            ["RS", "Santana do Livramento", "Sant'Ana do Livramento"],
        ];
        for (const [uf, former, current] of renames) {
            const byFormer = resolveMunicipality(uf, former);
            const byCurrent = resolveMunicipality(uf, current);
            expect(byCurrent?.name).toBe(current);
            expect(byFormer?.id).toBe(byCurrent?.id);
        }
    });

    it("folds accents, case and apostrophes", () => {
        expect(resolveMunicipality("SP", "sao paulo")?.id).toBe("3550308");
        expect(resolveMunicipality("RS", "santana do livramento")?.id).toBe(
            resolveMunicipality("RS", "Sant'Ana do Livramento")?.id,
        );
        expect(resolveMunicipality("XX", "São Paulo")).toBeNull();
        expect(resolveMunicipality("SP", "Cidade Inexistente")).toBeNull();
    });
});
