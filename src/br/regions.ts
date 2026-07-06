import type { LegendItem } from "./MapLegend";
import type { BrRegion } from "./locations";

/**
 * Categorical, distinguishable colors for the five IBGE macro-regions
 * (Tableau-10 family). Swap for your brand palette if needed.
 */
export const REGION_COLORS: Record<BrRegion, string> = {
    Norte: "#4e79a7",
    Nordeste: "#f28e2b",
    "Centro-Oeste": "#59a14f",
    Sudeste: "#e15759",
    Sul: "#b07aa1",
};

/** Legend entries (swatch + region name) for a region-colored map. */
export function regionLegendItems(): LegendItem[] {
    return (Object.keys(REGION_COLORS) as BrRegion[]).map((region) => ({
        color: REGION_COLORS[region],
        label: region,
    }));
}
