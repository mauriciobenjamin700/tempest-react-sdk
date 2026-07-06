import rawLocations from "./data/br-locations.json";

/** The 27 Brazilian federative units (26 states + Federal District). */
export type UF =
    | "AC"
    | "AL"
    | "AP"
    | "AM"
    | "BA"
    | "CE"
    | "DF"
    | "ES"
    | "GO"
    | "MA"
    | "MT"
    | "MS"
    | "MG"
    | "PA"
    | "PB"
    | "PR"
    | "PE"
    | "PI"
    | "RJ"
    | "RN"
    | "RS"
    | "RO"
    | "RR"
    | "SC"
    | "SP"
    | "SE"
    | "TO";

/** The five Brazilian macro-regions (IBGE). */
export type BrRegion = "Norte" | "Nordeste" | "Centro-Oeste" | "Sudeste" | "Sul";

/** A federative unit with its display name and city list. */
export interface BrazilState {
    /** Two-letter acronym, e.g. `"SP"`. */
    uf: UF;
    /** Full name, e.g. `"São Paulo"`. */
    name: string;
    /** Macro-region the state belongs to. */
    region: BrRegion;
    /** City names within the state, alphabetically. */
    cities: string[];
}

/** A `{ value, label }` option, handy for `<Select>` / `<Combobox>`. */
export interface Choice {
    value: string;
    label: string;
}

/** IBGE macro-region of each federative unit. */
const REGION_BY_UF: Record<UF, BrRegion> = {
    AC: "Norte",
    AP: "Norte",
    AM: "Norte",
    PA: "Norte",
    RO: "Norte",
    RR: "Norte",
    TO: "Norte",
    AL: "Nordeste",
    BA: "Nordeste",
    CE: "Nordeste",
    MA: "Nordeste",
    PB: "Nordeste",
    PE: "Nordeste",
    PI: "Nordeste",
    RN: "Nordeste",
    SE: "Nordeste",
    DF: "Centro-Oeste",
    GO: "Centro-Oeste",
    MT: "Centro-Oeste",
    MS: "Centro-Oeste",
    ES: "Sudeste",
    MG: "Sudeste",
    RJ: "Sudeste",
    SP: "Sudeste",
    PR: "Sul",
    RS: "Sul",
    SC: "Sul",
};

interface RawState {
    sigla: string;
    estado: string;
    cidades: string[];
}

const RAW = rawLocations as unknown as { dataLocals: RawState[] };

/** Normalized, frozen list of all 27 states (built once at module load). */
const STATES: readonly BrazilState[] = RAW.dataLocals
    .map((entry) => {
        const uf = entry.sigla as UF;
        return {
            uf,
            name: entry.estado,
            region: REGION_BY_UF[uf],
            cities: entry.cidades,
        };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

const STATE_BY_UF = new Map<UF, BrazilState>(STATES.map((s) => [s.uf, s]));

/** All 27 federative units, sorted by name. */
export function listStates(): readonly BrazilState[] {
    return STATES;
}

/** Look up a single state by acronym (case-insensitive). Returns `null` if unknown. */
export function getState(uf: string): BrazilState | null {
    const normalized = normalizeUf(uf);
    return normalized ? (STATE_BY_UF.get(normalized) ?? null) : null;
}

/**
 * City names for a federative unit (case-insensitive acronym). Returns an empty
 * array for an unknown UF — "no matches" is a valid result, not an error.
 */
export function citiesByUf(uf: string): string[] {
    return getState(uf)?.cities ?? [];
}

/** States belonging to a macro-region. */
export function statesByRegion(region: BrRegion): readonly BrazilState[] {
    return STATES.filter((s) => s.region === region);
}

/** True when `value` is one of the 27 valid acronyms (case-insensitive). */
export function isValidUf(value: string): boolean {
    return normalizeUf(value) !== null;
}

/**
 * Normalize an acronym to canonical uppercase form, or `null` if it is not a
 * valid UF. `"sp"` → `"SP"`, `"xx"` → `null`.
 */
export function normalizeUf(value: string): UF | null {
    const upper = value.trim().toUpperCase();
    return (REGION_BY_UF as Record<string, BrRegion>)[upper] ? (upper as UF) : null;
}

/** True when `city` exists within `uf` (both case-insensitive). */
export function isValidCity(uf: string, city: string): boolean {
    const target = city.trim().toLowerCase();
    return citiesByUf(uf).some((c) => c.toLowerCase() === target);
}

/** `{ value: uf, label: name }` options for every state, for a `<Select>`. */
export function ufChoices(): Choice[] {
    return STATES.map((s) => ({ value: s.uf, label: s.name }));
}

/** `{ value, label }` options for every city in a UF (value === label). */
export function cityChoices(uf: string): Choice[] {
    return citiesByUf(uf).map((c) => ({ value: c, label: c }));
}
