import type { HTMLAttributes } from "react";

import { cn } from "@/utils/cn";

import { areaPath, barRects, describeSeries, linePath, sparkPoints } from "./sparkline-geometry";
import styles from "./Sparkline.module.css";

export type SparklineVariant = "line" | "area" | "bar";

export interface SparklineProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
    /** The series, in order. Non-finite entries are skipped. */
    data: readonly number[];
    /** Drawing width in px. Default `88`. */
    width?: number;
    /** Drawing height in px. Default `24`. */
    height?: number;
    /** Which mark to draw. Default `"line"`. */
    variant?: SparklineVariant;
    /** Any CSS colour. Defaults to the first chart series token. */
    color?: string;
    /** Draw a dot on the last point. Default `true` for line and area. */
    showEnd?: boolean;
    /** Force the low end of the value axis — use it to compare several sparklines. */
    min?: number;
    /** Force the high end. */
    max?: number;
    /** Render a value; used in the accessible description. */
    valueFormatter?: (value: number) => string;
    /**
     * Accessible name. Defaults to a sentence describing the series.
     *
     * Pass one when the surrounding text already says what is plotted — the default
     * still appends the shape, so a caller never ends up with an unlabelled image.
     */
    label?: string;
}

/**
 * A tiny inline chart: shape only, no axes, no legend.
 *
 * Sized to sit in a table cell or beside a number, which is why it is plain SVG on
 * the root entry rather than a recharts wrapper — a sparkline in a data table should
 * not oblige an app to install a charting library.
 *
 * It carries `role="img"` and a spoken description of the series (direction, ends,
 * extremes). Without that it is an unlabelled image: a sparkline has no axis or
 * legend to fall back on, so a screen reader would reach it and read nothing. Pair it
 * with the number it annotates — the shape is context, never the only way to read the
 * value.
 *
 * @example
 * <Sparkline data={last30Days} />
 * <Sparkline data={revenue} variant="area" width={120} height={32} />
 *
 * // Same axis across a column, so the rows are comparable
 * <Sparkline data={row.series} min={0} max={columnMax} />
 */
export function Sparkline({
    data,
    width = 88,
    height = 24,
    variant = "line",
    color = "var(--tempest-chart-1)",
    showEnd,
    min,
    max,
    valueFormatter,
    label,
    className,
    ...rest
}: SparklineProps) {
    const points = sparkPoints({ values: data, width, height, min, max });
    const description = label ?? describeSeries(data, valueFormatter);
    const withEnd = showEnd ?? variant !== "bar";
    const last = points[points.length - 1];

    /*
     * Bars grow from the bottom of the box; line and area close against it. Both use
     * the same edge so a sparkline swapped between variants keeps its footprint.
     */
    const baselineY = height - 2;

    return (
        <span className={cn(styles.wrapper, className)} {...rest}>
            <svg
                className={styles.svg}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label={description}
            >
                {points.length > 0 && variant === "area" && (
                    <path d={areaPath(points, baselineY)} fill={color} className={styles.area} />
                )}

                {points.length > 0 && variant !== "bar" && (
                    <path
                        d={linePath(points)}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                )}

                {variant === "bar" &&
                    barRects(points, { width, baselineY }).map((rect) => (
                        <rect
                            key={rect.point.index}
                            x={rect.x}
                            y={rect.y}
                            width={rect.width}
                            height={rect.height}
                            rx={1}
                            fill={color}
                        />
                    ))}

                {withEnd && last && (
                    /*
                     * The ring is drawn in the surface colour rather than as a stroke on
                     * the dot: it keeps the marker legible where it sits on top of the
                     * line without adding ink that is not data.
                     */
                    <circle
                        cx={last.x}
                        cy={last.y}
                        r={3}
                        fill={color}
                        stroke="var(--tempest-bg)"
                        strokeWidth={2}
                    />
                )}
            </svg>
        </span>
    );
}
