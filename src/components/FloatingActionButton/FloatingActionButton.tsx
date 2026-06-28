import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./FloatingActionButton.module.css";

export type FloatingActionButtonPosition = "bottom-right" | "bottom-left" | "none";
export type FloatingActionButtonSize = "sm" | "md" | "lg";
export type FloatingActionButtonVariant = "primary" | "surface";

export interface FloatingActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Icon rendered inside the FAB. Required. */
    icon: ReactNode;
    /** When present, renders an extended (pill) FAB with icon + label. */
    label?: ReactNode;
    /** Corner placement, or `"none"` for static/inline. Default `"bottom-right"`. */
    position?: FloatingActionButtonPosition;
    /** Size token. Default `"md"`. */
    size?: FloatingActionButtonSize;
    /** Visual style. Default `"primary"`. */
    variant?: FloatingActionButtonVariant;
    /** Extra class names merged onto the root. */
    className?: string;
}

/**
 * Material Floating Action Button. Renders a round FAB when only an `icon` is
 * given, or an extended pill FAB when a `label` is also provided. By default it
 * is fixed to the bottom-right corner; set `position="none"` to place it inline.
 *
 * Spreads all native `<button>` props (`onClick`, `disabled`, etc.).
 *
 * @remarks
 * Always pass an `aria-label` when there is no `label`, since an icon-only FAB
 * has no accessible name otherwise.
 *
 * @example
 * <FloatingActionButton icon={<Plus />} aria-label="Adicionar" onClick={create} />
 *
 * @example
 * <FloatingActionButton icon={<Plus />} label="Novo" onClick={create} />
 */
export function FloatingActionButton({
    icon,
    label,
    position = "bottom-right",
    size = "md",
    variant = "primary",
    className,
    ...props
}: FloatingActionButtonProps) {
    const extended = label !== undefined;
    return (
        <button
            type="button"
            className={cn(
                styles.fab,
                styles[size],
                styles[variant],
                extended ? styles.extended : styles.round,
                position !== "none" && styles.fixed,
                position === "bottom-right" && styles.bottomRight,
                position === "bottom-left" && styles.bottomLeft,
                className,
            )}
            {...props}
        >
            <span className={styles.icon}>{icon}</span>
            {extended && <span className={styles.label}>{label}</span>}
        </button>
    );
}
