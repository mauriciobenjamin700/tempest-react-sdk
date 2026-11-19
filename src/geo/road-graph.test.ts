import { describe, expect, it } from "vitest";
import {
    candidatesNear,
    createRoadGraph,
    fromPlane,
    networkDistance,
    networkPath,
    roadGraphCore,
    runDijkstra,
    toPlane,
} from "./road-graph";
import type { RoadGraph } from "./road-graph";
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

describe("createRoadGraph", () => {
    it("splits a two-way edge into both directions and keeps one-way edges single", () => {
        const graph = createRoadGraph({
            nodes: [at(0, 0), at(100, 0), at(200, 0)],
            edges: [
                { from: 0, to: 1, twoWay: true },
                { from: 1, to: 2 },
            ],
        });
        expect(graph.directedEdgeCount).toBe(3);
    });

    it("applies the graph-level twoWay default to edges that do not set it", () => {
        const graph = createRoadGraph({
            nodes: [at(0, 0), at(100, 0), at(200, 0)],
            edges: [
                { from: 0, to: 1 },
                { from: 1, to: 2, twoWay: false },
            ],
            twoWay: true,
        });
        expect(graph.directedEdgeCount).toBe(3);
    });

    it("returns the app's nodes and edges untouched", () => {
        const nodes = [at(0, 0), at(100, 0)];
        const edges = [{ from: 0, to: 1, id: "way/1", name: "Rua A" }];
        const graph = createRoadGraph({ nodes, edges });
        expect(graph.nodes).toBe(nodes);
        expect(graph.edges[0]).toBe(edges[0]);
    });

    it("rejects an edge that points at a node that does not exist", () => {
        expect(() => createRoadGraph({ nodes: [at(0, 0)], edges: [{ from: 0, to: 1 }] })).toThrow(
            RangeError,
        );
        expect(() => createRoadGraph({ nodes: [at(0, 0)], edges: [{ from: -1, to: 0 }] })).toThrow(
            RangeError,
        );
        expect(() =>
            createRoadGraph({ nodes: [at(0, 0), at(1, 0)], edges: [{ from: 0.5, to: 1 }] }),
        ).toThrow(RangeError);
    });

    it("rejects a node that is not a finite coordinate", () => {
        expect(() =>
            createRoadGraph({
                nodes: [at(0, 0), { latitude: Number.NaN, longitude: 0 }],
                edges: [],
            }),
        ).toThrow(RangeError);
    });

    it("builds an empty graph without failing", () => {
        const graph = createRoadGraph({ nodes: [], edges: [] });
        expect(graph.directedEdgeCount).toBe(0);
        expect(candidatesNear(roadGraphCore(graph), 0, 0, 100, 4)).toEqual([]);
    });
});

describe("roadGraphCore", () => {
    it("refuses an object that only looks like a graph", () => {
        const lookalike: RoadGraph = { nodes: [], edges: [], directedEdgeCount: 0 };
        expect(() => roadGraphCore(lookalike)).toThrow(TypeError);
    });
});

describe("plane projection", () => {
    it("round-trips a coordinate within a millimetre", () => {
        const graph = createRoadGraph({ nodes: [at(0, 0), at(5000, 3000)], edges: [] });
        const core = roadGraphCore(graph);
        const point = at(1234, 567);
        const [x, y] = toPlane(core, point);
        const back = fromPlane(core, x, y);
        expect(Math.abs(back.latitude - point.latitude) * M_PER_DEG).toBeLessThan(0.001);
        expect(Math.abs(back.longitude - point.longitude) * M_PER_DEG).toBeLessThan(0.001);
    });

    it("measures distances in metres", () => {
        const graph = createRoadGraph({ nodes: [at(0, 0), at(1000, 0)], edges: [] });
        const core = roadGraphCore(graph);
        const [ax, ay] = toPlane(core, at(0, 0));
        const [bx, by] = toPlane(core, at(1000, 0));
        expect(Math.hypot(bx - ax, by - ay)).toBeCloseTo(1000, 0);
    });
});

describe("candidatesNear", () => {
    const graph = createRoadGraph({
        nodes: [at(0, 0), at(1000, 0), at(0, 30), at(1000, 30), at(0, 300), at(1000, 300)],
        edges: [
            { from: 0, to: 1, twoWay: true },
            { from: 2, to: 3 },
            { from: 4, to: 5 },
        ],
    });
    const core = roadGraphCore(graph);

    it("finds a long segment from a point near its middle, far from both ends", () => {
        const [x, y] = toPlane(core, at(500, 10));
        const found = candidatesNear(core, x, y, 50, 8);
        expect(found.map((c) => core.dirEdge[c.dir]).sort()).toEqual([0, 0, 1]);
    });

    it("keeps only the nearest roads, counting a two-way road once", () => {
        const [x, y] = toPlane(core, at(500, 10));
        const found = candidatesNear(core, x, y, 50, 1);
        expect(found).toHaveLength(2);
        expect(found[0].distance).toBeCloseTo(10, 0);
        expect(found[1].offset).toBeCloseTo(500, 0);
    });

    it("leaves out roads beyond the radius", () => {
        const [x, y] = toPlane(core, at(500, 10));
        const found = candidatesNear(core, x, y, 15, 8);
        expect(new Set(found.map((c) => core.dirEdge[c.dir]))).toEqual(new Set([0]));
    });
});

describe("runDijkstra", () => {
    it("finds the shortest directed path and its edges", () => {
        const graph = createRoadGraph({
            nodes: [at(0, 0), at(100, 0), at(200, 0), at(100, 100)],
            edges: [
                { from: 0, to: 1 },
                { from: 1, to: 2 },
                { from: 0, to: 3 },
                { from: 3, to: 2 },
            ],
        });
        const core = roadGraphCore(graph);
        runDijkstra(core, 0, [2], Infinity);
        expect(networkDistance(core, 2)).toBeCloseTo(200, 0);
        expect(networkPath(core, 2).map((d) => core.dirEdge[d])).toEqual([0, 1]);
    });

    it("does not report a node beyond the limit", () => {
        const graph = createRoadGraph({
            nodes: [at(0, 0), at(100, 0), at(200, 0)],
            edges: [
                { from: 0, to: 1 },
                { from: 1, to: 2 },
            ],
        });
        const core = roadGraphCore(graph);
        runDijkstra(core, 0, [2], 150);
        expect(networkDistance(core, 2)).toBe(Infinity);
        expect(networkDistance(core, 1)).toBeCloseTo(100, 0);
    });

    it("explores a hub wider than its initial heap", () => {
        const spokes = 200;
        const nodes = [at(0, 0)];
        const edges = [];
        for (let i = 0; i < spokes; i += 1) {
            const angle = (2 * Math.PI * i) / spokes;
            nodes.push(at(100 * Math.cos(angle), 100 * Math.sin(angle)));
            edges.push({ from: 0, to: i + 1 });
        }
        const core = roadGraphCore(createRoadGraph({ nodes, edges }));
        runDijkstra(core, 0, [spokes], Infinity);
        expect(networkDistance(core, spokes)).toBeCloseTo(100, 0);
    });
});
