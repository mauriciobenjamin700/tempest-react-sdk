/**
 * Tabular data consumed by every chart: an array of rows, where each row maps a
 * column key to a string (label) or number (value).
 */
export type ChartData = Array<Record<string, string | number>>;

import type {
    Formatter,
    NameType,
    ValueType,
} from "recharts/types/component/DefaultTooltipContent";

/**
 * Recharts tooltip formatters receive a loosely-typed value. This adapts a
 * friendly `(value: number) => string` formatter into a recharts `Formatter`,
 * coercing the incoming value to a number first.
 *
 * @param valueFormatter - The user-supplied numeric formatter, if any.
 * @returns A recharts-compatible formatter, or undefined when none was given.
 */
export function toTooltipFormatter(
    valueFormatter?: (value: number) => string,
): Formatter<ValueType, NameType> | undefined {
    if (!valueFormatter) return undefined;
    return (value: ValueType | undefined): string => valueFormatter(Number(value));
}

/**
 * Shared props for the cartesian chart family (Area, Bar, Line) and Radar.
 *
 * Each chart plots one series per entry in `categories`, reading values from the
 * matching key on every row, and uses `index` for the category axis.
 */
export interface CartesianChartProps {
    /** Rows of data to plot. */
    data: ChartData;
    /** Row key used for the x-axis (cartesian) or angle axis (radar). */
    index: string;
    /** Row keys to plot, one series each. */
    categories: string[];
    /** Series colors, cycled per category. Defaults to {@link DEFAULT_CHART_COLORS}. */
    colors?: string[];
    /** Chart height in pixels. Defaults to 300. */
    height?: number;
    /**
     * Fixed chart width in pixels. When set, the chart renders at this explicit
     * width WITHOUT a ResponsiveContainer (useful for tests/SSR). When omitted,
     * the chart fills its parent via a ResponsiveContainer.
     */
    width?: number;
    /** Stack all series on a shared stackId instead of grouping them. */
    stack?: boolean;
    /** Render the legend. Defaults to true. */
    showLegend?: boolean;
    /** Render the cartesian grid. Defaults to true. */
    showGrid?: boolean;
    /** Render the tooltip. Defaults to true. */
    showTooltip?: boolean;
    /** Format numeric values for tooltip/axis display. */
    valueFormatter?: (value: number) => string;
    /** Extra class name applied to the chart wrapper. */
    className?: string;
}

/**
 * Props for the {@link PieChart} component.
 */
export interface PieChartProps {
    /** Rows of data to plot, one slice each. */
    data: ChartData;
    /** Row key holding the numeric slice value. */
    category: string;
    /** Row key holding the slice name/label. */
    index: string;
    /** Slice colors, cycled per slice. Defaults to {@link DEFAULT_CHART_COLORS}. */
    colors?: string[];
    /** Chart height in pixels. Defaults to 300. */
    height?: number;
    /**
     * Fixed chart width in pixels. When set, the chart renders at this explicit
     * width WITHOUT a ResponsiveContainer (useful for tests/SSR).
     */
    width?: number;
    /** Render as a donut (non-zero inner radius) instead of a full pie. */
    donut?: boolean;
    /** Render the legend. Defaults to true. */
    showLegend?: boolean;
    /** Render the tooltip. Defaults to true. */
    showTooltip?: boolean;
    /** Format numeric values for tooltip display. */
    valueFormatter?: (value: number) => string;
    /** Extra class name applied to the chart wrapper. */
    className?: string;
}
