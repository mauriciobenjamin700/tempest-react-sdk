import {
    candidatesNear,
    fromPlane,
    networkDistance,
    networkPath,
    projectOnto,
    roadGraphCore,
    runDijkstra,
    toPlane,
} from "./road-graph";
import type { RoadCandidate, RoadEdge, RoadGraph, RoadGraphCore } from "./road-graph";
import type { Coordinate } from "./types";

/**
 * A fix the matchers take: a {@link Coordinate}, optionally with the time it
 * was captured. A `TrackPoint` is one as is.
 */
export interface RoadFix extends Coordinate {
    /**
     * Capture time in epoch milliseconds. When two consecutive fixes both have
     * one, the detour allowed between them grows with the interval
     * (`detourPerSecondM`); without it the bound is the fixed `maxDetourM`.
     */
    timestamp?: number;
}

/** Tuning of the hidden Markov model behind {@link matchToRoads}. */
export interface MatchToRoadsOptions {
    /**
     * GPS noise, standard deviation in metres: the emission is a Gaussian on
     * the distance from the fix to the road.
     */
    sigmaM?: number;
    /**
     * Scale of the transition, in metres: a move between two fixes costs
     * `|straight-line distance − distance along the network| / betaM`. Smaller
     * punishes detours harder.
     */
    betaM?: number;
    /** Roads farther than this from a fix are not candidates, in metres. */
    radiusM?: number;
    /** At most this many nearest roads are candidates for one fix. */
    maxCandidates?: number;
    /**
     * A fix closer than this to the previous kept fix is not run through the
     * model (Newson & Krumm's pre-processing): it adds no information and
     * jitters the direction on a stopped vehicle. Default: `2 * sigmaM`.
     */
    minSpacingM?: number;
    /**
     * A transition whose network distance exceeds the straight line by more
     * than this is impossible, in metres. Bounds the shortest-path search,
     * which is where the time goes; when every transition is impossible the
     * chain breaks instead of failing.
     */
    maxDetourM?: number;
    /**
     * Extra detour allowed per second between two timed fixes, in metres: the
     * bound becomes `maxDetourM + detourPerSecondM · Δt`. A sparse source (a
     * fix every 5–30 s) turns corners and goes round blocks between fixes, so
     * a bound fixed for 1 Hz breaks the chain on real drives; growing it with
     * the interval keeps it tight where fixes are dense. Applies only when both
     * fixes carry a `timestamp`. `0` turns it off.
     */
    detourPerSecondM?: number;
    /**
     * Intervals longer than this, in seconds, grant no more detour: the slack
     * stops at `detourPerSecondM · maxIntervalS`, which bounds the
     * shortest-path search after a long gap.
     */
    maxIntervalS?: number;
}

/**
 * Default tuning, chosen by measurement on the Kubicka et al. dataset (100
 * real drives, 247 251 fixes at ~1 Hz, OpenStreetMap excerpts): `node
 * scripts/bench-map-matching.mjs` sweeps every knob and prints the whole
 * table.
 *
 * `detourPerSecondM` and `maxIntervalS` were chosen on the same drives thinned
 * to one fix every 5–300 s and on public OpenStreetMap traces of five
 * Brazilian city centres (`node scripts/bench-br-osm.mjs`): 2 m/s is the
 * largest rate that leaves the 1 Hz result where it was (92.33% right road),
 * and it already takes the breaks of the runs at ≥ 6 m/s to zero at 5, 10 and
 * 30 s; a larger rate mostly turns one-way streets driven the wrong way into
 * a loop round the block. Without a cap, the long gaps a 1 Hz trace also has
 * cost 0.2 pp of right road; 60 s keeps the gain at 30–120 s.
 */
export const ROAD_MATCH_DEFAULTS: Readonly<Required<Omit<MatchToRoadsOptions, "minSpacingM">>> =
    Object.freeze({
        sigmaM: 7,
        betaM: 3,
        radiusM: 200,
        maxCandidates: 16,
        maxDetourM: 100,
        detourPerSecondM: 2,
        maxIntervalS: 60,
    });

/** A directed pass over one of the app's edges. */
export interface RoadTraversal<E extends RoadEdge = RoadEdge> {
    /** The app's edge object. */
    edge: E;
    /** Index of the edge in `graph.edges`. */
    edgeIndex: number;
    /** `true` when a two-way edge is driven `to → from`. */
    reversed: boolean;
}

