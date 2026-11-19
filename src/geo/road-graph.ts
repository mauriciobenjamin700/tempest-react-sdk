import { EARTH_RADIUS_KM, toRadians } from "./distance";
import type { Coordinate } from "./types";

/**
 * One road segment between two nodes of a {@link RoadGraph}, as the app hands
 * it over. `from`/`to` are **indices** into the graph's `nodes` array — the
 * compact form a backend serializes an OpenStreetMap excerpt or a vector tile
 * into. Any other field (`id`, road class, name, speed limit) is the app's own
 * and comes back untouched on every match, so the edge type is generic.
 *
 * A road drawn as a polyline is several edges, one per consecutive pair of its
 * vertices: the matcher works on straight segments.
 */
export interface RoadEdge {
    /** Index of the start node in `nodes`. */
    from: number;
    /** Index of the end node in `nodes`. */
    to: number;
    /**
     * Whether the road can also be driven `to → from`. Overrides the graph's
     * `twoWay` default. OpenStreetMap's `oneway=no` is `true` here.
     */
    twoWay?: boolean;
}

/** Input of {@link createRoadGraph}. */
export interface CreateRoadGraphInput<E extends RoadEdge = RoadEdge> {
    /** Road network vertices, WGS84. Edges refer to them by index. */
    nodes: readonly Coordinate[];
    /** Road segments. Directed `from → to` unless two-way. */
    edges: readonly E[];
    /**
     * Default for edges that do not set `twoWay`. Default: `false` — every edge
     * is one-way, which is how a source that already lists both directions as
     * separate edges (OSRM, the Kubicka dataset) arrives.
     */
    twoWay?: boolean;
}

/**
 * A road network ready for {@link matchToRoads}: the app's nodes and edges plus
 * a spatial index and a directed adjacency, both built once. Build it once per
 * tile or region and reuse it for every trace — building is the expensive
 * part; querying is cheap.
 */
export interface RoadGraph<E extends RoadEdge = RoadEdge> {
    /** The nodes as given. */
    readonly nodes: readonly Coordinate[];
    /** The edges as given; matches point back into this array. */
    readonly edges: readonly E[];
    /** Directed edges after two-way roads are split into both directions. */
    readonly directedEdgeCount: number;
}

/**
 * A matching candidate: a directed edge, the fix's projection onto it and how
 * far along the direction of travel that projection sits.
 */
export interface RoadCandidate {
    /** Directed edge index. */
    dir: number;
    /** Projection, plane x in metres. */
    px: number;
    /** Projection, plane y in metres. */
    py: number;
    /** Metres from the start of the directed edge to the projection. */
    offset: number;
    /** Metres from the fix to the projection. */
    distance: number;
}

/**
 * Internal arrays behind a {@link RoadGraph}. Kept off the public object so
 * the type the app sees is its own data, not typed-array plumbing.
 */
export interface RoadGraphCore {
    lat0: number;
    lon0: number;
    kx: number;
    ky: number;
    nx: Float64Array;
    ny: Float64Array;
    edgeFrom: Int32Array;
    edgeTo: Int32Array;
    dirFrom: Int32Array;
    dirTo: Int32Array;
    dirEdge: Int32Array;
    dirReversed: Uint8Array;
    dirLength: Float64Array;
    edgeDirs: Int32Array;
    outStart: Int32Array;
    outList: Int32Array;
    cells: Map<number, number[]>;
    edgeStamp: Int32Array;
    edgeTick: number;
    dist: Float64Array;
    prev: Int32Array;
    nodeStamp: Int32Array;
    targetStamp: Int32Array;
    nodeTick: number;
    heapNode: Int32Array;
    heapKey: Float64Array;
}

/**
 * Edge length of a grid cell of the spatial index, in metres. Each segment is
 * registered in the cells it passes through (sampled at this step), so a long
 * motorway segment costs cells along its length, not across its bounding box.
 */
export const ROAD_GRID_CELL_M = 50;

const CELL_OFFSET = 2 ** 20;
const CELL_STRIDE = 2 ** 21;
const cores = new WeakMap<RoadGraph<RoadEdge>, RoadGraphCore>();

/**
 * Build a {@link RoadGraph} from nodes and edges: projects every node onto a
 * local plane, splits two-way edges into both directions, and indexes the
 * segments in a 50 m grid.
 *
 * The plane is equirectangular around the centre of the nodes' bounding box,
 * in metres. Within a city-sized tile the scale error is a fraction of a
 * percent; at 100 km of north–south span at 50° it reaches ~2%, which moves a
 * 20 m distance by 0.4 m. Graphs that cross the antimeridian are not
 * supported — split them.
 *
 * @param input - Nodes, edges and the two-way default.
 * @returns The graph, reusable across every trace in the same region.
 * @throws {RangeError} When a node is not a finite coordinate or an edge
 * refers to a node index that does not exist.
 *
 * @example
 * const graph = createRoadGraph({
 *   nodes: [
 *     { latitude: -5.09, longitude: -42.80 },
 *     { latitude: -5.09, longitude: -42.79 },
 *   ],
 *   edges: [{ from: 0, to: 1, twoWay: true, id: "way/123" }],
 * });
 */
