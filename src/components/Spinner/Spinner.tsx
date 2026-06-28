import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Spinner.module.css";

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface SpinnerProps {
    size?: SpinnerSize;
    className?: string;
    /** Accessible label announced by screen readers. */
    label?: string;
    /**
     * Visible caption rendered under the spinner. When set, the spinner and
     * caption are wrapped in a centered column.
     */
    caption?: ReactNode;
    /**
     * Center the spinner inside a full-area overlay (fills the nearest
     * positioned ancestor; pair with a relative container or a route fallback).
     * Implies the wrapped layout.
     */
    overlay?: boolean;
}

/**
 * Loading spinner with preset sizes (xs..xl). Provide `label` for screen
 * readers, `caption` for a visible message, and `overlay` to center it inside a
 * full-area container (e.g. a Suspense / route fallback).
 *
 * @example
 * <Spinner />
 * <Spinner size="lg" caption="Carregando…" overlay />
 */
export function Spinner({
    size = "md",
    className,
    label = "Carregando",
    caption,
    overlay = false,
}: SpinnerProps) {
    const dot = <span aria-hidden className={cn(styles.spinner, styles[size])} />;

    if (!overlay && caption === undefined) {
        return (
            <span
                role="status"
                aria-label={label}
                className={cn(styles.spinner, styles[size], className)}
            />
        );
    }

    return (
        <div
            role="status"
            aria-label={label}
            aria-live="polite"
            className={cn(styles.wrap, overlay && styles.overlay, className)}
        >
            {dot}
            {caption !== undefined && <span className={styles.caption}>{caption}</span>}
        </div>
    );
}