/** Where one fix landed on the network. */
export interface MatchedFix<E extends RoadEdge = RoadEdge> extends RoadTraversal<E> {
    /** The fix projected onto the edge. */
    point: Coordinate;
    /** Metres from the fix to `point`. */
    distanceM: number;
    /** Metres from the start of the edge, in the direction of travel, to `point`. */
    offsetM: number;
    /**
     * `true` for a fix the model skipped because it sat within `minSpacingM`
     * of the previous kept fix: it is projected onto the edge that fix was
     * matched to. The vehicle moved less than the GPS noise, so that edge is
     * the honest answer — at an intersection it can be the road just left.
     */
    inferred: boolean;
}

/** One unbroken run of the matched route. */
export interface MatchedRoute<E extends RoadEdge = RoadEdge> {
    /**
     * The edges driven, in order, consecutive repeats collapsed — including the
     * ones between fixes, recovered by the shortest path on the network.
     */
    edges: RoadTraversal<E>[];
    /** Index of the first fix of this run. */
    firstFix: number;
    /** Index of the last fix of this run. */
    lastFix: number;
}

/** Output of {@link matchToRoads}. */
export interface RoadMatchResult<E extends RoadEdge = RoadEdge> {
    /** One entry per input fix, same order; `null` when no road was in reach. */
    matches: (MatchedFix<E> | null)[];
    /** The route, one entry per unbroken chain. */
    routes: MatchedRoute<E>[];
    /** Times the chain broke because no transition was possible and restarted. */
    breaks: number;
    /** Fixes skipped by `minSpacingM` (their match has `inferred: true`). */
    dropped: number;
    /** Fixes with no road within `radiusM` (their match is `null`). */
    unmatched: number;
}

/** Options of {@link createRoadMatcher}. */
export interface CreateRoadMatcherOptions extends MatchToRoadsOptions {
    /**
     * How many kept fixes the matcher waits before committing one: a fix is
     * final once `lag` newer fixes have voted on it. `0` commits at once.
     * Default: {@link ROAD_MATCHER_DEFAULT_LAG}.
     */
    lag?: number;
}

/** A fix whose match is final. */
export interface CommittedMatch<E extends RoadEdge = RoadEdge> {
    /** Index of the fix, counting every `push` since the matcher was created. */
    index: number;
    /** Its final match, or `null` when no road was in reach. */
    match: MatchedFix<E> | null;
}

/** What one {@link RoadMatcher.push} returns. */
export interface RoadMatcherUpdate<E extends RoadEdge = RoadEdge> {
    /** Index of the fix just pushed. */
    index: number;
    /**
     * Best guess for the fix just pushed, from what has arrived so far. Good
     * for drawing the vehicle now; it can still change.
     */
    current: MatchedFix<E> | null;
    /** Fixes that became final with this push, oldest first. */
    committed: CommittedMatch<E>[];
}

/** Incremental, fixed-lag matcher for a live map. */
export interface RoadMatcher<E extends RoadEdge = RoadEdge> {
    /** Feed the next fix; with its `timestamp`, sparse fixes stay chained. */
    push(fix: RoadFix): RoadMatcherUpdate<E>;
    /** Commit everything still pending and start a new chain. */
    flush(): CommittedMatch<E>[];
    /** Chain breaks so far. */
    readonly breaks: number;
    /** Fixes skipped by `minSpacingM` so far. */
    readonly dropped: number;
}

/**
 * Default `lag` of {@link createRoadMatcher}, chosen by measurement on the same
 * dataset as {@link ROAD_MATCH_DEFAULTS}.
 */
export const ROAD_MATCHER_DEFAULT_LAG = 5;

interface Params {
    sigma: number;
    beta: number;
    radius: number;
    k: number;
    spacing: number;
    detour: number;
    perSecond: number;
    interval: number;
}

interface Follower {
    fix: number;
    x: number;
    y: number;
    dropped: boolean;
}

interface Column {
    fix: number;
    x: number;
    y: number;
    t: number;
    cands: RoadCandidate[];
    score: Float64Array;
    back: Int32Array;
    start: boolean;
    followers: Follower[];
}

/**
 * Resolve and validate the options.
 *
 * @param options - Caller's options.
 * @returns The numbers the model runs on.
 * @throws {RangeError} When a value is not a positive finite number, or
 * `maxCandidates` is not a positive integer.
 */
