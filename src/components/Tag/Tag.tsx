import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Tag.module.css";

export type TagVariant = "neutral" | "primary" | "success" | "warning" | "danger" | "info";
export type TagSize = "sm" | "md" | "lg";

export interface TagProps extends Omit<HTMLAttributes<HTMLSpanElement>, "onRemove"> {
    /** Visual variant. Default `"neutral"`. */
    variant?: TagVariant;
    /** Visual size. Default `"md"`. */
    size?: TagSize;
    /** When set, renders a close button that fires this callback. */
    onRemove?: () => void;
    /** Custom remove label for screen readers. Default `"Remover"`. */
    removeLabel?: string;
    children?: ReactNode;
}

/**
 * Removable chip — used for filter tokens, applied search filters,
 * selected entities. Different from `Badge` (status-only, not removable).
 *
 * @example
 * <Tag variant="primary" onRemove={() => removeFilter("sao-paulo")}>
 *     São Paulo
 * </Tag>
 */
export function Tag({
    variant = "neutral",
    size = "md",
    onRemove,
    removeLabel = "Remover",
    className,
    children,
    ...props
}: TagProps) {
    return (
        <span className={cn(styles.tag, styles[variant], styles[size], className)} {...props}>
            <span className={styles.label}>{children}</span>
            {onRemove && (
                <button
                    type="button"
                    className={styles.remove}
                    aria-label={removeLabel}
                    onClick={onRemove}
                >
                    ×
                </button>
            )}
        </span>
    );
}
