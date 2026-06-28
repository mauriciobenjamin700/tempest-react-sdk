import { useCallback, useMemo } from "react";
import { cn } from "@/utils/cn";
import styles from "./Slider.module.css";

export interface SliderProps {
    /** Current value. */
    value: number;
    /** Called with the new value on every change. */
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    helperText?: string;
    disabled?: boolean;
    /** Formatter for the value badge next to the label. Defaults to the raw number. */
    formatValue?: (value: number) => string;
    className?: string;
}

/**
 * Single-thumb slider built on a native `<input type="range">`, so it stays
 * accessible (keyboard + screen reader) with no positioning libs. The active
 * fill is a percentage-width bar. For a two-thumb range, use `RangeSlider`.
 */
export function Slider({
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
}: SliderProps) {
    const pct = useMemo(() => {
        const range = max - min;
        if (range <= 0) return 0;
        return Math.min(100, Math.max(0, ((value - min) / range) * 100));
    }, [value, min, max]);

    const valueText = formatValue?.(value) ?? String(value);

    const handleChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>): void => {
            onChange(Number(event.target.value));
        },
        [onChange],
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
                <div className={styles.fill} style={{ width: `${pct}%` }} />
                <input
                    type="range"
                    className={styles.input}
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={handleChange}
                    disabled={disabled}
                    aria-label={label ?? "Slider"}
                    aria-valuetext={valueText}
                />
            </div>
            {helperText && <span className={styles.helper}>{helperText}</span>}
        </div>
    );
}
