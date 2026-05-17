import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import styles from "./Layout.module.css";

export type ContainerSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
    size?: ContainerSize;
}

/**
 * Page-level horizontal container with a max-width preset and responsive
 * side padding (`space-4` mobile / `space-6` tablet / `space-8` desktop).
 */
export function Container({ size = "lg", className, children, ...props }: ContainerProps) {
    return (
        <div className={cn(styles.container, styles[size], className)} {...props}>
            {children}
        </div>
    );
}

/**
 * Responsive value — either a single value applied at all breakpoints, or
 * an object with `mobile` / `tablet` / `desktop` overrides. Apps can mix
 * any combination; `mobile` is the base, `tablet` / `desktop` cascade up.
 */
export type ResponsiveValue<T> =
    | T
    | {
          mobile?: T;
          tablet?: T;
          desktop?: T;
      };

function isResponsiveObject<T>(value: ResponsiveValue<T>): value is {
    mobile?: T;
    tablet?: T;
    desktop?: T;
} {
    return (
        typeof value === "object" &&
        value !== null &&
        ("mobile" in value || "tablet" in value || "desktop" in value)
    );
}

function pickResponsive<T>(
    value: ResponsiveValue<T> | undefined,
    device: "mobile" | "tablet" | "desktop",
): T | undefined {
    if (value === undefined) return undefined;
    if (!isResponsiveObject(value)) return value;
    if (device === "desktop") return value.desktop ?? value.tablet ?? value.mobile;
    if (device === "tablet") return value.tablet ?? value.mobile ?? value.desktop;
    return value.mobile ?? value.tablet ?? value.desktop;
}

export type StackAlign = "start" | "center" | "end" | "stretch";
export type StackJustify = "start" | "center" | "end" | "between";
export type StackDirection = "vertical" | "horizontal";

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
    /** Direction. Accepts responsive object — e.g. `{ mobile: "vertical", desktop: "horizontal" }`. */
    direction?: ResponsiveValue<StackDirection>;
    /** Gap as a CSS length. Numbers map to a multiple of the 4px scale. Accepts responsive object. */
    gap?: ResponsiveValue<number | string>;
    align?: StackAlign;
    justify?: StackJustify;
    wrap?: boolean;
    children?: ReactNode;
}

function resolveGap(gap: number | string | undefined): string | undefined {
    if (gap === undefined) return undefined;
    return typeof gap === "number" ? `${gap * 4}px` : gap;
}

function deviceFromBreakpoint(
    isMobile: boolean,
    isTablet: boolean,
): "mobile" | "tablet" | "desktop" {
    if (isMobile) return "mobile";
    if (isTablet) return "tablet";
    return "desktop";
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
    const { isMobile, isTablet } = useBreakpoint();
    const device = deviceFromBreakpoint(isMobile, isTablet);
    const finalDirection: StackDirection = pickResponsive(direction, device) ?? "vertical";
    const finalGap = resolveGap(pickResponsive(gap, device));
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
                finalDirection === "vertical" ? styles.vertical : styles.horizontal,
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
    /** Number of columns or a custom `grid-template-columns` value. Accepts responsive object. */
    columns?: ResponsiveValue<number | string>;
    /** Gap as a CSS length. Numbers map to a multiple of the 4px scale. Accepts responsive object. */
    gap?: ResponsiveValue<number | string>;
    children?: ReactNode;
}

function resolveColumns(columns: number | string | undefined): string | undefined {
    if (columns === undefined) return undefined;
    return typeof columns === "number" ? `repeat(${columns}, minmax(0, 1fr))` : columns;
}

/** Simple CSS-Grid wrapper for equal-width or custom column layouts. */
export function Grid({ columns = 2, gap = 4, className, style, children, ...props }: GridProps) {
    const { isMobile, isTablet } = useBreakpoint();
    const device = deviceFromBreakpoint(isMobile, isTablet);
    const templateColumns = resolveColumns(pickResponsive(columns, device));
    const finalGap = resolveGap(pickResponsive(gap, device));
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
