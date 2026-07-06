import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { fitProjection } from "@/geo/projection";
import type { GeoMarker } from "@/geo/types";
import { getState, type UF } from "./locations";
import { MapMarkers } from "./MapMarkers";
import { MapTooltip } from "./MapTooltip";
import type { ColorScale } from "./scales";
import { useMapZoom } from "./use-map-zoom";
import { loadStateMunicipalities, type StateMunicipalities } from "./state-geo";
import { geometriesBounds, geometryCentroid, geometryPath, lerpColor } from "./svg-utils";
import { useMapHover } from "./use-map-hover";
import styles from "./BrazilMap.module.css";

/** A municipality identified for selection callbacks. */
export interface Municipality {
    /** 7-digit IBGE code. */
    id: string;
    /** Municipality name. */
    name: string;
}

/** Data passed to a {@link BrazilStateMapProps.renderTooltip} callback. */
export interface BrazilStateMapTooltipData extends Municipality {
    /** Choropleth value for this municipality, if `values` was provided. */
    value?: number;
}

export interface BrazilStateMapProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
    /** Federative unit to draw (required). */
    uf: UF;
    /** Selected municipality — matched by IBGE `id` or by `name`. Accepts many. */
    selected?: string | readonly string[] | null;
    /** Fired when a municipality is clicked. */
    onSelect?: (municipality: Municipality) => void;
    /**
     * Choropleth values keyed by municipality `id` **or** `name`. When set, each
     * municipality is tinted between `minColor` and `maxColor`.
     */
    values?: Record<string, number>;
    /** Choropleth low-end color (2-color linear ramp). Default: a light primary tint. */
    minColor?: string;
    /** Choropleth high-end color (2-color linear ramp). Default: the primary token. */
    maxColor?: string;
    /**
     * Custom value→color scale (from `sequentialScale`/`quantizeScale`). Takes
     * precedence over `minColor`/`maxColor`. Pair with a `<MapLegend>`.
     */
    colorScale?: ColorScale;
    /** Viewport height in pixels. Default: `440`. */
    height?: number;
    /** Inner padding in pixels. Default: `12`. */
    padding?: number;
    /**
     * Render each municipality name at its centroid. Off by default — a state
     * can have hundreds of municipalities and labels overlap badly.
     */
    showLabels?: boolean;
    /** Accessible label. Default: derived from the state name. */
    label?: string;
    /** Content while the state geometry is loading. */
    loadingContent?: ReactNode;
    /** Show a floating tooltip (name + IBGE code + value) on hover. Default: `true`. */
    showTooltip?: boolean;
    /** Override the default tooltip content. */
    renderTooltip?: (data: BrazilStateMapTooltipData) => ReactNode;
    /** Point markers to overlay on the state (e.g. addresses, POIs). */
    markers?: readonly GeoMarker[];
    /** Fired when a marker is clicked. */
    onMarkerClick?: (marker: GeoMarker, index: number) => void;
    /** Enable wheel-zoom + drag-pan (double-click resets). Default: `false`. */
    zoomable?: boolean;
}

/**
 * Clickable submap of a single Brazilian state showing **all its
 * municipalities** as SVG paths — no external tiles or paid API. The state's
 * geometry (~40-70 KB gzip) is loaded lazily per UF, so switching states fetches
 * only what is shown.
 *
 * @example
 * const [city, setCity] = useState<string | null>(null);
 * <BrazilStateMap uf="SP" selected={city} onSelect={(m) => setCity(m.name)} />
 *
 * @example
 * // Choropleth of a metric by municipality name
 * <BrazilStateMap uf="RJ" values={{ "Rio de Janeiro": 100, Niterói: 40 }} />
 */
