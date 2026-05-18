import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./SegmentedControl.module.css";

export interface SegmentedControlOption<TValue extends string = string> {
    value: TValue;
    label: ReactNode;
    icon?: ReactNode;
    disabled?: boolean;
}

export interface SegmentedControlProps<TValue extends string = string> extends Omit<
    HTMLAttributes<HTMLDivElement>,
    "onChange"
> {
    /** Available segments. */
    options: SegmentedControlOption<TValue>[];
    /** Selected value. */
    value: TValue;
    /** Fires with the new value when a segment is selected. */
    onChange: (value: TValue) => void;
    /** Visual size. Default `"md"`. */
    size?: "sm" | "md" | "lg";
    /** Stretch to full width of container. Default `false`. */
    fullWidth?: boolean;
    /** Group label for screen readers. */
    "aria-label"?: string;
}

/**
 * iOS-style segmented control. Two-to-five mutually-exclusive options
 * rendered as a single connected pill bar.
 *
 * @example
 * <SegmentedControl
 *     value={view}
 *     onChange={setView}
 *     options={[
 *         { value: "list", label: "Lista" },
 *         { value: "grid", label: "Grade" },
 *     ]}
 * />
 */
export function SegmentedControl<TValue extends string = string>({
    options,
    value,
    onChange,
    size = "md",
    fullWidth = false,
    className,
    "aria-label": ariaLabel,
    ...props
}: SegmentedControlProps<TValue>) {
    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            className={cn(styles.group, styles[size], fullWidth && styles.fullWidth, className)}
            {...props}
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={option.disabled}
                        className={cn(styles.segment, selected && styles.active)}
                        onClick={() => onChange(option.value)}
                    >
                        {option.icon && <span className={styles.icon}>{option.icon}</span>}
                        <span className={styles.label}>{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
