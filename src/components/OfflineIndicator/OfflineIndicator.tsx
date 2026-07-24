import { useEffect, useRef, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { CloudOff, Wifi } from "lucide-react";
import { cn } from "@/utils/cn";
import { useOnline } from "@/hooks";
import styles from "./OfflineIndicator.module.css";

export type OfflineIndicatorPosition = "top" | "bottom";

export interface OfflineIndicatorProps extends HTMLAttributes<HTMLDivElement> {
    /** Where to pin the fixed bar. Default `"bottom"`. */
    position?: OfflineIndicatorPosition;
    /** Message shown while offline. */
    offlineLabel?: ReactNode;
    /** Message flashed briefly when connectivity returns. */
    onlineLabel?: ReactNode;
    /**
     * How long (ms) to keep the "back online" flash visible. `0` hides it
     * entirely. Default `3000`.
     */
    onlineFlashMs?: number;
    /** Override the offline body entirely (icon + label ignored). */
    children?: ReactNode;
}

/**
 * Fixed bar that appears while the browser is offline and, by default, flashes
 * a brief confirmation when the connection returns. Backed by {@link useOnline}
 * — no props needed for the common case.
 *
 * Renders nothing while online (after any flash has elapsed), so it is safe to
 * mount unconditionally at the app root.
 *
 * @example
 * <OfflineIndicator position="top" />
 */
export function OfflineIndicator({
    position = "bottom",
    offlineLabel = "Você está offline. As alterações serão sincronizadas ao reconectar.",
    onlineLabel = "Conexão restabelecida.",
    onlineFlashMs = 3000,
    className,
    children,
    ...props
}: OfflineIndicatorProps) {
    const online = useOnline();
    const [flashOnline, setFlashOnline] = useState<boolean>(false);
    const wasOfflineRef = useRef<boolean>(false);

    useEffect(() => {
        if (!online) {
            wasOfflineRef.current = true;
            setFlashOnline(false);
            return;
        }
        if (!wasOfflineRef.current || onlineFlashMs <= 0) return;
        wasOfflineRef.current = false;
        setFlashOnline(true);
        const id = window.setTimeout(() => setFlashOnline(false), onlineFlashMs);
        return () => window.clearTimeout(id);
    }, [online, onlineFlashMs]);

    if (online && !flashOnline) return null;

    const showingOnline = online && flashOnline;
    return (
        <div
            className={cn(
                styles.bar,
                styles[position],
                showingOnline ? styles.online : styles.offline,
                className,
            )}
            role="status"
            aria-live="polite"
            {...props}
        >
            {children ?? (
                <>
                    {showingOnline ? (
                        <Wifi className={styles.icon} size={16} aria-hidden="true" />
                    ) : (
                        <CloudOff className={styles.icon} size={16} aria-hidden="true" />
                    )}
                    <span>{showingOnline ? onlineLabel : offlineLabel}</span>
                </>
            )}
        </div>
    );
}
