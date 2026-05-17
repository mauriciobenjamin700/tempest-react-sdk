import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    fullWidth?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
}

/**
 * Primary action button with variants, sizes and a loading state that
 * preserves layout via an absolutely-positioned spinner.
 */
export function Button({
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
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
