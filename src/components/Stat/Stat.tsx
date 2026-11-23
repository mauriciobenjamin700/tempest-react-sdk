import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Stat.module.css";

export type StatTrend = "up" | "down" | "flat";

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
    /** Metric label (e.g. "Revenue", "Active users"). */
    label: ReactNode;
    /** Metric value (e.g. "R$ 12.345", "1.2k"). */
    value: ReactNode;
    /** Optional comparison delta — when set, renders alongside the value. */
    delta?: ReactNode;
    /** Trend direction for the delta. Default inferred from delta string. */
    trend?: StatTrend;
    /**
     * Whether a rising value is good news. Default `true`.
     *
     * The delta's color says "good" or "bad", not "up" or "down": with the
     * default, `up` is green and `down` red. Pass `false` for a metric where
     * growth is the problem — no-show rate, churn, response time, open tickets —
     * and `up` turns red while `down` turns green. The direction itself is not
     * touched: `trend` and the delta text still say which way the number moved.
     */
    higherIsBetter?: boolean;
    /** Optional supporting context line below the value. */
    hint?: ReactNode;
    /** Optional leading icon. */
    icon?: ReactNode;
}

function inferTrend(delta: ReactNode | undefined): StatTrend | undefined {
    if (typeof delta !== "string") return undefined;
    const trimmed = delta.trim();
    if (trimmed.startsWith("+")) return "up";
    if (trimmed.startsWith("-") || trimmed.startsWith("−")) return "down";
    return undefined;
}

/**
 * The tone a delta is painted with: whether the move it reports is good news.
 *
 * @param trend - Which way the metric moved, if known.
 * @param higherIsBetter - Whether rising is good for this metric.
 * @returns `"positive"`, `"negative"`, `"neutral"` for `flat`, or `undefined`
 *     when the direction is unknown and the delta stays muted.
 */
function deltaTone(
    trend: StatTrend | undefined,
    higherIsBetter: boolean,
): "positive" | "negative" | "neutral" | undefined {
    if (trend === undefined) return undefined;
    if (trend === "flat") return "neutral";
    return (trend === "up") === higherIsBetter ? "positive" : "negative";
}

/**
 * KPI card. Dashboard widget showing a label + big value + optional
 * delta/trend and hint.
 *
 * The delta carries `data-trend` (the direction) and `data-tone` (whether that
 * direction is good news under `higherIsBetter`), so a test or an app style can
 * read either without matching a hashed class name.
 *
 * @example
 * <Stat label="Receita" value="R$ 12.345" delta="+12,4%" trend="up" hint="vs. mês anterior" />
 *
 * @example
 * <Stat label="Faltas" value="7,5%" delta="+1,2 p.p." higherIsBetter={false} />
 */
export function Stat({
    label,
    value,
    delta,
    trend,
    higherIsBetter = true,
    hint,
    icon,
    className,
    ...props
}: StatProps) {
    const resolvedTrend: StatTrend | undefined = trend ?? inferTrend(delta);
    const tone = deltaTone(resolvedTrend, higherIsBetter);
    return (
        <div className={cn(styles.stat, className)} {...props}>
            <div className={styles.header}>
                {icon && <span className={styles.icon}>{icon}</span>}
                <span className={styles.label}>{label}</span>
            </div>
            <div className={styles.row}>
                <span className={styles.value}>{value}</span>
                {delta !== undefined && (
                    <span
                        className={cn(
                            styles.delta,
                            tone === "positive" && styles.positive,
                            tone === "negative" && styles.negative,
                            tone === "neutral" && styles.neutral,
                        )}
                        data-trend={resolvedTrend}
                        data-tone={tone}
                    >
                        {delta}
                    </span>
                )}
            </div>
            {hint && <p className={styles.hint}>{hint}</p>}
        </div>
    );
}
