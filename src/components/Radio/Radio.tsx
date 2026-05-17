import { createContext, forwardRef, useContext, useId, useState } from "react";
import type { ChangeEvent, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Radio.module.css";

interface RadioGroupContextValue {
    name: string;
    value?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
    label?: ReactNode;
    description?: ReactNode;
    value: string;
    wrapperClassName?: string;
}

/**
 * Single radio button. Inside a {@link RadioGroup}, name/checked/onChange are
 * managed by the group; outside, behaves as a regular radio input.
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
    {
        label,
        description,
        value,
        disabled,
        name,
        checked,
        onChange,
        wrapperClassName,
        className,
        ...props
    },
    ref,
) {
    const group = useContext(RadioGroupContext);
    const resolvedName = group?.name ?? name;
    const resolvedDisabled = group?.disabled ?? disabled;
    const isChecked = group ? group.value === value : checked;

    function handleChange(event: ChangeEvent<HTMLInputElement>): void {
        if (group) group.onChange?.(value);
        onChange?.(event);
    }

    return (
        <label className={cn(styles.wrapper, resolvedDisabled && styles.disabled, wrapperClassName)}>
            <input
                ref={ref}
                type="radio"
                name={resolvedName}
                value={value}
                checked={isChecked}
                disabled={resolvedDisabled}
                onChange={handleChange}
                className={cn(styles.input, className)}
                {...props}
            />
            <span className={styles.dot} aria-hidden />
            {(label || description) && (
                <span className={styles.labelWrap}>
                    {label && <span className={styles.label}>{label}</span>}
                    {description && <span className={styles.description}>{description}</span>}
                </span>
            )}
        </label>
    );
});

export interface RadioGroupProps {
    /** Selected value (controlled). */
    value?: string;
    /** Default selected value (uncontrolled). */
    defaultValue?: string;
    /** Called when the selection changes. */
    onChange?: (value: string) => void;
    /** `name` attribute applied to every Radio inside. Auto-generated if omitted. */
    name?: string;
    /** Disable every Radio inside. */
    disabled?: boolean;
    /** Lay out radios horizontally. Default: false (column). */
    horizontal?: boolean;
    className?: string;
    children: ReactNode;
}

/**
 * Wraps multiple {@link Radio} children and coordinates selection via context.
 * Pass `value` for controlled mode or `defaultValue` for uncontrolled.
 */
export function RadioGroup({
    value,
    defaultValue,
    onChange,
    name,
    disabled,
    horizontal = false,
    className,
    children,
}: RadioGroupProps) {
    const generatedName = useId();
    const resolvedName = name ?? generatedName;

    const [internal, setInternal] = useState<string | undefined>(defaultValue);
    const isControlled = value !== undefined;
    const current = isControlled ? value : internal;

    function handleChange(next: string): void {
        if (!isControlled) setInternal(next);
        onChange?.(next);
    }

    return (
        <RadioGroupContext.Provider
            value={{ name: resolvedName, value: current, onChange: handleChange, disabled }}
        >
            <div
                role="radiogroup"
                className={cn(styles.group, horizontal && styles.horizontal, className)}
            >
                {children}
            </div>
        </RadioGroupContext.Provider>
    );
}