export function createRoadGraph<E extends RoadEdge>(input: CreateRoadGraphInput<E>): RoadGraph<E> {
    const { nodes, edges } = input;
    const defaultTwoWay = input.twoWay ?? false;
    const n = nodes.length;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    for (let i = 0; i < n; i += 1) {
        const { latitude, longitude } = nodes[i];
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new RangeError(`createRoadGraph: node ${i} is not a finite coordinate`);
        }
        if (latitude < minLat) minLat = latitude;
        if (latitude > maxLat) maxLat = latitude;
        if (longitude < minLon) minLon = longitude;
        if (longitude > maxLon) maxLon = longitude;
    }
    const lat0 = n === 0 ? 0 : (minLat + maxLat) / 2;
    const lon0 = n === 0 ? 0 : (minLon + maxLon) / 2;
    const ky = EARTH_RADIUS_KM * 1000 * toRadians(1);
    const kx = ky * Math.cos(toRadians(lat0));
    const nx = new Float64Array(n);
    const ny = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
        nx[i] = (nodes[i].longitude - lon0) * kx;
        ny[i] = (nodes[i].latitude - lat0) * ky;
    }

    const m = edges.length;
    const edgeFrom = new Int32Array(m);
    const edgeTo = new Int32Array(m);
    const edgeDirs = new Int32Array(m * 2).fill(-1);
    let directed = 0;
    for (let e = 0; e < m; e += 1) {
        const { from, to } = edges[e];
        if (!Number.isInteger(from) || from < 0 || from >= n) {
            throw new RangeError(`createRoadGraph: edge ${e} has no node ${String(from)}`);
        }
        if (!Number.isInteger(to) || to < 0 || to >= n) {
            throw new RangeError(`createRoadGraph: edge ${e} has no node ${String(to)}`);
        }
        edgeFrom[e] = from;
        edgeTo[e] = to;
        directed += (edges[e].twoWay ?? defaultTwoWay) ? 2 : 1;
    }

    const dirFrom = new Int32Array(directed);
    const dirTo = new Int32Array(directed);
    const dirEdge = new Int32Array(directed);
    const dirReversed = new Uint8Array(directed);
    const dirLength = new Float64Array(directed);
    const outStart = new Int32Array(n + 1);
    let d = 0;
    for (let e = 0; e < m; e += 1) {
        const a = edgeFrom[e];
        const b = edgeTo[e];
        const length = Math.hypot(nx[b] - nx[a], ny[b] - ny[a]);
        dirFrom[d] = a;
        dirTo[d] = b;
        dirEdge[d] = e;
        dirLength[d] = length;
        edgeDirs[e * 2] = d;
        outStart[a + 1] += 1;
        d += 1;
        if (edges[e].twoWay ?? defaultTwoWay) {
            dirFrom[d] = b;
            dirTo[d] = a;
            dirEdge[d] = e;
            dirReversed[d] = 1;
            dirLength[d] = length;
            edgeDirs[e * 2 + 1] = d;
            outStart[b + 1] += 1;
            d += 1;
        }
    }
    for (let i = 0; i < n; i += 1) outStart[i + 1] += outStart[i];
    const fill = outStart.slice(0, n);
    const outList = new Int32Array(directed);
    for (let k = 0; k < directed; k += 1) {
        outList[fill[dirFrom[k]]] = k;
        fill[dirFrom[k]] += 1;
    }

    const cells = new Map<number, number[]>();
    for (let e = 0; e < m; e += 1) {
        const ax = nx[edgeFrom[e]];
        const ay = ny[edgeFrom[e]];
        const bx = nx[edgeTo[e]];
        const by = ny[edgeTo[e]];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / ROAD_GRID_CELL_M));
        let last = Number.NaN;
        for (let s = 0; s <= steps; s += 1) {
            const key = cellKey(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
            if (key === last) continue;
            last = key;
            const list = cells.get(key);
            if (list === undefined) cells.set(key, [e]);
            else if (list[list.length - 1] !== e) list.push(e);
        }
    }

    const graph: RoadGraph<E> = { nodes, edges, directedEdgeCount: directed };
    cores.set(graph, {
        lat0,
        lon0,
        kx,
        ky,
        nx,
        ny,
        edgeFrom,
        edgeTo,
        dirFrom,
        dirTo,
        dirEdge,
        dirReversed,
        dirLength,
        edgeDirs,
        outStart,
        outList,
        cells,
        edgeStamp: new Int32Array(m),
        edgeTick: 0,
        dist: new Float64Array(n),
        prev: new Int32Array(n),
        nodeStamp: new Int32Array(n),
        targetStamp: new Int32Array(n),
        nodeTick: 0,
        heapNode: new Int32Array(64),
        heapKey: new Float64Array(64),
    });
    return graph;
}

