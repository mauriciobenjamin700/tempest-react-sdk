import {
    Legend,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    RadarChart as RRadarChart,
    Radar,
    ResponsiveContainer,
    Tooltip,
} from "recharts";
import { cn } from "@/utils/cn";
import { DEFAULT_CHART_COLORS } from "./palette";
import { toTooltipFormatter } from "./types";
import type { CartesianChartProps } from "./types";

/**
 * RadarChart — themed wrapper over recharts `RadarChart`.
 *
 * Plots one radar polygon per entry in `categories`, colored from `colors`
 * (cycling {@link DEFAULT_CHART_COLORS} by default). `index` drives the angle
 * axis. When `width` is provided the chart renders at that fixed size without a
 * ResponsiveContainer; otherwise it fills its parent.
 */
export function RadarChart({
    data,
    index,
    categories,
    colors = DEFAULT_CHART_COLORS,
    height = 300,
    width,
    showLegend = true,
    showTooltip = true,
    valueFormatter,
    className,
}: CartesianChartProps) {
    const chart = (
        <RRadarChart data={data} width={width} height={height}>
            <PolarGrid />
            <PolarAngleAxis dataKey={index} />
            <PolarRadiusAxis />
            {showTooltip ? <Tooltip formatter={toTooltipFormatter(valueFormatter)} /> : null}
            {showLegend ? <Legend /> : null}
            {categories.map((category, i) => {
                const color = colors[i % colors.length];
                return (
                    <Radar
                        key={category}
                        dataKey={category}
                        stroke={color}
                        fill={color}
                        fillOpacity={0.3}
                    />
                );
            })}
        </RRadarChart>
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
