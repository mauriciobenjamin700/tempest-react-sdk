import type { BrUfGeometry } from "./br-geo";
import type { UF } from "./locations";

/** One municipality feature within a state. */
export interface MunicipalityFeature {
    type: "Feature";
    properties: {
        /** 7-digit IBGE municipality code. */
        id: string;
        /** Municipality name. */
        name: string;
    };
    geometry: BrUfGeometry;
}

/** Municipality boundaries for a single federative unit. */
export interface StateMunicipalities {
    type: "FeatureCollection";
    /** The federative unit these municipalities belong to. */
    uf: UF;
    features: MunicipalityFeature[];
}

type GeoModule = { default: StateMunicipalities };

// One explicit dynamic import per UF — each `data/mun/<UF>.json` becomes its own
// lazy chunk, so `loadStateMunicipalities("SP")` fetches only São Paulo's
// geometry and the full ~2 MB municipal dataset never lands in one bundle.
const LOADERS: Record<UF, () => Promise<GeoModule>> = {
    AC: () => import("./data/mun/AC.json") as unknown as Promise<GeoModule>,
    AL: () => import("./data/mun/AL.json") as unknown as Promise<GeoModule>,
    AP: () => import("./data/mun/AP.json") as unknown as Promise<GeoModule>,
    AM: () => import("./data/mun/AM.json") as unknown as Promise<GeoModule>,
    BA: () => import("./data/mun/BA.json") as unknown as Promise<GeoModule>,
    CE: () => import("./data/mun/CE.json") as unknown as Promise<GeoModule>,
    DF: () => import("./data/mun/DF.json") as unknown as Promise<GeoModule>,
    ES: () => import("./data/mun/ES.json") as unknown as Promise<GeoModule>,
    GO: () => import("./data/mun/GO.json") as unknown as Promise<GeoModule>,
    MA: () => import("./data/mun/MA.json") as unknown as Promise<GeoModule>,
    MT: () => import("./data/mun/MT.json") as unknown as Promise<GeoModule>,
    MS: () => import("./data/mun/MS.json") as unknown as Promise<GeoModule>,
    MG: () => import("./data/mun/MG.json") as unknown as Promise<GeoModule>,
    PA: () => import("./data/mun/PA.json") as unknown as Promise<GeoModule>,
    PB: () => import("./data/mun/PB.json") as unknown as Promise<GeoModule>,
    PR: () => import("./data/mun/PR.json") as unknown as Promise<GeoModule>,
    PE: () => import("./data/mun/PE.json") as unknown as Promise<GeoModule>,
    PI: () => import("./data/mun/PI.json") as unknown as Promise<GeoModule>,
    RJ: () => import("./data/mun/RJ.json") as unknown as Promise<GeoModule>,
    RN: () => import("./data/mun/RN.json") as unknown as Promise<GeoModule>,
    RS: () => import("./data/mun/RS.json") as unknown as Promise<GeoModule>,
    RO: () => import("./data/mun/RO.json") as unknown as Promise<GeoModule>,
    RR: () => import("./data/mun/RR.json") as unknown as Promise<GeoModule>,
    SC: () => import("./data/mun/SC.json") as unknown as Promise<GeoModule>,
    SP: () => import("./data/mun/SP.json") as unknown as Promise<GeoModule>,
    SE: () => import("./data/mun/SE.json") as unknown as Promise<GeoModule>,
    TO: () => import("./data/mun/TO.json") as unknown as Promise<GeoModule>,
};

/**
 * Lazily load the simplified municipality GeoJSON for a federative unit. Each
 * state's geometry is a separate chunk (~40-70 KB gzip), fetched on demand —
 * the full ~2 MB municipal dataset never lands in one bundle.
 *
 * @param uf - Federative unit acronym (e.g. `"SP"`).
 * @returns The municipality collection, or `null` for an unknown UF.
 *
 * @example
 * const sp = await loadStateMunicipalities("SP");
 * sp?.features.length; // 644
 */
export async function loadStateMunicipalities(uf: UF): Promise<StateMunicipalities | null> {
    const loader = LOADERS[uf];
    if (!loader) return null;
    const mod = await loader();
    return mod.default ?? (mod as unknown as StateMunicipalities);
}
