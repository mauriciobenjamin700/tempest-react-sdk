import { describe, expect, it } from "vitest";

import { regionLegendItems, REGION_COLORS } from "./regions";

describe("regionLegendItems", () => {
    it("gives one legend entry per IBGE macro-region, labelled by name", () => {
        const items = regionLegendItems();

        expect(items).toHaveLength(5);
        expect(items.map((item) => item.label)).toEqual([
            "Norte",
            "Nordeste",
            "Centro-Oeste",
            "Sudeste",
            "Sul",
        ]);
        for (const item of items) {
            expect(item.color).toBe(REGION_COLORS[item.label as keyof typeof REGION_COLORS]);
            expect(item.color).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });
});
