/**
 * @tempest-limits file-lines, props-count, function-lines — options/value/onChange
 * plus the shared field contract (label, placeholder, helperText, error, disabled,
 * className) and the combobox-specific knobs: filter, emptyMessage, portal. The body
 * is the listbox — open state, active descendant, type-ahead and the ARIA wiring —
 * and those cannot be separated without passing the same active index back and
 * forth.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Portal } from "@/components/Portal";
import { useAnchorPosition } from "@/components/Portal/anchor-position";
import { CaretIcon } from "@/components/Select/CaretIcon";
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
    /**
     * Render the list in a portal, positioned under the field. Default `true`.
     *
     * In flow, an ancestor with `overflow` other than `visible` clips the list —
     * in the last row of a `DataTable` none of it was visible (measured in Chrome
     * at 1440 px). In a portal it escapes the clip, takes the field's width,
     * flips above the field when there is no room below, and follows it on
     * scroll, resize and when the field or the list changes size.
     */
    portal?: boolean;
    className?: string;
}

/** Gap between field and list, in px — the in-flow CSS uses the same 4 px. */
const LIST_OFFSET = 4;

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
    portal = true,
    className,
}: ComboboxProps) {
    const id = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [fieldNode, setFieldNode] = useState<HTMLDivElement | null>(null);
    const [listNode, setListNode] = useState<HTMLUListElement | null>(null);
    const floatingStyle = useAnchorPosition({
        anchor: fieldNode,
        floating: listNode,
        side: "bottom",
        align: "start",
        offset: LIST_OFFSET,
        enabled: portal && open,
        matchWidth: true,
    });

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

    /**
     * Close on a press outside both the field and the list.
     *
     * The list is checked on its own because in a portal it is not inside the
     * field's wrapper: a press on its scrollbar, or on the empty message, would
     * otherwise count as outside and close it.
     */
    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent): void => {
            const target = event.target as Node;
            if (rootRef.current?.contains(target) || listNode?.contains(target)) return;
            closeAndReset();
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open, closeAndReset, listNode]);

    /**
     * Keyboard model of the input.
     *
     * `Escape` calls `preventDefault()` only while the list is open: that marks the
     * key as consumed, so an enclosing `Modal` or `Drawer` stays open and the next
     * `Escape` reaches it. With the list closed the key is left alone and dismisses
     * the enclosing layer, as the user expects.
     */
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
            if (open) event.preventDefault();
            closeAndReset();
        }
    };

    const list = (
        <ul
            ref={setListNode}
            id={`${id}-listbox`}
            role="listbox"
            className={cn(styles.menu, portal && styles.portalled)}
            style={floatingStyle}
        >
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
    );

    return (
        <div ref={rootRef} className={cn(styles.wrapper, error && styles.error, className)}>
            {label && (
                <label htmlFor={id} className={styles.label}>
                    {label}
                </label>
            )}
            <div ref={setFieldNode} className={styles.field}>
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
                    <CaretIcon />
                </span>
            </div>
            {open && (portal ? <Portal>{list}</Portal> : list)}
            {error ? (
                <span className={styles.errorText}>{error}</span>
            ) : helperText ? (
                <span className={styles.helper}>{helperText}</span>
            ) : null}
        </div>
    );
}
