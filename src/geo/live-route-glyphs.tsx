import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { cn } from "@/utils/cn";
import {
    interpolateCoordinate,
    interpolateHeading,
    projectLive,
    type LiveMapView,
    type LiveMapViewport,
} from "./live-route-view";
import type { LiveRouteMarker, LiveVehicle } from "./LiveRouteMap";
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
}

/** The vehicle: an arrow rotated to its heading, or a dot when the heading is unknown. */
export function VehicleGlyph({
    vehicle,
    view,
    viewport,
    animationMs,
}: VehicleGlyphProps): ReactElement {
    const shown = useVehicleGlide(
        { position: vehicle.position, heading: vehicle.heading ?? null },
        animationMs,
    );
    const p = projectLive(view, viewport, shown.position);
    return (
        <g
            className={styles.vehicle}
            transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
            role="img"
            aria-label={vehicle.label ?? "Veículo"}
            data-testid="live-route-vehicle"
            data-heading={shown.heading === null ? undefined : shown.heading.toFixed(0)}
        >
            <circle className={styles.vehicleHalo} r={18} />
            <circle className={styles.vehicleBody} r={12} />
            {shown.heading === null ? (
                <circle className={styles.vehicleMark} r={4} />
            ) : (
                <path
                    className={styles.vehicleMark}
                    d="M0 -8 L6 6 L0 3 L-6 6 Z"
                    transform={`rotate(${shown.heading.toFixed(1)})`}
                />
            )}
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
    onToggle: (marker: LiveRouteMarker) => void;
    markerRef: (id: string, node: SVGGElement | null) => void;
}

/** One marker: shape by kind, optional count badge, focusable and keyboard-operable. */
export function MarkerGlyph({
    marker,
    x,
    y,
    open,
    panelId,
    kindLabel,
    onToggle,
    markerRef,
}: MarkerGlyphProps): ReactElement {
    const kind = marker.kind ?? "stop";
    const hasContent = marker.content !== undefined && marker.content !== null;
    const badgeText =
        marker.badge === undefined ? null : marker.badge > 99 ? "99+" : String(marker.badge);
    const name = `${marker.label}, ${kindLabel}${badgeText === null ? "" : `, ${badgeText}`}`;
    return (
        <g
            ref={(node) => markerRef(marker.id, node)}
            className={cn(styles.marker, styles[kind])}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
            role="button"
            tabIndex={0}
            aria-label={name}
            aria-expanded={hasContent ? open : undefined}
            aria-controls={hasContent && open ? panelId : undefined}
            data-marker-id={marker.id}
            data-kind={kind}
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
            <circle className={styles.focusRing} r={16} />
            {kind === "destination" ? (
                <rect className={styles.markerShape} x={-9} y={-9} width={18} height={18} rx={3} />
            ) : (
                <circle className={styles.markerShape} r={kind === "origin" ? 10 : 8} />
            )}
            {kind === "origin" ? <circle className={styles.markerDot} r={3.5} /> : null}
            {badgeText !== null ? (
                <g className={styles.badge} transform="translate(11 -11)" aria-hidden="true">
                    <rect
                        x={badgeText.length > 1 ? -4 - badgeText.length * 3.5 : -9}
                        y={-9}
                        width={badgeText.length > 1 ? 8 + badgeText.length * 7 : 18}
                        height={18}
                        rx={9}
                    />
                    <text y={4} textAnchor="middle">
                        {badgeText}
                    </text>
                </g>
            ) : null}
        </g>
    );
}
