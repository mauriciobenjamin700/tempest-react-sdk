import { forwardRef, useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import styles from "./Textarea.module.css";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    helperText?: string;
    error?: string;
    wrapperClassName?: string;
}

/**
 * Multi-line text input. Mirrors the {@link Input} API for label/helper/error.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
    { label, helperText, error, wrapperClassName, className, id, required, ...props },
    ref,
) {
    const generatedId = useId();
    const textareaId = id ?? generatedId;

    return (
        <div className={cn(styles.wrapper, error && styles.error, wrapperClassName)}>
            {label && (
                <label htmlFor={textareaId} className={styles.label}>
                    {label}
                    {required && <span className={styles.required}>*</span>}
                </label>
            )}
            <textarea
                ref={ref}
                id={textareaId}
                aria-invalid={!!error}
                required={required}
                className={cn(styles.textarea, className)}
                {...props}
            />
            {error ? (
                <span className={styles.errorText}>{error}</span>
            ) : helperText ? (
                <span className={styles.helper}>{helperText}</span>
            ) : null}
        </div>
    );
});
