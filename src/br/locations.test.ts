import { describe, expect, it } from "vitest";
import {
    citiesByUf,
    cityChoices,
    getState,
    isValidCity,
    isValidUf,
    listStates,
    normalizeUf,
    statesByRegion,
    ufChoices,
} from "./locations";

describe("listStates", () => {
    it("has all 27 federative units, sorted by name", () => {
        const states = listStates();
        expect(states).toHaveLength(27);
        const names = states.map((s) => s.name);
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "pt-BR")));
    });

    it("every state carries a region and a non-empty city list", () => {
        for (const state of listStates()) {
            expect(state.region).toBeTruthy();
            expect(state.cities.length).toBeGreaterThan(0);
        }
    });
});

describe("getState", () => {
    it("resolves case-insensitively", () => {
        expect(getState("sp")?.name).toBe("São Paulo");
        expect(getState("SP")?.name).toBe("São Paulo");
    });

    it("returns null for unknown UF", () => {
        expect(getState("XX")).toBeNull();
    });
});

describe("citiesByUf", () => {
    it("returns cities for a valid UF", () => {
        const cities = citiesByUf("SP");
        expect(cities.length).toBeGreaterThan(100);
        expect(cities).toContain("São Paulo");
    });

    it("returns [] for an unknown UF (no error)", () => {
        expect(citiesByUf("ZZ")).toEqual([]);
    });
});

describe("normalizeUf / isValidUf", () => {
    it("normalizes and validates", () => {
        expect(normalizeUf(" rj ")).toBe("RJ");
        expect(normalizeUf("zz")).toBeNull();
        expect(isValidUf("mg")).toBe(true);
        expect(isValidUf("qq")).toBe(false);
    });
});

describe("isValidCity", () => {
    it("checks membership case-insensitively", () => {
        expect(isValidCity("RJ", "rio de janeiro")).toBe(true);
        expect(isValidCity("RJ", "Curitiba")).toBe(false);
    });
});

describe("statesByRegion", () => {
    it("groups by macro-region", () => {
        const sul = statesByRegion("Sul")
            .map((s) => s.uf)
            .sort();
        expect(sul).toEqual(["PR", "RS", "SC"]);
    });
});

describe("choices", () => {
    it("ufChoices returns 27 value/label pairs", () => {
        const choices = ufChoices();
        expect(choices).toHaveLength(27);
        expect(choices[0]).toHaveProperty("value");
        expect(choices[0]).toHaveProperty("label");
    });

    it("cityChoices mirror the city list", () => {
        expect(cityChoices("SP")).toHaveLength(citiesByUf("SP").length);
    });
});
