import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Card.module.css";

export type CardElevation = "flat" | "default" | "raised" | "elevated";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    title?: ReactNode;
    actions?: ReactNode;
    footer?: ReactNode;
    flush?: boolean;
    /** Hoverable card — adds elevation lift, cursor pointer and focus ring. */
    interactive?: boolean;
    /** Visual elevation level. Defaults to `default` (subtle shadow + border). */
    elevation?: CardElevation;
}

/**
 * Card container with optional header (title + actions) and footer slot.
 * Use `flush` when you need to host content (tables, lists) without inner padding.
 * Use `interactive` for clickable cards — adds hover lift and focus ring.
 */
export function Card({
    title,
    actions,
    footer,
    flush = false,
    interactive = false,
    elevation = "default",
    className,
    children,
    ...props
}: CardProps) {
    const hasHeader = !!(title || actions);
    return (
        <div
            className={cn(
                styles.card,
                elevation === "flat" && styles.flat,
                elevation === "raised" && styles.raised,
                elevation === "elevated" && styles.elevated,
                interactive && styles.interactive,
                !hasHeader && !flush && styles.padded,
                flush && styles.flush,
                className,
            )}
            tabIndex={interactive ? (props.tabIndex ?? 0) : props.tabIndex}
            {...props}
        >
            {hasHeader && (
                <header className={styles.header}>
                    {typeof title === "string" ? <h3 className={styles.title}>{title}</h3> : title}
                    {actions}
                </header>
            )}
            {hasHeader ? <div className={styles.body}>{children}</div> : children}
            {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
    );
}
