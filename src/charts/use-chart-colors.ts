import { useEffect, useState } from "react";

import { resolveChartColors } from "./palette";

/**
 * Theme-aware series colors for a chart.
 *
 * Resolves the `--tempest-chart-*` tokens on mount and again whenever the theme
 * attribute flips, so switching to dark re-colors the series instead of leaving
 * light-theme colors on a dark canvas. Passing `explicit` short-circuits the
 * whole thing — an explicit `colors` prop always wins and no observer is set up.
 *
 * @param explicit - Colors passed by the caller. When present, returned as-is.
 * @param element - Element to resolve tokens against. Default `<html>`.
 * @returns Colors in cycle order.
 *
 * @example
 * ```tsx
 * function Sales({ data }: { data: ChartDatum[] }) {
 *   const colors = useChartColors();
 *   return <BarChart data={data} colors={colors} />;
 * }
 * ```
 */
export function useChartColors(explicit?: string[], element?: Element | null): string[] {
    const [resolved, setResolved] = useState<string[]>(() =>
        explicit ? explicit : resolveChartColors(element),
    );

    useEffect(() => {
        if (explicit) return;
        if (typeof window === "undefined" || typeof MutationObserver === "undefined") return;

        const target = element ?? document.documentElement;
        if (!target) return;

        const sync = (): void => setResolved(resolveChartColors(target));
        sync();

        const roots = new Set<Element>([target]);
        const documentRoot = target.ownerDocument?.documentElement;
        if (documentRoot) roots.add(documentRoot);

        const observer = new MutationObserver(sync);
        for (const root of roots) {
            observer.observe(root, {
                attributes: true,
                attributeFilter: ["data-tempest-theme", "class", "style"],
            });
        }

        return () => observer.disconnect();
    }, [explicit, element]);

    return explicit ?? resolved;
}
