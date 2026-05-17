import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Card.module.css";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    title?: ReactNode;
    actions?: ReactNode;
    flush?: boolean;
}

/**
 * Card container with optional header (title + actions). Use `flush` when you
 * need to host content (tables, lists) that should not have inner padding.
 */
export function Card({ title, actions, flush = false, className, children, ...props }: CardProps) {
    const hasHeader = title || actions;
    return (
        <div
            className={cn(
                styles.card,
                !hasHeader && !flush && styles.padded,
                flush && styles.flush,
                className,
            )}
            {...props}
        >
            {hasHeader && (
                <header className={styles.header}>
                    {typeof title === "string" ? <h3 className={styles.title}>{title}</h3> : title}
                    {actions}
                </header>
            )}
            {hasHeader ? <div className={styles.body}>{children}</div> : children}
        </div>
    );
}
