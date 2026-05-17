import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import styles from "./Combobox.module.css";

export interface ComboboxOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface ComboboxProps {
    options: ComboboxOption[];
    value: string;
    onChange: (value: string) => void;
    label?: string;
    placeholder?: string;
    helperText?: string;
    error?: string;
    disabled?: boolean;
    /** Custom filter — return true to keep the option. Default is case-insensitive substring match on label. */
    filter?: (option: ComboboxOption, query: string) => boolean;
    /** Message shown when no option matches. */
    emptyMessage?: string;
    className?: string;
}

function defaultFilter(option: ComboboxOption, query: string): boolean {
    if (!query) return true;
    return option.label.toLowerCase().includes(query.toLowerCase());
}

/**
 * Combobox — text input with a filterable dropdown of options.
 *
 * Selecting an option fires `onChange(value)`. Typing filters the list.
 * Keyboard: ArrowUp/ArrowDown to navigate, Enter to select, Esc to close.
 */
export function Combobox({
    options,
    value,
    onChange,
    label,
    placeholder = "Selecione",
    helperText,
    error,
    disabled,
    filter = defaultFilter,
    emptyMessage = "Nenhuma opção encontrada",
    className,
}: ComboboxProps) {
    const id = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);

    const selectedLabel = useMemo(
        () => options.find((o) => o.value === value)?.label ?? "",
        [options, value],
    );

    const filtered = useMemo(
        () => options.filter((o) => filter(o, query)),
        [options, filter, query],
    );

    const closeAndReset = useCallback((): void => {
        setOpen(false);
        setQuery("");
        setActiveIndex(0);
    }, []);

    const handleSelect = useCallback(
        (option: ComboboxOption): void => {
            if (option.disabled) return;
            onChange(option.value);
            closeAndReset();
        },
        [onChange, closeAndReset],
    );

    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent): void => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                closeAndReset();
            }
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open, closeAndReset]);

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
            if (option) handleSelect(option);
        } else if (event.key === "Escape") {
            closeAndReset();
        }
    };

    return (
        <div ref={rootRef} className={cn(styles.wrapper, error && styles.error, className)}>
            {label && (
                <label htmlFor={id} className={styles.label}>
                    {label}
                </label>
            )}
            <div className={styles.field}>
                <input
                    id={id}
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={`${id}-listbox`}
                    aria-autocomplete="list"
                    className={styles.input}
                    placeholder={placeholder}
                    disabled={disabled}
                    value={open ? query : selectedLabel}
                    onFocus={() => setOpen(true)}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                        setActiveIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                />
                <span className={styles.caret} aria-hidden>
                    ▾
                </span>
            </div>
            {open && (
                <ul id={`${id}-listbox`} role="listbox" className={styles.menu}>
                    {filtered.length === 0 ? (
                        <li className={styles.empty}>{emptyMessage}</li>
                    ) : (
                        filtered.map((option, index) => (
                            <li
                                key={option.value}
                                role="option"
                                aria-selected={option.value === value}
                                className={cn(
                                    styles.option,
                                    index === activeIndex && styles.active,
                                    option.value === value && styles.selected,
                                )}
                                onMouseEnter={() => setActiveIndex(index)}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    handleSelect(option);
                                }}
                            >
                                {option.label}
                            </li>
                        ))
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
