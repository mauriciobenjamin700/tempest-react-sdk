import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Tag.module.css";
import { TAG_MESSAGES } from "@/i18n/messages/tag";
import { useTempestText } from "@/i18n/use-tempest-text";

export type TagVariant = "neutral" | "primary" | "success" | "warning" | "danger" | "info";
export type TagSize = "sm" | "md" | "lg";

export interface TagProps extends Omit<HTMLAttributes<HTMLSpanElement>, "onRemove"> {
    /** Visual variant. Default `"neutral"`. */
    variant?: TagVariant;
    /** Visual size. Default `"md"`. */
    size?: TagSize;
    /** When set, renders a close button that fires this callback. */
    onRemove?: () => void;
    /** Custom remove label for screen readers. Default: `tempest.tag.remove` from the active i18n catalog (`"Remover"` / `"Remove"`). */
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
    removeLabel,
    className,
    children,
    ...props
}: TagProps) {
    const text = useTempestText(TAG_MESSAGES);
    return (
        <span className={cn(styles.tag, styles[variant], styles[size], className)} {...props}>
            <span className={styles.label}>{children}</span>
            {onRemove && (
                <button
                    type="button"
                    className={styles.remove}
                    aria-label={removeLabel ?? text.t("tempest.tag.remove")}
                    onClick={onRemove}
                >
                    ×
                </button>
            )}
        </span>
    );
}
