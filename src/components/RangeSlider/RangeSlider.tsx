import { useCallback, useMemo } from "react";
import { cn } from "@/utils/cn";
import styles from "./RangeSlider.module.css";

export type RangeValue = [number, number];

export interface RangeSliderProps {
    value: RangeValue;
    onChange: (value: RangeValue) => void;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    helperText?: string;
    disabled?: boolean;
    /** Formatter for the value badge next to the label. Defaults to `min – max`. */
    formatValue?: (value: RangeValue) => string;
    className?: string;
}

/**
 * Dual-thumb range slider. Built on two native `<input type="range">` so it
 * stays accessible and works with keyboards/screen readers without
 * heavyweight positioning libs. The active fill is positioned via percentages.
 */
export function RangeSlider({
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    label,
    helperText,
    disabled = false,
    formatValue,
    className,
}: RangeSliderProps) {
    const [low, high] = value;
    const range = max - min;

    const fillLeft = useMemo(() => ((low - min) / range) * 100, [low, min, range]);
    const fillRight = useMemo(() => ((high - min) / range) * 100, [high, min, range]);

    const valueText = formatValue?.(value) ?? `${low} – ${high}`;

    const handleLow = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>): void => {
            const next = Math.min(Number(event.target.value), high);
            onChange([next, high]);
        },
        [high, onChange],
    );

    const handleHigh = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>): void => {
            const next = Math.max(Number(event.target.value), low);
            onChange([low, next]);
        },
        [low, onChange],
    );

    return (
        <div className={cn(styles.wrapper, className)}>
            {label && (
                <div className={styles.label}>
                    <span>{label}</span>
                    <span className={styles.value}>{valueText}</span>
                </div>
            )}
            <div className={styles.field}>
                <div className={styles.track} />
                <div
                    className={styles.fill}
                    style={{ left: `${fillLeft}%`, right: `${100 - fillRight}%` }}
                />
                <input
                    type="range"
                    className={styles.input}
                    min={min}
                    max={max}
                    step={step}
                    value={low}
                    onChange={handleLow}
                    disabled={disabled}
                    aria-label={label ? `${label} (mínimo)` : "Mínimo"}
                />
                <input
                    type="range"
                    className={styles.input}
                    min={min}
                    max={max}
                    step={step}
                    value={high}
                    onChange={handleHigh}
                    disabled={disabled}
                    aria-label={label ? `${label} (máximo)` : "Máximo"}
                />
            </div>
            {helperText && <span className={styles.helper}>{helperText}</span>}
        </div>
    );
}
