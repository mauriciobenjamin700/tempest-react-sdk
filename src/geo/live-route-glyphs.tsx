import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import {
    interpolateCoordinate,
    interpolateHeading,
    projectLive,
    type LiveMapView,
    type LiveMapViewport,
} from "./live-route-view";
import type { LiveRouteMarker, LiveRouteMarkerKind, LiveVehicle } from "./LiveRouteMap";
import {
    EMPHASIS_FACTOR,
    MARKER_HIT_RADIUS,
    formatBadge,
    hasInnerMark,
    markerGeometry,
} from "./live-route-symbols";
import type { Coordinate } from "./types";
import styles from "./LiveRouteMap.module.css";

/** True when the user asked the system to minimize motion. */
function prefersReducedMotion(): boolean {
    return (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}

interface VehicleFrame {
    position: Coordinate;
    heading: number | null;
}

/**
 * Glide the vehicle from where it is drawn to its new position.
 *
 * The animation runs in geographic space, not in pixels, so a drag or a follow
 * pan during the glide keeps the vehicle on the road instead of sliding across
 * the screen. The drawn position lives in state, so the render that receives a
 * new fix still draws the old one and the glide starts without a one-frame jump.
 * With `prefers-reduced-motion`, without `matchMedia` or with a zero duration the
 * vehicle jumps, in a layout effect so the stale position is never painted; a
 * glide cut short by a newer fix starts the next one from where it stopped.
 */
function useVehicleGlide(target: VehicleFrame, durationMs: number): VehicleFrame {
    const [shown, setShown] = useState<VehicleFrame>(target);
    const drawn = useRef<VehicleFrame>(target);
    const { latitude, longitude } = target.position;
    const heading = target.heading;

    useLayoutEffect(() => {
        const to: VehicleFrame = { position: { latitude, longitude }, heading };
        const from = drawn.current;
        if (
            from.position.latitude === latitude &&
            from.position.longitude === longitude &&
            from.heading === heading
        ) {
            return;
        }
        const show = (frame: VehicleFrame): void => {
            drawn.current = frame;
            setShown(frame);
        };
        if (
            durationMs <= 0 ||
            prefersReducedMotion() ||
            typeof requestAnimationFrame !== "function"
        ) {
            show(to);
            return;
        }
        let handle = 0;
        let start: number | null = null;
        const step = (now: number): void => {
            if (start === null) start = now;
            const t = Math.min(1, (now - start) / durationMs);
            if (t >= 1) {
                show(to);
                return;
            }
            const eased = 1 - (1 - t) ** 3;
            show({
                position: interpolateCoordinate(from.position, to.position, eased),
                heading:
                    from.heading !== null && to.heading !== null
                        ? interpolateHeading(from.heading, to.heading, eased)
                        : to.heading,
            });
            handle = requestAnimationFrame(step);
        };
        handle = requestAnimationFrame(step);
        return () => cancelAnimationFrame(handle);
    }, [latitude, longitude, heading, durationMs]);

    return shown;
}

export interface VehicleGlyphProps {
    vehicle: LiveVehicle;
    view: LiveMapView;
    viewport: LiveMapViewport;
    animationMs: number;
    /**
     * Whether the drawn position is on a road (`"snapped"`) or the raw fix
     * because no road was in reach (`"raw"`, drawn with a dashed halo).
     * `undefined` when the map has no road graph.
     */
    roadMatch?: "snapped" | "raw";
}

/** Spoken suffix of a stale vehicle when `LiveVehicle.staleLabel` is absent. */
export const DEFAULT_STALE_LABEL = "posição desatualizada";

export interface VehicleShapeProps {
    /** Heading in degrees, or `null` for the plain dot. */
    heading: number | null;
}

/**
 * The vehicle drawing itself — halo, body and the heading arrow (or dot) — at
 * the origin, with no position, glide or accessible name. Shared by the map and
 * by `LiveRouteMapLegend`, so the legend cannot drift from what the map draws.
 */
export function VehicleShape({ heading }: VehicleShapeProps): ReactElement {
    return (
        <>
            <circle className={styles.vehicleHalo} r={18} />
            <circle className={styles.vehicleBody} r={12} />
            {heading === null ? (
                <circle className={styles.vehicleMark} r={4} />
            ) : (
                <path
                    className={styles.vehicleMark}
                    d="M0 -8 L6 6 L0 3 L-6 6 Z"
                    transform={`rotate(${heading.toFixed(1)})`}
                />
            )}
        </>
    );
}

/**
 * The vehicle: an arrow rotated to its heading, or a dot when the heading is
 * unknown. Off every road of the graph, the halo turns into a dashed ring — the
 * position is shown as reported, and the ring says it is not on the network.
 *
 * With `vehicle.stale` the body turns neutral and the halo goes away, and the
 * accessible name gains `staleLabel`: an old position drawn exactly like a live
 * one is read as live, by eye and by screen reader alike.
 */
export function VehicleGlyph({
    vehicle,
    view,
    viewport,
    animationMs,
    roadMatch,
}: VehicleGlyphProps): ReactElement {
    const shown = useVehicleGlide(
        { position: vehicle.position, heading: vehicle.heading ?? null },
        animationMs,
    );
    const p = projectLive(view, viewport, shown.position);
    const stale = vehicle.stale === true;
    const name = vehicle.label ?? "Veículo";
    return (
        <g
            className={cn(
                styles.vehicle,
                roadMatch === "raw" && styles.offRoad,
                stale && styles.vehicleStale,
            )}
            transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
            role="img"
            aria-label={stale ? `${name}, ${vehicle.staleLabel ?? DEFAULT_STALE_LABEL}` : name}
            data-testid="live-route-vehicle"
            data-road-match={roadMatch}
            data-stale={stale ? "" : undefined}
            data-heading={shown.heading === null ? undefined : shown.heading.toFixed(0)}
        >
            <VehicleShape heading={shown.heading} />
        </g>
    );
}

export interface MarkerShapeProps {
    /** Kind of the marker, which picks the shape and the color. */
    kind: LiveRouteMarkerKind;
    /** Draw the emphasis halo and the larger shape. */
    emphasis?: boolean;
    /** Short text drawn inside the shape. */
    glyphText?: string;
    /** SVG content drawn inside the shape, in a 24×24 box. */
    icon?: ReactNode;
}

/**
 * The marker drawing at the origin — shape by kind, emphasis halo, and the
 * inner mark (`glyphText`, `icon`, or the origin dot) — without the badge,
 * focus ring or hit area. Shared by the map and by `LiveRouteMapLegend`.
 *
 * The inner mark is painted in the ink of the kind's fill: `--tempest-surface`
 * on the origin's `--tempest-success-fg`, `--tempest-info-on-solid` on the
 * stop's `--tempest-info-solid`, `--tempest-danger-on-solid` on the
 * destination's `--tempest-danger-solid` — 8.65, 5.17 and 4.83:1 in the light
 * theme, 10.28, 5.25 and 5.13:1 in the dark one.
 */
export function MarkerShape({
    kind,
    emphasis = false,
    glyphText,
    icon,
}: MarkerShapeProps): ReactElement {
    const text = glyphText !== undefined && glyphText !== "" ? glyphText : null;
    const hasIcon = hasInnerMark(undefined, icon);
    const { half, outer } = markerGeometry(kind, emphasis, hasInnerMark(glyphText, icon));
    const fontSize =
        text === null ? 0 : Math.min(half * 1.2, (half * 2 - 3) / (0.62 * text.length));
    const iconSize = half * 1.2;
    return (
        <>
            {emphasis ? (
                <circle className={styles.emphasisHalo} r={outer} data-emphasis-halo="" />
            ) : null}
            {kind === "destination" ? (
                <rect
                    className={styles.markerShape}
                    x={-half}
                    y={-half}
                    width={half * 2}
                    height={half * 2}
                    rx={half / 3}
                />
            ) : (
                <circle className={styles.markerShape} r={half} />
            )}
            {text !== null ? (
                <text
                    className={styles.glyphText}
                    y={fontSize * 0.36}
                    textAnchor="middle"
                    fontSize={fontSize.toFixed(1)}
                    aria-hidden="true"
                >
                    {text}
                </text>
            ) : hasIcon ? (
                <svg
                    className={styles.glyphIcon}
                    x={-iconSize / 2}
                    y={-iconSize / 2}
                    width={iconSize}
                    height={iconSize}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    data-glyph-icon=""
                >
                    {icon}
                </svg>
            ) : kind === "origin" ? (
                <circle className={styles.markerDot} r={emphasis ? 3.5 * EMPHASIS_FACTOR : 3.5} />
            ) : null}
        </>
    );
}

export interface BadgeShapeProps {
    /** The count to draw; past 99 it reads `"99+"`. */
    count: number;
}

/**
 * The count pill drawn at the origin, without the offset that places it on a
 * marker's corner. Shared by the map and by `LiveRouteMapLegend`, so the
 * legend entry cannot drift from the badge it explains.
 */
export function BadgeShape({ count }: BadgeShapeProps): ReactElement {
    const text = formatBadge(count);
    return (
        <g className={styles.badge}>
            <rect
                x={text.length > 1 ? -4 - text.length * 3.5 : -9}
                y={-9}
                width={text.length > 1 ? 8 + text.length * 7 : 18}
                height={18}
                rx={9}
            />
            <text y={4} textAnchor="middle">
                {text}
            </text>
        </g>
    );
}

export interface MarkerGlyphProps {
    marker: LiveRouteMarker;
    x: number;
    y: number;
    open: boolean;
    panelId: string;
    kindLabel: string;
    visitedLabel: string;
    scale: number;
    onToggle: (marker: LiveRouteMarker) => void;
    markerRef: (id: string, node: SVGGElement | null) => void;
}

/**
 * One marker: the shared `MarkerShape`, an optional count badge, focusable and
 * keyboard-operable.
 *
 * The badge is drawn in a sibling group, outside the button, with no pointer
 * events: its number is already in the accessible name, and inside the button
 * its text ran into `glyphText` as the button's visible label ("2" + "3" read
 * as "23"), which axe reports as a label-in-name mismatch (WCAG 2.5.3).
 *
 * `markerScale` cannot ride on the outer `transform`, which already places the
 * marker, so the drawing sits in an inner `<g>` scaled on its own. The hit
 * circle stays outside it, so a glyph scaled below 1 keeps the 44 px target.
 */
export function MarkerGlyph({
    marker,
    x,
    y,
    open,
    panelId,
    kindLabel,
    visitedLabel,
    scale,
    onToggle,
    markerRef,
}: MarkerGlyphProps): ReactElement {
    const kind = marker.kind ?? "stop";
    const emphasis = marker.emphasis === true;
    const hasContent = marker.content !== undefined && marker.content !== null;
    const hasInner = hasInnerMark(marker.glyphText, marker.icon);
    const { outer, focus } = markerGeometry(kind, emphasis, hasInner);
    const badgeOffset = Math.max(11, outer * 0.75 + 3.5);
    const visited = marker.visited === true;
    const badge = marker.badge === undefined ? null : formatBadge(marker.badge);
    const name = [marker.label, kindLabel, visited ? visitedLabel : null, badge]
        .filter((part) => part !== null)
        .join(", ");
    const place = `translate(${x.toFixed(1)} ${y.toFixed(1)})`;
    return (
        <>
            <g
                ref={(node) => markerRef(marker.id, node)}
                className={cn(styles.marker, styles[kind], visited && styles.visited)}
                transform={place}
                role="button"
                tabIndex={0}
                aria-label={name}
                aria-expanded={hasContent ? open : undefined}
                aria-controls={hasContent && open ? panelId : undefined}
                data-marker-id={marker.id}
                data-kind={kind}
                data-emphasis={emphasis ? "" : undefined}
                data-visited={visited ? "" : undefined}
                onClick={(event) => {
                    event.stopPropagation();
                    onToggle(marker);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onToggle(marker);
                    }
                }}
            >
                <circle
                    className={styles.hit}
                    r={Math.max(MARKER_HIT_RADIUS, focus * scale)}
                    data-marker-hit=""
                />
                <g
                    transform={scale === 1 ? undefined : `scale(${scale})`}
                    data-marker-scale={scale === 1 ? undefined : scale}
                >
                    <circle className={styles.focusRing} r={focus} />
                    <MarkerShape
                        kind={kind}
                        emphasis={emphasis}
                        glyphText={marker.glyphText}
                        icon={marker.icon}
                    />
                </g>
            </g>
            {marker.badge !== undefined ? (
                <g transform={place} aria-hidden="true" data-marker-badge={marker.id}>
                    <g transform={scale === 1 ? undefined : `scale(${scale})`}>
                        <g
                            transform={`translate(${badgeOffset.toFixed(1)} ${(-badgeOffset).toFixed(1)})`}
                        >
                            <BadgeShape count={marker.badge} />
                        </g>
                    </g>
                </g>
            ) : null}
        </>
    );
}
