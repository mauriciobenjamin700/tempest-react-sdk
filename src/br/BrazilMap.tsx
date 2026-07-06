import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { fitProjection } from "@/geo/projection";
import type { BrUfFeatureCollection } from "./br-geo";
import { getState, type UF } from "./locations";
import { MapTooltip } from "./MapTooltip";
import { geometriesBounds, geometryCentroid, geometryPath, lerpColor } from "./svg-utils";
import { useMapHover } from "./use-map-hover";
import styles from "./BrazilMap.module.css";

/** Data passed to a {@link BrazilMapProps.renderTooltip} callback. */
export interface BrazilMapTooltipData {
    uf: UF;
    name: string;
    /** Choropleth value for this UF, if `values` was provided. */
    value?: number;
}

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
    /** Show a floating tooltip (name + region + city count + value) on hover. Default: `true`. */
    showTooltip?: boolean;
    /** Override the default tooltip content. */
    renderTooltip?: (data: BrazilMapTooltipData) => ReactNode;
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
    showTooltip = true,
    renderTooltip,
    className,
    style,
    ...rest
}: BrazilMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState<number>(600);
    const [collection, setCollection] = useState<BrUfFeatureCollection | null>(null);
    const { hover, onMove, onLeave } = useMapHover<{ uf: UF; name: string }>(containerRef);

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
        const projection = fitProjection(
            geometriesBounds(collection.features.map((f) => f.geometry)),
            width,
            height,
            { padding },
        );
        return collection.features.map((feature) => ({
            uf: feature.properties.uf,
            name: feature.properties.name,
            d: geometryPath(feature.geometry, projection),
            centroid: geometryCentroid(feature.geometry, projection),
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
                                onMouseMove={
                                    showTooltip
                                        ? (e) => onMove({ uf: shape.uf, name: shape.name }, e)
                                        : undefined
                                }
                                onMouseLeave={showTooltip ? onLeave : undefined}
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
                            />
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

            {showTooltip && hover && (
                <MapTooltip x={hover.x} y={hover.y}>
                    {renderTooltip ? (
                        renderTooltip({
                            uf: hover.item.uf,
                            name: hover.item.name,
                            value: values?.[hover.item.uf],
                        })
                    ) : (
                        <DefaultUfTooltip
                            uf={hover.item.uf}
                            name={hover.item.name}
                            value={values?.[hover.item.uf]}
                        />
                    )}
                </MapTooltip>
            )}
        </div>
    );
}

/** Default UF tooltip: name (UF) + region + city count + optional value. */
function DefaultUfTooltip({ uf, name, value }: { uf: UF; name: string; value?: number }) {
    const state = getState(uf);
    return (
        <>
            <div className={styles.tooltipTitle}>
                {name} ({uf})
            </div>
            <div className={styles.tooltipMeta}>
                {state ? `${state.region} · ${state.cities.length} cidades` : uf}
                {typeof value === "number" ? ` · ${value}` : ""}
            </div>
        </>
    );
}
