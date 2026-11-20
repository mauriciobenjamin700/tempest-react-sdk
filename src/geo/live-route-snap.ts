import { bearingDeg } from "./distance";
import { createRoadMatcher, matchToRoads, type MatchedFix } from "./map-matching";
import type { RoadEdge, RoadGraph } from "./road-graph";
import type { Coordinate } from "./types";

/** Where the live map draws the vehicle once the graph is in play. */
export interface VehicleOnRoad<E extends RoadEdge = RoadEdge> {
    /** The matched point, or the raw position when no road is in reach. */
    position: Coordinate;
    /** Direction of travel along the matched edge; `null` when unmatched. */
    heading: number | null;
    /** The match itself, `null` when the position is off every road. */
    match: MatchedFix<E> | null;
}

/**
 * Compass heading of a matched edge in the direction it is driven.
 *
 * @param roads - The graph the match came from.
 * @param match - The match.
 * @returns Degrees, 0 = north, clockwise.
 */
function edgeHeading<E extends RoadEdge>(roads: RoadGraph<E>, match: MatchedFix<E>): number {
    const a = roads.nodes[match.edge.from];
    const b = roads.nodes[match.edge.to];
    return match.reversed ? bearingDeg(b, a) : bearingDeg(a, b);
}

/**
 * Match a whole trail and turn the result into drawable polylines.
 *
 * Each unbroken run of the match becomes one polyline: the first matched
 * point, the node where every driven edge hands over to the next — which is
 * how the line turns the corner instead of cutting it — and the last matched
 * point. Fixes with no road in reach are left out of the line; a chain break
 * starts a new one, and a run with a single matched position draws nothing,
 * like a one-point trail.
 *
 * @param trail - The raw trail.
 * @param roads - The graph.
 * @returns One polyline per run, in order.
 */
export function snapTrail<E extends RoadEdge>(
    trail: readonly Coordinate[],
    roads: RoadGraph<E>,
): Coordinate[][] {
    const result = matchToRoads(trail, roads);
    const lines: Coordinate[][] = [];
    for (const route of result.routes) {
        let first: Coordinate | null = null;
        let last: Coordinate | null = null;
        for (let i = route.firstFix; i <= route.lastFix; i += 1) {
            const point = result.matches[i]?.point;
            if (point === undefined) continue;
            first ??= point;
            last = point;
        }
        if (first === null || last === null || (first === last && route.edges.length === 1)) {
            continue;
        }
        const line: Coordinate[] = [first];
        for (let k = 0; k < route.edges.length - 1; k += 1) {
            const step = route.edges[k];
            line.push(roads.nodes[step.reversed ? step.edge.from : step.edge.to]);
        }
        line.push(last);
        lines.push(line);
    }
    return lines;
}

/**
 * A live snapper for one graph: a `createRoadMatcher` with its default lag,
 * fed one position per call.
 *
 * The returned point is the matcher's best guess for the fix just received,
 * which already weighs every fix before it, so a parallel street a few metres
 * closer does not steal the vehicle. Pushing the same position twice is
 * harmless — the repeat falls inside the matcher's minimum spacing and lands
 * where the first one did — so a double render under `StrictMode` does not
 * skew the model.
 *
 * @param roads - The graph.
 * @returns A function from the raw position to where the vehicle is drawn.
 */
export function createVehicleSnapper<E extends RoadEdge>(
    roads: RoadGraph<E>,
): (position: Coordinate) => VehicleOnRoad<E> {
    const matcher = createRoadMatcher(roads);
    return (position) => {
        const { current } = matcher.push(position);
        return current
            ? { position: current.point, heading: edgeHeading(roads, current), match: current }
            : { position, heading: null, match: null };
    };
}
