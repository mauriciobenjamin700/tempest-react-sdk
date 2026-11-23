import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { BadgeShape, MarkerShape, VehicleShape } from "./live-route-glyphs";
import {
    badgeHalfWidth,
    hasInnerMark,
    markerGeometry,
    resolveMarkerScale,
} from "./live-route-symbols";
import type { LiveRouteMarkerKind } from "./LiveRouteMap";
import styles from "./LiveRouteMap.module.css";

/**
 * What a legend entry shows: a marker kind, the vehicle, one of the two lines,
 * or the count badge a marker carries.
 */
export type LiveRouteLegendSymbol = LiveRouteMarkerKind | "vehicle" | "route" | "trail" | "badge";

/** One entry of `LiveRouteMapLegend`. */
export interface LiveRouteLegendItem {
    /** The symbol drawn next to the text. */
    symbol: LiveRouteLegendSymbol;
    /** The text of the entry, e.g. `"Seu embarque"`. */
    label: string;
    /** For a marker kind: draw it emphasized, as `LiveRouteMarker.emphasis` does. */
    emphasis?: boolean;
    /** For a marker kind: text inside the glyph, as `LiveRouteMarker.glyphText` does. */
    glyphText?: string;
    /** For a marker kind: SVG content inside the glyph, as `LiveRouteMarker.icon` does. */
    icon?: ReactNode;
    /** For a marker kind: draw it as already visited, as `LiveRouteMarker.visited` does. */
    visited?: boolean;
    /** For `"vehicle"`: draw it with an old position, as `LiveVehicle.stale` does. */
    stale?: boolean;
    /** For `"badge"`: the number drawn in the pill. Default: `1`. */
    badge?: number;
}

export interface LiveRouteMapLegendProps extends Omit<
    HTMLAttributes<HTMLUListElement>,
    "children"
> {
    /**
     * The entries, in order. Default: origin, stop, destination, vehicle,
     * planned route and traveled trail, with PT-BR labels.
     */
    items?: readonly LiveRouteLegendItem[];
    /** Same factor as the map's `markerScale`, so the legend matches it. Default: `1`. */
    markerScale?: number;
    /** Accessible name of the list. Default: `"Legenda do mapa"`. */
    label?: string;
}

/** The default entries: every symbol the map draws, named in PT-BR. */
const DEFAULT_ITEMS: readonly LiveRouteLegendItem[] = [
    { symbol: "origin", label: "Origem" },
    { symbol: "stop", label: "Parada" },
    { symbol: "destination", label: "Destino" },
    { symbol: "vehicle", label: "Veículo" },
    { symbol: "route", label: "Rota planejada" },
    { symbol: "trail", label: "Trajeto percorrido" },
];

const LINE_HALF_LENGTH = 14;
const VEHICLE_HALF_SIZE = 18;
const DEFAULT_BADGE_COUNT = 1;

/**
 * Half the size of the box a symbol needs, before `markerScale`.
 *
 * @param item - The legend entry.
 * @returns Half the width and height of its SVG box, in px.
 */
function symbolHalfSize(item: LiveRouteLegendItem): number {
    if (item.symbol === "vehicle") return VEHICLE_HALF_SIZE;
    if (item.symbol === "route" || item.symbol === "trail") return LINE_HALF_LENGTH;
    if (item.symbol === "badge") return badgeHalfWidth(item.badge ?? DEFAULT_BADGE_COUNT) + 2;
    const inner = hasInnerMark(item.glyphText, item.icon);
    return markerGeometry(item.symbol, item.emphasis === true, inner).outer + 2;
}

/**
 * The drawing of one legend symbol at the origin, with the map's own classes.
 *
 * @param item - The legend entry.
 * @returns The SVG content.
 */
function LegendSymbol({ item }: { item: LiveRouteLegendItem }): ReactElement {
    if (item.symbol === "vehicle") {
        return (
            <g className={item.stale === true ? styles.vehicleStale : undefined}>
                <VehicleShape heading={0} />
            </g>
        );
    }
    if (item.symbol === "badge") return <BadgeShape count={item.badge ?? DEFAULT_BADGE_COUNT} />;
    if (item.symbol === "route" || item.symbol === "trail") {
        const casing = item.symbol === "route" ? styles.routeCasing : styles.trailCasing;
        const line = item.symbol === "route" ? styles.route : styles.trail;
        return (
            <>
                <line className={casing} x1={-LINE_HALF_LENGTH + 4} x2={LINE_HALF_LENGTH - 4} />
                <line className={line} x1={-LINE_HALF_LENGTH + 4} x2={LINE_HALF_LENGTH - 4} />
            </>
        );
    }
    return (
        <g className={cn(styles[item.symbol], item.visited === true && styles.visited)}>
            <MarkerShape
                kind={item.symbol}
                emphasis={item.emphasis}
                glyphText={item.glyphText}
                icon={item.icon}
            />
        </g>
    );
}

/**
 * Legend for `LiveRouteMap`, drawn with the map's own glyphs and colors.
 *
 * Each app used to draw its legend by hand, with SVGs imitating the glyphs — and
 * a theme change or a new glyph in the SDK left those behind. This one renders
 * the same `MarkerShape`/`VehicleShape` and reads the same CSS as the map, so an
 * override of `--tempest-info-solid` on a common ancestor recolors both. Each
 * symbol is decorative (`aria-hidden`); the text is what a screen reader reads.
 *
 * The states the map draws have entries too: `visited` on a marker kind,
 * `stale` on the vehicle, and the `"badge"` symbol for the count pill — each
 * read from the same rules as the map, so the legend explains the number on a
 * stop instead of leaving it to guesswork.
 *
 * @example
 * <LiveRouteMapLegend
 *   items={[
 *     { symbol: "stop", label: "Seu embarque", emphasis: true },
 *     { symbol: "stop", label: "Parada (ordem da viagem)", glyphText: "1" },
 *     { symbol: "destination", label: "Chegada" },
 *     { symbol: "vehicle", label: "Ônibus" },
 *     { symbol: "stop", label: "Parada atendida", visited: true },
 *     { symbol: "badge", label: "Embarques na parada", badge: 3 },
 *   ]}
 * />
 */
export function LiveRouteMapLegend({
    items = DEFAULT_ITEMS,
    markerScale,
    label = "Legenda do mapa",
    className,
    ...rest
}: LiveRouteMapLegendProps): ReactElement {
    const scale = resolveMarkerScale(markerScale);
    return (
        <ul className={cn(styles.legend, className)} aria-label={label} {...rest}>
            {items.map((item, index) => {
                const half = symbolHalfSize(item);
                const scaled =
                    item.symbol === "route" || item.symbol === "trail" || item.symbol === "vehicle"
                        ? 1
                        : scale;
                const size = Math.ceil(half * 2 * scaled);
                return (
                    <li
                        key={`${item.symbol}-${index.toString()}`}
                        className={styles.legendItem}
                        data-symbol={item.symbol}
                    >
                        <svg
                            className={styles.legendSymbol}
                            width={size}
                            height={size}
                            viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}
                            aria-hidden="true"
                            focusable="false"
                        >
                            <LegendSymbol item={item} />
                        </svg>
                        <span>{item.label}</span>
                    </li>
                );
            })}
        </ul>
    );
}
