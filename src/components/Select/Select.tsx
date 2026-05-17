import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import styles from "./Select.module.css";

export interface SelectOption {
    value: string | number;
    label: string;
    disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    helperText?: string;
    error?: string;
    options?: SelectOption[];
    placeholder?: string;
    wrapperClassName?: string;
}

/**
 * Native `<select>` wrapper with label/helper/error slots. Either provide
 * `options` for a quick render, or pass `<option>` children directly.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
    {
        label,
        helperText,
        error,
        options,
        placeholder,
        wrapperClassName,
        className,
        children,
        id,
        required,
        ...props
    },
    ref,
) {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    return (
        <div className={cn(styles.wrapper, error && styles.error, wrapperClassName)}>
            {label && (
                <label htmlFor={selectId} className={styles.label}>
                    {label}
                    {required && <span className={styles.required}>*</span>}
                </label>
            )}
            <div className={styles.field}>
                <select
                    ref={ref}
                    id={selectId}
                    aria-invalid={!!error}
                    required={required}
                    className={cn(styles.select, className)}
                    {...props}
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
