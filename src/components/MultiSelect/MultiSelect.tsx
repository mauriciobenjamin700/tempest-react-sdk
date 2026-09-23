/**
 * @tempest-limits file-lines, props-count, function-lines — options/value/onChange
 * plus the shared field contract, the knobs that make it multi (maxItems, filter,
 * emptyMessage) and portal. The body is the listbox with chip removal, type-ahead and
 * the ARIA active-descendant wiring reading one active index.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Portal } from "@/components/Portal";
import { useAnchorPosition } from "@/components/Portal/anchor-position";
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
    /**
     * Render the list in a portal, positioned under the field. Default `true`.
     *
     * In flow, an ancestor with `overflow` other than `visible` clips the list —
     * in the last row of a `DataTable` none of it was visible (measured in Chrome
     * at 1440 px). In a portal it escapes the clip, takes the field's width,
     * flips above the field when there is no room below, and follows it on
     * scroll, resize and when the field grows a line of chips.
     */
    portal?: boolean;
    className?: string;
}

function defaultFilter(option: MultiSelectOption, query: string): boolean {
    if (!query) return true;
    return option.label.toLowerCase().includes(query.toLowerCase());
}

/** Gap between field and list, in px — the in-flow CSS uses the same 4 px. */
const LIST_OFFSET = 4;

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
    portal = true,
    className,
}: MultiSelectProps) {
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
            setOpen(false);
            setQuery("");
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open, listNode]);

    /**
     * Open the list and keep focus on the input when the empty part of the field
     * is pressed.
     *
     * Only a press on the field itself counts: a press on a chip or on its remove
     * button has its own handler, and the input focuses itself.
     */
    const handleFieldMouseDown = (event: React.MouseEvent<HTMLDivElement>): void => {
        if (disabled || event.target !== event.currentTarget) return;
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
    };

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
            if (option) toggle(option);
        } else if (event.key === "Escape") {
            if (open) event.preventDefault();
            setOpen(false);
            setQuery("");
        } else if (event.key === "Backspace" && query === "" && value.length > 0) {
            removeAt(value[value.length - 1]);
        }
    };

    const list = (
        <ul
            ref={setListNode}
            id={`${id}-listbox`}
            role="listbox"
            aria-multiselectable
            className={cn(styles.menu, portal && styles.portalled)}
            style={floatingStyle}
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
    );

    return (
        <div ref={rootRef} className={cn(styles.wrapper, error && styles.error, className)}>
            {label && (
                <label htmlFor={id} className={styles.label}>
                    {label}
                </label>
            )}
            <div
                ref={setFieldNode}
                className={cn(styles.field, disabled && styles.disabled)}
                onMouseDown={handleFieldMouseDown}
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
            {open && (portal ? <Portal>{list}</Portal> : list)}
            {error ? (
                <span className={styles.errorText}>{error}</span>
            ) : helperText ? (
                <span className={styles.helper}>{helperText}</span>
            ) : null}
        </div>
    );
}
