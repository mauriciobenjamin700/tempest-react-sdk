import { describe, expect, it } from "vitest";
import {
    createRoadMatcher,
    matchToRoads,
    ROAD_MATCH_DEFAULTS,
    ROAD_MATCHER_DEFAULT_LAG,
} from "./map-matching";
import type { CommittedMatch, MatchedFix } from "./map-matching";
import { createRoadGraph } from "./road-graph";
import type { RoadEdge } from "./road-graph";
import type { Coordinate } from "./types";

const BASE: Coordinate = { latitude: -5.09, longitude: -42.8 };
const M_PER_DEG = 6371008.8 * (Math.PI / 180);

/**
 * A coordinate `x` metres east and `y` metres north of {@link BASE}.
 *
 * @param x - Metres east.
 * @param y - Metres north.
 * @returns The coordinate.
 */
function at(x: number, y: number): Coordinate {
    return {
        latitude: BASE.latitude + y / M_PER_DEG,
        longitude: BASE.longitude + x / (M_PER_DEG * Math.cos((BASE.latitude * Math.PI) / 180)),
    };
}

interface NamedEdge extends RoadEdge {
    id: string;
}

/**
 * Ids of the matched edges.
 *
 * @param matches - Matches, possibly `null`.
 * @returns The edge id of each, or `null`.
 */
function ids(matches: readonly (MatchedFix<NamedEdge> | null)[]): (string | null)[] {
    return matches.map((m) => (m === null ? null : m.edge.id));
}

/**
 * A main street along y = 0 from x = 0 to 1000 in 100 m edges, and a
 * parallel side street at y = 20 from x = 300 to 700, joined to the main
 * street only at its two ends. Everything two-way.
 */
function parallelStreets(): ReturnType<typeof createRoadGraph<NamedEdge>> {
    const nodes: Coordinate[] = [];
    const edges: NamedEdge[] = [];
    for (let i = 0; i <= 10; i += 1) nodes.push(at(i * 100, 0));
    for (let i = 0; i < 10; i += 1)
        edges.push({ from: i, to: i + 1, twoWay: true, id: `main-${i}` });
    const side = nodes.length;
    for (let i = 0; i <= 4; i += 1) nodes.push(at(300 + i * 100, 20));
    for (let i = 0; i < 4; i += 1) {
        edges.push({ from: side + i, to: side + i + 1, twoWay: true, id: `side-${i}` });
    }
    edges.push({ from: 3, to: side, twoWay: true, id: "link-west" });
    edges.push({ from: 7, to: side + 4, twoWay: true, id: "link-east" });
    return createRoadGraph({ nodes, edges });
}

