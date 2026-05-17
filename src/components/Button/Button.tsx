import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Button.module.css";

export type ButtonVariant =
    | "primary"
    | "secondary"
    | "danger"
    | "success"
    | "ghost"
    | "soft"
    | "outline"
    | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    fullWidth?: boolean;
    /** Removes horizontal padding and forces a square footprint (use with `aria-label`). */
    iconOnly?: boolean;
    /** Pill-shaped border radius. */
    pill?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
}

/**
 * Primary action button with variants, sizes and a loading state that
 * preserves layout via an absolutely-positioned spinner.
 *
 * Variants: `primary` (solid), `secondary` (neutral), `danger`, `success`,
 * `ghost` (transparent), `soft` (tinted), `outline` (bordered), `link`.
 *
 * Sizes are density-aware — they read from `--tempest-control-height-*`
 * tokens which respond to the `data-tempest-density` attribute.
 */
export function Button({
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    iconOnly = false,
    pill = false,
    leftIcon,
    rightIcon,
    disabled,
    className,
    children,
    ...props
}: ButtonProps) {
    return (
        <button
            className={cn(
                styles.button,
                styles[variant],
                styles[size],
                iconOnly && styles.iconOnly,
                pill && styles.pill,
                loading && styles.loading,
                fullWidth && styles.fullWidth,
                className,
            )}
            disabled={disabled || loading}
            {...props}
        >
            {loading && (
                <span className={styles.spinner} aria-hidden>
                    <SpinnerIcon />
                </span>
            )}
            <span className={cn(loading && styles.hiddenText)}>
                {leftIcon}
                {children}
                {rightIcon}
            </span>
        </button>
    );
}

function SpinnerIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M21 12a9 9 0 1 1-6.219-8.56"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}
