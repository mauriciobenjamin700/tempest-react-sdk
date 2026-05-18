import { forwardRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./PasswordInput.module.css";

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export interface PasswordInputProps extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "size"
> {
    /** Label rendered above the input. */
    label?: ReactNode;
    /** Helper text below — replaced by `error` when set. */
    helperText?: ReactNode;
    /** Error message. Adds `aria-invalid` + red border. */
    error?: string;
    /** Visual size of the input. */
    size?: "sm" | "md" | "lg";
    /** Show a strength meter below the field. Default `false`. */
    showStrength?: boolean;
    /** Override the automatic strength calc (0–4). */
    strength?: PasswordStrength;
    /** Custom labels per strength level (5 entries). */
    strengthLabels?: readonly [string, string, string, string, string];
    /** Custom toggle button labels for accessibility. */
    toggleLabels?: { show: string; hide: string };
}

const DEFAULT_STRENGTH_LABELS = ["Muito fraca", "Fraca", "Razoável", "Forte", "Excelente"] as const;

export function estimatePasswordStrength(value: string): PasswordStrength {
    if (!value) return 0;
    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/[0-9]/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    return Math.min(4, score) as PasswordStrength;
}

/**
 * Password field with toggle-visibility button and optional strength meter.
 *
 * @example
 * <PasswordInput label="Senha" showStrength autoComplete="new-password" />
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
    function PasswordInput(
        {
            label,
            helperText,
            error,
            size = "md",
            showStrength = false,
            strength,
            strengthLabels = DEFAULT_STRENGTH_LABELS,
            toggleLabels = { show: "Mostrar senha", hide: "Esconder senha" },
            className,
            value,
            defaultValue,
            ...inputProps
        },
        ref,
    ) {
        const [revealed, setRevealed] = useState<boolean>(false);
        const stringValue = String((value ?? defaultValue ?? "") as string);
        const computedStrength: PasswordStrength =
            strength ?? estimatePasswordStrength(stringValue);

        return (
            <div className={cn(styles.wrapper, styles[size], error && styles.error, className)}>
                {label && <label className={styles.label}>{label}</label>}
                <div className={styles.field}>
                    <input
                        ref={ref}
                        {...inputProps}
                        value={value}
                        defaultValue={defaultValue}
                        type={revealed ? "text" : "password"}
                        aria-invalid={!!error}
                        className={styles.input}
                    />
                    <button
                        type="button"
                        className={styles.toggle}
                        aria-label={revealed ? toggleLabels.hide : toggleLabels.show}
                        aria-pressed={revealed}
                        onClick={() => setRevealed((on) => !on)}
                    >
                        {revealed ? "🙈" : "👁"}
                    </button>
                </div>
                {showStrength && (
                    <div
                        className={cn(styles.strength, styles[`level${computedStrength}`])}
                        aria-label={strengthLabels[computedStrength]}
                    >
                        <div className={styles.strengthBar}>
                            <span style={{ width: `${(computedStrength / 4) * 100}%` }} />
                        </div>
                        <span className={styles.strengthLabel}>
                            {strengthLabels[computedStrength]}
                        </span>
                    </div>
                )}
                {error ? (
                    <span className={styles.errorText}>{error}</span>
                ) : helperText ? (
                    <span className={styles.helper}>{helperText}</span>
                ) : null}
            </div>
        );
    },
);
