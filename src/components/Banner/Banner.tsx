import { useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Banner.module.css";

export type BannerVariant = "info" | "success" | "warning" | "danger";

export interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    /** Visual variant. Default `"info"`. */
    variant?: BannerVariant;
    /** Optional leading icon. */
    icon?: ReactNode;
    /** Optional title displayed before description. */
    title?: ReactNode;
    /** Optional action button rendered on the right side. */
    action?: ReactNode;
    /** Show a dismiss button on the right. */
    dismissible?: boolean;
    /** Callback fired when the dismiss button is clicked. */
    onDismiss?: () => void;
    children?: ReactNode;
}

/**
 * Top-of-page persistent notice. Use for environment indicators
 * ("Você está em sandbox"), maintenance windows, account warnings.
 * Different from `Alert` (inline near a field) and `Toast` (transient).
 *
 * @example
 * <Banner variant="warning" dismissible onDismiss={() => setOpen(false)}>
 *     Sua assinatura expira em 3 dias.
 * </Banner>
 */
export function Banner({
    variant = "info",
    icon,
    title,
    action,
    dismissible = false,
    onDismiss,
    className,
    children,
    ...props
}: BannerProps) {
    const [open, setOpen] = useState(true);
    if (!open) return null;
    return (
        <div className={cn(styles.banner, styles[variant], className)} role="status" {...props}>
            {icon && <span className={styles.icon}>{icon}</span>}
            <div className={styles.body}>
                {title && <p className={styles.title}>{title}</p>}
                {children && <p className={styles.description}>{children}</p>}
            </div>
            {action && <div className={styles.action}>{action}</div>}
            {dismissible && (
                <button
                    type="button"
                    className={styles.close}
                    aria-label="Fechar"
                    onClick={() => {
                        setOpen(false);
                        onDismiss?.();
                    }}
                >
                    ×
                </button>
            )}
        </div>
    );
}
