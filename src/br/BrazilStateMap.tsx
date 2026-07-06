import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { fitProjection } from "@/geo/projection";
import { getState, type UF } from "./locations";
import { loadStateMunicipalities, type StateMunicipalities } from "./state-geo";
import { geometriesBounds, geometryCentroid, geometryPath, lerpColor } from "./svg-utils";
import styles from "./BrazilMap.module.css";

/** A municipality identified for selection callbacks. */
export interface Municipality {
    /** 7-digit IBGE code. */
    id: string;
    /** Municipality name. */
    name: string;
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
    /** Choropleth low-end color. Default: a light primary tint. */
    minColor?: string;
    /** Choropleth high-end color. Default: the primary token. */
    maxColor?: string;
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
    height = 440,
    padding = 12,
    showLabels = false,
    label,
    loadingContent,
    className,
    style,
    ...rest
}: BrazilStateMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState<number>(600);
    const [collection, setCollection] = useState<StateMunicipalities | null>(null);

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
        return collection.features.map((feature) => ({
            id: feature.properties.id,
            name: feature.properties.name,
            d: geometryPath(feature.geometry, projection),
            centroid: geometryCentroid(feature.geometry, projection),
        }));
    }, [collection, width, height, padding]);

    function fillFor(id: string, name: string): string | undefined {
        if (!values || !valueRange) return undefined;
        const v = values[id] ?? values[name];
        if (typeof v !== "number") return undefined;
        const [min, max] = valueRange;
        const t = max === min ? 1 : (v - min) / (max - min);
        return lerpColor(minColor, maxColor, t);
    }

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
                >
                    {shapes.map((shape) => {
                        const isSelected = selectedSet.has(shape.id) || selectedSet.has(shape.name);
                        return (
                            <path
                                key={shape.id}
                                className={cn(styles.state, isSelected && styles.selected)}
                                d={shape.d}
                                fillRule="evenodd"
                                fill={isSelected ? undefined : fillFor(shape.id, shape.name)}
                                data-city-id={shape.id}
                                data-city={shape.name}
                                tabIndex={onSelect ? 0 : undefined}
                                role={onSelect ? "button" : undefined}
                                aria-label={shape.name}
                                aria-pressed={onSelect ? isSelected : undefined}
                                onClick={
                                    onSelect
                                        ? () => onSelect({ id: shape.id, name: shape.name })
                                        : undefined
                                }
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
                            >
                                <title>{shape.name}</title>
                            </path>
                        );
                    })}

                    {showLabels &&
                        shapes.map((shape) => (
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
                </svg>
            )}
        </div>
    );
}
