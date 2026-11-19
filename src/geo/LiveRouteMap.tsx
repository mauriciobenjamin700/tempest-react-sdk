/**
 * @tempest-limits file-lines, props-count, function-lines — a live trip map has
 * two line layers (route, trail), a vehicle, interactive markers with content,
 * follow and drag, optional self-hosted tiles and the screen-reader ETA. The
 * framing policy itself lives in `live-route-view.ts` as pure functions; what
 * stays here is wiring those to pointer, keyboard and animation frames.
 */
import {
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type HTMLAttributes,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactElement,
    type ReactNode,
} from "react";
import { cn } from "@/utils/cn";
import { boundingBox, expandBounds } from "./bounds";
import { MarkerGlyph, VehicleGlyph } from "./live-route-glyphs";
import {
    INITIAL_LIVE_VIEW_STATE,
    detachLiveView,
    fitLiveView,
    kmPerPixel,
    panLiveView,
    placePopover,
    projectLive,
    recenterLiveView,
    resolveLiveView,
    tilesForView,
    type LiveMapView,
    type LiveMapViewport,
    type LiveViewState,
} from "./live-route-view";
import { formatScale, pickScaleKm } from "./scale";
import type { Coordinate } from "./types";
import styles from "./LiveRouteMap.module.css";

/** Role of a point on the trip, which decides its glyph and color. */
export type LiveRouteMarkerKind = "origin" | "stop" | "destination";

/** A point on the trip (pickup, stop, destination) that can open content. */
export interface LiveRouteMarker extends Coordinate {
    /** Stable identity, used for the open state and `onMarkerOpenChange`. */
    id: string;
    /** Accessible name, read before the kind ("Terminal Norte, origem"). */
    label: string;
    /** Glyph and color. Default: `"stop"`. */
    kind?: LiveRouteMarkerKind;
    /** Small count drawn on the marker, e.g. passengers boarding there. Hidden when absent. */
    badge?: number;
    /** Opened in a panel by click, tap, `Enter` or `Space` on the marker. */
    content?: ReactNode;
}

/** The live vehicle position. */
export interface LiveVehicle {
    /** Last known position. */
    position: Coordinate;
    /**
     * Compass heading in degrees (0 = north, clockwise). With it the vehicle is an
     * arrow pointing that way; without it, a plain dot.
     */
    heading?: number | null;
    /** Accessible name of the vehicle glyph. Default: `"Veículo"`. */
    label?: string;
}

export interface LiveRouteMapProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** Planned route (e.g. an OSRM geometry), drawn dashed. Decides the initial framing. */
    route?: readonly Coordinate[];
    /** Path already traveled, drawn solid on top of the route. */
    trail?: readonly Coordinate[];
    /** Live vehicle. `null`/absent hides it. */
    vehicle?: LiveVehicle | null;
    /** Pickup points, stops, origin and destination. Included in the initial framing. */
    markers?: readonly LiveRouteMarker[];
    /**
     * Keep the vehicle in sight. A new position pans the map only when the vehicle
     * nears an edge, and never changes the zoom. Dragging the map pauses it and
     * shows the recenter button. Default: `false`.
     */
    follow?: boolean;
    /**
     * Text announced to screen readers through a polite live region, e.g.
     * `"Chegada estimada em 6 minutos"`. The app computes it; the map only says it.
     */
    etaLabel?: string;
    /** Viewport height in pixels. Default: `360`. */
    height?: number;
    /** Margin in pixels kept clear around the initial framing. Default: `32`. */
    padding?: number;
    /** Accessible name of the map region. Default: `"Mapa da viagem"`. */
    label?: string;
    /** Text of the button that resumes following after a drag. Default: `"Recentralizar"`. */
    recenterLabel?: string;
    /** Text of the close button of a marker panel. Default: `"Fechar"`. */
    closeLabel?: string;
    /** Spoken name of each marker kind. Default: PT-BR (`origem`, `parada`, `destino`). */
    kindLabels?: Partial<Record<LiveRouteMarkerKind, string>>;
    /** Duration of the vehicle glide between two positions, in ms. `0` jumps. Default: `600`. */
    animationMs?: number;
    /** Draw a distance scale bar. Default: `true`. */
    showScale?: boolean;
    /**
     * Tile URL template (`{z}/{x}/{y}`) of a map server **you host**. Tiles are drawn
     * under the same projection as the lines, with no extra dependency. Omit for the
     * zero-network SVG map.
     */
    tileUrl?: string;
    /** Attribution text shown over the tiles. */
    tileAttribution?: string;
    /** Highest zoom your tile server serves. Default: `19`. */
    tileMaxZoom?: number;
    /** Fired when a marker panel opens (`id`) or closes (`null`). */
    onMarkerOpenChange?: (id: string | null) => void;
}

const DEFAULT_KIND_LABELS: Record<LiveRouteMarkerKind, string> = {
    origin: "origem",
    stop: "parada",
    destination: "destino",
};

const DRAG_THRESHOLD_PX = 4;
const PANEL_MAX_WIDTH = 240;

