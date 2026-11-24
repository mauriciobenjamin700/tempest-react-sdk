/**
 * @tempest-limits file-lines, props-count, function-lines — the SVG plot (points,
 * current, height, padding, showGrid, showScale, strokeColor, label), the optional
 * self-hosted tile layer (tileUrl, tileAttribution, tileMaxZoom) and the overlay
 * (markers, onMarkerClick). Every layer shares one Web Mercator view from
 * `live-route-view`, so tiles, path and markers stay aligned with zero extra deps.
 */
import { useEffect, useMemo, useRef, useState, type HTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import { boundingBox, expandBounds } from "./bounds";
import { fitLiveView, kmPerPixel, projectLive, tilesForView } from "./live-route-view";
import type { PixelPoint } from "./projection";
import { formatScale, pickScaleKm } from "./scale";
import type { Coordinate, GeoMarker } from "./types";
import styles from "./TrajectoryMap.module.css";

export interface TrajectoryMapProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** Ordered coordinates forming the trajectory. */
    points: readonly Coordinate[];
    /** Optional "current position" marker, drawn on top of the path. */
    current?: Coordinate | null;
    /** Viewport height in pixels. Default: `320`. */
    height?: number;
    /** Inner padding in pixels kept clear on every edge. Default: `24`. */
    padding?: number;
    /** Draw a light reference grid behind the path when no tiles are active. Default: `true`. */
    showGrid?: boolean;
    /** Draw a distance scale bar. Default: `true`. */
    showScale?: boolean;
    /** Path stroke color. Default: the primary token. */
    strokeColor?: string;
    /**
     * Tile URL template (`{z}/{x}/{y}`) of a map server **you host**. Tiles are
     * drawn directly inside the SVG under the same Web Mercator projection, with
     * no extra dependency. Omit for the zero-network SVG plot.
     */
    tileUrl?: string;
    /** Attribution text shown over the tile layer. */
    tileAttribution?: string;
    /** Highest zoom level your tile server serves. Default: `19`. */
    tileMaxZoom?: number;
    /** Accessible label for the map region. Default: `"Trajetória"`. */
    label?: string;
    /** Point markers to overlay (e.g. stops, POIs). Included in the auto-fit. */
    markers?: readonly GeoMarker[];
    /** Fired when a marker is clicked. */
    onMarkerClick?: (marker: GeoMarker, index: number) => void;
}

/**
 * Plot a GPS trajectory. By default it renders a **tile-free SVG** map (Web
 * Mercator projection, auto-fit to the points and markers, optional grid +
 * scale bar) — 100% self-contained, no external tiles or paid API. Pass
 * `tileUrl` pointing at a map server **you host** to render `{z}/{x}/{y}` tiles
 * under the same projection, with no map library required.
 *
 * @example
 * // Zero-dependency SVG plot
 * <TrajectoryMap points={points} current={lastPoint} height={360} />
 *
 * @example
 * // Self-hosted tiles with markers (no map library required)
 * <TrajectoryMap
 *   points={points}
 *   markers={[{ id: "shop", latitude: -23.5505, longitude: -46.6333, label: "Loja" }]}
 *   tileUrl="https://tiles.internal/{z}/{x}/{y}.png"
 *   tileAttribution="© OpenStreetMap"
 * />
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
    tileMaxZoom = 19,
    label = "Trajetória",
    markers,
    onMarkerClick,
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
        () => [...points, ...(current ? [current] : []), ...(markers ?? [])],
        [points, current, markers],
    );

    const svg = useMemo(() => {
        const box = boundingBox(allPoints);
        if (!box) return null;

        const viewport = { width, height };
        const view = fitLiveView(expandBounds(box, 0.12), viewport, padding);
        if (!view) return null;

        const pixels: PixelPoint[] = points.map((p) => projectLive(view, viewport, p));
        const polyline = pixels.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

        const startPixel = pixels[0] ?? null;
        const endPixel = pixels.length > 0 ? pixels[pixels.length - 1] : null;
        const currentPixel = current ? projectLive(view, viewport, current) : null;
        const markerPixels = (markers ?? []).map((m) => ({
            marker: m,
            p: projectLive(view, viewport, m),
        }));
        const tiles = tileUrl ? tilesForView(view, viewport, tileUrl, tileMaxZoom) : [];

        return {
            polyline,
            startPixel,
            endPixel,
            currentPixel,
            kmPerPixel: kmPerPixel(view),
            markerPixels,
            tiles,
        };
    }, [allPoints, points, current, markers, width, height, padding, tileUrl, tileMaxZoom]);

    const scale =
        showScale && svg && svg.kmPerPixel > 0
            ? pickScaleKm(svg.kmPerPixel, Math.min(120, width * 0.35))
            : null;

    return (
        <div
            ref={containerRef}
            className={cn(styles.map, className)}
            style={{ height, ...style }}
            role={onMarkerClick ? "region" : "img"}
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
                    {svg.tiles.length > 0 && (
                        <g className={styles.tiles} aria-hidden="true">
                            {svg.tiles.map((tile) => (
                                <image
                                    key={`${tile.url}@${tile.x.toFixed(0)}`}
                                    href={tile.url}
                                    x={tile.x}
                                    y={tile.y}
                                    width={tile.size + 0.5}
                                    height={tile.size + 0.5}
                                    preserveAspectRatio="none"
                                />
                            ))}
                        </g>
                    )}

                    {showGrid && !tileUrl && (
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

                    {svg.markerPixels.map(({ marker, p }, i) => {
                        const interactive = Boolean(onMarkerClick);
                        return (
                            <circle
                                key={marker.id ?? i}
                                className={styles.marker}
                                cx={p.x}
                                cy={p.y}
                                r={marker.radius ?? 6}
                                style={marker.color ? { fill: marker.color } : undefined}
                                data-marker-id={marker.id ?? i}
                                tabIndex={interactive ? 0 : undefined}
                                role={interactive ? "button" : undefined}
                                aria-label={marker.label}
                                onClick={interactive ? () => onMarkerClick?.(marker, i) : undefined}
                                onKeyDown={
                                    interactive
                                        ? (e) => {
                                              if (e.key === "Enter" || e.key === " ") {
                                                  e.preventDefault();
                                                  onMarkerClick?.(marker, i);
                                              }
                                          }
                                        : undefined
                                }
                            >
                                {marker.label ? <title>{marker.label}</title> : null}
                            </circle>
                        );
                    })}

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

            {svg && tileUrl && tileAttribution ? (
                <span className={styles.attribution}>{tileAttribution}</span>
            ) : null}
        </div>
    );
}