describe("matchToRoads", () => {
    it("keeps the trace on the street it drives where a parallel street is nearer", () => {
        const graph = parallelStreets();
        const fixes: Coordinate[] = [];
        for (let x = 20; x <= 980; x += 15) fixes.push(at(x, x > 350 && x < 650 ? 12 : 3));
        const drifted = fixes.filter((_, i) => 20 + i * 15 > 350 && 20 + i * 15 < 650);
        expect(drifted.length).toBeGreaterThan(10);

        const result = matchToRoads(fixes, graph);

        expect(ids(result.matches).every((id) => id?.startsWith("main-"))).toBe(true);
        expect(result.routes).toHaveLength(1);
        expect(result.routes[0].edges.map((s) => s.edge.id)).toEqual(
            Array.from({ length: 10 }, (_, i) => `main-${i}`),
        );
        expect(result.breaks).toBe(0);
    });

    it("follows the parallel street when the trace really takes it", () => {
        const graph = parallelStreets();
        const fixes: Coordinate[] = [];
        for (let x = 20; x <= 290; x += 15) fixes.push(at(x, 2));
        for (let y = 2; y <= 18; y += 15) fixes.push(at(300, y));
        for (let x = 315; x <= 690; x += 15) fixes.push(at(x, 19));
        for (let x = 710; x <= 980; x += 15) fixes.push(at(x, 2));

        const result = matchToRoads(fixes, graph);
        const route = result.routes[0].edges.map((s) => s.edge.id);

        expect(route).toEqual([
            "main-0",
            "main-1",
            "main-2",
            "link-west",
            "side-0",
            "side-1",
            "side-2",
            "side-3",
            "link-east",
            "main-7",
            "main-8",
            "main-9",
        ]);
    });

    it("turns at an intersection onto the road the trace leaves by", () => {
        const graph = createRoadGraph<NamedEdge>({
            nodes: [at(-300, 0), at(0, 0), at(300, 0), at(0, -300), at(0, 300)],
            edges: [
                { from: 0, to: 1, id: "west" },
                { from: 1, to: 2, id: "east" },
                { from: 3, to: 1, id: "south" },
                { from: 1, to: 4, id: "north" },
            ],
            twoWay: true,
        });
        const fixes: Coordinate[] = [];
        for (let x = -280; x <= -20; x += 20) fixes.push(at(x, 4));
        for (let y = 20; y <= 280; y += 20) fixes.push(at(-4, y));

        const result = matchToRoads(fixes, graph);

        expect(result.routes[0].edges.map((s) => s.edge.id)).toEqual(["west", "north"]);
        expect(
            ids(result.matches)
                .slice(0, 14)
                .every((id) => id === "west"),
        ).toBe(true);
        expect(
            ids(result.matches)
                .slice(14)
                .every((id) => id === "north"),
        ).toBe(true);
    });

    it("never drives a one-way road against its direction, even when it is nearer", () => {
        const graph = createRoadGraph<NamedEdge>({
            nodes: [at(0, 0), at(0, 600), at(12, 600), at(12, 0)],
            edges: [
                { from: 0, to: 1, id: "northbound" },
                { from: 2, to: 3, id: "southbound" },
            ],
        });
        const fixes: Coordinate[] = [];
        for (let y = 580; y >= 20; y -= 20) fixes.push(at(4, y));

        const result = matchToRoads(fixes, graph);

        expect(ids(result.matches).every((id) => id === "southbound")).toBe(true);
        expect(result.matches.every((m) => m?.reversed === false)).toBe(true);
    });

    it("reports a two-way road driven from its end to its start as reversed", () => {
        const graph = createRoadGraph<NamedEdge>({
            nodes: [at(0, 0), at(500, 0)],
            edges: [{ from: 0, to: 1, twoWay: true, id: "street" }],
        });
        const fixes = [at(450, 3), at(350, 3), at(250, 3), at(170, 3)];

        const result = matchToRoads(fixes, graph);

        expect(result.matches.every((m) => m?.reversed === true)).toBe(true);
        expect(result.matches[0]?.offsetM).toBeCloseTo(50, 0);
        expect(result.routes[0].edges).toEqual([
            { edge: graph.edges[0], edgeIndex: 0, reversed: true },
        ]);
    });

    it("breaks the chain and restarts when the next fix cannot be reached", () => {
        const graph = createRoadGraph<NamedEdge>({
            nodes: [at(0, 0), at(200, 0), at(2000, 0), at(2200, 0)],
            edges: [
                { from: 0, to: 1, id: "a" },
                { from: 2, to: 3, id: "b" },
            ],
        });
        const fixes = [at(20, 2), at(100, 2), at(180, 2), at(2020, 2), at(2100, 2), at(2180, 2)];

        const result = matchToRoads(fixes, graph);

        expect(result.breaks).toBe(1);
        expect(ids(result.matches)).toEqual(["a", "a", "a", "b", "b", "b"]);
        expect(
            result.routes.map((r) => [r.firstFix, r.lastFix, r.edges.map((s) => s.edge.id)]),
        ).toEqual([
            [0, 2, ["a"]],
            [3, 5, ["b"]],
        ]);
    });

    it("leaves a fix with no road in reach unmatched without breaking the chain", () => {
        const graph = createRoadGraph<NamedEdge>({
            nodes: [at(0, 0), at(1000, 0)],
            edges: [{ from: 0, to: 1, id: "road" }],
        });
        const fixes = [at(100, 2), at(150, 2), at(200, 900), at(250, 2), at(300, 2)];

        const result = matchToRoads(fixes, graph);

        expect(ids(result.matches)).toEqual(["road", "road", null, "road", "road"]);
        expect(result.unmatched).toBe(1);
        expect(result.breaks).toBe(0);
        expect(result.routes).toHaveLength(1);
    });

    it("projects fixes closer than minSpacingM onto the edge of the last kept fix", () => {
        const graph = createRoadGraph<NamedEdge>({
            nodes: [at(0, 0), at(1000, 0)],
            edges: [{ from: 0, to: 1, id: "road" }],
        });
        const fixes = [at(100, 2), at(102, 3), at(101, 1), at(200, 2)];

        const result = matchToRoads(fixes, graph);

        expect(result.dropped).toBe(2);
        expect(result.matches.map((m) => m?.inferred)).toEqual([false, true, true, false]);
        expect(result.matches[1]?.offsetM).toBeCloseTo(102, 0);
        expect(result.matches[1]?.distanceM).toBeCloseTo(3, 0);
        expect(result.routes[0].lastFix).toBe(3);
    });

    it("keeps every fix in the model when minSpacingM is 0", () => {
        const graph = createRoadGraph<NamedEdge>({
            nodes: [at(0, 0), at(1000, 0)],
            edges: [{ from: 0, to: 1, id: "road" }],
        });
        const result = matchToRoads([at(100, 2), at(101, 2), at(102, 2)], graph, {
            minSpacingM: 0,
        });
        expect(result.dropped).toBe(0);
        expect(result.matches.every((m) => m?.inferred === false)).toBe(true);
    });

    it("rebuilds the edges between sparse fixes from the shortest path", () => {
        const nodes: Coordinate[] = [];
        const edges: NamedEdge[] = [];
        for (let i = 0; i <= 20; i += 1) nodes.push(at(i * 50, 0));
        for (let i = 0; i < 20; i += 1) edges.push({ from: i, to: i + 1, id: `e${i}` });
        const graph = createRoadGraph({ nodes, edges });

        const result = matchToRoads([at(10, 3), at(330, 3), at(640, 3), at(990, 3)], graph, {
            maxDetourM: 50,
        });

        expect(result.routes[0].edges.map((s) => s.edge.id)).toEqual(
            Array.from({ length: 20 }, (_, i) => `e${i}`),
        );
    });

    it("returns the app's own edge object, metadata included", () => {
        const edge = { from: 0, to: 1, id: "way/42", name: "Avenida Frei Serafim", maxKmh: 60 };
        const graph = createRoadGraph({ nodes: [at(0, 0), at(500, 0)], edges: [edge] });

        const result = matchToRoads([at(100, 4), at(200, 4)], graph);

        expect(result.matches[0]?.edge).toBe(edge);
        expect(result.matches[0]?.edgeIndex).toBe(0);
        expect(result.matches[0]?.distanceM).toBeCloseTo(4, 0);
        expect(result.matches[0]?.point.latitude).toBeCloseTo(BASE.latitude, 6);
    });

    it("matches nothing on an empty network", () => {
        const graph = createRoadGraph({ nodes: [], edges: [] });
        const result = matchToRoads([at(0, 0), at(50, 0)], graph);
        expect(result.matches).toEqual([null, null]);
        expect(result.unmatched).toBe(2);
        expect(result.routes).toEqual([]);
    });

    it("rejects options out of range", () => {
        const graph = createRoadGraph({ nodes: [], edges: [] });
        expect(() => matchToRoads([], graph, { sigmaM: 0 })).toThrow(RangeError);
        expect(() => matchToRoads([], graph, { betaM: -1 })).toThrow(RangeError);
        expect(() => matchToRoads([], graph, { radiusM: Number.NaN })).toThrow(RangeError);
        expect(() => matchToRoads([], graph, { maxCandidates: 2.5 })).toThrow(RangeError);
        expect(() => matchToRoads([], graph, { minSpacingM: -1 })).toThrow(RangeError);
        expect(() => matchToRoads([], graph, { maxDetourM: Infinity })).toThrow(RangeError);
    });

    it("publishes the measured defaults", () => {
        expect(ROAD_MATCH_DEFAULTS).toEqual({
            sigmaM: 7,
            betaM: 3,
            radiusM: 200,
            maxCandidates: 16,
            maxDetourM: 100,
        });
        expect(Object.isFrozen(ROAD_MATCH_DEFAULTS)).toBe(true);
        expect(ROAD_MATCHER_DEFAULT_LAG).toBe(5);
    });
});

