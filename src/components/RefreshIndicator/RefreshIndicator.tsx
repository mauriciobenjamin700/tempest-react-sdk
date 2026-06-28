import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { Spinner } from "@/components/Spinner";
import { cn } from "@/utils/cn";
import styles from "./RefreshIndicator.module.css";

export interface RefreshIndicatorProps {
    /** Invoked when the user pulls past `threshold` and releases. May be async. */
    onRefresh: () => void | Promise<void>;
    /** Scrollable content to wrap. */
    children: ReactNode;
    /** Pixels the user must pull past to trigger a refresh. Defaults to `80`. */
    threshold?: number;
    /** When true, pull-to-refresh is inert. */
    disabled?: boolean;
    className?: string;
}

/** Apply resistance so the content lags behind the finger and the pull never runs away. */
function applyResistance(distance: number, threshold: number): number {
    const cap = threshold * 1.5;
    return Math.min(distance / 2, cap);
}

/**
 * RefreshIndicator — pull-to-refresh wrapper for touch devices.
 *
 * Wraps scrollable `children` and listens for a downward drag that starts while the
 * container is scrolled to the top. Pulling past `threshold` and releasing triggers
 * `onRefresh`; the SDK {@link Spinner} is shown while pulling and during the refresh.
 */
export function RefreshIndicator({
    onRefresh,
    children,
    threshold = 80,
    disabled,
    className,
}: RefreshIndicatorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const startYRef = useRef<number | null>(null);
    const [pull, setPull] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    const engaged = startYRef.current !== null;

    const handleTouchStart = (event: TouchEvent<HTMLDivElement>): void => {
        if (disabled || refreshing) return;
        const container = containerRef.current;
        if (!container || container.scrollTop > 0) return;
        const touch = event.touches[0];
        if (!touch) return;
        startYRef.current = touch.clientY;
    };

    const handleTouchMove = (event: TouchEvent<HTMLDivElement>): void => {
        if (disabled || refreshing) return;
        const startY = startYRef.current;
        if (startY === null) return;
        const touch = event.touches[0];
        if (!touch) return;
        const delta = touch.clientY - startY;
        if (delta <= 0) {
            setPull(0);
            return;
        }
        setPull(applyResistance(delta, threshold));
    };

    const reset = (): void => {
        startYRef.current = null;
        setPull(0);
    };

    const handleTouchEnd = async (): Promise<void> => {
        if (disabled || refreshing) {
            reset();
            return;
        }
        const startY = startYRef.current;
        const triggered = startY !== null && pull >= threshold;
        if (!triggered) {
            reset();
            return;
        }
        startYRef.current = null;
        setRefreshing(true);
        setPull(threshold);
        try {
            await onRefresh();
        } finally {
            setRefreshing(false);
            setPull(0);
        }
    };

    const showIndicator = refreshing || pull > 0;
    const progress = Math.min(1, pull / threshold);

    return (
        <div
            ref={containerRef}
            className={cn(styles.wrapper, className)}
            data-refreshing={refreshing}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className={styles.indicator}
                aria-hidden={!showIndicator}
                style={{
                    opacity: refreshing ? 1 : progress,
                    transform: `translateX(-50%) translateY(${showIndicator ? pull : 0}px) rotate(${progress * 360}deg)`,
                }}
            >
                <Spinner size="sm" label="Atualizando" />
            </div>
            <div
                className={cn(styles.content, (engaged || refreshing) && styles.dragging)}
                style={{ transform: `translateY(${showIndicator ? pull : 0}px)` }}
            >
                {children}
            </div>
        </div>
    );
}
