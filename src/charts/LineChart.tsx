import {
    CartesianGrid,
    Legend,
    Line,
    LineChart as RLineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { cn } from "@/utils/cn";
import { DEFAULT_CHART_COLORS } from "./palette";
import { toTooltipFormatter } from "./types";
import type { CartesianChartProps } from "./types";

/**
 * LineChart — themed wrapper over recharts `LineChart`.
 *
 * Plots one line per entry in `categories`, colored from `colors` (cycling
 * {@link DEFAULT_CHART_COLORS} by default). `stack` is accepted for API parity
 * but does not visually stack lines. When `width` is provided the chart renders
 * at that fixed size without a ResponsiveContainer; otherwise it fills its
 * parent.
 */
export function LineChart({
    data,
    index,
    categories,
    colors = DEFAULT_CHART_COLORS,
    height = 300,
    width,
    showLegend = true,
    showGrid = true,
    showTooltip = true,
    valueFormatter,
    className,
}: CartesianChartProps) {
    const chart = (
        <RLineChart data={data} width={width} height={height}>
            {showGrid ? <CartesianGrid strokeDasharray="3 3" /> : null}
            <XAxis dataKey={index} />
            <YAxis tickFormatter={valueFormatter} />
            {showTooltip ? <Tooltip formatter={toTooltipFormatter(valueFormatter)} /> : null}
            {showLegend ? <Legend /> : null}
            {categories.map((category, i) => (
                <Line
                    key={category}
                    type="monotone"
                    dataKey={category}
                    stroke={colors[i % colors.length]}
                    dot={false}
                />
            ))}
        </RLineChart>
    );

    return (
        <div className={cn(className)}>
            {width !== undefined ? (
                chart
            ) : (
                <ResponsiveContainer width="100%" height={height}>
                    {chart}
                </ResponsiveContainer>
            )}
        </div>
    );
}
