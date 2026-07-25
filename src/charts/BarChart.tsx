import {
    Bar,
    BarChart as RBarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { cn } from "@/utils/cn";
import { useChartColors } from "./use-chart-colors";
import { toTooltipFormatter } from "./types";
import type { CartesianChartProps } from "./types";

/**
 * BarChart — themed wrapper over recharts `BarChart`.
 *
 * Plots one bar series per entry in `categories`, colored from `colors`
 * (cycling the `--tempest-chart-*` theme tokens by default). When `stack` is set, all
 * bars share a stackId. When `width` is provided the chart renders at that
 * fixed size without a ResponsiveContainer; otherwise it fills its parent.
 */
export function BarChart({
    data,
    index,
    categories,
    colors,
    height = 300,
    width,
    stack = false,
    showLegend = true,
    showGrid = true,
    showTooltip = true,
    valueFormatter,
    className,
}: CartesianChartProps) {
    const palette = useChartColors(colors);
    const stackId = stack ? "stack" : undefined;

    const chart = (
        <RBarChart data={data} width={width} height={height}>
            {showGrid ? <CartesianGrid strokeDasharray="3 3" /> : null}
            <XAxis dataKey={index} />
            <YAxis tickFormatter={valueFormatter} />
            {showTooltip ? <Tooltip formatter={toTooltipFormatter(valueFormatter)} /> : null}
            {showLegend ? <Legend /> : null}
            {categories.map((category, i) => (
                <Bar
                    key={category}
                    dataKey={category}
                    stackId={stackId}
                    fill={palette[i % palette.length]}
                />
            ))}
        </RBarChart>
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
