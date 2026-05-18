import { useEffect } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";
import styles from "./BottomSheet.module.css";

export interface BottomSheetProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    /** Controlled open state. */
    open: boolean;
    /** Fires when user dismisses (backdrop click, Esc, swipe). */
    onClose: () => void;
    /** Optional title rendered at the top of the sheet. */
    title?: ReactNode;
    /** Show a drag handle indicator at the top. Default `true`. */
    showHandle?: boolean;
    /** When `true`, clicking the backdrop closes the sheet. Default `true`. */
    dismissOnBackdrop?: boolean;
    /** When `true`, pressing Esc closes the sheet. Default `true`. */
    dismissOnEsc?: boolean;
    children?: ReactNode;
}

/**
 * Slide-up modal panel — mobile-style sheet anchored to the bottom edge.
 * Uses portal + safe-area padding + scroll lock.
 *
 * @example
 * <BottomSheet open={open} onClose={() => setOpen(false)} title="Filters">
 *     <FilterForm />
 * </BottomSheet>
 */
export function BottomSheet({
    open,
    onClose,
    title,
    showHandle = true,
    dismissOnBackdrop = true,
    dismissOnEsc = true,
    className,
    children,
    ...props
}: BottomSheetProps) {
    useEffect(() => {
        if (!open || !dismissOnEsc) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, dismissOnEsc, onClose]);

    useEffect(() => {
        if (!open) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [open]);

    if (!open || typeof document === "undefined") return null;

    return createPortal(
        <div className={styles.root} role="dialog" aria-modal="true">
            <div
                className={styles.backdrop}
                onClick={() => dismissOnBackdrop && onClose()}
                aria-hidden="true"
            />
            <div className={cn(styles.sheet, className)} {...props}>
                {showHandle && (
                    <button
                        type="button"
                        className={styles.handle}
                        aria-label="Arrastar para fechar"
                        onClick={onClose}
                    >
                        <span className={styles.handleBar} />
                    </button>
                )}
                {title && <div className={styles.title}>{title}</div>}
                <div className={styles.body}>{children}</div>
            </div>
        </div>,
        document.body,
    );
}
