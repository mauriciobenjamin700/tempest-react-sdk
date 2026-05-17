import { forwardRef, useEffect, useRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Checkbox.module.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
    label?: ReactNode;
    description?: ReactNode;
    /** Render the box in the indeterminate state regardless of `checked`. */
    indeterminate?: boolean;
    wrapperClassName?: string;
}

/**
 * Accessible checkbox. Supports a tri-state via `indeterminate` and pairs the
 * input with a label/description column for forms.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
    { label, description, indeterminate, disabled, wrapperClassName, className, ...props },
    ref,
) {
    const innerRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (innerRef.current) innerRef.current.indeterminate = Boolean(indeterminate);
    }, [indeterminate]);

    function setRef(node: HTMLInputElement | null): void {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
    }

    return (
        <label className={cn(styles.wrapper, disabled && styles.disabled, wrapperClassName)}>
            <input
                ref={setRef}
                type="checkbox"
                disabled={disabled}
                className={cn(styles.input, className)}
                {...props}
            />
            <span className={styles.box} aria-hidden>
                {indeterminate ? <DashIcon /> : <CheckIcon />}
            </span>
            {(label || description) && (
                <span className={styles.labelWrap}>
                    {label && <span className={styles.label}>{label}</span>}
                    {description && <span className={styles.description}>{description}</span>}
                </span>
            )}
        </label>
    );
});

function CheckIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
                d="M5 12l5 5L20 7"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function DashIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
    );
}
