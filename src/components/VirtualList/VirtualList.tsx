import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./VirtualList.module.css";

export interface VirtualListProps<T> {
    items: T[];
    /** Fixed pixel height for each row. */
    itemHeight: number;
    /** Render a single row. */
    renderItem: (item: T, index: number) => ReactNode;
    /** Container height (px) or any CSS length. */
    height: number | string;
    /** Number of items rendered above/below the viewport. Default: 4. */
    overscan?: number;
    /** Stable key derivation; defaults to the index. */
    getKey?: (item: T, index: number) => string | number;
    className?: string;
    style?: CSSProperties;
    /**
     * Accessible name for the list. Worth setting when the list scrolls: it
     * then carries a tab stop of its own, and a focus stop that announces
     * nothing is worse than no focus stop.
     */
    label?: string;
}

/**
 * Fixed-height virtual list. Renders only the visible window plus a small
 * overscan buffer. Suitable for lists of thousands of identical rows.
 *
 * For variable heights, use `react-window`/`@tanstack/react-virtual` — those
 * solve a more general problem at the cost of extra setup.
 */
export function VirtualList<T>({
    items,
    itemHeight,
    renderItem,
    height,
    overscan = 4,
    getKey,
    className,
    style,
    label,
}: VirtualListProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState<number>(0);
    const [viewport, setViewport] = useState<number>(0);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        setViewport(element.clientHeight);
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => setViewport(element.clientHeight));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const totalHeight = items.length * itemHeight;
    /*
     * Rows are absolutely positioned inside the spacer, so nothing in a
     * virtual list is focusable by default: a keyboard user can see the
     * scrollbar and has no way to move it. The tab stop only appears while
     * there is something past the fold — measured from the numbers already at
     * hand rather than from the DOM.
     */
    const scrollable = viewport > 0 && totalHeight - viewport > 1;
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(viewport / itemHeight) + overscan * 2;
    const end = Math.min(items.length, start + visibleCount);

    return (
        <div
            ref={containerRef}
            className={cn(styles.scroll, className)}
            style={{ height, ...style }}
            onScroll={(event) => setScrollTop((event.target as HTMLDivElement).scrollTop)}
            role="list"
            aria-label={label}
            tabIndex={scrollable ? 0 : undefined}
        >
            <div className={styles.spacer} style={{ height: totalHeight }}>
                {items.slice(start, end).map((item, offset) => {
                    const index = start + offset;
                    const key = getKey ? getKey(item, index) : index;
                    return (
                        <div
                            key={key}
                            role="listitem"
                            className={styles.row}
                            style={{ top: index * itemHeight, height: itemHeight }}
                        >
                            {renderItem(item, index)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
