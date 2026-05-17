import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Input.module.css";

export type InputSize = "sm" | "md" | "lg";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
    label?: string;
    helperText?: string;
    error?: string;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    wrapperClassName?: string;
    /** Visual size — drives height, padding and font via density-aware tokens. */
    size?: InputSize;
}

/**
 * Labelled text input with helper/error slots and optional adornment icons.
 * Forwards refs to the underlying `<input>` for integration with form libraries.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    {
        label,
        helperText,
        error,
        leftIcon,
        rightIcon,
        wrapperClassName,
        className,
        id,
        required,
        size = "md",
        ...props
    },
    ref,
) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const describedById = error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined;
    const sizeClass = size === "sm" ? styles.sizeSm : size === "lg" ? styles.sizeLg : styles.sizeMd;

    return (
        <div className={cn(styles.wrapper, error && styles.error, wrapperClassName)}>
            {label && (
                <label htmlFor={inputId} className={styles.label}>
                    {label}
                    {required && <span className={styles.required}>*</span>}
                </label>
            )}
            <div className={styles.field}>
                {leftIcon && <span className={styles.iconLeft}>{leftIcon}</span>}
                <input
                    ref={ref}
                    id={inputId}
                    aria-invalid={!!error}
                    aria-describedby={describedById}
                    required={required}
                    className={cn(
                        styles.input,
                        sizeClass,
                        leftIcon && styles.hasLeftIcon,
                        rightIcon && styles.hasRightIcon,
                        className,
                    )}
                    {...props}
                />
                {rightIcon && <span className={styles.iconRight}>{rightIcon}</span>}
            </div>
            {error ? (
                <span id={`${inputId}-error`} className={styles.errorText}>
                    {error}
                </span>
            ) : helperText ? (
                <span id={`${inputId}-helper`} className={styles.helper}>
                    {helperText}
                </span>
            ) : null}
        </div>
    );
});
