import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Layout.module.css";

export type ContainerSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
    size?: ContainerSize;
}

/** Page-level horizontal container with a max-width preset and side padding. */
export function Container({ size = "lg", className, children, ...props }: ContainerProps) {
    return (
        <div className={cn(styles.container, styles[size], className)} {...props}>
            {children}
        </div>
    );
}

export type StackAlign = "start" | "center" | "end" | "stretch";
export type StackJustify = "start" | "center" | "end" | "between";

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
    /** Direction. Default `vertical`. */
    direction?: "vertical" | "horizontal";
    /** Gap as a CSS length. Numbers map to a multiple of the 4px scale. */
    gap?: number | string;
    align?: StackAlign;
    justify?: StackJustify;
    wrap?: boolean;
    children?: ReactNode;
}

/** Flex-based vertical or horizontal stack with a numeric `gap`. */
export function Stack({
    direction = "vertical",
    gap = 2,
    align,
    justify,
    wrap = false,
    className,
    style,
    children,
    ...props
}: StackProps) {
    const finalGap = typeof gap === "number" ? `${gap * 4}px` : gap;
    const finalStyle: CSSProperties = { gap: finalGap, ...style };
    const justifyClass =
        justify === "between"
            ? styles.justifyBetween
            : justify === "center"
              ? styles.justifyCenter
              : justify === "end"
                ? styles.justifyEnd
                : justify === "start"
                  ? styles.justifyStart
                  : undefined;
    return (
        <div
            className={cn(
                styles.stack,
                direction === "vertical" ? styles.vertical : styles.horizontal,
                align && styles[align],
                justifyClass,
                wrap && styles.wrap,
                className,
            )}
            style={finalStyle}
            {...props}
        >
            {children}
        </div>
    );
}

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
    /** Number of columns or a custom `grid-template-columns` value. */
    columns?: number | string;
    /** Gap as a CSS length. Numbers map to a multiple of the 4px scale. */
    gap?: number | string;
    children?: ReactNode;
}

/** Simple CSS-Grid wrapper for equal-width or custom column layouts. */
export function Grid({ columns = 2, gap = 4, className, style, children, ...props }: GridProps) {
    const templateColumns =
        typeof columns === "number" ? `repeat(${columns}, minmax(0, 1fr))` : columns;
    const finalGap = typeof gap === "number" ? `${gap * 4}px` : gap;
    return (
        <div
            className={cn(styles.grid, className)}
            style={{ gridTemplateColumns: templateColumns, gap: finalGap, ...style }}
            {...props}
        >
            {children}
        </div>
    );
}
