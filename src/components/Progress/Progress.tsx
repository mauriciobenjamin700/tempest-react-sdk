import { cn } from "@/utils/cn";
import styles from "./Progress.module.css";

export type ProgressVariant = "primary" | "success" | "warning" | "danger";

export interface ProgressProps {
    /** Value between 0 and `max` (or 0-100 by default). Ignored when `indeterminate`. */
    value?: number;
    max?: number;
    variant?: ProgressVariant;
    /** Show an animated indeterminate bar. Default: false. */
    indeterminate?: boolean;
    /** Render a numeric label "x% / max" above the bar. Default: false. */
    showLabel?: boolean;
    /** Optional left-aligned descriptor (e.g. "Enviando arquivo…"). */
    label?: string;
    className?: string;
}

/** Linear progress bar with determinate / indeterminate modes. */
export function Progress({
    value = 0,
    max = 100,
    variant = "primary",
    indeterminate = false,
    showLabel = false,
    label,
    className,
}: ProgressProps) {
    const pct = indeterminate ? 0 : Math.max(0, Math.min(100, (value / max) * 100));

    return (
        <div className={cn(styles.wrapper, className)}>
            {(showLabel || label) && (
                <div className={styles.label}>
                    {label && <span>{label}</span>}
                    {showLabel && !indeterminate && <span>{Math.round(pct)}%</span>}
                </div>
            )}
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={indeterminate ? undefined : value}
                className={cn(styles.bar, indeterminate && styles.indeterminate)}
            >
                <div
                    className={cn(
                        styles.fill,
                        variant !== "primary" && styles[variant],
                    )}
                    style={{ width: indeterminate ? undefined : `${pct}%` }}
                />
            </div>
        </div>
    );
}
