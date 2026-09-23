/**
 * @tempest-limits props-count, function-lines — placement plus mobilePlacement is
 * the whole point — a drawer that comes from the side on desktop and from the bottom
 * on a phone — and the rest is the dialog contract the SDK's Modal also has (open,
 * onClose, title, children, footer, closeOnBackdrop, closeOnEsc, hideCloseButton)
 * plus showHandle for the sheet affordance.
 */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscapeLayer } from "@/components/Portal/escape-layer";
import { cn } from "@/utils/cn";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import styles from "./Drawer.module.css";
import { usePortalHost } from "../Portal/portal-host";

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
    /**
     * Auto-switch to bottom-sheet placement on mobile viewports (< md).
     * Modern mobile apps default to bottom drawers; on desktop the original
     * `placement` is preserved.
     */
    mobilePlacement?: DrawerPlacement;
    /** Render a drag handle indicator at the leading edge (bottom-sheet style). */
    showHandle?: boolean;
}

/**
 * Sliding side panel. Same building blocks as {@link Modal} but anchored to
 * an edge. Locks body scroll while open, and traps keyboard focus in the panel
 * the same way `Modal` does: focus enters on open, `Tab` cycles inside (portalled
 * panels opened from it included) and returns to the opener on close.
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
    mobilePlacement,
    showHandle = false,
}: DrawerProps) {
    const { isMobile } = useBreakpoint();
    const effectivePlacement: DrawerPlacement =
        isMobile && mobilePlacement ? mobilePlacement : placement;

    const panelRef = useRef<HTMLElement>(null);
    useFocusTrap(panelRef, open);
    useEscapeLayer(open, closeOnEsc ? onClose : null);
    useEffect(() => {
        if (!open) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open, closeOnEsc, onClose]);

    const portalHost = usePortalHost();

    if (!open || !portalHost) return null;

    return createPortal(
        <>
            <div
                className={styles.overlay}
                onClick={() => {
                    if (closeOnBackdrop) onClose();
                }}
            />
            <aside
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                tabIndex={-1}
                className={cn(styles.panel, styles[effectivePlacement], className)}
            >
                {showHandle &&
                    (effectivePlacement === "bottom" || effectivePlacement === "top") && (
                        <div
                            className={cn(
                                styles.handle,
                                effectivePlacement === "top" && styles.handleTop,
                            )}
                            aria-hidden
                        />
                    )}
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
        portalHost,
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
