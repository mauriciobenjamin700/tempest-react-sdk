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

/** A municipality, identified by the code that survives its renames. */
export interface BrazilMunicipality {
    /** 7-digit IBGE code, e.g. `"3550308"`. Stable across a rename. */
    id: string;
    /** Current IBGE name, e.g. `"São Paulo"`. */
    name: string;
}

/**
 * An administrative region of the Federal District.
 *
 * The DF has exactly one municipality — Brasília — and 35 administrative
 * regions inside it. Nobody in the DF writes "Brasília" in an address field,
 * so the regions are listed and resolvable; they are not municipalities, and
 * `municipalityId` is what they geocode through.
 */
export interface BrazilAdministrativeRegion {
    /** IBGE subdistrict code, e.g. `"53001080515"` for Ceilândia. */
    id: string;
    /** IBGE name, e.g. `"Sudoeste/Octogonal"`. */
    name: string;
    /** The municipality it belongs to — Brasília (`"5300108"`) for all 35. */
    municipalityId: string;
}

/** A federative unit with its display name and city list. */
export interface BrazilState {
    /** Two-letter acronym, e.g. `"SP"`. */
    uf: UF;
    /** Full name, e.g. `"São Paulo"`. */
    name: string;
    /** Macro-region the state belongs to. */
    region: BrRegion;
    /** Municipality names within the state, alphabetically. */
    cities: string[];
    /** The same municipalities carrying their IBGE codes, same order. */
    municipalities: readonly BrazilMunicipality[];
    /** Administrative regions — 35 for `"DF"`, empty everywhere else. */
    administrativeRegions: readonly BrazilAdministrativeRegion[];
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

/** One `[IBGE code, name]` row as `br-locations.json` stores it. */
type RawEntry = [string, string];

interface RawState {
    uf: string;
    name: string;
    cities: RawEntry[];
}

interface RawLocations {
    /**
     * The two IBGE vintages this file was built from: `roster` is the day the
     * municipality list was read, `mesh` the boundary release it was joined to.
     */
    vintage: { roster: string; mesh: string };
    states: RawState[];
    /** Administrative regions keyed by the municipality that contains them. */
    administrativeRegions: Record<string, RawEntry[]>;
    /** Every former name, mapped to the IBGE code that still answers to it. */
    aliases: RawEntry[];
    /** Municipalities the roster lists and the mesh has no geometry for. */
    pendingGeometry: string[];
}

const RAW = rawLocations as unknown as RawLocations;

/**
 * Strip a name down to what two spellings of the same place share.
 *
 * Accents, case and apostrophes are exactly what differs between the spelling a
 * user typed, the one an app saved five years ago and the one IBGE publishes
 * today — `"Sant'Ana do Livramento"` and `"Santana do Livramento"` are the same
 * municipality, and `"acu"` should find `"Açu"`.
 *
 * @param value - A municipality, region or alias name.
 * @returns The comparable form: lowercase, unaccented, apostrophes dropped.
 */
function foldName(value: string): string {
    return value
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/['\u2019\u0060]/g, "")
        .toLowerCase();
}

/** The federative unit each IBGE code starts with. */
const UF_BY_CODE: Record<string, UF> = {
    "11": "RO",
    "12": "AC",
    "13": "AM",
    "14": "RR",
    "15": "PA",
    "16": "AP",
    "17": "TO",
    "21": "MA",
    "22": "PI",
    "23": "CE",
    "24": "RN",
    "25": "PB",
    "26": "PE",
    "27": "AL",
    "28": "SE",
    "29": "BA",
    "31": "MG",
    "32": "ES",
    "33": "RJ",
    "35": "SP",
    "41": "PR",
    "42": "SC",
    "43": "RS",
    "50": "MS",
    "51": "MT",
    "52": "GO",
    "53": "DF",
};

/**
 * The municipality an IBGE code belongs to.
 *
 * A municipality code is 7 digits and a subdistrict code extends it with 4 more
 * — `"53001080515"` (Ceilândia) is Brasília's `"5300108"` plus `"0515"` — so the
 * containing municipality is a prefix, not a lookup.
 *
 * @param id - A municipality or subdistrict IBGE code.
 * @returns The 7-digit municipality code.
 */
function municipalityIdOf(id: string): string {
    return id.slice(0, 7);
}

/** Administrative regions of a municipality, or `[]` when it has none. */
function regionsOf(municipalityId: string): readonly BrazilAdministrativeRegion[] {
    return (RAW.administrativeRegions[municipalityId] ?? []).map(([id, name]) => ({
        id,
        name,
        municipalityId,
    }));
}

/** Normalized, frozen list of all 27 states (built once at module load). */
const STATES: readonly BrazilState[] = RAW.states
    .map((entry) => {
        const uf = entry.uf as UF;
        const municipalities = entry.cities.map(([id, name]) => ({ id, name }));
        return {
            uf,
            name: entry.name,
            region: REGION_BY_UF[uf],
            cities: municipalities.map((m) => m.name),
            municipalities,
            administrativeRegions: municipalities.flatMap((m) => regionsOf(m.id)),
        };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

const STATE_BY_UF = new Map<UF, BrazilState>(STATES.map((s) => [s.uf, s]));

/**
 * Every name that resolves to a municipality, folded, keyed by `<UF>:<name>`.
 *
 * Three kinds of name land here and the precedence matters: a current IBGE name
 * wins, then a former name from `aliases`, then an administrative region of the
 * DF. A rename never shadows a live municipality — `Campo Grande` is a live
 * municipality in both MS and RN, and in RN it is also the former name of
 * nothing, so the live entry has to be written last.
 */
const ID_BY_FOLDED_NAME = new Map<string, string>();
for (const [name, id] of RAW.aliases) {
    const uf = UF_BY_CODE[id.slice(0, 2)];
    if (uf !== undefined) ID_BY_FOLDED_NAME.set(`${uf}:${foldName(name)}`, municipalityIdOf(id));
}
for (const state of STATES) {
    for (const region of state.administrativeRegions) {
        ID_BY_FOLDED_NAME.set(`${state.uf}:${foldName(region.name)}`, region.municipalityId);
    }
}
for (const state of STATES) {
    for (const municipality of state.municipalities) {
        ID_BY_FOLDED_NAME.set(`${state.uf}:${foldName(municipality.name)}`, municipality.id);
    }
}

const MUNICIPALITY_BY_ID = new Map<string, BrazilMunicipality>(
    STATES.flatMap((s) => s.municipalities).map((m) => [m.id, m]),
);

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

/**
 * Municipalities of a federative unit, each carrying its IBGE code.
 *
 * The code is what a backend wants stored: it survives the renames that keep
 * happening (`Presidente Juscelino` became `Serra Caiada` in 2013) and it is the
 * key every other dataset in this module joins on.
 *
 * @param uf - Federative unit acronym, case-insensitive.
 * @returns The municipalities, alphabetically. Empty for an unknown UF.
 */
export function municipalitiesByUf(uf: string): readonly BrazilMunicipality[] {
    return getState(uf)?.municipalities ?? [];
}

/**
 * Administrative regions of a federative unit.
 *
 * Only the Federal District has any — 35 of them, inside its single
 * municipality. Every other UF answers `[]`, which is a valid result and not an
 * error.
 *
 * @param uf - Federative unit acronym, case-insensitive.
 * @returns The regions, alphabetically. Empty outside the DF.
 */
export function administrativeRegionsByUf(uf: string): readonly BrazilAdministrativeRegion[] {
    return getState(uf)?.administrativeRegions ?? [];
}

/**
 * Find the municipality a name refers to, however it was written down.
 *
 * Four kinds of name resolve, which is the point — an address saved years ago
 * has to keep pointing at the same place:
 *
 * 1. The current IBGE name (`"Serra Caiada"`).
 * 2. A former name (`"Presidente Juscelino"`), from the alias table the
 *    generator builds by diffing vintages.
 * 3. A different spelling — accents, case and apostrophes are folded, so
 *    `"sant'ana do livramento"` finds `"Sant'Ana do Livramento"`.
 * 4. An administrative region of the DF (`"Ceilândia"`), which resolves to
 *    Brasília — the municipality it is part of.
 *
 * A live municipality always wins over a former name, so a name that is current
 * in one UF and historical in another resolves to the live one in each.
 *
 * @param uf - Federative unit acronym, case-insensitive.
 * @param name - The municipality, region or former name.
 * @returns The municipality, or `null` when nothing in that UF answers to it.
 */
export function resolveMunicipality(uf: string, name: string): BrazilMunicipality | null {
    const normalized = normalizeUf(uf);
    if (normalized === null) return null;
    const id = ID_BY_FOLDED_NAME.get(`${normalized}:${foldName(name)}`);
    return id === undefined ? null : (MUNICIPALITY_BY_ID.get(id) ?? null);
}

/**
 * The IBGE vintages the bundled datasets were built from.
 *
 * `roster` is the day the municipality list was read and `mesh` the boundary
 * release it was joined to. They differ on purpose: IBGE publishes new
 * municipalities before it publishes their boundaries, and the gap is what
 * {@link pendingGeometryIds} enumerates.
 *
 * @returns The two vintages, as they were written into the data file.
 */
export function datasetVintage(): { roster: string; mesh: string } {
    return RAW.vintage;
}

/**
 * Municipalities that exist in the roster and have no boundary yet.
 *
 * One today: Boa Esperança do Norte (MT), installed in 2023, for which IBGE
 * serves no mesh at any endpoint. It is listed and selectable, and it is the one
 * municipality `geocodeMunicipality` cannot place — so a caller that must plot
 * every selection can check this list up front instead of discovering it as an
 * empty result.
 *
 * @returns The IBGE codes, in the order the data file declares them.
 */
export function pendingGeometryIds(): readonly string[] {
    return RAW.pendingGeometry;
}
