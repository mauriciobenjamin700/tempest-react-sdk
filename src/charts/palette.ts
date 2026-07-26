/**
 * Series colors for Tempest charts, resolved from the theme tokens.
 *
 * Recharts sets colors as SVG presentation attributes (`fill="…"`), where
 * `var(--token)` is **not** substituted — browsers only resolve custom properties
 * in CSS declarations. So the tokens are read from the computed style and handed
 * over as literal colors, which is what keeps a re-theme (and dark mode)
 * reflected in the charts.
 */

/**
 * Fallback palette: six visually distinct hex colors (blue, green, amber,
 * violet, pink, cyan) in cycle order.
 *
 * Used when the `--tempest-chart-*` tokens cannot be read — no stylesheet
 * imported, a non-browser environment (tests, build scripts), or a host page that
 * dropped the tokens. Exported so callers can start from it and pass a tweaked
 * array to any chart's `colors` prop.
 */
export const DEFAULT_CHART_COLORS: string[] = [
    "#2563eb", // blue
    "#16a34a", // green
    "#f59e0b", // amber
    "#7c3aed", // violet
    "#ec4899", // pink
    "#06b6d4", // cyan
];

/** How many `--tempest-chart-N` tokens the SDK ships. */
export const CHART_COLOR_TOKEN_COUNT = 8;

/**
 * Read `--tempest-chart-1` … `--tempest-chart-8` into a color array.
 *
 * Respects `--tempest-chart-count` when the theme declares one (`createTheme`
 * writes it), so a six-color brand palette is read as six and not padded with the
 * SDK's leftover `-7`/`-8` defaults. Otherwise it walks the tokens and stops at
 * the first unset one. Returns {@link DEFAULT_CHART_COLORS} when nothing is
 * resolvable.
 *
 * @param element - Element to resolve the tokens against. Default `<html>`; pass
 *   a subtree root when a section carries a scoped theme.
 * @returns Literal color strings in cycle order.
 */
export function resolveChartColors(element?: Element | null): string[] {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return DEFAULT_CHART_COLORS;
    }

    const target = element ?? document.documentElement;
    if (!target) return DEFAULT_CHART_COLORS;

    const styles = window.getComputedStyle(target);
    const resolved: string[] = [];
    const declared = Number.parseInt(styles.getPropertyValue("--tempest-chart-count").trim(), 10);
    const limit =
        Number.isFinite(declared) && declared > 0
            ? Math.min(declared, CHART_COLOR_TOKEN_COUNT)
            : CHART_COLOR_TOKEN_COUNT;

    for (let index = 1; index <= limit; index += 1) {
        const value = styles.getPropertyValue(`--tempest-chart-${index}`).trim();
        if (!value) break;
        resolved.push(value);
    }

    return resolved.length > 0 ? resolved : DEFAULT_CHART_COLORS;
}

/**
 * Read one piece of chart chrome (`--tempest-chart-grid` / `--tempest-chart-axis`).
 *
 * @param part - Which chrome token to read.
 * @param element - Element to resolve against. Default `<html>`.
 * @param fallback - Value returned when the token is unset.
 * @returns The resolved color, or `fallback`.
 */
export function resolveChartChrome(
    part: "grid" | "axis",
    element?: Element | null,
    fallback = part === "grid" ? "#e4e7ec" : "#667085",
): string {
    if (typeof window === "undefined" || typeof document === "undefined") return fallback;
    const target = element ?? document.documentElement;
    if (!target) return fallback;
    const value = window
        .getComputedStyle(target)
        .getPropertyValue(`--tempest-chart-${part}`)
        .trim();
    return value || fallback;
}
