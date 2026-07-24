import { describe, expect, it } from "vitest";
import {
    geocodeMunicipality,
    municipalityCentroid,
    nearestMunicipality,
    reverseGeocode,
    searchMunicipalities,
    stateCentroid,
} from "./geocode";

describe("nearestMunicipality", () => {
    it("resolves a São Paulo coordinate to a nearby SP municipality", async () => {
        const m = await nearestMunicipality({ latitude: -23.5505, longitude: -46.6333 });
        expect(m?.uf).toBe("SP");
        expect(m?.distanceKm).toBeLessThan(30);
    });

    it("resolves a Rio coordinate to an RJ municipality", async () => {
        const m = await nearestMunicipality({ latitude: -22.9068, longitude: -43.1729 });
        expect(m?.uf).toBe("RJ");
    });
});

describe("reverseGeocode", () => {
    it("resolves a downtown coordinate to the containing municipality (São Paulo)", async () => {
        const m = await reverseGeocode({ latitude: -23.5505, longitude: -46.6333 });
        expect(m?.uf).toBe("SP");
        expect(m?.name).toBe("São Paulo");
    });

    it("resolves Rio de Janeiro exactly", async () => {
        const m = await reverseGeocode({ latitude: -22.9068, longitude: -43.1729 });
        expect(m?.name).toBe("Rio de Janeiro");
    });

    it("uses the provided uf to scope the search", async () => {
        const m = await reverseGeocode({ latitude: -19.9167, longitude: -43.9345 }, { uf: "MG" });
        expect(m?.uf).toBe("MG");
        expect(m?.name).toBe("Belo Horizonte");
    });
});

describe("geocodeMunicipality", () => {
    it("matches by name accent-insensitively", async () => {
        const hits = await geocodeMunicipality("sao paulo", "SP");
        expect(hits.some((m) => m.id === "3550308")).toBe(true);
    });

    it("returns matches across states for a shared name", async () => {
        const bonito = await geocodeMunicipality("Bonito");
        expect(bonito.length).toBeGreaterThan(1);
        expect(new Set(bonito.map((m) => m.uf)).size).toBeGreaterThan(1);
    });

    it("returns [] when nothing matches", async () => {
        expect(await geocodeMunicipality("Xyzzy Não Existe")).toEqual([]);
    });
});

describe("searchMunicipalities", () => {
    it("ranks prefix matches first and respects the limit", async () => {
        const hits = await searchMunicipalities("são p", { uf: "SP", limit: 5 });
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.length).toBeLessThanOrEqual(5);
        expect(hits[0].uf).toBe("SP");
    });

    it("returns [] for an empty query", async () => {
        expect(await searchMunicipalities("")).toEqual([]);
    });
});

describe("municipalityCentroid / stateCentroid", () => {
    it("returns a municipality centroid by IBGE code", async () => {
        const c = await municipalityCentroid("3550308");
        expect(c?.name).toBe("São Paulo");
        expect(c?.latitude).toBeLessThan(0);
        expect(c?.longitude).toBeLessThan(0);
    });

    it("returns a state centroid", async () => {
        const c = await stateCentroid("SP");
        expect(c).not.toBeNull();
        expect(c!.latitude).toBeLessThan(0);
    });
});

describe("geocode — centroid lookups and edges", () => {
    it("returns a municipality centroid by IBGE code, or null", async () => {
        const sp = await municipalityCentroid("3550308");
        expect(sp?.name).toBe("São Paulo");
        expect(sp?.uf).toBe("SP");
        expect(await municipalityCentroid("0000000")).toBeNull();
    });

    it("returns a state centroid, or null for an unknown UF", async () => {
        const sp = await stateCentroid("SP");
        expect(sp?.latitude).toBeLessThan(0);
        expect(await stateCentroid("XX" as never)).toBeNull();
    });

    it("scopes the search to a UF", async () => {
        const inSp = await searchMunicipalities("santo", { uf: "SP" });
        expect(inSp.length).toBeGreaterThan(0);
        expect(inSp.every((m) => m.uf === "SP")).toBe(true);
    });

    it("falls back to the nearest centroid for an offshore point", async () => {
        const offshore = await reverseGeocode({ latitude: -30, longitude: -40 });
        expect(offshore).not.toBeNull();
        expect(offshore?.uf).toBeTruthy();
    });

    it("falls back to the nearest centroid when a forced uf contains no match", async () => {
        const result = await reverseGeocode({ latitude: -23.55, longitude: -46.63 }, { uf: "AC" });
        expect(result).not.toBeNull();
    });

    it("reports the distance for the nearest municipality", async () => {
        const nearest = await nearestMunicipality({ latitude: -23.5505, longitude: -46.6333 });
        expect(nearest?.distanceKm).toBeGreaterThanOrEqual(0);
        expect(nearest?.distanceKm).toBeLessThan(50);
    });

    it("caches the index across calls", async () => {
        const first = await municipalityCentroid("3550308");
        const second = await municipalityCentroid("3550308");
        expect(second).toBe(first);
    });
});
