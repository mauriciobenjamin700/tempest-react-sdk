import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { SEQUENTIAL_BLUES } from "./scales";
import styles from "./MapLegend.module.css";

/** A discrete legend entry. */
export interface LegendItem {
    color: string;
    label: ReactNode;
}

export interface MapLegendProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    /** Legend heading. */
    title?: ReactNode;
    /**
     * Discrete entries (swatch + label). When provided the legend renders in
     * "steps" mode; otherwise it renders a continuous gradient from `min`/`max`.
     */
    items?: readonly LegendItem[];
    /** Continuous mode: low end of the domain. */
    min?: number;
    /** Continuous mode: high end of the domain. */
    max?: number;
    /** Continuous mode: palette (light → dark). Default: sequential blues. */
    palette?: readonly string[];
    /** Continuous mode: format the min/mid/max tick labels. */
    format?: (value: number) => string;
}

/**
 * Legend for a choropleth map. Renders a **continuous gradient** (with
 * min/mid/max ticks) from `min`/`max`/`palette`, or **discrete swatches** when
 * `items` is given. Pair it with a `BrazilMap`/`BrazilStateMap` `colorScale`.
 *
 * @example
 * // Continuous, matching a sequentialScale(0, 100)
 * <MapLegend title="Vendas" min={0} max={100} palette={SEQUENTIAL_BLUES} />
 *
 * @example
 * // Discrete buckets
 * <MapLegend
 *   title="Faixa"
 *   items={[
 *     { color: "#c6dbef", label: "< 10" },
 *     { color: "#6baed6", label: "10–50" },
 *     { color: "#08519c", label: "> 50" },
 *   ]}
 * />
 */
export function MapLegend({
    title,
    items,
    min = 0,
    max = 1,
    palette = SEQUENTIAL_BLUES,
    format = (v) => String(Math.round(v)),
    className,
    ...rest
}: MapLegendProps) {
    return (
        <div className={cn(styles.legend, className)} {...rest}>
            {title != null && <div className={styles.title}>{title}</div>}

            {items ? (
                <ul className={styles.items}>
                    {items.map((item, i) => (
                        <li key={i} className={styles.item}>
                            <span className={styles.swatch} style={{ background: item.color }} />
                            <span className={styles.itemLabel}>{item.label}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <>
                    <div
                        className={styles.gradient}
                        style={{ background: `linear-gradient(to right, ${palette.join(", ")})` }}
                    />
                    <div className={styles.ticks}>
                        <span>{format(min)}</span>
                        <span>{format((min + max) / 2)}</span>
                        <span>{format(max)}</span>
                    </div>
                </>
            )}
        </div>
    );
}