/** Serialize a polyline for the SVG `points` attribute under the current view. */
function toPoints(
    coords: readonly Coordinate[] | undefined,
    view: LiveMapView,
    viewport: LiveMapViewport,
): string {
    if (!coords || coords.length < 2) return "";
    return coords
        .map((c) => {
            const p = projectLive(view, viewport, c);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(" ");
}

/**
 * Live trip map: the planned route (dashed) and the traveled trail (solid), the
 * vehicle with its heading, and the trip's markers, which open their content by
 * click, tap or keyboard.
 *
 * Built for a vehicle reporting its position every few seconds (SSE, WebSocket):
 * the framing is fixed by the route and markers, and a new position never refits
 * the map. With `follow`, the map pans only when the vehicle nears an edge, at
 * the same zoom. Dragging pauses follow and shows a recenter button. The vehicle
 * glides between fixes unless the user prefers reduced motion.
 *
 * It is an SVG map with no tiles and no network by default, so it works offline
 * and in tests. `tileUrl` adds tiles from a server **you host**, drawn under the
 * same projection, with no map library. There is no Google Maps path.
 *
 * Unlike `TrajectoryMap`, which plots a recorded path and refits to it on every
 * change, this component keeps its view across updates; use `TrajectoryMap` for
 * a finished trip and this one while it is happening.
 *
 * @example
 * <LiveRouteMap
 *   route={osrmGeometry}
 *   trail={traveled}
 *   vehicle={{ position: fix, heading: fix.heading }}
 *   markers={[{ id: "a", label: "Praça", kind: "origin", badge: 3, content: <p>3 embarcam</p> }]}
 *   follow
 *   etaLabel="Chegada estimada em 6 minutos"
 * />
 */
export function LiveRouteMap({
    route,
    trail,
    vehicle,
    markers,
    follow = false,
    etaLabel,
    height = 360,
    padding = 32,
    label = "Mapa da viagem",
    recenterLabel = "Recentralizar",
    closeLabel = "Fechar",
    kindLabels,
    animationMs = 600,
    showScale = true,
    tileUrl,
    tileAttribution,
    tileMaxZoom = 19,
    onMarkerOpenChange,
    className,
    style,
    ...rest
}: LiveRouteMapProps): ReactElement {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState<number>(600);
    const [openId, setOpenId] = useState<string | null>(null);
    const [viewState, setViewState] = useState<LiveViewState>(INITIAL_LIVE_VIEW_STATE);
    const [anchor, setAnchor] = useState<Coordinate | null>(
        () => vehicle?.position ?? trail?.[0] ?? null,
    );
    const drag = useRef<{
        pointerId: number;
        x: number;
        y: number;
        moved: boolean;
        from: LiveMapView;
    } | null>(null);
    const [dragging, setDragging] = useState(false);
    const swallowClick = useRef(false);
    const markerNodes = useRef(new Map<string, SVGGElement>());
    const panelRef = useRef<HTMLDivElement>(null);
    const focusPanel = useRef(false);
    const panelId = useId();
    const titleId = useId();

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

    if (!anchor && (vehicle || trail?.[0])) {
        setAnchor(vehicle?.position ?? trail?.[0] ?? null);
    }

    const viewport: LiveMapViewport = useMemo(() => ({ width, height }), [width, height]);
    const planned: Coordinate[] = [...(route ?? []), ...(markers ?? [])];
    const frame = planned.length > 0 ? planned : anchor ? [anchor] : [];
    const box = boundingBox(frame);
    const fitted = fitLiveView(box ? expandBounds(box, 0.06) : null, viewport, padding);
    const target = follow && vehicle ? vehicle.position : null;
    const resolved = resolveLiveView(viewState, { fitted, target, viewport });
    if (resolved !== viewState) setViewState(resolved);
    const view = resolved.view;

    const routePoints = useMemo(
        () => (view ? toPoints(route, view, viewport) : ""),
        [route, view, viewport],
    );
    const trailPoints = useMemo(
        () => (view ? toPoints(trail, view, viewport) : ""),
        [trail, view, viewport],
    );
    const tiles = useMemo(
        () => (view && tileUrl ? tilesForView(view, viewport, tileUrl, tileMaxZoom) : []),
        [view, viewport, tileUrl, tileMaxZoom],
    );

    const openMarker = markers?.find((m) => m.id === openId && m.content != null) ?? null;

    useEffect(() => {
        if (openMarker && focusPanel.current) {
            focusPanel.current = false;
            panelRef.current?.focus();
        }
    }, [openMarker]);

    const setOpen = (id: string | null): void => {
        setOpenId(id);
        onMarkerOpenChange?.(id);
    };

    const toggle = (marker: LiveRouteMarker): void => {
        if (openId === marker.id) {
            setOpen(null);
            return;
        }
        focusPanel.current = marker.content != null;
        setOpen(marker.id);
    };

    const closePanel = (): void => {
        const id = openId;
        setOpen(null);
        if (id) markerNodes.current.get(id)?.focus();
    };

    const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
        if (event.button !== 0 || !view) return;
        drag.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            moved: false,
            from: view,
        };
    };

    const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (!current.moved) {
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
            current.moved = true;
            setDragging(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
        }
        setViewState((prev) => detachLiveView(prev, panLiveView(current.from, dx, dy)));
    };

    const endDrag = (event: ReactPointerEvent<SVGSVGElement>): void => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        swallowClick.current = current.moved;
        drag.current = null;
        setDragging(false);
    };

    const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        if (event.key === "Escape") {
            event.stopPropagation();
            closePanel();
        }
    };

    const scale =
        showScale && view ? pickScaleKm(kmPerPixel(view), Math.min(120, width * 0.35)) : null;
    const placement =
        openMarker && view
            ? placePopover(projectLive(view, viewport, openMarker), viewport, PANEL_MAX_WIDTH)
            : null;
    const labels = { ...DEFAULT_KIND_LABELS, ...kindLabels };

    return (
        <div
            ref={containerRef}
            className={cn(styles.map, className)}
            style={{ height, ...style }}
            role="region"
            aria-label={label}
            {...rest}
        >
            {!view ? (
                <div className={styles.empty}>Sem rota para mostrar ainda.</div>
            ) : (
                <svg
                    className={cn(styles.svg, dragging && styles.dragging)}
                    width="100%"
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onClickCapture={(event) => {
                        if (swallowClick.current) {
                            swallowClick.current = false;
                            event.stopPropagation();
                        }
                    }}
                    onClick={() => {
                        if (openId) setOpen(null);
                    }}
                >
                    {tiles.length > 0 ? (
                        <g className={styles.tiles} aria-hidden="true">
                            {tiles.map((tile) => (
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
                    ) : null}
                    {routePoints ? (
                        <g aria-hidden="true">
                            <polyline className={styles.routeCasing} points={routePoints} />
                            <polyline
                                className={styles.route}
                                points={routePoints}
                                data-testid="live-route-planned"
                            />
                        </g>
                    ) : null}
                    {trailPoints ? (
                        <g aria-hidden="true">
                            <polyline className={styles.trailCasing} points={trailPoints} />
                            <polyline
                                className={styles.trail}
                                points={trailPoints}
                                data-testid="live-route-trail"
                            />
                        </g>
                    ) : null}
                    {(markers ?? []).map((marker) => {
                        const p = projectLive(view, viewport, marker);
                        return (
                            <MarkerGlyph
                                key={marker.id}
                                marker={marker}
                                x={p.x}
                                y={p.y}
                                open={openId === marker.id}
                                panelId={panelId}
                                kindLabel={labels[marker.kind ?? "stop"]}
                                onToggle={toggle}
                                markerRef={(id, node) => {
                                    if (node) markerNodes.current.set(id, node);
                                    else markerNodes.current.delete(id);
                                }}
                            />
                        );
                    })}
                    {vehicle ? (
                        <VehicleGlyph
                            vehicle={vehicle}
                            view={view}
                            viewport={viewport}
                            animationMs={animationMs}
                        />
                    ) : null}
                    {scale ? (
                        <g
                            className={styles.scale}
                            transform={`translate(16, ${height - 16})`}
                            aria-hidden="true"
                        >
                            <line x1={0} y1={0} x2={scale.pixels} y2={0} />
                            <line x1={0} y1={-4} x2={0} y2={4} />
                            <line x1={scale.pixels} y1={-4} x2={scale.pixels} y2={4} />
                            <text x={scale.pixels / 2} y={-8} textAnchor="middle">
                                {formatScale(scale.km)}
                            </text>
                        </g>
                    ) : null}
                </svg>
            )}

            {openMarker && placement ? (
                <div
                    ref={panelRef}
                    id={panelId}
                    className={cn(
                        styles.panel,
                        placement.side === "below" ? styles.below : styles.above,
                    )}
                    style={{ left: placement.left, top: placement.top }}
                    role="dialog"
                    aria-labelledby={titleId}
                    tabIndex={-1}
                    onKeyDown={onPanelKeyDown}
                >
                    <div className={styles.panelHeader}>
                        <strong id={titleId} className={styles.panelTitle}>
                            {openMarker.label}
                        </strong>
                        <button
                            type="button"
                            className={styles.close}
                            aria-label={closeLabel}
                            onClick={closePanel}
                        >
                            ×
                        </button>
                    </div>
                    <div className={styles.panelBody}>{openMarker.content}</div>
                </div>
            ) : null}

            {view && resolved.detached ? (
                <button
                    type="button"
                    className={styles.recenter}
                    onClick={() => setViewState((prev) => recenterLiveView(prev, target))}
                >
                    {recenterLabel}
                </button>
            ) : null}

            {tileUrl && tileAttribution ? (
                <span className={styles.attribution}>{tileAttribution}</span>
            ) : null}

            <p className={styles.srOnly} role="status">
                {etaLabel ?? ""}
            </p>
        </div>
    );
}
