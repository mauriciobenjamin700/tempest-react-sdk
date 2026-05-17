import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/utils/cn";
import styles from "./ChipInput.module.css";

export interface ChipInputProps {
    value: string[];
    onChange: (next: string[]) => void;
    label?: string;
    placeholder?: string;
    helperText?: string;
    error?: string;
    /** Keys that commit the current draft as a chip. Default: Enter, comma, Tab. */
    commitKeys?: string[];
    /** Lowercase + trim each chip + dedupe. Default: true. */
    normalize?: boolean;
    className?: string;
}

/**
 * Multi-value input. Type a value and press Enter (or comma / Tab) to push a
 * chip. Backspace on empty input removes the last chip.
 */
export function ChipInput({
    value,
    onChange,
    label,
    placeholder = "Adicionar e pressionar Enter…",
    helperText,
    error,
    commitKeys = ["Enter", ",", "Tab"],
    normalize = true,
    className,
}: ChipInputProps) {
    const [draft, setDraft] = useState<string>("");
    const inputRef = useRef<HTMLInputElement>(null);

    function commit(): void {
        const next = normalize ? draft.trim().toLowerCase() : draft.trim();
        if (!next) return;
        if (value.includes(next)) {
            setDraft("");
            return;
        }
        onChange([...value, next]);
        setDraft("");
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
        if (commitKeys.includes(event.key)) {
            event.preventDefault();
            commit();
            return;
        }
        if (event.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
        }
    }

    function remove(index: number): void {
        const next = value.slice();
        next.splice(index, 1);
        onChange(next);
    }

    return (
        <div className={cn(styles.wrapper, error && styles.error, className)}>
            {label && <label className={styles.label}>{label}</label>}
            <div className={styles.field} onClick={() => inputRef.current?.focus()}>
                {value.map((chip, index) => (
                    <span key={`${chip}-${index}`} className={styles.chip}>
                        {chip}
                        <button
                            type="button"
                            className={styles.remove}
                            aria-label={`Remover ${chip}`}
                            onClick={() => remove(index)}
                        >
                            ×
                        </button>
                    </span>
                ))}
                <input
                    ref={inputRef}
                    className={styles.input}
                    value={draft}
                    placeholder={value.length === 0 ? placeholder : ""}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={commit}
                />
            </div>
            {error ? (
                <span className={styles.errorText}>{error}</span>
            ) : helperText ? (
                <span className={styles.helper}>{helperText}</span>
            ) : null}
        </div>
    );
}
