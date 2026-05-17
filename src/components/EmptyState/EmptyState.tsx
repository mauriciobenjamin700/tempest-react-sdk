import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}

/** Centered "nothing here yet" placeholder with optional icon and CTA. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div className={cn(styles.wrapper, className)}>
            {icon && <div className={styles.icon}>{icon}</div>}
            <h4 className={styles.title}>{title}</h4>
            {description && <p className={styles.description}>{description}</p>}
            {action && <div className={styles.action}>{action}</div>}
        </div>
    );
}
