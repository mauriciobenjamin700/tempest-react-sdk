import { Cell, Legend, Pie, PieChart as RPieChart, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/utils/cn";
import { DEFAULT_CHART_COLORS } from "./palette";
import { toTooltipFormatter } from "./types";
import type { PieChartProps } from "./types";

/**
 * PieChart — themed wrapper over recharts `PieChart`.
 *
 * Renders one slice per row, reading the numeric value from `category` and the
 * label from `index`. Each slice is colored from `colors` (cycling
 * {@link DEFAULT_CHART_COLORS} by default). When `donut` is set the pie gets a
 * non-zero inner radius. When `width` is provided the chart renders at that
 * fixed size without a ResponsiveContainer; otherwise it fills its parent.
 */
export function PieChart({
    data,
    category,
    index,
    colors = DEFAULT_CHART_COLORS,
    height = 300,
    width,
    donut = false,
    showLegend = true,
    showTooltip = true,
    valueFormatter,
    className,
}: PieChartProps) {
    const chart = (
        <RPieChart width={width} height={height}>
            {showTooltip ? <Tooltip formatter={toTooltipFormatter(valueFormatter)} /> : null}
            {showLegend ? <Legend /> : null}
            <Pie
                data={data}
                dataKey={category}
                nameKey={index}
                innerRadius={donut ? "60%" : 0}
                outerRadius="80%"
            >
                {data.map((row, i) => (
                    <Cell key={`${String(row[index])}-${i}`} fill={colors[i % colors.length]} />
                ))}
            </Pie>
        </RPieChart>
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
