import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import styles from "./Badge.module.css";

export type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger" | "info";
export type BadgeAppearance = "soft" | "solid" | "outline";
export type BadgeSize = "sm" | "md" | "lg";
export type BadgeShape = "pill" | "square";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
    /** Visual style: soft (default tinted bg), solid (filled), outline (bordered). */
    appearance?: BadgeAppearance;
    size?: BadgeSize;
    /** Pill (default rounded) or square (slightly rounded). */
    shape?: BadgeShape;
    /** Renders a leading status dot in the badge color. */
    dot?: boolean;
}

/**
 * Pill / square status badge.
 *
 * - `variant` picks the tone (neutral, primary, success, warning, danger, info).
 * - `appearance` picks the style (soft, solid, outline).
 * - `dot` prepends a status dot in the same tone.
 */
export function Badge({
    variant = "neutral",
    appearance = "soft",
    size = "md",
    shape = "pill",
    dot = false,
    className,
    children,
    ...props
}: BadgeProps) {
    return (
        <span
            className={cn(
                styles.badge,
                styles[variant],
                appearance === "solid" && styles.solid,
                appearance === "outline" && styles.outline,
                styles[size],
                shape === "square" && styles.square,
                className,
            )}
            {...props}
        >
            {dot && <span className={styles.dot} aria-hidden />}
            {children}
        </span>
    );
}
