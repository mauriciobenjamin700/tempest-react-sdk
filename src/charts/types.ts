/**
 * @tempest-limits props-count — these are the recharts wrapper's surface, and each
 * prop maps to one recharts element the wrapper renders: data/index/categories to
 * the series, colors to Cell, showLegend/showGrid/showTooltip to
 * Legend/CartesianGrid/Tooltip, valueFormatter to the tick and tooltip formatters,
 * labels to each series' `name`, yAxisWidth/yAxisFormatter to the YAxis.
 * Cutting the list means the caller drops to raw recharts for whatever was cut,
 * which is the thing the wrapper exists to avoid.
 */
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
    /**
     * Display name per series, keyed by the entry in `categories`.
     *
     * The legend and the tooltip show this text; the data keeps its own keys. A
     * translated screen passes `labels={{ done: t("series.done") }}` and leaves
     * the rows as the API sent them, instead of rebuilding every row with the
     * translated sentence as its key. A category with no entry shows its key.
     */
    labels?: Record<string, string>;
    /** Extra class name applied to the chart wrapper. */
    className?: string;
}

/**
 * Props for the value axis of the cartesian charts (Area, Bar, Line).
 */
export interface ValueAxisProps {
    /**
     * Width of the value (Y) axis, in pixels, or `"auto"` to fit the widest tick
     * label. Default `"auto"`.
     *
     * recharts reserves a fixed 60 px by default, and a formatted value wider than
     * that is clipped at the chart's left edge: `"R$ 50.000"` lost its first 10 px
     * at every viewport width (#740, measured in Chromium). `"auto"` measures the
     * rendered ticks and grows the axis to fit them. Pass a number to pin the
     * width, for example to line up the plot areas of charts stacked one above the
     * other.
     */
    yAxisWidth?: number | "auto";
    /**
     * Format the value-axis tick labels only. Defaults to `valueFormatter`.
     *
     * The axis and the tooltip compete for different things: the tooltip has room
     * for `R$ 186.430,00`, the axis on a phone does not. Pass a compact formatter
     * here and keep the exact one in `valueFormatter` for the tooltip.
     */
    yAxisFormatter?: (value: number) => string;
}

/**
 * Props for the cartesian charts — {@link CartesianChartProps} plus the value
 * axis settings.
 */
export type CartesianAxisChartProps = CartesianChartProps & ValueAxisProps;

/**
 * Display name of one series: its entry in `labels`, or the key itself.
 *
 * @param labels - The `labels` prop, if any.
 * @param category - The series' data key.
 * @returns The text the legend and the tooltip show for the series.
 */
export function seriesName(labels: Record<string, string> | undefined, category: string): string {
    return labels?.[category] ?? category;
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
