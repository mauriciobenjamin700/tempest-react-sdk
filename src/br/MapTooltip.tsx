import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./BrazilMap.module.css";

export interface MapTooltipProps {
    /** X position in pixels, relative to the map container. */
    x: number;
    /** Y position in pixels, relative to the map container. */
    y: number;
    /** Tooltip body. */
    children: ReactNode;
    className?: string;
}

/**
 * Floating tooltip anchored near the cursor over a map. Positioned absolutely
 * inside the map container (which is `position: relative`) and non-interactive
 * so it never steals hover from the shapes beneath it.
 */
export function MapTooltip({ x, y, children, className }: MapTooltipProps) {
    return (
        <div
            className={cn(styles.tooltip, className)}
            style={{ left: x, top: y }}
            data-testid="map-tooltip"
            aria-hidden
        >
            {children}
        </div>
    );
}
