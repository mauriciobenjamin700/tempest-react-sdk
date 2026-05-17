import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Alert.module.css";

export type AlertVariant = "neutral" | "info" | "success" | "warning" | "danger";
export type AlertAppearance = "soft" | "solid" | "outline";

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    variant?: AlertVariant;
    /** Visual style: soft (default tinted bg), solid (filled), outline (bordered). */
    appearance?: AlertAppearance;
    title?: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    /** Show a close button and invoke this when clicked. */
    onClose?: () => void;
    /** Custom close button label for screen readers. */
    closeLabel?: string;
}

/**
 * Inline alert / notice with tone (info/success/warning/danger) and appearance
 * (soft/solid/outline). Accepts optional `icon`, `title`, `description` and
 * a dismiss button via `onClose`.
 */
export function Alert({
    variant = "info",
    appearance = "soft",
    title,
    description,
    icon,
    onClose,
    closeLabel = "Dismiss",
    className,
    children,
    ...props
}: AlertProps) {
    return (
        <div
            role="alert"
            className={cn(
                styles.alert,
                styles[variant],
                appearance === "solid" && styles.solid,
                appearance === "outline" && styles.outline,
                className,
            )}
            {...props}
        >
            {icon && <span className={styles.icon}>{icon}</span>}
            <div className={styles.content}>
                {title && <p className={styles.title}>{title}</p>}
                {description && <p className={styles.description}>{description}</p>}
                {children}
            </div>
            {onClose && (
                <button
                    type="button"
                    className={styles.close}
                    onClick={onClose}
                    aria-label={closeLabel}
                >
                    <CloseIcon />
                </button>
            )}
        </div>
    );
}

function CloseIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}