describe("createRoadMatcher", () => {
    /**
     * Feed every fix and collect the committed matches by index.
     *
     * @param fixes - The trace.
     * @param lag - Matcher lag.
     * @returns The final match of each fix.
     */
    function live(fixes: readonly Coordinate[], lag: number): (MatchedFix<NamedEdge> | null)[] {
        const matcher = createRoadMatcher(parallelStreets(), { lag });
        const out = new Array<MatchedFix<NamedEdge> | null>(fixes.length).fill(null);
        const store = (list: CommittedMatch<NamedEdge>[]): void => {
            for (const c of list) out[c.index] = c.match;
        };
        for (const fix of fixes) store(matcher.push(fix).committed);
        store(matcher.flush());
        return out;
    }

    const trace: Coordinate[] = [];
    for (let x = 20; x <= 980; x += 15) trace.push(at(x, x > 350 && x < 650 ? 12 : 3));

    it("commits the same matches as the batch matcher when the lag covers the trace", () => {
        expect(ids(live(trace, 1000))).toEqual(ids(matchToRoads(trace, parallelStreets()).matches));
    });

    it("commits every fix exactly once, in order, with the default lag", () => {
        const matcher = createRoadMatcher(parallelStreets());
        const seen: number[] = [];
        for (const fix of trace) seen.push(...matcher.push(fix).committed.map((c) => c.index));
        expect(seen.length).toBe(trace.length - ROAD_MATCHER_DEFAULT_LAG);
        seen.push(...matcher.flush().map((c) => c.index));
        expect(seen).toEqual(trace.map((_, i) => i));
    });

    it("commits a fix at once with lag 0 and still links it to the previous one", () => {
        const matcher = createRoadMatcher(parallelStreets(), { lag: 0 });
        const first = matcher.push(at(120, 3));
        expect(first.committed.map((c) => c.index)).toEqual([0]);
        expect(first.current?.edge.id).toBe("main-1");
        matcher.push(at(170, 3));
        expect(matcher.breaks).toBe(0);
        expect(matcher.flush()).toEqual([]);
    });

    it("answers a close fix at once, projected onto the current best edge", () => {
        const matcher = createRoadMatcher(parallelStreets(), { lag: 3 });
        matcher.push(at(120, 3));
        const close = matcher.push(at(123, 4));
        expect(close.current?.inferred).toBe(true);
        expect(close.current?.edge.id).toBe("main-1");
        expect(close.committed).toEqual([]);
        expect(matcher.dropped).toBe(1);
    });

    it("commits a close fix immediately once its anchor is already final", () => {
        const matcher = createRoadMatcher(parallelStreets(), { lag: 0 });
        matcher.push(at(120, 3));
        const close = matcher.push(at(122, 3));
        expect(close.committed).toHaveLength(1);
        expect(close.committed[0].index).toBe(1);
        expect(close.committed[0].match?.inferred).toBe(true);
        expect(close.current).toBe(close.committed[0].match);
    });

    it("commits an unmatched first fix as null right away", () => {
        const matcher = createRoadMatcher(parallelStreets());
        const update = matcher.push(at(500, 5000));
        expect(update).toEqual({ index: 0, current: null, committed: [{ index: 0, match: null }] });
    });

    it("holds an unmatched fix until the fix before it commits", () => {
        const matcher = createRoadMatcher(parallelStreets(), { lag: 2 });
        matcher.push(at(120, 3));
        const far = matcher.push(at(150, 5000));
        expect(far.current).toBeNull();
        expect(far.committed).toEqual([]);
        const rest = matcher.flush();
        expect(rest.map((c) => c.index)).toEqual([0, 1]);
        expect(rest[1].match).toBeNull();
    });

    it("counts a break when the next fix cannot be reached", () => {
        const graph = createRoadGraph({
            nodes: [at(0, 0), at(200, 0), at(2000, 0), at(2200, 0)],
            edges: [
                { from: 0, to: 1 },
                { from: 2, to: 3 },
            ],
        });
        const matcher = createRoadMatcher(graph);
        for (const fix of [at(20, 2), at(100, 2), at(2020, 2), at(2100, 2)]) matcher.push(fix);
        expect(matcher.breaks).toBe(1);
    });

    it("rejects a negative or fractional lag", () => {
        expect(() => createRoadMatcher(parallelStreets(), { lag: -1 })).toThrow(RangeError);
        expect(() => createRoadMatcher(parallelStreets(), { lag: 1.5 })).toThrow(RangeError);
    });
});
