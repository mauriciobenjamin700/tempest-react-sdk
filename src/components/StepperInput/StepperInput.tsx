import { forwardRef } from "react";
import type { ReactNode } from "react";
import { clamp } from "@/utils/numbers";
import { cn } from "@/utils/cn";
import styles from "./StepperInput.module.css";

export interface StepperInputProps {
    /** Current value. */
    value: number;
    /** Fires with the new value (already clamped to min/max). */
    onChange: (value: number) => void;
    /** Lower bound. Default `0`. */
    min?: number;
    /** Upper bound. Default `Number.POSITIVE_INFINITY`. */
    max?: number;
    /** Increment per click. Default `1`. */
    step?: number;
    /** Visual size. Default `"md"`. */
    size?: "sm" | "md" | "lg";
    /** Disable the whole control. */
    disabled?: boolean;
    /** Optional label rendered above. */
    label?: ReactNode;
    /** Optional formatter for the displayed value. */
    format?: (value: number) => string;
    /** Custom button labels for accessibility. */
    labels?: { decrement: string; increment: string };
    className?: string;
}

/**
 * Numeric +/− stepper. Common in checkout quantity selectors and admin
 * forms. Clamps to `[min, max]` and emits already-bounded values.
 *
 * @example
 * <StepperInput value={qty} onChange={setQty} min={1} max={10} />
 */
export const StepperInput = forwardRef<HTMLDivElement, StepperInputProps>(function StepperInput(
    {
        value,
        onChange,
        min = 0,
        max = Number.POSITIVE_INFINITY,
        step = 1,
        size = "md",
        disabled = false,
        label,
        format,
        labels = { decrement: "Diminuir", increment: "Aumentar" },
        className,
    },
    ref,
) {
    const decrement = (): void => {
        if (disabled) return;
        onChange(clamp(value - step, min, max));
    };
    const increment = (): void => {
        if (disabled) return;
        onChange(clamp(value + step, min, max));
    };

    const display = format ? format(value) : String(value);
    const canDecrement = !disabled && value > min;
    const canIncrement = !disabled && value < max;

    return (
        <div ref={ref} className={cn(styles.wrapper, className)}>
            {label && <label className={styles.label}>{label}</label>}
            <div className={cn(styles.row, styles[size], disabled && styles.disabled)}>
                <button
                    type="button"
                    className={styles.btn}
                    aria-label={labels.decrement}
                    onClick={decrement}
                    disabled={!canDecrement}
                >
                    −
                </button>
                <span className={styles.value} role="status" aria-live="polite">
                    {display}
                </span>
                <button
                    type="button"
                    className={styles.btn}
                    aria-label={labels.increment}
                    onClick={increment}
                    disabled={!canIncrement}
                >
                    +
                </button>
            </div>
        </div>
    );
});
