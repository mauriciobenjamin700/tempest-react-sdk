import { forwardRef } from "react";
import type { LabelHTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import styles from "./Label.module.css";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
    /** When `true` appends a danger-colored asterisk marking the field as required. */
    required?: boolean;
}

/**
 * A form `<label>`. Associate it with a control via `htmlFor`. When `required`
 * is set, a decorative asterisk (`aria-hidden`) is appended.
 *
 * @param props - {@link LabelProps}.
 * @returns The label element.
 */
export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
    { required = false, className, children, ...props },
    ref,
) {
    return (
        <label ref={ref} className={cn(styles.label, className)} {...props}>
            {children}
            {required && (
                <span className={styles.asterisk} aria-hidden>
                    *
                </span>
            )}
        </label>
    );
});
