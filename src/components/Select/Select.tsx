import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import styles from "./Select.module.css";

export interface SelectOption {
    value: string | number;
    label: string;
    disabled?: boolean;
}

/** What both variants of {@link Select} accept. */
export interface SelectBaseProps extends SelectHTMLAttributes<HTMLSelectElement> {
    options?: SelectOption[];
    placeholder?: string;
    wrapperClassName?: string;
}

/** The full form field: label, control, helper text and error slot. */
export interface SelectFieldProps extends SelectBaseProps {
    variant?: "field";
    label?: string;
    helperText?: string;
    error?: string;
}

/**
 * The bare control, sized to its content.
 *
 * `aria-label` is required rather than optional, because the variant removes the
 * only visible label the component had. A settings row names the control in the
 * row's own text, which the `<select>` has no relationship to — so without this
 * the screen reader announces a combobox with no name at all.
 */
export interface SelectChipProps extends SelectBaseProps {
    variant: "chip";
    "aria-label": string;
}

export type SelectProps = SelectFieldProps | SelectChipProps;

/**
 * Native `<select>` wrapper. Either provide `options` for a quick render, or
 * pass `<option>` children directly.
 *
 * Two variants:
 *
 * - `"field"` (default) — label, control, helper text and error slot, for a form.
 * - `"chip"` — the control alone, sized to its content, for a settings row where
 *   the icon and the label are already on the left and the control belongs on the
 *   right. Rendering the full field there stacks two labelled fields inside one
 *   list item, which is why every app ended up hand-rolling a native `<select>`
 *   with `appearance: none` — and hand-rolling it loses the focus ring, the
 *   disabled styling and the caret this component already solves.
 *
 * @example
 * <Select label="Estado" options={states} placeholder="Selecione" />
 *
 * @example
 * <ListTile title="Idioma" trailing={<Select variant="chip" aria-label="Idioma" options={langs} />} />
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(props, ref) {
    const {
        options,
        placeholder,
        wrapperClassName,
        className,
        children,
        id,
        required,
        variant = "field",
        label,
        helperText,
        error,
        ...rest
    } = props as SelectBaseProps & {
        variant?: "field" | "chip";
        label?: string;
        helperText?: string;
        error?: string;
    };
    const isChip = variant === "chip";
    const generatedId = useId();
    const selectId = id ?? generatedId;

    const control = (
        <div className={cn(styles.field, isChip && styles.chip)}>
            <select
                ref={ref}
                id={selectId}
                aria-invalid={!!error}
                required={required}
                className={cn(styles.select, className)}
                {...rest}
            >
                {placeholder && (
                    <option value="" disabled hidden>
                        {placeholder}
                    </option>
                )}
                {options?.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                        {opt.label}
                    </option>
                ))}
                {children}
            </select>
            <span className={styles.caret} aria-hidden>
                <CaretIcon />
            </span>
        </div>
    );

    if (isChip) {
        return <div className={cn(styles.chipWrapper, wrapperClassName)}>{control}</div>;
    }

    return (
        <div className={cn(styles.wrapper, error && styles.error, wrapperClassName)}>
            {label && (
                <label htmlFor={selectId} className={styles.label}>
                    {label}
                    {required && <span className={styles.required}>*</span>}
                </label>
            )}
            {control}
            {error ? (
                <span className={styles.errorText}>{error}</span>
            ) : helperText ? (
                <span className={styles.helper}>{helperText}</span>
            ) : null}
        </div>
    );
});

function CaretIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