function resolveParams(options: MatchToRoadsOptions): Params {
    const sigma = options.sigmaM ?? ROAD_MATCH_DEFAULTS.sigmaM;
    const params: Params = {
        sigma,
        beta: options.betaM ?? ROAD_MATCH_DEFAULTS.betaM,
        radius: options.radiusM ?? ROAD_MATCH_DEFAULTS.radiusM,
        k: options.maxCandidates ?? ROAD_MATCH_DEFAULTS.maxCandidates,
        spacing: options.minSpacingM ?? 2 * sigma,
        detour: options.maxDetourM ?? ROAD_MATCH_DEFAULTS.maxDetourM,
        perSecond: options.detourPerSecondM ?? ROAD_MATCH_DEFAULTS.detourPerSecondM,
        interval: options.maxIntervalS ?? ROAD_MATCH_DEFAULTS.maxIntervalS,
    };
    for (const [name, value] of Object.entries(params)) {
        const zeroOk = name === "spacing" || name === "perSecond";
        if (!Number.isFinite(value) || value < 0 || (!zeroOk && value === 0)) {
            throw new RangeError(`road matching: invalid ${name} (${String(value)})`);
        }
    }
    if (!Number.isInteger(params.k)) {
        throw new RangeError(`road matching: maxCandidates must be an integer`);
    }
    return params;
}

/**
 * Fill one Viterbi column from the previous one.
 *
 * The emission is `-½(d/σ)²` (Gaussian, constant dropped) and the transition
 * `-|straight − network| / β` (exponential). Network distance from a candidate
 * on edge `a` to one on edge `b` is the rest of `a`, the shortest path from
 * `a`'s end to `b`'s start, and `b` up to the projection — or just the gap
 * when both sit on the same directed edge with `b` ahead. One bounded
 * Dijkstra runs per distinct end node of the previous candidates.
 *
 * A route longer than `straight + maxDetourM + detourPerSecondM · Δt` is
 * impossible, where `Δt` is the time between this fix and the previous kept
 * one, capped at `maxIntervalS`. A fix without a timestamp has `t = NaN`, so
 * `Δt` is not positive and the slack is zero — the bound of an untimed trace
 * is exactly the fixed one. The same zero covers clocks that repeat or go
 * back.
 *
 * When no previous candidate reaches any current one, the column restarts the
 * chain from its emissions alone (`start = true`) — the HMM break.
 *
 * @param core - Graph core.
 * @param prev - Previous column, or `null` at the start.
 * @param col - The column to fill.
 * @param p - Model parameters.
 */
function advance(core: RoadGraphCore, prev: Column | null, col: Column, p: Params): void {
    const m = col.cands.length;
    const emission = new Float64Array(m);
    for (let j = 0; j < m; j += 1) {
        const z = col.cands[j].distance / p.sigma;
        emission[j] = -0.5 * z * z;
    }
    col.score = new Float64Array(m).fill(-Infinity);
    col.back = new Int32Array(m).fill(-1);
    if (prev !== null) {
        const straight = Math.hypot(col.x - prev.x, col.y - prev.y);
        const dt = (col.t - prev.t) / 1000;
        const limit = straight + p.detour + p.perSecond * Math.min(dt > 0 ? dt : 0, p.interval);
        const consider = (a: number, j: number, route: number): void => {
            if (route > limit) return;
            const value = prev.score[a] - Math.abs(route - straight) / p.beta;
            if (value > col.score[j]) {
                col.score[j] = value;
                col.back[j] = a;
            }
        };
        const byEnd = new Map<number, number[]>();
        for (let a = 0; a < prev.cands.length; a += 1) {
            if (prev.score[a] === -Infinity) continue;
            const ca = prev.cands[a];
            for (let j = 0; j < m; j += 1) {
                const cb = col.cands[j];
                if (cb.dir === ca.dir && cb.offset >= ca.offset)
                    consider(a, j, cb.offset - ca.offset);
            }
            const end = core.dirTo[ca.dir];
            const list = byEnd.get(end);
            if (list === undefined) byEnd.set(end, [a]);
            else list.push(a);
        }
        const targets = col.cands.map((c) => core.dirFrom[c.dir]);
        for (const [end, group] of byEnd) {
            let rest = Infinity;
            for (const a of group) {
                const left = core.dirLength[prev.cands[a].dir] - prev.cands[a].offset;
                if (left < rest) rest = left;
            }
            if (rest > limit) continue;
            runDijkstra(core, end, targets, limit - rest);
            for (let j = 0; j < m; j += 1) {
                const via = networkDistance(core, targets[j]);
                if (via === Infinity) continue;
                for (const a of group) {
                    const ca = prev.cands[a];
                    consider(a, j, core.dirLength[ca.dir] - ca.offset + via + col.cands[j].offset);
                }
            }
        }
    }
    let alive = false;
    for (let j = 0; j < m; j += 1) {
        if (col.score[j] > -Infinity) {
            col.score[j] += emission[j];
            alive = true;
        }
    }
    col.start = !alive;
    if (!alive) col.score = emission;
}