/**
 * The internal arrays of a graph built by {@link createRoadGraph}.
 *
 * @param graph - A graph from `createRoadGraph`.
 * @returns Its core.
 * @throws {TypeError} When the object did not come from `createRoadGraph` —
 * a hand-built lookalike has no index to query.
 */
export function roadGraphCore(graph: RoadGraph<RoadEdge>): RoadGraphCore {
    const core = cores.get(graph);
    if (core === undefined) {
        throw new TypeError("roadGraphCore: build the graph with createRoadGraph()");
    }
    return core;
}

/**
 * Grid key of a plane point. Two 21-bit cell indices packed into one safe
 * integer, so the index is a `Map<number, …>` with no string allocation.
 *
 * @param x - Plane x, metres.
 * @param y - Plane y, metres.
 * @returns The packed cell key.
 */
function cellKey(x: number, y: number): number {
    return cellKeyOf(Math.floor(x / ROAD_GRID_CELL_M), Math.floor(y / ROAD_GRID_CELL_M));
}

/**
 * Pack two cell indices into one key.
 *
 * @param cx - Cell column.
 * @param cy - Cell row.
 * @returns The packed cell key.
 */
function cellKeyOf(cx: number, cy: number): number {
    return (cx + CELL_OFFSET) * CELL_STRIDE + (cy + CELL_OFFSET);
}

/**
 * Project a coordinate onto the graph's plane.
 *
 * @param core - Graph core.
 * @param coordinate - WGS84 point.
 * @returns `[x, y]` in metres.
 */
export function toPlane(core: RoadGraphCore, coordinate: Coordinate): [number, number] {
    return [
        (coordinate.longitude - core.lon0) * core.kx,
        (coordinate.latitude - core.lat0) * core.ky,
    ];
}

/**
 * Inverse of {@link toPlane}.
 *
 * @param core - Graph core.
 * @param x - Plane x, metres.
 * @param y - Plane y, metres.
 * @returns The WGS84 coordinate.
 */
export function fromPlane(core: RoadGraphCore, x: number, y: number): Coordinate {
    return { latitude: core.lat0 + y / core.ky, longitude: core.lon0 + x / core.kx };
}

/**
 * Project a plane point onto a directed edge, clamped to the segment.
 *
 * @param core - Graph core.
 * @param dir - Directed edge index.
 * @param x - Point x, metres.
 * @param y - Point y, metres.
 * @returns The candidate for that edge.
 */
export function projectOnto(core: RoadGraphCore, dir: number, x: number, y: number): RoadCandidate {
    const ax = core.nx[core.dirFrom[dir]];
    const ay = core.ny[core.dirFrom[dir]];
    const dx = core.nx[core.dirTo[dir]] - ax;
    const dy = core.ny[core.dirTo[dir]] - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const px = ax + t * dx;
    const py = ay + t * dy;
    return { dir, px, py, offset: t * core.dirLength[dir], distance: Math.hypot(x - px, y - py) };
}

/**
 * The roads within `radius` of a point, nearest first, each expanded into
 * the directions it can be driven in.
 *
 * `limit` counts **roads** (input edges), not directions: a two-way road is
 * one road that yields two candidates, so the limit means the same thing on
 * a network of one-way pairs and on one of two-way edges.
 *
 * @param core - Graph core.
 * @param x - Point x, metres.
 * @param y - Point y, metres.
 * @param radius - Search radius, metres.
 * @param limit - Maximum number of roads kept.
 * @returns The candidates, nearest road first.
 */
