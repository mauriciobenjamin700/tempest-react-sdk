import { useEffect, useId } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";
import styles from "./Modal.module.css";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: ReactNode;
    children?: ReactNode;
    footer?: ReactNode;
    size?: ModalSize;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
    className?: string;
    hideCloseButton?: boolean;
    /** Force fullscreen at all breakpoints. */
    fullscreen?: boolean;
    /** Auto-fullscreen on mobile viewports (< 640px). Default `false`. */
    fullscreenOnMobile?: boolean;
    /**
     * Accessible name for the dialog. Only needed when there is no `title` —
     * with a `title` the dialog is named by it through `aria-labelledby`.
     */
    "aria-label"?: string;
}

/**
 * Portal-rendered modal dialog with backdrop, Esc handler, and slots for
 * header/body/footer. Locks body scroll while open.
 *
 * The `dialog` role needs an accessible name: a `title` supplies it via
 * `aria-labelledby`, and a titleless dialog should pass `aria-label`. The
 * header heading is only rendered when there is a title, so a close-button-only
 * header does not leave an empty `h3` behind.
 */
export function Modal({
    open,
    onClose,
    title,
    children,
    footer,
    size = "md",
    closeOnBackdrop = true,
    closeOnEsc = true,
    className,
    hideCloseButton = false,
    fullscreen = false,
    fullscreenOnMobile = false,
    "aria-label": ariaLabel,
}: ModalProps) {
    const titleId = useId();
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
        <div
            className={styles.overlay}
            role="presentation"
            onClick={() => {
                if (closeOnBackdrop) onClose();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                aria-label={title ? undefined : ariaLabel}
                className={cn(
                    styles.dialog,
                    sizeClassName(size),
                    fullscreen && styles.fullscreen,
                    fullscreenOnMobile && styles.fullscreenOnMobile,
                    className,
                )}
                onClick={(event) => event.stopPropagation()}
            >
                {(title || !hideCloseButton) && (
                    <header className={styles.header}>
                        {title && (
                            <h3 id={titleId} className={styles.title}>
                                {title}
                            </h3>
                        )}
                        {!hideCloseButton && (
                            <button
                                type="button"
                                className={styles.close}
                                aria-label="Fechar"
                                onClick={onClose}
                            >
                                <CloseIcon />
                            </button>
                        )}
                    </header>
                )}
                <div className={styles.body}>{children}</div>
                {footer && <footer className={styles.footer}>{footer}</footer>}
            </div>
        </div>,
        document.body,
    );
}

function sizeClassName(size: ModalSize): string | undefined {
    if (size === "2xl") return styles.size2xl;
    if (size === "3xl") return styles.size3xl;
    return styles[size];
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
