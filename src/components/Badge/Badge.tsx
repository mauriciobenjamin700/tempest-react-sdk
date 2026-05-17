import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import styles from "./Badge.module.css";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
}

/** Pill-shaped status badge with semantic color variants. */
export function Badge({ variant = "neutral", className, children, ...props }: BadgeProps) {
    return (
        <span className={cn(styles.badge, styles[variant], className)} {...props}>
            {children}
        </span>
    );
}
