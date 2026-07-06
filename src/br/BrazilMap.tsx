import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { fitProjection, type FittedProjection } from "@/geo/projection";
import type { GeoBounds } from "@/geo/types";
import type { BrUfFeature, BrUfFeatureCollection, Ring } from "./br-geo";
import type { UF } from "./locations";
import styles from "./BrazilMap.module.css";

export interface BrazilMapProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
    /** Currently selected UF(s) — highlighted. Accepts one or many. */
    selected?: UF | readonly UF[] | null;
    /** Fired when a state is clicked. */
    onSelect?: (uf: UF) => void;
    /**
     * Optional choropleth values per UF. When set, each state is tinted between
     * `minColor` and `maxColor` by its value (linear). States without a value
     * use the base surface color.
     */
    values?: Partial<Record<UF, number>>;
    /** Choropleth low-end color. Default: a light primary tint. */
    minColor?: string;
    /** Choropleth high-end color. Default: the primary token. */
    maxColor?: string;
    /** Viewport height in pixels. Default: `440`. */
    height?: number;
    /** Inner padding in pixels. Default: `12`. */
    padding?: number;
    /** Render the UF acronym at each state centroid. Default: `true`. */
    showLabels?: boolean;
    /** Accessible label for the map region. Default: `"Mapa do Brasil por estado"`. */
    label?: string;
    /** Custom content when the geometry is still loading. */
    loadingContent?: ReactNode;
}

/** Iterate every ring of a feature (Polygon or MultiPolygon). */
function ringsOf(feature: BrUfFeature): Ring[] {
    const { type, coordinates } = feature.geometry;
    return type === "MultiPolygon" ? (coordinates as Ring[][]).flat() : (coordinates as Ring[]);
}

/** Bounding box across every coordinate in the collection. */
function collectionBounds(collection: BrUfFeatureCollection): GeoBounds {
    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;
    for (const feature of collection.features) {
        for (const ring of ringsOf(feature)) {
            for (const [lon, lat] of ring) {
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
            }
        }
    }
    return { minLatitude: minLat, maxLatitude: maxLat, minLongitude: minLon, maxLongitude: maxLon };
}

/** Build the SVG `d` path for a feature (all rings, evenodd for holes). */
function featurePath(feature: BrUfFeature, projection: FittedProjection): string {
    return ringsOf(feature)
        .map((ring) => {
            const pts = ring.map(([lon, lat]) => {
                const p = projection.project({ latitude: lat, longitude: lon });
                return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            });
            return `M${pts.join("L")}Z`;
        })
        .join("");
}

/** Rough visual centroid of a feature (average of its outer-ring points). */
function featureCentroid(
    feature: BrUfFeature,
    projection: FittedProjection,
): { x: number; y: number } {
    const rings = ringsOf(feature);
    const outer = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0] ?? []);
    let sx = 0;
    let sy = 0;
    for (const [lon, lat] of outer) {
        const p = projection.project({ latitude: lat, longitude: lon });
        sx += p.x;
        sy += p.y;
    }
    const n = outer.length || 1;
    return { x: sx / n, y: sy / n };
}

function lerpColor(from: string, to: string, t: number): string {
    const parse = (c: string): [number, number, number] => {
        const hex = c.replace("#", "");
        const full =
            hex.length === 3
                ? hex
                      .split("")
                      .map((ch) => ch + ch)
                      .join("")
                : hex;
        return [
            parseInt(full.slice(0, 2), 16),
            parseInt(full.slice(2, 4), 16),
            parseInt(full.slice(4, 6), 16),
        ];
    };
    const [r1, g1, b1] = parse(from);
    const [r2, g2, b2] = parse(to);
    const mix = (a: number, b: number): number => Math.round(a + (b - a) * t);
    return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
}

