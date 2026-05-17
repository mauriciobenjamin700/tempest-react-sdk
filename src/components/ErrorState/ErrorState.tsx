import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { cn } from "@/utils/cn";
import styles from "./ErrorState.module.css";

export interface ErrorStateProps {
    title?: ReactNode;
    description?: ReactNode;
    onRetry?: () => void;
    retryLabel?: string;
    icon?: ReactNode;
    className?: string;
}

/** Error placeholder with optional retry CTA. Use when a request fails. */
export function ErrorState({
    title = "Algo deu errado",
    description = "Não foi possível carregar essas informações.",
    onRetry,
    retryLabel = "Tentar novamente",
    icon,
    className,
}: ErrorStateProps) {
    return (
        <div className={cn(styles.wrapper, className)}>
            <div className={styles.icon}>{icon ?? <AlertIcon />}</div>
            <h4 className={styles.title}>{title}</h4>
            {description && <p className={styles.description}>{description}</p>}
            {onRetry && (
                <div className={styles.action}>
                    <Button variant="secondary" onClick={onRetry}>
                        {retryLabel}
                    </Button>
                </div>
            )}
        </div>
    );
}

function AlertIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
