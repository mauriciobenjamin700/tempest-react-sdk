import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Switch.module.css";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
    label?: ReactNode;
    wrapperClassName?: string;
}

/** Toggle switch backed by a checkbox input. Accessible via keyboard. */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
    { label, disabled, wrapperClassName, className, ...props },
    ref,
) {
    return (
        <label className={cn(styles.wrapper, disabled && styles.disabled, wrapperClassName)}>
            <input
                ref={ref}
                type="checkbox"
                role="switch"
                disabled={disabled}
                className={cn(styles.input, className)}
                {...props}
            />
            <span className={styles.track} aria-hidden>
                <span className={styles.thumb} />
            </span>
            {label && <span className={styles.label}>{label}</span>}
        </label>
    );
});
