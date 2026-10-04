import {
    useEffect,
    useId,
    useState,
    type KeyboardEvent,
    type MouseEvent,
    type ReactElement,
} from "react";
import { Input } from "@/components/Input";
import { useDebounce } from "@/hooks";
import { cn } from "@/utils/cn";
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
 * Keeps focus on the input when a press lands anywhere on the list — an option,
 * the padding or the scrollbar — so the input never blurs and the list closes
 * only when focus really leaves the field.
 *
 * @param event - The `mousedown` on the list.
 */
function keepInputFocus(event: MouseEvent<HTMLUListElement>): void {
    event.preventDefault();
}

/**
 * Debounced municipality autocomplete backed by the offline
 * {@link searchMunicipalities} index — no network. Type a partial name, pick a
 * result, and `onSelect` fires with its `{ id, name, uf, latitude, longitude }`.
 * Wire `onSelect` to a `BrazilStateMap` `selected` to highlight it on the map.
 *
 * Keyboard follows the SDK's `Combobox` (the WAI-ARIA combobox pattern): focus
 * stays on the input, `ArrowDown`/`ArrowUp` move the active result — announced
 * through `aria-activedescendant` — `Enter` picks it, `Escape` closes the list
 * and `Tab` leaves the field, closing the list on the way out.
 *
 * The list used to close on a 120 ms timer after the input blurred, with each
 * result a focusable `<button>`. Measured in Chromium (gallery build, issue
 * #426): `Tab` moved focus to the first result, the timer then unmounted it and
 * focus fell to `<body>`; arrows, `Enter` and `Escape` did nothing. Results are
 * now plain options outside the tab order, and a press on the list cancels the
 * blur instead of racing it.
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
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const debounced = useDebounce(query, debounceMs);
    const listId = useId();
    const expanded = open && results.length > 0;
    const optionId = (index: number): string => `${listId}-option-${index}`;

    useEffect(() => {
        let active = true;
        if (!debounced.trim()) {
            setResults([]);
            return;
        }
        void searchMunicipalities(debounced, { uf, limit }).then((hits) => {
            if (!active) return;
            setResults(hits);
            setActiveIndex(0);
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

    /**
     * Keyboard model of the input, the same as `Combobox`'s.
     *
     * `Escape` calls `preventDefault()` only while the list is open, so an
     * enclosing `Modal` or `Drawer` stays open and the next `Escape` reaches it.
     * `Enter` is consumed only when it picks a result, so with the list closed
     * it still submits an enclosing form.
     *
     * @param event - The `keydown` on the input.
     */
    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!expanded) {
                setOpen(true);
                return;
            }
            setActiveIndex((current) => Math.min(results.length - 1, current + 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(0, current - 1));
        } else if (event.key === "Enter") {
            const municipality = expanded ? results[activeIndex] : undefined;
            if (!municipality) return;
            event.preventDefault();
            choose(municipality);
        } else if (event.key === "Escape") {
            if (expanded) event.preventDefault();
            setOpen(false);
        }
    }

    return (
        <div className={styles.search}>
            <Input
                label={label}
                value={query}
                placeholder={placeholder}
                disabled={disabled}
                role="combobox"
                aria-expanded={expanded}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={expanded ? optionId(activeIndex) : undefined}
                autoComplete="off"
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={handleKeyDown}
            />
            {expanded && (
                <ul
                    id={listId}
                    className={styles.results}
                    role="listbox"
                    onMouseDown={keepInputFocus}
                >
                    {results.map((m, index) => (
                        <li
                            key={m.id}
                            id={optionId(index)}
                            role="option"
                            aria-selected={index === activeIndex}
                            className={cn(styles.result, index === activeIndex && styles.active)}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => choose(m)}
                        >
                            <span>{m.name}</span>
                            <span className={styles.uf}>{m.uf}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
