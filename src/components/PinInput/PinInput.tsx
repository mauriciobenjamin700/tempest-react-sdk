import { forwardRef, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from "react";
import { cn } from "@/utils/cn";
import styles from "./PinInput.module.css";

export type PinInputType = "numeric" | "alphanumeric";
export type PinInputSize = "sm" | "md" | "lg";

export interface PinInputProps {
    /** Number of cells. Default `6`. */
    length?: number;
    /** Allowed character set. `numeric` (default) rejects letters, `alphanumeric` allows both. */
    type?: PinInputType;
    /** Visual size. Default `"md"`. */
    size?: PinInputSize;
    /** Controlled value. */
    value?: string;
    /** Initial value (uncontrolled mode). */
    defaultValue?: string;
    /** Fires on every change with the current concatenated value. */
    onChange?: (value: string) => void;
    /** Fires when the user fills the last cell. */
    onComplete?: (value: string) => void;
    /** Show characters obscured (`*`). Default `false`. */
    masked?: boolean;
    /** Label rendered above the cells. */
    label?: string;
    /** Helper text below the cells. */
    helperText?: string;
    /** Error message — turns cells red and replaces helperText. */
    error?: string;
    /** Disable all cells. */
    disabled?: boolean;
    /** Auto-focus the first cell on mount. Default `false`. */
    autoFocus?: boolean;
    /** id for the wrapping group label association. */
    id?: string;
    className?: string;
}

const NUMERIC = /[0-9]/;
const ALNUM = /[A-Za-z0-9]/;

/**
 * One-time-password style input — N independent cells, paste support, auto-
 * advance on input, backspace flows back, arrow keys navigate.
 *
 * @example
 * <PinInput length={6} type="numeric" onComplete={(otp) => verify(otp)} />
 */
export const PinInput = forwardRef<HTMLDivElement, PinInputProps>(function PinInput(
    {
        length = 6,
        type = "numeric",
        size = "md",
        value,
        defaultValue,
        onChange,
        onComplete,
        masked = false,
        label,
        helperText,
        error,
        disabled = false,
        autoFocus = false,
        id,
        className,
    },
    ref,
) {
    const internalId = useId();
    const wrapperId = id ?? internalId;
    const isControlled = value !== undefined;
    const [internal, setInternal] = useState<string>(defaultValue ?? "");
    const current = isControlled ? (value ?? "") : internal;
    const cells = Array.from({ length }, (_, index) => current[index] ?? "");
    const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
    const pattern = type === "numeric" ? NUMERIC : ALNUM;

    useEffect(() => {
        if (autoFocus) inputsRef.current[0]?.focus();
    }, [autoFocus]);

    const update = (next: string): void => {
        const trimmed = next.slice(0, length);
        if (!isControlled) setInternal(trimmed);
        onChange?.(trimmed);
        if (trimmed.length === length) onComplete?.(trimmed);
    };

    const focusCell = (index: number): void => {
        const safe = Math.max(0, Math.min(length - 1, index));
        inputsRef.current[safe]?.focus();
        inputsRef.current[safe]?.select();
    };

    const onCellChange = (index: number) => (event: ChangeEvent<HTMLInputElement>) => {
        const char = event.target.value.slice(-1);
        if (char && !pattern.test(char)) return;
        const next = cells.slice();
        next[index] = char;
        update(next.join(""));
        if (char) focusCell(index + 1);
    };

    const onCellKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Backspace") {
            if (!cells[index] && index > 0) {
                event.preventDefault();
                const next = cells.slice();
                next[index - 1] = "";
                update(next.join(""));
                focusCell(index - 1);
            }
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            focusCell(index - 1);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            focusCell(index + 1);
        }
    };

    const onPaste = (event: ClipboardEvent<HTMLInputElement>): void => {
        const text = event.clipboardData
            .getData("text")
            .split("")
            .filter((c) => pattern.test(c))
            .join("");
        if (!text) return;
        event.preventDefault();
        update(text);
        focusCell(Math.min(length - 1, text.length));
    };

    return (
        <div
            ref={ref}
            className={cn(styles.wrapper, error && styles.error, className)}
            id={wrapperId}
        >
            {label && <label className={styles.label}>{label}</label>}
            <div className={cn(styles.cells, styles[size])} role="group" aria-label={label}>
                {cells.map((cell, index) => (
                    <input
                        key={index}
                        ref={(node) => {
                            inputsRef.current[index] = node;
                        }}
                        type={masked ? "password" : "text"}
                        inputMode={type === "numeric" ? "numeric" : "text"}
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        maxLength={1}
                        value={cell}
                        disabled={disabled}
                        className={styles.cell}
                        aria-label={`Dígito ${index + 1}`}
                        aria-invalid={!!error}
                        onChange={onCellChange(index)}
                        onKeyDown={onCellKeyDown(index)}
                        onPaste={onPaste}
                    />
                ))}
            </div>
            {error ? (
                <span className={styles.errorText}>{error}</span>
            ) : helperText ? (
                <span className={styles.helper}>{helperText}</span>
            ) : null}
        </div>
    );
});
