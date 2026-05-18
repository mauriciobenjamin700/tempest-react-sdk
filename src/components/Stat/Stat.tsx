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
 * KPI card. Dashboard widget showing a label + big value + optional
 * delta/trend and hint.
 *
 * @example
 * <Stat label="Receita" value="R$ 12.345" delta="+12,4%" trend="up" hint="vs. mês anterior" />
 */
export function Stat({ label, value, delta, trend, hint, icon, className, ...props }: StatProps) {
    const resolvedTrend: StatTrend | undefined = trend ?? inferTrend(delta);
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
                            resolvedTrend === "up" && styles.up,
                            resolvedTrend === "down" && styles.down,
                            resolvedTrend === "flat" && styles.flat,
                        )}
                    >
                        {delta}
                    </span>
                )}
            </div>
            {hint && <p className={styles.hint}>{hint}</p>}
        </div>
    );
}