export function BrazilStateMap({
    uf,
    selected,
    onSelect,
    values,
    minColor = "#dbeafe",
    maxColor = "#2563eb",
    colorScale,
    height = 440,
    padding = 12,
    showLabels = false,
    label,
    loadingContent,
    showTooltip = true,
    renderTooltip,
    markers,
    onMarkerClick,
    zoomable = false,
    className,
    style,
    ...rest
}: BrazilStateMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState<number>(600);
    const [collection, setCollection] = useState<StateMunicipalities | null>(null);
    const mapZoom = useMapZoom(zoomable);
    const { hover, onMove, onLeave } = useMapHover<Municipality>(containerRef);

    useEffect(() => {
        let active = true;
        setCollection(null);
        void loadStateMunicipalities(uf).then((data) => {
            if (active) setCollection(data);
        });
        return () => {
            active = false;
        };
    }, [uf]);

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

    const selectedSet = useMemo<Set<string>>(() => {
        if (!selected) return new Set();
        return new Set(Array.isArray(selected) ? selected : [selected as string]);
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
        const items = collection.features.map((feature) => ({
            id: feature.properties.id,
            name: feature.properties.name,
            d: geometryPath(feature.geometry, projection),
            centroid: geometryCentroid(feature.geometry, projection),
        }));
        return { projection, items };
    }, [collection, width, height, padding]);

    function fillFor(id: string, name: string): string | undefined {
        const v = values?.[id] ?? values?.[name];
        if (typeof v !== "number") return undefined;
        if (colorScale) return colorScale(v);
        if (!valueRange) return undefined;
        const [min, max] = valueRange;
        const t = max === min ? 1 : (v - min) / (max - min);
        return lerpColor(minColor, maxColor, t);
    }

    // Memoized so hover re-renders don't rebuild hundreds of municipality paths.
    const cityEls = useMemo(() => {
        if (!shapes) return null;
        return shapes.items.map((shape) => {
            const isSelected = selectedSet.has(shape.id) || selectedSet.has(shape.name);
            const fillColor = isSelected ? undefined : fillFor(shape.id, shape.name);
            return (
                <path
                    key={shape.id}
                    className={cn(styles.state, isSelected && styles.selected)}
                    d={shape.d}
                    fillRule="evenodd"
                    style={fillColor ? { fill: fillColor } : undefined}
                    data-city-id={shape.id}
                    data-city={shape.name}
                    tabIndex={onSelect ? 0 : undefined}
                    role={onSelect ? "button" : undefined}
                    aria-label={shape.name}
                    aria-pressed={onSelect ? isSelected : undefined}
                    onClick={
                        onSelect ? () => onSelect({ id: shape.id, name: shape.name }) : undefined
                    }
                    onMouseMove={
                        showTooltip
                            ? (e) => onMove({ id: shape.id, name: shape.name }, e)
                            : undefined
                    }
                    onMouseLeave={showTooltip ? onLeave : undefined}
                    onKeyDown={
                        onSelect
                            ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      onSelect({ id: shape.id, name: shape.name });
                                  }
                              }
                            : undefined
                    }
                />
            );
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        shapes,
        selectedSet,
        values,
        colorScale,
        minColor,
        maxColor,
        onSelect,
        showTooltip,
        onMove,
        onLeave,
    ]);

    const resolvedLabel = label ?? `Municípios de ${getState(uf)?.name ?? uf}`;

    return (
        <div
            ref={containerRef}
            className={cn(styles.map, className)}
            style={{ height, ...style }}
            role="group"
            aria-label={resolvedLabel}
            {...rest}
        >
            {!shapes ? (
                <div className={styles.loading}>{loadingContent ?? "Carregando municípios…"}</div>
            ) : (
                <svg
                    className={styles.svg}
                    width="100%"
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    preserveAspectRatio="xMidYMid meet"
                    {...mapZoom.handlers}
                >
                    <g transform={mapZoom.transform || undefined}>
                        {cityEls}

                        {showLabels &&
                            shapes.items.map((shape) => (
                                <text
                                    key={`label-${shape.id}`}
                                    className={styles.label}
                                    x={shape.centroid.x}
                                    y={shape.centroid.y}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                >
                                    {shape.name}
                                </text>
                            ))}

                        {markers && markers.length > 0 && (
                            <MapMarkers
                                projection={shapes.projection}
                                markers={markers}
                                onMarkerClick={onMarkerClick}
                            />
                        )}
                    </g>
                </svg>
            )}

            {mapZoom.isTransformed && (
                <button type="button" className={styles.zoomReset} onClick={mapZoom.reset}>
                    Reset
                </button>
            )}

            {showTooltip && hover && (
                <MapTooltip x={hover.x} y={hover.y}>
                    {renderTooltip ? (
                        renderTooltip({
                            ...hover.item,
                            value: values?.[hover.item.id] ?? values?.[hover.item.name],
                        })
                    ) : (
                        <>
                            <div className={styles.tooltipTitle}>{hover.item.name}</div>
                            <div className={styles.tooltipMeta}>
                                IBGE {hover.item.id}
                                {(() => {
                                    const v = values?.[hover.item.id] ?? values?.[hover.item.name];
                                    return typeof v === "number" ? ` · ${v}` : "";
                                })()}
                            </div>
                        </>
                    )}
                </MapTooltip>
            )}
        </div>
    );
}