/**
 * Index of the best state of a column.
 *
 * @param col - A filled column.
 * @returns The argmax of its scores.
 */
function best(col: Column): number {
    let at = 0;
    for (let j = 1; j < col.score.length; j += 1) if (col.score[j] > col.score[at]) at = j;
    return at;
}

/**
 * Viterbi backtrack over a run of columns, newest to oldest. A column that
 * started a chain cuts the walk; the column before it restarts from its own
 * best state, so every chain is decoded on its own.
 *
 * @param cols - Columns, oldest first.
 * @returns The chosen state of each column.
 */
function backtrack(cols: readonly Column[]): Int32Array {
    const states = new Int32Array(cols.length);
    if (cols.length === 0) return states;
    let s = best(cols[cols.length - 1]);
    for (let i = cols.length - 1; i >= 0; i -= 1) {
        states[i] = s;
        if (i === 0) break;
        s = cols[i].start ? best(cols[i - 1]) : cols[i].back[s];
    }
    return states;
}

/**
 * Turn a candidate into the public match.
 *
 * @param graph - The graph.
 * @param core - Its core.
 * @param c - The candidate.
 * @param inferred - Whether the fix was skipped by the spacing rule.
 * @returns The match.
 */
function toMatch<E extends RoadEdge>(
    graph: RoadGraph<E>,
    core: RoadGraphCore,
    c: RoadCandidate,
    inferred: boolean,
): MatchedFix<E> {
    const edgeIndex = core.dirEdge[c.dir];
    return {
        edge: graph.edges[edgeIndex],
        edgeIndex,
        reversed: core.dirReversed[c.dir] === 1,
        point: fromPlane(core, c.px, c.py),
        distanceM: c.distance,
        offsetM: c.offset,
        inferred,
    };
}

/**
 * Matches of a column and its followers, given the column's chosen state.
 *
 * @param graph - The graph.
 * @param core - Its core.
 * @param col - The column.
 * @param state - Its chosen candidate.
 * @returns The committed matches, column first.
 */
function commitColumn<E extends RoadEdge>(
    graph: RoadGraph<E>,
    core: RoadGraphCore,
    col: Column,
    state: number,
): CommittedMatch<E>[] {
    const chosen = col.cands[state];
    const out: CommittedMatch<E>[] = [
        { index: col.fix, match: toMatch(graph, core, chosen, false) },
    ];
    for (const f of col.followers) {
        out.push({
            index: f.fix,
            match: f.dropped
                ? toMatch(graph, core, projectOnto(core, chosen.dir, f.x, f.y), true)
                : null,
        });
    }
    return out;
}

/**
 * The shared front half of both matchers: where a fix goes before Viterbi.
 */
interface Intake {
    lastX: number;
    lastY: number;
    breaks: number;
    dropped: number;
    unmatched: number;
}

/**
 * Route one fix into the trellis: a follower of the last column (too close, or
 * no road in reach), or a new column filled against the last one.
 *
 * @param core - Graph core.
 * @param cols - Columns so far; a new one is appended.
 * @param state - Counters and the last kept fix.
 * @param p - Model parameters.
 * @param index - The fix's index.
 * @param fix - The fix.
 * @returns The new column, or `null` when the fix became a follower (or was
 * unmatched with no column to follow).
 */
