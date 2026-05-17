import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";
import styles from "./Drawer.module.css";

export type DrawerPlacement = "right" | "left" | "top" | "bottom";

export interface DrawerProps {
    open: boolean;
    onClose: () => void;
    placement?: DrawerPlacement;
    title?: ReactNode;
    children?: ReactNode;
    footer?: ReactNode;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
    hideCloseButton?: boolean;
    className?: string;
}

/**
 * Sliding side panel. Same building blocks as {@link Modal} but anchored to
 * an edge. Locks body scroll while open.
 */
export function Drawer({
    open,
    onClose,
    placement = "right",
    title,
    children,
    footer,
    closeOnBackdrop = true,
    closeOnEsc = true,
    hideCloseButton = false,
    className,
}: DrawerProps) {
    useEffect(() => {
        if (!open) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const handleKey = (event: KeyboardEvent): void => {
            if (closeOnEsc && event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKey);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKey);
        };
    }, [open, closeOnEsc, onClose]);

    if (!open || typeof document === "undefined") return null;

    return createPortal(
        <>
            <div
                className={styles.overlay}
                onClick={() => {
                    if (closeOnBackdrop) onClose();
                }}
            />
            <aside
                role="dialog"
                aria-modal="true"
                className={cn(styles.panel, styles[placement], className)}
            >
                {(title || !hideCloseButton) && (
                    <header className={styles.header}>
                        <h3 className={styles.title}>{title}</h3>
                        {!hideCloseButton && (
                            <button
                                type="button"
                                aria-label="Fechar"
                                className={styles.close}
                                onClick={onClose}
                            >
                                <CloseIcon />
                            </button>
                        )}
                    </header>
                )}
                <div className={styles.body}>{children}</div>
                {footer && <footer className={styles.footer}>{footer}</footer>}
            </aside>
        </>,
        document.body,
    );
}

function CloseIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
                d="M6 6l12 12M6 18L18 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}