/**
 * Clickable choropleth map of Brazil's 27 federative units. Renders the bundled
 * simplified UF GeoJSON as SVG paths — **no external tiles or paid API**. Click
 * a state to fire `onSelect(uf)`; pass `selected` to highlight and `values` to
 * tint states by a metric.
 *
 * The GeoJSON (~36 KB gzip) is loaded lazily, so importing this component does
 * not pull the geometry until it actually mounts.
 *
 * @example
 * const [uf, setUf] = useState<UF | null>(null);
 * <BrazilMap selected={uf} onSelect={setUf} />
 *
 * @example
 * // Choropleth by a metric per state
 * <BrazilMap values={{ SP: 120, RJ: 90, MG: 60 }} />
 */
export function BrazilMap({
    selected,
    onSelect,
    values,
    minColor = "#dbeafe",
    maxColor = "#2563eb",
    height = 440,
    padding = 12,
    showLabels = true,
    label = "Mapa do Brasil por estado",
    loadingContent,
    className,
    style,
    ...rest
}: BrazilMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState<number>(600);
    const [collection, setCollection] = useState<BrUfFeatureCollection | null>(null);

    useEffect(() => {
        let active = true;
        void import("./br-geo").then((m) => {
            if (active) setCollection(m.BR_UF_GEOJSON);
        });
        return () => {
            active = false;
        };
    }, []);

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

    const selectedSet = useMemo<Set<UF>>(() => {
        if (!selected) return new Set();
        return new Set(Array.isArray(selected) ? selected : [selected as UF]);
    }, [selected]);

    const valueRange = useMemo<[number, number] | null>(() => {
        if (!values) return null;
        const nums = Object.values(values).filter((v): v is number => typeof v === "number");
        if (nums.length === 0) return null;
        return [Math.min(...nums), Math.max(...nums)];
    }, [values]);

    const shapes = useMemo(() => {
        if (!collection) return null;
        const projection = fitProjection(collectionBounds(collection), width, height, { padding });
        return collection.features.map((feature) => ({
            uf: feature.properties.uf,
            name: feature.properties.name,
            d: featurePath(feature, projection),
            centroid: featureCentroid(feature, projection),
        }));
    }, [collection, width, height, padding]);

    function fillFor(uf: UF): string | undefined {
        if (!values || !valueRange) return undefined;
        const v = values[uf];
        if (typeof v !== "number") return undefined;
        const [min, max] = valueRange;
        const t = max === min ? 1 : (v - min) / (max - min);
        return lerpColor(minColor, maxColor, t);
    }

    return (
        <div
            ref={containerRef}
            className={cn(styles.map, className)}
            style={{ height, ...style }}
            role="group"
            aria-label={label}
            {...rest}
        >
            {!shapes ? (
                <div className={styles.loading}>{loadingContent ?? "Carregando mapa…"}</div>
            ) : (
                <svg
                    className={styles.svg}
                    width="100%"
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    preserveAspectRatio="xMidYMid meet"
                >
                    {shapes.map((shape) => {
                        const isSelected = selectedSet.has(shape.uf);
                        return (
                            <path
                                key={shape.uf}
                                className={cn(styles.state, isSelected && styles.selected)}
                                d={shape.d}
                                fillRule="evenodd"
                                fill={isSelected ? undefined : fillFor(shape.uf)}
                                data-uf={shape.uf}
                                tabIndex={onSelect ? 0 : undefined}
                                role={onSelect ? "button" : undefined}
                                aria-label={shape.name}
                                aria-pressed={onSelect ? isSelected : undefined}
                                onClick={onSelect ? () => onSelect(shape.uf) : undefined}
                                onKeyDown={
                                    onSelect
                                        ? (e) => {
                                              if (e.key === "Enter" || e.key === " ") {
                                                  e.preventDefault();
                                                  onSelect(shape.uf);
                                              }
                                          }
                                        : undefined
                                }
                            >
                                <title>{shape.name}</title>
                            </path>
                        );
                    })}

                    {showLabels &&
                        shapes.map((shape) => (
                            <text
                                key={`label-${shape.uf}`}
                                className={styles.label}
                                x={shape.centroid.x}
                                y={shape.centroid.y}
                                textAnchor="middle"
                                dominantBaseline="central"
                            >
                                {shape.uf}
                            </text>
                        ))}
                </svg>
            )}
        </div>
    );
}
