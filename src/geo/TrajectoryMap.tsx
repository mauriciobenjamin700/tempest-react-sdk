import { lazy, Suspense, useEffect, useMemo, useRef, useState, type HTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import { boundingBox, expandBounds } from "./bounds";
import { haversineKm } from "./distance";
import { fitProjection, type PixelPoint } from "./projection";
import type { Coordinate } from "./types";
import styles from "./TrajectoryMap.module.css";

// Leaflet layer is loaded on demand — only when a `tileUrl` is supplied, so
// apps that stick to the tile-free SVG never pull leaflet into their bundle.
const LeafletTrajectory = lazy(() =>
    import("./leaflet-map").then((m) => ({ default: m.LeafletTrajectory })),
);

export interface TrajectoryMapProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** Ordered coordinates forming the trajectory. */
    points: readonly Coordinate[];
    /** Optional "current position" marker, drawn on top of the path. */
    current?: Coordinate | null;
    /** Viewport height in pixels. Default: `320`. */
    height?: number;
    /** Inner padding in pixels kept clear on every edge. Default: `24`. */
    padding?: number;
    /** Draw a light reference grid behind the path (SVG mode). Default: `true`. */
    showGrid?: boolean;
    /** Draw a distance scale bar (SVG mode). Default: `true`. */
    showScale?: boolean;
    /** Path stroke color. Default: the primary token. */
    strokeColor?: string;
    /**
     * Tile URL template (`{z}/{x}/{y}`) of a map server **you host**. When set,
     * the map upgrades to a real Leaflet tile layer (requires `leaflet` to be
     * installed). Omit for the zero-dependency, zero-network SVG plot.
     */
    tileUrl?: string;
    /** Attribution text shown over the tile layer. */
    tileAttribution?: string;
    /** Accessible label for the map region. Default: `"Trajetória"`. */
    label?: string;
}

const NICE_KM_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000] as const;

/** Pick the largest "nice" distance whose bar fits within `maxPixels`. */
function pickScaleKm(kmPerPixel: number, maxPixels: number): { km: number; pixels: number } {
    const maxKm = kmPerPixel * maxPixels;
    let chosen: number = NICE_KM_STEPS[0];
    for (const step of NICE_KM_STEPS) {
        if (step <= maxKm) chosen = step;
    }
    return { km: chosen, pixels: chosen / kmPerPixel };
}

