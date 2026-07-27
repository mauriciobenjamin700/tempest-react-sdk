/** A point in the sparkline's own coordinate space. */
export interface SparkPoint {
    x: number;
    y: number;
    /** The datum this point came from. */
    value: number;
    /** Its position in the input series. */
    index: number;
}

export interface SparkGeometryOptions {
    values: readonly number[];
    width: number;
    height: number;
    /** Room reserved on every side for the end marker's ring, so it is never clipped. */
    padding?: number;
    /** Force the low end of the value axis. Defaults to the series minimum. */
    min?: number;
    /** Force the high end. Defaults to the series maximum. */
    max?: number;
}

/**
 * Project a series onto the drawing box.
 *
 * `y` is inverted — SVG grows downward and a chart grows upward — and a flat series
 * is centred rather than pinned to an edge, which is the honest reading of "no
 * variation" and avoids dividing by a zero-height domain.
 *
 * Non-finite values are dropped rather than drawn: a `NaN` in the middle of a path
 * silently voids the whole `d` attribute and the sparkline disappears with no error.
 *
 * @param options - The series and the box to fit it in.
 * @returns The projected points, in input order.
 */
export function sparkPoints({
    values,
    width,
    height,
    padding = 2,
    min,
    max,
}: SparkGeometryOptions): SparkPoint[] {
    const usable = values
        .map((value, index) => ({ value, index }))
        .filter((item) => Number.isFinite(item.value));
    if (usable.length === 0 || width <= 0 || height <= 0) return [];

    const numbers = usable.map((item) => item.value);
    const lo = min ?? Math.min(...numbers);
    const hi = max ?? Math.max(...numbers);
    const span = hi - lo;

    const innerW = Math.max(0, width - padding * 2);
    const innerH = Math.max(0, height - padding * 2);
    const lastIndex = usable.length - 1;

    return usable.map((item, i) => {
        const t = lastIndex === 0 ? 0.5 : i / lastIndex;
        const v = span === 0 ? 0.5 : (item.value - lo) / span;
        return {
            x: padding + t * innerW,
            y: padding + (1 - Math.min(1, Math.max(0, v))) * innerH,
            value: item.value,
            index: item.index,
        };
    });
}

/** An SVG `d` for a polyline through the points. */
export function linePath(points: readonly SparkPoint[]): string {
    if (points.length === 0) return "";
    if (points.length === 1) {
        // A lone point has no line; emit a zero-length segment so the round cap
        // still paints a dot rather than nothing at all.
        const [only] = points;
        return `M ${only.x} ${only.y} L ${only.x} ${only.y}`;
    }
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

/**
 * An SVG `d` for the area under the line, closed along the baseline.
 *
 * @param points - The projected points.
 * @param baselineY - Where the fill closes, in the same space as the points.
 */
export function areaPath(points: readonly SparkPoint[], baselineY: number): string {
    if (points.length === 0) return "";
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const first = points[0];
    const last = points[points.length - 1];
    return `${line} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

/** Bar rectangles growing from the baseline, with the band's leftover left as air. */
export function barRects(
    points: readonly SparkPoint[],
    { width, baselineY, gap = 2 }: { width: number; baselineY: number; gap?: number },
): { x: number; y: number; width: number; height: number; point: SparkPoint }[] {
    if (points.length === 0) return [];
    const band = width / points.length;
    // Never fill the slot: the gap between bars is what separates them, not a stroke.
    const barWidth = Math.max(1, Math.min(24, band - gap));
    return points.map((point) => {
        /*
         * The minimum value sits on the baseline, where the raw height is 0. It still
         * needs a visible sliver — but growing *up* from the baseline, not down: the
         * naive `Math.max(1, …)` on height alone leaves the bar hanging one pixel
         * below the axis it is supposed to stand on.
         */
        const height = Math.max(1, Math.abs(baselineY - point.y));
        return {
            x: point.x - barWidth / 2,
            y: Math.min(point.y, baselineY - height),
            width: barWidth,
            height,
            point,
        };
    });
}

/**
 * A one-sentence description of the series, for the chart's accessible name.
 *
 * A sparkline has no axes and no legend, so without this it is an unlabelled image:
 * a screen reader reaches it and reads nothing. Direction is stated in words rather
 * than implied by the shape.
 *
 * @param values - The series, in order.
 * @param format - How to render a single value.
 * @returns Text suitable for `aria-label`.
 */
export function describeSeries(
    values: readonly number[],
    format: (value: number) => string = String,
): string {
    const usable = values.filter((v) => Number.isFinite(v));
    if (usable.length === 0) return "Sem dados";
    if (usable.length === 1) return `Valor único: ${format(usable[0])}`;

    const first = usable[0];
    const last = usable[usable.length - 1];
    const direction = last > first ? "subindo" : last < first ? "descendo" : "estável";
    return (
        `${usable.length} pontos, ${direction}. ` +
        `Início ${format(first)}, fim ${format(last)}. ` +
        `Mínimo ${format(Math.min(...usable))}, máximo ${format(Math.max(...usable))}.`
    );
}
