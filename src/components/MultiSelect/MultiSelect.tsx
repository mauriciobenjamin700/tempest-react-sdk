import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import styles from "./MultiSelect.module.css";

export interface MultiSelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface MultiSelectProps {
    options: MultiSelectOption[];
    /** Currently selected values. */
    value: string[];
    onChange: (value: string[]) => void;
    label?: string;
    placeholder?: string;
    helperText?: string;
    error?: string;
    disabled?: boolean;
    /** Cap the number of selectable items. */
    maxItems?: number;
    /** Custom filter — return true to keep the option. Default: case-insensitive substring on label. */
    filter?: (option: MultiSelectOption, query: string) => boolean;
    /** Message shown when no option matches. */
    emptyMessage?: string;
    className?: string;
}

function defaultFilter(option: MultiSelectOption, query: string): boolean {
    if (!query) return true;
    return option.label.toLowerCase().includes(query.toLowerCase());
}

/**
 * MultiSelect — a filterable dropdown that selects many options, shown as
 * removable chips inside the field. Selecting toggles a value; Backspace on an
 * empty query removes the last chip.
 *
 * Keyboard: ArrowUp/ArrowDown navigate, Enter toggles the active option, Esc
 * closes, Backspace (empty input) pops the last chip.
 */
export function MultiSelect({
    options,
    value,
    onChange,
    label,
    placeholder = "Selecione",
    helperText,
    error,
    disabled,
    maxItems,
    filter = defaultFilter,
    emptyMessage = "Nenhuma opção encontrada",
    className,
}: MultiSelectProps) {
    const id = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);

    const selectedSet = useMemo(() => new Set(value), [value]);
    const selectedOptions = useMemo(
        () =>
            value
                .map((v) => options.find((o) => o.value === v))
                .filter((o): o is MultiSelectOption => Boolean(o)),
        [value, options],
    );
    const filtered = useMemo(
        () => options.filter((o) => filter(o, query)),
        [options, filter, query],
    );

    const atMax = maxItems !== undefined && value.length >= maxItems;

    const toggle = useCallback(
        (option: MultiSelectOption): void => {
            if (option.disabled) return;
            if (selectedSet.has(option.value)) {
                onChange(value.filter((v) => v !== option.value));
            } else {
                if (atMax) return;
                onChange([...value, option.value]);
            }
            setQuery("");
            inputRef.current?.focus();
        },
        [selectedSet, onChange, value, atMax],
    );

    const removeAt = useCallback(
        (optionValue: string): void => {
            onChange(value.filter((v) => v !== optionValue));
        },
        [onChange, value],
    );

    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent): void => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setOpen(false);
                setQuery("");
            }
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => Math.min(filtered.length - 1, current + 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(0, current - 1));
        } else if (event.key === "Enter") {
            event.preventDefault();
            const option = filtered[activeIndex];
            if (option) toggle(option);
        } else if (event.key === "Escape") {
            setOpen(false);
            setQuery("");
        } else if (event.key === "Backspace" && query === "" && value.length > 0) {
            removeAt(value[value.length - 1]);
        }
    };

    return (
        <div ref={rootRef} className={cn(styles.wrapper, error && styles.error, className)}>
            {label && (
                <label htmlFor={id} className={styles.label}>
                    {label}
                </label>
            )}
            <div
                className={cn(styles.field, disabled && styles.disabled)}
                onMouseDown={(event) => {
                    if (disabled) return;
                    // Keep focus on the input when clicking empty field space.
                    if (event.target === event.currentTarget) {
                        event.preventDefault();
                        inputRef.current?.focus();
                        setOpen(true);
                    }
                }}
            >
                {selectedOptions.map((option) => (
                    <span key={option.value} className={styles.chip}>
                        {option.label}
                        <button
                            type="button"
                            className={styles.chipRemove}
                            aria-label={`Remover ${option.label}`}
                            disabled={disabled}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                removeAt(option.value);
                            }}
                        >
                            ×
                        </button>
                    </span>
                ))}
                <input
                    id={id}
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={`${id}-listbox`}
                    aria-autocomplete="list"
                    className={styles.input}
                    placeholder={value.length === 0 ? placeholder : ""}
                    disabled={disabled}
                    value={query}
                    onFocus={() => setOpen(true)}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                        setActiveIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                />
            </div>
            {open && (
                <ul
                    id={`${id}-listbox`}
                    role="listbox"
                    aria-multiselectable
                    className={styles.menu}
                >
                    {filtered.length === 0 ? (
                        <li className={styles.empty}>{emptyMessage}</li>
                    ) : (
                        filtered.map((option, index) => {
                            const isSelected = selectedSet.has(option.value);
                            return (
                                <li
                                    key={option.value}
                                    role="option"
                                    aria-selected={isSelected}
                                    aria-disabled={option.disabled || (!isSelected && atMax)}
                                    className={cn(
                                        styles.option,
                                        index === activeIndex && styles.active,
                                        isSelected && styles.selected,
                                    )}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onMouseDown={(event) => {
                                        event.preventDefault();
                                        toggle(option);
                                    }}
                                >
                                    <span className={styles.check} aria-hidden>
                                        {isSelected ? "✓" : ""}
                                    </span>
                                    {option.label}
                                </li>
                            );
                        })
                    )}
                </ul>
            )}
            {error ? (
                <span className={styles.errorText}>{error}</span>
            ) : helperText ? (
                <span className={styles.helper}>{helperText}</span>
            ) : null}
        </div>
    );
}