function intake(
    core: RoadGraphCore,
    cols: Column[],
    state: Intake,
    p: Params,
    index: number,
    fix: RoadFix,
): Column | null {
    const [x, y] = toPlane(core, fix);
    const t = fix.timestamp ?? NaN;
    const last = cols.length > 0 ? cols[cols.length - 1] : null;
    if (last !== null && Math.hypot(x - state.lastX, y - state.lastY) < p.spacing) {
        last.followers.push({ fix: index, x, y, dropped: true });
        state.dropped += 1;
        return null;
    }
    const cands = candidatesNear(core, x, y, p.radius, p.k);
    if (cands.length === 0) {
        state.unmatched += 1;
        if (last !== null) last.followers.push({ fix: index, x, y, dropped: false });
        return null;
    }
    const col: Column = {
        fix: index,
        x,
        y,
        t,
        cands,
        score: new Float64Array(0),
        back: new Int32Array(0),
        start: true,
        followers: [],
    };
    advance(core, last, col, p);
    if (col.start && last !== null) state.breaks += 1;
    cols.push(col);
    state.lastX = x;
    state.lastY = y;
    return col;
}

/**
 * Match a GPS trace to a road network with the hidden Markov model of Newson
 * & Krumm (2009): each fix's candidates are the nearest roads within
 * `radiusM`, scored by a Gaussian on the distance (`sigmaM`); consecutive
 * candidates are linked by an exponential on how much the network distance
 * between them differs from the straight line between the fixes (`betaM`);
 * Viterbi picks the most likely sequence. This is what fixes the case
 * snapping to the nearest road gets wrong — a parallel street a few metres
 * closer, the wrong side of an intersection — because a road the vehicle
 * cannot have reached in one second loses to the one it is driving on.
 *
 * Measured on 100 real drives (247 251 fixes, `node
 * scripts/bench-map-matching.mjs`): see the table in `docs/geo.md`.
 *
 * - **Breaks**: when no transition is possible (a gap, a missing road), the
 *   chain restarts at that fix instead of failing; `routes` gets one entry per
 *   chain and `breaks` counts them.
 * - **Close fixes** (within `minSpacingM` of the last kept one) skip the model
 *   and are projected onto that fix's edge, with `inferred: true`.
 * - **No road in reach**: the match is `null` and the fix is counted in
 *   `unmatched`; it does not break the chain.
 * - **Sparse fixes**: give each fix its `timestamp` and the detour allowed
 *   between two of them grows by `detourPerSecondM` per second of interval
 *   (capped at `maxIntervalS`). Without timestamps the bound is the fixed
 *   `maxDetourM`, tuned for 1 Hz, and a fix every 5–30 s breaks the chain
 *   where the vehicle turned a corner or went round a block in between.
 *
 * Runs synchronously and allocates per call only what it explores. For a live
 * map, {@link createRoadMatcher} gives the same model a fix at a time.
 *
 * @param fixes - The trace, in time order (`TrackPoint` works as is, timestamp
 * included).
 * @param graph - The network, from {@link createRoadGraph}.
 * @param options - Model tuning; defaults in {@link ROAD_MATCH_DEFAULTS}.
 * @returns The match of every fix, the route, and what was skipped.
 * @throws {RangeError} When an option is out of range.
 * @throws {TypeError} When `graph` did not come from `createRoadGraph`.
 */
export function matchToRoads<E extends RoadEdge>(
    fixes: readonly RoadFix[],
    graph: RoadGraph<E>,
    options: MatchToRoadsOptions = {},
): RoadMatchResult<E> {
    const core = roadGraphCore(graph);
    const p = resolveParams(options);
    const cols: Column[] = [];
    const state: Intake = { lastX: 0, lastY: 0, breaks: 0, dropped: 0, unmatched: 0 };
    for (let i = 0; i < fixes.length; i += 1) intake(core, cols, state, p, i, fixes[i]);

    const matches: (MatchedFix<E> | null)[] = new Array<MatchedFix<E> | null>(fixes.length).fill(
        null,
    );
    const states = backtrack(cols);
    for (let i = 0; i < cols.length; i += 1) {
        for (const c of commitColumn(graph, core, cols[i], states[i])) matches[c.index] = c.match;
    }

    const routes: MatchedRoute<E>[] = [];
    let route: MatchedRoute<E> | null = null;
    let lastDir = -1;
    const append = (dir: number): void => {
        if (route === null || dir === lastDir) return;
        lastDir = dir;
        const edgeIndex = core.dirEdge[dir];
        route.edges.push({
            edge: graph.edges[edgeIndex],
            edgeIndex,
            reversed: core.dirReversed[dir] === 1,
        });
    };
    for (let i = 0; i < cols.length; i += 1) {
        const c = cols[i].cands[states[i]];
        if (route === null || cols[i].start) {
            route = { edges: [], firstFix: cols[i].fix, lastFix: cols[i].fix };
            routes.push(route);
            lastDir = -1;
        } else {
            const a = cols[i - 1].cands[states[i - 1]];
            if (!(a.dir === c.dir && c.offset >= a.offset)) {
                const target = core.dirFrom[c.dir];
                runDijkstra(core, core.dirTo[a.dir], [target], Infinity);
                for (const dir of networkPath(core, target)) append(dir);
            }
        }
        append(c.dir);
        route.lastFix = cols[i].followers.reduce((at, f) => Math.max(at, f.fix), cols[i].fix);
    }

    return {
        matches,
        routes,
        breaks: state.breaks,
        dropped: state.dropped,
        unmatched: state.unmatched,
    };
}

