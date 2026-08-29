/**
 * @tempest-limits props-count — two dependent selects in one control, so every knob
 * comes in pairs: stateLabel and cityLabel, statePlaceholder and cityPlaceholder,
 * defaultUf and defaultCity. The pairing is the feature — the city list is derived
 * from the chosen UF, which is exactly what a caller wiring two separate selects has
 * to reimplement.
 */
import { useMemo, useState, type ReactElement } from "react";
import { Select } from "@/components/Select";
import {
    administrativeRegionsByUf,
    listStates,
    municipalitiesByUf,
    normalizeUf,
    resolveMunicipality,
    type Choice,
    type UF,
} from "./locations";

/** Current selection emitted by {@link BrazilStateCitySelect}. */
export interface BrazilStateCitySelection {
    /** Selected federative unit, or `null` when none. */
    uf: UF | null;
    /** Selected city, or `null` when none. */
    city: string | null;
    /**
     * IBGE code of the selected municipality, or `null` when none is selected.
     *
     * This is the value to store. It survives the renames `city` does not, and
     * it is what `geocodeMunicipality` and every other dataset here join on. A
     * DF administrative region carries Brasília's code, because that is the
     * municipality it is part of.
     */
    municipalityId: string | null;
}

export interface BrazilStateCitySelectProps {
    /** Pre-selected UF (uncontrolled initial value). */
    defaultUf?: UF;
    /** Pre-selected city (uncontrolled initial value). */
    defaultCity?: string;
    /** Fired whenever the state or city changes. */
    onChange?: (selection: BrazilStateCitySelection) => void;
    /** Label for the state select. Default: `"Estado"`. */
    stateLabel?: string;
    /** Label for the city select. Default: `"Cidade"`. */
    cityLabel?: string;
    /** Placeholder for the state select. Default: `"Selecione o estado"`. */
    statePlaceholder?: string;
    /** Placeholder for the city select. Default: `"Selecione a cidade"`. */
    cityPlaceholder?: string;
    /** Disable both selects. */
    disabled?: boolean;
    /** Layout of the two selects. Default: `"row"`. */
    layout?: "row" | "column";
}

/**
 * Cascading Estado → Cidade selector backed by the bundled BR locations data —
 * pick a state and the city list narrows to that UF's municipalities. No
 * network, no external API. Complements {@link BrazilMap} (wire the map's
 * `onSelect` to drive the same UF).
 *
 * @example
 * <BrazilStateCitySelect onChange={({ uf, city }) => console.log(uf, city)} />
 */
/**
 * The pickable places of a federative unit: its municipalities, plus the DF's
 * administrative regions.
 *
 * The DF has one municipality and nobody there writes "Brasília" in an address
 * field — they write Ceilândia, Taguatinga, Gama. Offering only the municipality
 * would be faithful to IBGE and useless in a form, so the 35 regions are listed
 * beside it and every one of them resolves to Brasília's code.
 *
 * @param uf - The selected federative unit.
 * @returns `{ value, label }` options, alphabetically, value === label.
 */
function placeChoices(uf: UF): Choice[] {
    const names = [
        ...municipalitiesByUf(uf).map((m) => m.name),
        ...administrativeRegionsByUf(uf).map((r) => r.name),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return names.map((name) => ({ value: name, label: name }));
}

export function BrazilStateCitySelect({
    defaultUf,
    defaultCity,
    onChange,
    stateLabel = "Estado",
    cityLabel = "Cidade",
    statePlaceholder = "Selecione o estado",
    cityPlaceholder = "Selecione a cidade",
    disabled = false,
    layout = "row",
}: BrazilStateCitySelectProps): ReactElement {
    const [uf, setUf] = useState<UF | null>(defaultUf ?? null);
    const [city, setCity] = useState<string | null>(defaultCity ?? null);

    const stateOptions = useMemo(
        () => listStates().map((s) => ({ value: s.uf, label: s.name })),
        [],
    );
    const cityOptions = useMemo(() => (uf ? placeChoices(uf) : []), [uf]);

    function handleUf(next: string): void {
        const nextUf = normalizeUf(next);
        setUf(nextUf);
        setCity(null);
        onChange?.({ uf: nextUf, city: null, municipalityId: null });
    }

    function handleCity(next: string): void {
        const nextCity = next || null;
        setCity(nextCity);
        onChange?.({
            uf,
            city: nextCity,
            municipalityId: uf && nextCity ? (resolveMunicipality(uf, nextCity)?.id ?? null) : null,
        });
    }

    return (
        <div
            style={{
                display: "flex",
                flexDirection: layout === "row" ? "row" : "column",
                gap: "var(--tempest-space-3, 12px)",
                flexWrap: "wrap",
            }}
        >
            <Select
                label={stateLabel}
                placeholder={statePlaceholder}
                options={stateOptions}
                value={uf ?? ""}
                disabled={disabled}
                onChange={(e) => handleUf(e.target.value)}
                style={{ minWidth: 0 }}
            />
            <Select
                label={cityLabel}
                placeholder={cityPlaceholder}
                options={cityOptions}
                value={city ?? ""}
                disabled={disabled || !uf}
                onChange={(e) => handleCity(e.target.value)}
                style={{ minWidth: 0 }}
            />
        </div>
    );
}