export function candidatesNear(
    core: RoadGraphCore,
    x: number,
    y: number,
    radius: number,
    limit: number,
): RoadCandidate[] {
    core.edgeTick += 1;
    const tick = core.edgeTick;
    const reach = Math.ceil(radius / ROAD_GRID_CELL_M + 0.5);
    const cx = Math.floor(x / ROAD_GRID_CELL_M);
    const cy = Math.floor(y / ROAD_GRID_CELL_M);
    const found: RoadCandidate[] = [];
    for (let i = cx - reach; i <= cx + reach; i += 1) {
        for (let j = cy - reach; j <= cy + reach; j += 1) {
            const list = core.cells.get(cellKeyOf(i, j));
            if (list === undefined) continue;
            for (const e of list) {
                if (core.edgeStamp[e] === tick) continue;
                core.edgeStamp[e] = tick;
                const candidate = projectOnto(core, core.edgeDirs[e * 2], x, y);
                if (candidate.distance <= radius) found.push(candidate);
            }
        }
    }
    found.sort((a, b) => a.distance - b.distance);
    const out: RoadCandidate[] = [];
    for (let r = 0; r < found.length && r < limit; r += 1) {
        const forward = found[r];
        out.push(forward);
        const back = core.edgeDirs[core.dirEdge[forward.dir] * 2 + 1];
        if (back >= 0) {
            out.push({
                dir: back,
                px: forward.px,
                py: forward.py,
                offset: core.dirLength[back] - forward.offset,
                distance: forward.distance,
            });
        }
    }
    return out;
}

/**
 * Bounded Dijkstra over the directed graph, from one node until every target
 * is settled or the frontier passes `limit`. Results stay in the core's
 * scratch arrays until the next call; read them with {@link networkDistance}
 * and {@link networkPath}. Scratch arrays are stamped instead of cleared, so a
 * call costs what it explores, not the size of the graph.
 *
 * @param core - Graph core.
 * @param source - Start node.
 * @param targets - Nodes whose distance is wanted.
 * @param limit - Stop once the nearest unsettled node is farther than this, in metres.
 */
export function runDijkstra(
    core: RoadGraphCore,
    source: number,
    targets: readonly number[],
    limit: number,
): void {
    core.nodeTick += 1;
    const tick = core.nodeTick;
    let pending = 0;
    for (const t of targets) {
        if (core.targetStamp[t] !== tick) {
            core.targetStamp[t] = tick;
            pending += 1;
        }
    }
    core.nodeStamp[source] = tick;
    core.dist[source] = 0;
    core.prev[source] = -1;
    let size = 0;
    const push = (node: number, key: number): void => {
        if (size === core.heapNode.length) {
            const nodes = new Int32Array(size * 2);
            nodes.set(core.heapNode);
            core.heapNode = nodes;
            const keys = new Float64Array(size * 2);
            keys.set(core.heapKey);
            core.heapKey = keys;
        }
        const hn = core.heapNode;
        const hk = core.heapKey;
        let i = size;
        size += 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (hk[parent] <= key) break;
            hn[i] = hn[parent];
            hk[i] = hk[parent];
            i = parent;
        }
        hn[i] = node;
        hk[i] = key;
    };
    push(source, 0);
    while (size > 0) {
        const hn = core.heapNode;
        const hk = core.heapKey;
        const node = hn[0];
        const key = hk[0];
        size -= 1;
        if (size > 0) {
            const lastNode = hn[size];
            const lastKey = hk[size];
            let i = 0;
            for (;;) {
                let child = i * 2 + 1;
                if (child >= size) break;
                if (child + 1 < size && hk[child + 1] < hk[child]) child += 1;
                if (hk[child] >= lastKey) break;
                hn[i] = hn[child];
                hk[i] = hk[child];
                i = child;
            }
            hn[i] = lastNode;
            hk[i] = lastKey;
        }
        if (key > core.dist[node]) continue;
        if (key > limit) break;
        if (core.targetStamp[node] === tick) {
            core.targetStamp[node] = 0;
            pending -= 1;
            if (pending === 0) break;
        }
        for (let k = core.outStart[node]; k < core.outStart[node + 1]; k += 1) {
            const dir = core.outList[k];
            const next = core.dirTo[dir];
            const candidate = key + core.dirLength[dir];
            if (candidate > limit) continue;
            if (core.nodeStamp[next] !== tick || candidate < core.dist[next]) {
                core.nodeStamp[next] = tick;
                core.dist[next] = candidate;
                core.prev[next] = dir;
                push(next, candidate);
            }
        }
    }
}

/**
 * Network distance from the last {@link runDijkstra} source to a node.
 *
 * @param core - Graph core.
 * @param node - Node to read.
 * @returns Metres, or `Infinity` when the node was not reached within the limit.
 */
export function networkDistance(core: RoadGraphCore, node: number): number {
    return core.nodeStamp[node] === core.nodeTick ? core.dist[node] : Infinity;
}

/**
 * Directed edges of the shortest path from the last {@link runDijkstra}
 * source to a node, in travel order.
 *
 * @param core - Graph core.
 * @param node - A node reached by the last run.
 * @returns Directed edge indices; empty when the node is the source.
 */
export function networkPath(core: RoadGraphCore, node: number): number[] {
    const path: number[] = [];
    let at = node;
    while (core.prev[at] >= 0) {
        const dir = core.prev[at];
        path.push(dir);
        at = core.dirFrom[dir];
    }
    return path.reverse();
}
