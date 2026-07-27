import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type HTMLAttributes,
    type ReactNode,
} from "react";

import { cn } from "@/utils/cn";

import { columnsFor, distribute } from "./masonry-layout";
import styles from "./Masonry.module.css";

/** DOM attributes this component redefines. */
type OverriddenDomProps = "children";

export interface MasonryProps<T> extends Omit<HTMLAttributes<HTMLDivElement>, OverriddenDomProps> {
    /** What to lay out. */
    items: readonly T[];
    /** Render one card. */
    children: (item: T, index: number) => ReactNode;
    /** Stable key per item. Index is a fallback nobody should rely on. */
    itemKey?: (item: T, index: number) => string | number;
    /**
     * Column count: a fixed number, or a `width → columns` map read as
     * "from this width up". Default `{ 0: 1, 640: 2, 1024: 3 }`.
     */
    columns?: number | Record<number, number>;
    /** Gap between cards, any CSS length. Default `var(--tempest-space-4)`. */
    gap?: string;
}

/** Default breakpoints: one column on a phone, three on a desktop. */
const DEFAULT_COLUMNS: Record<number, number> = { 0: 1, 640: 2, 1024: 3 };

/**
 * Masonry layout: cards of uneven height packed into columns with an even bottom
 * edge.
 *
 * Measures the rendered cards and deals each one into the shortest column, rather
 * than using CSS `columns` or `grid-auto-flow: dense`. Both of those are one line
 * of CSS and neither does this job: CSS `columns` breaks a card across the column
 * boundary, and a dense grid keeps every row the height of its tallest cell, which
 * is the ragged bottom edge people reach for masonry to avoid.
 *
 * @example
 * <Masonry items={fotos} itemKey={(foto) => foto.id} columns={{ 0: 1, 700: 2, 1100: 4 }}>
 *     {(foto) => <img src={foto.url} alt={foto.alt} />}
 * </Masonry>
 */
export function Masonry<T>({
    items,
    children,
    itemKey,
    columns = DEFAULT_COLUMNS,
    gap,
    className,
    style,
    ...rest
}: MasonryProps<T>) {
    const wrapper = useRef<HTMLDivElement | null>(null);
    const cells = useRef<Map<number, HTMLElement>>(new Map());
    const [width, setWidth] = useState(0);
    const [heights, setHeights] = useState<number[]>([]);

    const columnCount = columnsFor(width, columns);

    /**
     * Track the container width, not the viewport.
     *
     * A masonry inside a drawer or a two-column page is narrower than the window,
     * and a media query would give it desktop columns at 300px wide. `ResizeObserver`
     * is what makes the breakpoint map mean "this container", which is the only
     * useful reading.
     */
    useEffect(() => {
        const node = wrapper.current;
        if (!node || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(([entry]) => {
            setWidth(entry.contentRect.width);
        });
        observer.observe(node);
        setWidth(node.getBoundingClientRect().width);
        return () => observer.disconnect();
    }, []);

    /**
     * Re-read every card's height, and store it only when something moved.
     *
     * The equality check is what stops the loop: writing a new array on every pass
     * would re-render, re-measure and write again. The first render lays out in
     * source order with weight 1 each — never blank — and this pass re-deals with
     * real numbers.
     */
    const measure = useCallback(() => {
        const next = items.map((_, index) => {
            const node = cells.current.get(index);
            return node ? node.getBoundingClientRect().height : 1;
        });
        setHeights((current) =>
            current.length === next.length && current.every((value, i) => value === next[i])
                ? current
                : next,
        );
    }, [items]);

    useLayoutEffect(measure, [measure, columnCount, width]);

    /**
     * Re-measure when a card changes size on its own — an image finishing its
     * download is the common one, and it is exactly the case a height measured at
     * mount gets wrong.
     */
    useEffect(() => {
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        for (const node of cells.current.values()) observer.observe(node);
        return () => observer.disconnect();
    }, [measure, columnCount]);

    const layout = useMemo(
        () =>
            distribute(
                items.map((_, index) => heights[index] ?? 1),
                columnCount,
            ),
        [items, heights, columnCount],
    );

    return (
        <div
            ref={wrapper}
            className={cn(styles.wrapper, className)}
            style={{ ...style, ...(gap ? { "--tempest-masonry-gap": gap } : {}) }}
            {...rest}
        >
            {layout.map((columnItems, column) => (
                <div key={column} className={styles.column}>
                    {columnItems.map((index) => {
                        const item = items[index];
                        return (
                            <div
                                key={itemKey ? itemKey(item, index) : index}
                                className={styles.item}
                                ref={(node) => {
                                    if (node) cells.current.set(index, node);
                                    else cells.current.delete(index);
                                }}
                            >
                                {children(item, index)}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
