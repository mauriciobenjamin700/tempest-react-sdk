import {
    Area,
    AreaChart as RAreaChart,
    CartesianGrid,
    Legend,
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
 * AreaChart — themed wrapper over recharts `AreaChart`.
 *
 * Plots one filled area per entry in `categories`, colored from `colors`
 * (cycling {@link DEFAULT_CHART_COLORS} by default). When `stack` is set, all
 * areas share a stackId. When `width` is provided the chart renders at that
 * fixed size without a ResponsiveContainer; otherwise it fills its parent.
 */
export function AreaChart({
    data,
    index,
    categories,
    colors = DEFAULT_CHART_COLORS,
    height = 300,
    width,
    stack = false,
    showLegend = true,
    showGrid = true,
    showTooltip = true,
    valueFormatter,
    className,
}: CartesianChartProps) {
    const stackId = stack ? "stack" : undefined;

    const chart = (
        <RAreaChart data={data} width={width} height={height}>
            {showGrid ? <CartesianGrid strokeDasharray="3 3" /> : null}
            <XAxis dataKey={index} />
            <YAxis tickFormatter={valueFormatter} />
            {showTooltip ? <Tooltip formatter={toTooltipFormatter(valueFormatter)} /> : null}
            {showLegend ? <Legend /> : null}
            {categories.map((category, i) => {
                const color = colors[i % colors.length];
                return (
                    <Area
                        key={category}
                        type="monotone"
                        dataKey={category}
                        stackId={stackId}
                        stroke={color}
                        fill={color}
                        fillOpacity={0.3}
                    />
                );
            })}
        </RAreaChart>
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
