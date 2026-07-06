import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { Input } from "@/components/Input";
import { useDebounce } from "@/hooks";
import { searchMunicipalities, type MunicipalityCentroid } from "./geocode";
import type { UF } from "./locations";
import styles from "./MunicipalitySearch.module.css";

export interface MunicipalitySearchProps {
    /** Restrict the search to a single UF. */
    uf?: UF;
    /** Fired when a municipality is picked from the results. */
    onSelect: (municipality: MunicipalityCentroid) => void;
    /** Field label. */
    label?: string;
    /** Input placeholder. Default: `"Buscar município…"`. */
    placeholder?: string;
    /** Max results shown. Default: `8`. */
    limit?: number;
    /** Debounce in ms before searching. Default: `250`. */
    debounceMs?: number;
    /** Disable the field. */
    disabled?: boolean;
}

/**
 * Debounced municipality autocomplete backed by the offline
 * {@link searchMunicipalities} index — no network. Type a partial name, pick a
 * result, and `onSelect` fires with its `{ id, name, uf, latitude, longitude }`.
 * Wire `onSelect` to a `BrazilStateMap` `selected` to highlight it on the map.
 *
 * @example
 * const [uf, setUf] = useState<UF>("SP");
 * const [city, setCity] = useState<string | null>(null);
 * <MunicipalitySearch uf={uf} onSelect={(m) => setCity(m.name)} />
 * <BrazilStateMap uf={uf} selected={city} />
 */
export function MunicipalitySearch({
    uf,
    onSelect,
    label,
    placeholder = "Buscar município…",
    limit = 8,
    debounceMs = 250,
    disabled = false,
}: MunicipalitySearchProps): ReactElement {
    const [query, setQuery] = useState<string>("");
    const [results, setResults] = useState<MunicipalityCentroid[]>([]);
    const [open, setOpen] = useState<boolean>(false);
    const debounced = useDebounce(query, debounceMs);
    const listId = useId();
    const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let active = true;
        if (!debounced.trim()) {
            setResults([]);
            return;
        }
        void searchMunicipalities(debounced, { uf, limit }).then((hits) => {
            if (active) setResults(hits);
        });
        return () => {
            active = false;
        };
    }, [debounced, uf, limit]);

    function choose(municipality: MunicipalityCentroid): void {
        onSelect(municipality);
        setQuery(municipality.name);
        setOpen(false);
    }

    return (
        <div className={styles.search}>
            <Input
                label={label}
                value={query}
                placeholder={placeholder}
                disabled={disabled}
                role="combobox"
                aria-expanded={open && results.length > 0}
                aria-controls={listId}
                autoComplete="off"
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                    // Delay so a result click registers before the list closes.
                    blurTimer.current = setTimeout(() => setOpen(false), 120);
                }}
            />
            {open && results.length > 0 && (
                <ul id={listId} className={styles.results} role="listbox">
                    {results.map((m) => (
                        <li key={m.id}>
                            <button
                                type="button"
                                role="option"
                                aria-selected={false}
                                className={styles.result}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    if (blurTimer.current) clearTimeout(blurTimer.current);
                                    choose(m);
                                }}
                            >
                                <span>{m.name}</span>
                                <span className={styles.uf}>{m.uf}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
