import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./ToggleGroup.module.css";

export type ToggleGroupType = "single" | "multiple";

interface ToggleGroupContextValue {
    type: ToggleGroupType;
    isSelected: (value: string) => boolean;
    toggle: (value: string) => void;
}

const ToggleGroupContext = createContext<ToggleGroupContextValue | null>(null);

function useToggleGroupContext(): ToggleGroupContextValue {
    const ctx = useContext(ToggleGroupContext);
    if (!ctx) {
        throw new Error("ToggleGroupItem must be used within a ToggleGroup");
    }
    return ctx;
}

export interface ToggleGroupProps extends HTMLAttributes<HTMLDivElement> {
    /** Selection mode. `"single"` keeps one value; `"multiple"` keeps a set. Default `"single"`. */
    type?: ToggleGroupType;
    /** Controlled value — `string` for `single`, `string[]` for `multiple`. */
    value?: string | string[];
    /** Uncontrolled initial value. */
    defaultValue?: string | string[];
    /** Fired with the next value whenever the selection changes. */
    onValueChange?: (value: string | string[]) => void;
    children: ReactNode;
}

function normalizeArray(value: string | string[] | undefined): string[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}

/**
 * A set of {@link ToggleGroupItem}s that share selection state via context.
 *
 * In `single` mode the value is a `string` (empty string when nothing is
 * selected); in `multiple` mode it is a `string[]`. Works controlled (pass
 * `value` + `onValueChange`) or uncontrolled (pass `defaultValue`).
 *
 * @param props - {@link ToggleGroupProps}.
 * @returns A `role="group"` container wrapping the items.
 */
export function ToggleGroup({
    type = "single",
    value,
    defaultValue,
    onValueChange,
    className,
    children,
    ...props
}: ToggleGroupProps) {
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = useState<string[]>(() =>
        normalizeArray(defaultValue),
    );
    const selected = isControlled ? normalizeArray(value) : internalValue;

    const commit = useCallback(
        (next: string[]): void => {
            if (!isControlled) setInternalValue(next);
            onValueChange?.(type === "single" ? (next[0] ?? "") : next);
        },
        [isControlled, onValueChange, type],
    );

    const toggle = useCallback(
        (itemValue: string): void => {
            const isOn = selected.includes(itemValue);
            if (type === "single") {
                commit(isOn ? [] : [itemValue]);
            } else {
                commit(isOn ? selected.filter((v) => v !== itemValue) : [...selected, itemValue]);
            }
        },
        [selected, type, commit],
    );

    const ctx = useMemo<ToggleGroupContextValue>(
        () => ({
            type,
            isSelected: (itemValue: string) => selected.includes(itemValue),
            toggle,
        }),
        [type, selected, toggle],
    );

    return (
        <ToggleGroupContext.Provider value={ctx}>
            <div role="group" className={cn(styles.group, className)} {...props}>
                {children}
            </div>
        </ToggleGroupContext.Provider>
    );
}

export interface ToggleGroupItemProps extends Omit<HTMLAttributes<HTMLButtonElement>, "onClick"> {
    /** Stable value identifying this item within the group. */
    value: string;
    /** Disables the item. */
    disabled?: boolean;
    children: ReactNode;
}

/**
 * A single selectable item inside a {@link ToggleGroup}. Reads and updates the
 * group's shared state through context.
 *
 * Icon-only items need an explicit `aria-label` (forwarded to the button):
 * an SVG child gives screen readers nothing to announce.
 *
 * @param props - {@link ToggleGroupItemProps}.
 * @returns A `role="button"` element exposing its state via `aria-pressed`.
 */
export function ToggleGroupItem({
    value,
    disabled,
    className,
    children,
    ...props
}: ToggleGroupItemProps) {
    const { isSelected, toggle } = useToggleGroupContext();
    const selected = isSelected(value);

    return (
        <button
            type="button"
            role="button"
            aria-pressed={selected}
            disabled={disabled}
            data-state={selected ? "on" : "off"}
            className={cn(styles.item, selected && styles.selected, className)}
            onClick={() => toggle(value)}
            {...props}
        >
            {children}
        </button>
    );
}