/**
 * The model of {@link matchToRoads}, a fix at a time, for a live map.
 *
 * Every `push` returns the best guess for that fix right away (`current`, to
 * draw the vehicle) and commits the fix `lag` kept fixes back, decoded with
 * everything that arrived since — fixed-lag Viterbi. Memory is bounded by the
 * lag: committed columns are dropped. A committed fix is never revised, even
 * when a later fix would have decoded it differently; `matchToRoads` over the
 * whole trace is the reference.
 *
 * Fixes skipped by the spacing rule, or with no road in reach, are committed
 * together with the kept fix before them. The route between fixes is not
 * rebuilt here — run `matchToRoads` on the finished trace for it.
 *
 * @param graph - The network, from {@link createRoadGraph}.
 * @param options - Model tuning plus `lag`.
 * @returns The matcher.
 * @throws {RangeError} When an option is out of range.
 * @throws {TypeError} When `graph` did not come from `createRoadGraph`.
 *
 * @example
 * const matcher = createRoadMatcher(graph);
 * const { current, committed } = matcher.push({ latitude, longitude, timestamp });
 */
export function createRoadMatcher<E extends RoadEdge>(
    graph: RoadGraph<E>,
    options: CreateRoadMatcherOptions = {},
): RoadMatcher<E> {
    const core = roadGraphCore(graph);
    const p = resolveParams(options);
    const lag = options.lag ?? ROAD_MATCHER_DEFAULT_LAG;
    if (!Number.isInteger(lag) || lag < 0) {
        throw new RangeError(`createRoadMatcher: lag must be a non-negative integer`);
    }
    let cols: Column[] = [];
    let pending = 0;
    const state: Intake = { lastX: 0, lastY: 0, breaks: 0, dropped: 0, unmatched: 0 };
    let next = 0;

    return {
        push(fix: RoadFix): RoadMatcherUpdate<E> {
            const index = next;
            next += 1;
            const col = intake(core, cols, state, p, index, fix);
            if (col === null) {
                if (cols.length === 0) {
                    return { index, current: null, committed: [{ index, match: null }] };
                }
                const last = cols[cols.length - 1];
                const follower = last.followers[last.followers.length - 1];
                if (pending === 0) {
                    const states = backtrack(cols);
                    const all = commitColumn(graph, core, last, states[cols.length - 1]);
                    const own = all.filter((c) => c.index === index);
                    return { index, current: own[0].match, committed: own };
                }
                const current = follower.dropped
                    ? toMatch(
                          graph,
                          core,
                          projectOnto(core, last.cands[best(last)].dir, follower.x, follower.y),
                          true,
                      )
                    : null;
                return { index, current, committed: [] };
            }
            pending += 1;
            const current = toMatch(graph, core, col.cands[best(col)], false);
            const committed: CommittedMatch<E>[] = [];
            if (pending > lag) {
                const states = backtrack(cols);
                const at = cols.length - pending;
                committed.push(...commitColumn(graph, core, cols[at], states[at]));
                pending -= 1;
                cols = cols.slice(Math.max(0, cols.length - pending - 1));
            }
            return { index, current, committed };
        },
        flush(): CommittedMatch<E>[] {
            const states = backtrack(cols);
            const committed: CommittedMatch<E>[] = [];
            for (let i = cols.length - pending; i < cols.length; i += 1) {
                committed.push(...commitColumn(graph, core, cols[i], states[i]));
            }
            cols = [];
            pending = 0;
            return committed;
        },
        get breaks(): number {
            return state.breaks;
        },
        get dropped(): number {
            return state.dropped;
        },
    };
}
