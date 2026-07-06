import { useCallback, useState, type MouseEvent, type RefObject } from "react";

/** The currently hovered item plus cursor position within the map container. */
export interface MapHover<T> {
    item: T;
    x: number;
    y: number;
}

/**
 * Track which shape the cursor is over and where, for a floating map tooltip.
 * Positions are computed relative to `containerRef` so the tooltip can be
 * placed with plain `left`/`top` inside the (relatively positioned) container.
 */
export function useMapHover<T>(containerRef: RefObject<HTMLDivElement | null>): {
    hover: MapHover<T> | null;
    onMove: (item: T, event: MouseEvent) => void;
    onLeave: () => void;
} {
    const [hover, setHover] = useState<MapHover<T> | null>(null);

    const onMove = useCallback(
        (item: T, event: MouseEvent): void => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            setHover({ item, x: event.clientX - rect.left, y: event.clientY - rect.top });
        },
        [containerRef],
    );

    const onLeave = useCallback((): void => setHover(null), []);

    return { hover, onMove, onLeave };
}
