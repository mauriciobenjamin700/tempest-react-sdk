/**
 * @tempest-limits props-count — label, helperText and error are the three states of
 * one message slot that every input in this SDK shares; removing them pushes the
 * scaffolding back into the app. DatePicker adds min, max and mode on top, which are
 * the field's own semantics.
 */
import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { Input } from "@/components/Input";

export interface DatePickerProps extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "onChange" | "size"
> {
    /** ISO date string (`YYYY-MM-DD`) or empty. */
    value: string;
    onChange: (value: string) => void;
    label?: string;
    helperText?: string;
    error?: string;
    /** Lower bound (`YYYY-MM-DD`). */
    min?: string;
    /** Upper bound (`YYYY-MM-DD`). */
    max?: string;
    /** Mode. `date` (default), `datetime-local`, `time`, or `month`. */
    mode?: "date" | "datetime-local" | "time" | "month";
    wrapperClassName?: string;
}

/**
 * Thin wrapper around the native `<input type="date">` (or `datetime-local`,
 * `time`, `month`). For richer pickers, pair with `react-datepicker` directly
 * — this primitive keeps the SDK dep-free.
 */
export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
    { value, onChange, mode = "date", ...props },
    ref,
) {
    return (
        <Input
            {...props}
            ref={ref}
            type={mode}
            value={value}
            onChange={(event) => onChange(event.target.value)}
        />
    );
});