/** Format a distance in km for the scale bar (meters below 1 km). */
function formatScale(km: number): string {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km % 1 === 0 ? km : km.toFixed(1)} km`;
}

/**
 * Plot a GPS trajectory. By default it renders a **tile-free SVG** map (Web
 * Mercator projection, auto-fit to the points, optional grid + scale bar) —
 * 100% self-contained, no external tiles or paid API. Pass `tileUrl` pointing
 * at a map server **you host** to upgrade to a real Leaflet tile layer.
 *
 * @example
 * // Zero-dependency SVG plot
 * <TrajectoryMap points={points} current={lastPoint} height={360} />
 *
 * @example
 * // Real tiles from your own server (requires `leaflet` installed)
 * <TrajectoryMap points={points} tileUrl="https://tiles.internal/{z}/{x}/{y}.png" />
 */
export function TrajectoryMap({
    points,
    current,
    height = 320,
    padding = 24,
    showGrid = true,
    showScale = true,
    strokeColor,
    tileUrl,
    tileAttribution,
    label = "Trajetória",
    className,
    style,
    ...rest
}: TrajectoryMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState<number>(600);

    useEffect(() => {
        const node = containerRef.current;
        if (!node || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver((entries) => {
            const measured = entries[0]?.contentRect.width;
            if (measured && measured > 0) setWidth(measured);
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    const allPoints = useMemo<Coordinate[]>(
        () => (current ? [...points, current] : [...points]),
        [points, current],
    );

    const svg = useMemo(() => {
        const box = boundingBox(allPoints);
        if (!box) return null;

        const projection = fitProjection(expandBounds(box, 0.12), width, height, { padding });
        const pixels: PixelPoint[] = points.map((p) => projection.project(p));
        const polyline = pixels.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

        const startPixel = pixels[0] ?? null;
        const endPixel = pixels.length > 0 ? pixels[pixels.length - 1] : null;
        const currentPixel = current ? projection.project(current) : null;

        // Distance-per-pixel at the map center, for the scale bar: measure the
        // center → east-edge span in both km (haversine) and pixels (projected).
        const centerCoord = {
            latitude: (box.minLatitude + box.maxLatitude) / 2,
            longitude: (box.minLongitude + box.maxLongitude) / 2,
        };
        const center = projection.project(centerCoord);
        const eastRef = projection.project({ ...centerCoord, longitude: box.maxLongitude });
        const edgeKm = haversineKm(centerCoord, { ...centerCoord, longitude: box.maxLongitude });
        const edgePixels = Math.abs(eastRef.x - center.x) || 1;
        const kmPerPixel = edgeKm / edgePixels || 0;

        return { polyline, startPixel, endPixel, currentPixel, kmPerPixel };
    }, [allPoints, points, current, width, height, padding]);

    // ── Leaflet tile mode ────────────────────────────────────────────────────
    if (tileUrl) {
        return (
            <div
                ref={containerRef}
                className={cn(styles.map, className)}
                style={{ height, ...style }}
                role="img"
                aria-label={label}
                {...rest}
            >
                <Suspense fallback={<div className={styles.loading}>Carregando mapa…</div>}>
                    <LeafletTrajectory
                        points={points}
                        current={current}
                        tileUrl={tileUrl}
                        tileAttribution={tileAttribution}
                        strokeColor={strokeColor}
                    />
                </Suspense>
            </div>
        );
    }

    // ── Tile-free SVG mode ─────────────────────────────────────────────────────
    const scale =
        showScale && svg && svg.kmPerPixel > 0
            ? pickScaleKm(svg.kmPerPixel, Math.min(120, width * 0.35))
            : null;

    return (
        <div
            ref={containerRef}
            className={cn(styles.map, className)}
            style={{ height, ...style }}
            role="img"
            aria-label={label}
            {...rest}
        >
            {!svg ? (
                <div className={styles.empty}>Sem pontos de trajetória ainda.</div>
            ) : (
                <svg
                    className={styles.svg}
                    width="100%"
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    preserveAspectRatio="xMidYMid meet"
                >
                    {showGrid && (
                        <g className={styles.grid}>
                            {[0.25, 0.5, 0.75].map((f) => (
                                <line
                                    key={`h${f}`}
                                    x1={0}
                                    y1={height * f}
                                    x2={width}
                                    y2={height * f}
                                />
                            ))}
                            {[0.25, 0.5, 0.75].map((f) => (
                                <line
                                    key={`v${f}`}
                                    x1={width * f}
                                    y1={0}
                                    x2={width * f}
                                    y2={height}
                                />
                            ))}
                        </g>
                    )}

                    {svg.polyline && (
                        <polyline
                            className={styles.path}
                            points={svg.polyline}
                            fill="none"
                            stroke={strokeColor}
                            data-testid="trajectory-path"
                        />
                    )}

                    {svg.startPixel && (
                        <circle
                            className={styles.start}
                            cx={svg.startPixel.x}
                            cy={svg.startPixel.y}
                            r={5}
                        />
                    )}
                    {svg.endPixel && !current && (
                        <circle
                            className={styles.end}
                            cx={svg.endPixel.x}
                            cy={svg.endPixel.y}
                            r={5}
                        />
                    )}
                    {svg.currentPixel && (
                        <>
                            <circle
                                className={styles.pulse}
                                cx={svg.currentPixel.x}
                                cy={svg.currentPixel.y}
                                r={10}
                            />
                            <circle
                                className={styles.current}
                                cx={svg.currentPixel.x}
                                cy={svg.currentPixel.y}
                                r={5}
                            />
                        </>
                    )}

                    {scale && (
                        <g
                            className={styles.scale}
                            transform={`translate(${padding}, ${height - padding})`}
                        >
                            <line x1={0} y1={0} x2={scale.pixels} y2={0} />
                            <line x1={0} y1={-4} x2={0} y2={4} />
                            <line x1={scale.pixels} y1={-4} x2={scale.pixels} y2={4} />
                            <text x={scale.pixels / 2} y={-8} textAnchor="middle">
                                {formatScale(scale.km)}
                            </text>
                        </g>
                    )}
                </svg>
            )}
        </div>
    );
}
