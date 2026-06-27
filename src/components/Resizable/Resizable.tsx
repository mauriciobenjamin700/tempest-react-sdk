import { useCallback, useRef, useState } from "react";
import type { HTMLAttributes, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Resizable.module.css";

export type ResizableDirection = "horizontal" | "vertical";

export interface ResizableProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** Split orientation. `horizontal` (default) places panes side by side. */
    direction?: ResizableDirection;
    /** Initial size of the first pane, as a percentage. Defaults to `50`. */
    defaultSize?: number;
    /** Lower clamp for the first pane size, in percent. Defaults to `10`. */
    min?: number;
    /** Upper clamp for the first pane size, in percent. Defaults to `90`. */
    max?: number;
    /** Exactly two panes — `[paneA, paneB]`. */
    children: [ReactNode, ReactNode];
}

const KEY_STEP = 2;

/**
 * Clamp a number into the inclusive `[min, max]` range.
 *
 * @param value - The value to clamp.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns The clamped value.
 */
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * A two-pane split layout with a draggable divider. The first pane is sized via
 * `flex-basis` as a percentage; the second pane fills the rest. Drag the divider
 * with a pointer, or focus it and use the arrow keys to adjust by 2% steps.
 *
 * The size is clamped to `[min, max]` at all times.
 */
export function Resizable({
    direction = "horizontal",
    defaultSize = 50,
    min = 10,
    max = 90,
    children,
    className,
    ...props
}: ResizableProps) {
    const [size, setSize] = useState<number>(() => clamp(defaultSize, min, max));
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [paneA, paneB] = children;
    const isHorizontal = direction === "horizontal";

    const updateFromPointer = useCallback(
        (clientX: number, clientY: number): void => {
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const total = isHorizontal ? rect.width : rect.height;
            if (total <= 0) return;
            const offset = isHorizontal ? clientX - rect.left : clientY - rect.top;
            const percent = (offset / total) * 100;
            setSize(clamp(percent, min, max));
        },
        [isHorizontal, min, max],
    );

    const handlePointerDown = useCallback(
        (event: PointerEvent<HTMLDivElement>): void => {
            event.preventDefault();
            const divider = event.currentTarget;
            divider.setPointerCapture(event.pointerId);

            const handleMove = (moveEvent: globalThis.PointerEvent): void => {
                updateFromPointer(moveEvent.clientX, moveEvent.clientY);
            };
            const handleUp = (): void => {
                window.removeEventListener("pointermove", handleMove);
                window.removeEventListener("pointerup", handleUp);
            };

            window.addEventListener("pointermove", handleMove);
            window.addEventListener("pointerup", handleUp);
        },
        [updateFromPointer],
    );

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>): void => {
            let delta = 0;
            if (isHorizontal) {
                if (event.key === "ArrowRight") delta = KEY_STEP;
                else if (event.key === "ArrowLeft") delta = -KEY_STEP;
            } else {
                if (event.key === "ArrowDown") delta = KEY_STEP;
                else if (event.key === "ArrowUp") delta = -KEY_STEP;
            }
            if (event.key === "Home") {
                event.preventDefault();
                setSize(min);
                return;
            }
            if (event.key === "End") {
                event.preventDefault();
                setSize(max);
                return;
            }
            if (delta === 0) return;
            event.preventDefault();
            setSize((current) => clamp(current + delta, min, max));
        },
        [isHorizontal, min, max],
    );

    return (
        <div
            ref={containerRef}
            className={cn(
                styles.root,
                isHorizontal ? styles.horizontal : styles.vertical,
                className,
            )}
            {...props}
        >
            <div className={styles.pane} style={{ flexBasis: `${size}%` }}>
                {paneA}
            </div>
            <div
                role="separator"
                aria-orientation={isHorizontal ? "vertical" : "horizontal"}
                aria-valuenow={Math.round(size)}
                aria-valuemin={min}
                aria-valuemax={max}
                tabIndex={0}
                className={styles.divider}
                onPointerDown={handlePointerDown}
                onKeyDown={handleKeyDown}
            >
                <span className={styles.handle} aria-hidden="true" />
            </div>
            <div className={styles.pane} style={{ flexBasis: `${100 - size}%` }}>
                {paneB}
            </div>
        </div>
    );
}
