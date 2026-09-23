import { forwardRef, useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import { CaretIcon } from "./CaretIcon";
import styles from "./Select.module.css";

export interface SelectOption {
    value: string | number;
    label: string;
    disabled?: boolean;
}

/** What every variant of {@link Select} accepts. */
export interface SelectBaseProps extends SelectHTMLAttributes<HTMLSelectElement> {
    options?: SelectOption[];
    placeholder?: string;
    /**
     * Class for the outermost element. On `"bare"` that element is the shell
     * holding the `<select>` and the caret, which is where the app's own look goes.
     */
    wrapperClassName?: string;
    /**
     * Replaces the built-in chevron, following the `icon?: ReactNode` convention
     * the rest of the SDK uses.
     *
     * The icon is drawn in the caret slot, which is positioned by
     * `--tempest-control-caret-offset` and sized by `--tempest-control-caret-size`;
     * an `<svg>` passed here is stretched to that size, so the token — not the
     * icon's own `width`/`height` — decides how big the caret is in every density.
     */
    caretIcon?: ReactNode;
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

/**
 * The mechanism without the look: `appearance: none`, the caret and the focus
 * ring, and no border, background, radius, shadow or height.
 *
 * The `<select>` inherits `background-color` and `color` from the shell (the
 * element `wrapperClassName` lands on). The background is not cosmetic: the
 * native popup paints each `<option>` from the `<select>`'s background, so a
 * transparent control would hand the menu back to the system white.
 *
 * Like `"chip"`, the variant has no visible label, so an accessible name is
 * required — through `aria-label` or `aria-labelledby`.
 */
export type SelectBareProps = SelectBaseProps & { variant: "bare" } & (
        { "aria-label": string } | { "aria-labelledby": string }
    );

export type SelectProps = SelectFieldProps | SelectChipProps | SelectBareProps;

/**
 * Native `<select>` wrapper. Either provide `options` for a quick render, or
 * pass `<option>` children directly.
 *
 * Three variants:
 *
 * - `"field"` (default) — label, control, helper text and error slot, for a form.
 * - `"chip"` — the control alone, sized to its content, for a settings row where
 *   the icon and the label are already on the left and the control belongs on the
 *   right. Rendering the full field there stacks two labelled fields inside one
 *   list item, which is why every app ended up hand-rolling a native `<select>`
 *   with `appearance: none` — and hand-rolling it loses the focus ring, the
 *   disabled styling and the caret this component already solves.
 * - `"bare"` — the same mechanism with none of the look, for an app with its own
 *   visual identity: the shell renders `wrapper > select + caret`, and the app
 *   dresses the wrapper through `wrapperClassName`. See {@link SelectBareProps}.
 *
 * @example
 * <Select label="Estado" options={states} placeholder="Selecione" />
 *
 * @example
 * <ListTile title="Idioma" trailing={<Select variant="chip" aria-label="Idioma" options={langs} />} />
 *
 * @example
 * <Select variant="bare" wrapperClassName={styles.filtro} aria-label="Status" options={status} />
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
        caretIcon,
        ...rest
    } = props as SelectBaseProps & {
        variant?: SelectProps["variant"];
        label?: string;
        helperText?: string;
        error?: string;
    };
    const isChip = variant === "chip";
    const isBare = variant === "bare";
    const generatedId = useId();
    const selectId = id ?? generatedId;

    const control = (
        <div
            className={cn(
                styles.field,
                isChip && styles.chip,
                isBare && styles.bare,
                isBare && wrapperClassName,
            )}
        >
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
                {caretIcon ?? <CaretIcon />}
            </span>
        </div>
    );

    if (isBare) {
        return control;
    }

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
