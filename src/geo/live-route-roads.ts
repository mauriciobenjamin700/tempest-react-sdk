import { useEffect, useMemo, useRef, useState } from "react";
import { projectLive, type LiveMapView, type LiveMapViewport } from "./live-route-view";
import type * as LiveRouteSnap from "./live-route-snap";
import type { VehicleOnRoad } from "./live-route-snap";
import type { MatchedFix, RoadFix } from "./map-matching";
import type { RoadEdge, RoadGraph } from "./road-graph";
import type { Coordinate } from "./types";

type SnapModule = typeof LiveRouteSnap;

let loadedModule: SnapModule | null = null;
let pendingModule: Promise<SnapModule> | null = null;

/**
 * Load the snapping module (and the map matcher behind it) on first use and
 * keep it for every later map.
 *
 * It is a dynamic import so `LiveRouteMap` costs little for an app that never
 * passes `roads`: the bundler emits the matcher as its own chunk, fetched the
 * first time a map with a graph mounts. A failed load is forgotten, so the
 * next map with a graph tries again instead of inheriting the rejection.
 *
 * @returns The module.
 */
function loadSnapModule(): Promise<SnapModule> {
    pendingModule ??= import("./live-route-snap").then(
        (mod) => {
            loadedModule = mod;
            return mod;
        },
        (error: unknown) => {
            pendingModule = null;
            throw error;
        },
    );
    return pendingModule;
}

/** What {@link useRoadSnap} hands back to the map. */
export interface RoadSnap<E extends RoadEdge = RoadEdge> {
    /** The vehicle on the road; `null` until the matcher is loaded, or with no vehicle. */
    vehicle: VehicleOnRoad<E> | null;
    /** The trail matched to the roads, one polyline per unbroken run; `null` until loaded. */
    trail: Coordinate[][] | null;
}

/**
 * Snap the live vehicle (and the trail) of a `LiveRouteMap` to a road graph.
 *
 * The vehicle runs through `createVehicleSnapper` (a `createRoadMatcher` with
 * its default lag), one push per new position, its `timestamp` included when
 * the position has one — that is what keeps a vehicle reporting every few
 * seconds chained to the road. The matcher lives as long as
 * the graph object does; a new graph starts a new chain.
 *
 * The trail is matched in one batch whenever it changes (`matchToRoads`,
 * ~3 ms per thousand fixes measured on desktop), which recovers the roads
 * driven between fixes.
 *
 * `onMatch` fires once per new position with the match, or `null` when the
 * position is off every road.
 *
 * @param roads - The graph, or `undefined` for no snapping at all.
 * @param position - The live vehicle position.
 * @param trail - The raw trail.
 * @param onMatch - Called with each new match.
 * @returns The snapped vehicle and trail, both `null` while not in play.
 */
export function useRoadSnap<E extends RoadEdge>(
    roads: RoadGraph<E> | undefined,
    position: RoadFix | undefined,
    trail: readonly RoadFix[] | undefined,
    onMatch: ((match: MatchedFix<E> | null) => void) | undefined,
): RoadSnap<E> {
    const [mod, setMod] = useState<SnapModule | null>(() => loadedModule);

    useEffect(() => {
        if (!roads || mod) return;
        let alive = true;
        loadSnapModule().then(
            (loaded) => {
                if (alive) setMod(loaded);
            },
            () => undefined,
        );
        return () => {
            alive = false;
        };
    }, [roads, mod]);

    const snapVehicle = useMemo(
        () => (mod && roads ? mod.createVehicleSnapper(roads) : null),
        [mod, roads],
    );
    const latitude = position?.latitude;
    const longitude = position?.longitude;
    const timestamp = position?.timestamp;

    const vehicle = useMemo<VehicleOnRoad<E> | null>(() => {
        if (!snapVehicle || latitude === undefined || longitude === undefined) return null;
        return snapVehicle(
            timestamp === undefined ? { latitude, longitude } : { latitude, longitude, timestamp },
        );
    }, [snapVehicle, latitude, longitude, timestamp]);

    const snappedTrail = useMemo(
        () => (mod && roads && trail && trail.length > 0 ? mod.snapTrail(trail, roads) : null),
        [mod, roads, trail],
    );

    const onMatchRef = useRef(onMatch);
    useEffect(() => {
        onMatchRef.current = onMatch;
    });
    useEffect(() => {
        if (vehicle) onMatchRef.current?.(vehicle.match);
    }, [vehicle]);

    return { vehicle, trail: snappedTrail };
}

const ROAD_CULL_MARGIN_PX = 16;

/**
 * Serialize every road of the graph that crosses the viewport as one SVG
 * path, one `M…L…` pair per edge.
 *
 * Nodes are projected once per view, and an edge whose two ends sit beyond the
 * same edge of the viewport is skipped, so a city-sized graph costs the streets
 * on screen in the DOM, not the whole network. Two directions of one road
 * given as two edges overlap exactly, which is invisible.
 *
 * @param roads - The graph.
 * @param view - Current view.
 * @param viewport - Viewport size.
 * @returns The `d` attribute; empty when no road is on screen.
 */
export function roadsPath(
    roads: RoadGraph<RoadEdge>,
    view: LiveMapView,
    viewport: LiveMapViewport,
): string {
    const points = roads.nodes.map((node) => projectLive(view, viewport, node));
    const min = -ROAD_CULL_MARGIN_PX;
    const maxX = viewport.width + ROAD_CULL_MARGIN_PX;
    const maxY = viewport.height + ROAD_CULL_MARGIN_PX;
    let d = "";
    for (const edge of roads.edges) {
        const a = points[edge.from];
        const b = points[edge.to];
        if (
            (a.x < min && b.x < min) ||
            (a.x > maxX && b.x > maxX) ||
            (a.y < min && b.y < min) ||
            (a.y > maxY && b.y > maxY)
        ) {
            continue;
        }
        d += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return d;
}

/**
 * Serialize several polylines as one SVG path, under the current view.
 *
 * @param lines - Polylines; any with fewer than two points is skipped.
 * @param view - Current view.
 * @param viewport - Viewport size.
 * @returns The `d` attribute; empty when nothing is drawable.
 */
export function linesPath(
    lines: readonly (readonly Coordinate[])[],
    view: LiveMapView,
    viewport: LiveMapViewport,
): string {
    let d = "";
    for (const line of lines) {
        if (line.length < 2) continue;
        line.forEach((c, i) => {
            const p = projectLive(view, viewport, c);
            d += `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        });
    }
    return d;
}
