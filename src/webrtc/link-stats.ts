/**
 * One link's outbound picture, in the shape a call UI actually renders.
 *
 * Everything here is derived, not reported: WebRTC hands out cumulative
 * counters and a graph of candidate pairs, and turning that into
 * `"1,2 Mbps · 42 ms · 1080p60"` is the work {@link createLinkStatsSampler}
 * does.
 */
export interface LinkStats {
    /** Throughput since the previous sample. `0` on the first one — there is no delta yet. */
    kbps: number;
    /** Width of the largest stream being sent, or `0` before one is reported. */
    width: number;
    /** Height of the largest stream being sent, or `0` before one is reported. */
    height: number;
    /** Frame rate of the largest stream being sent, or `0` when the browser omits it. */
    fps: number;
    /** Round trip to the peer in milliseconds, or `null` before the first reading. */
    rttMs: number | null;
    /**
     * Uplink the transport estimates for this path, in kbps, or `null`.
     *
     * `null` and not `0`, because the two mean opposite things: no estimate yet
     * is the normal state for the first seconds of every call and the permanent
     * state on an engine that publishes none, while `0` is indistinguishable
     * from a path that died. A consumer that reads absence as zero drops the
     * quality at the start of every call.
     *
     * This is the field that separates "healthy at 2.5 Mbps" from "capped at
     * 2.5 Mbps and drowning" — `kbps` reports the cap being honoured either
     * way, while the queue behind it grows.
     */
    availableKbps: number | null;
    /**
     * What the encoder says is holding the picture back, or `null` for nothing.
     *
     * `"bandwidth"` wins over the other values when senders disagree, because
     * it is the only one a lower cap answers. Reacting to bandwidth on a
     * machine that is actually CPU-bound buys a worse picture and no relief.
     *
     * The spec's `"none"` is reported as `null`: a consumer should not have to
     * know that one of the truthy strings means "nothing".
     */
    limitedBy: RTCQualityLimitationReason | null;
    /**
     * Whether the link is travelling through a TURN relay.
     *
     * On a self-hosted mesh this is the hosting bill: a relayed stream goes up
     * and down through the machine somebody is paying for, and the person who
     * picked 4K is not that somebody.
     *
     * Resolved only from the pair the transport **names**, never from a merely
     * `succeeded` one — guessing the route from a pair that carries nothing
     * would report a cost nobody is paying.
     */
    relayed: boolean;
}

/** Which media a sampler counts. */
export type LinkStatsKind = "video" | "audio" | "all";

/** Options for {@link createLinkStatsSampler}. */
export interface LinkStatsSamplerOptions {
    /**
     * Which media the throughput counts. Default `"video"`.
     *
     * Video is the default because it is what saturates an uplink — audio is an
     * order of magnitude cheaper, and mixing it in moves the number by less than
     * the noise between two samples. Use `"all"` when the figure is meant to be
     * the connection's real cost rather than the picture's.
     */
    kind?: LinkStatsKind;
}

/**
 * A sampler bound to one connection.
 *
 * Holds the previous byte counter and timestamp, which is the whole reason this
 * is an object rather than a function: the rate is a delta, so somebody has to
 * remember the last reading. One sampler per link — sharing one across peers
 * subtracts one connection's counter from another's and reports nonsense.
 */
export interface LinkStatsSampler {
    /**
     * Reduce a report you already have.
     *
     * @param report - A report from `RTCPeerConnection.getStats()`.
     * @returns The stats for this sample.
     */
    read: (report: RTCStatsReport) => LinkStats;
    /**
     * Fetch a report and reduce it.
     *
     * @param connection - The connection to sample.
     * @returns The stats for this sample.
     */
    sample: (connection: RTCPeerConnection) => Promise<LinkStats>;
    /**
     * Drop the baseline the rate is derived from.
     *
     * Call it after an ICE restart, a reconnect, or a pause — otherwise the next
     * sample divides the bytes of the whole gap by the whole gap and reports the
     * average of a period nobody is asking about. The next reading comes back at
     * `0` kbps and starts a fresh baseline; the resolution and round trip already
     * on screen are kept, so the badge does not blank out.
     */
    reset: () => void;
}

/**
 * The three field readers below take an entry the collector has already
 * established is an object.
 *
 * A report is a `Map` whose values the browser fills, and nothing says they
 * have to be objects — a polyfill or a mock can put anything in there. That
 * check belongs at the door of the one loop that walks the report, not repeated
 * in each reader: three copies of the same guard means three branches no test
 * can reach past the first, and a reader that silently returns `null` for a
 * primitive hides the case instead of skipping it.
 */
type StatsEntry = Record<string, unknown>;

function numberField(entry: StatsEntry, key: string): number | null {
    const value: unknown = entry[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringField(entry: StatsEntry, key: string): string | null {
    const value: unknown = entry[key];
    return typeof value === "string" ? value : null;
}

function booleanField(entry: StatsEntry, key: string): boolean | null {
    const value: unknown = entry[key];
    return typeof value === "boolean" ? value : null;
}

/**
 * Whether a string is one of the reasons the spec defines.
 *
 * `"none"` is deliberately not one of them here: the field it feeds reports
 * "nothing is limiting" as `null`, so a consumer never has to know that one of
 * the truthy strings means no.
 */
function isLimitationReason(value: string | null): value is RTCQualityLimitationReason {
    return value === "bandwidth" || value === "cpu" || value === "other";
}

/**
 * Resolve the media an RTP entry carries.
 *
 * `kind` is the standard field and `mediaType` is what older Chrome reported;
 * both are still in the wild, and a sampler that reads only one of them
 * silently counts nothing on the browser that uses the other.
 */
function entryKind(entry: StatsEntry): string | null {
    return stringField(entry, "kind") ?? stringField(entry, "mediaType");
}

/** What one candidate pair says about the path it describes. */
interface PairFacts {
    id: string;
    /** `true` when the browser marks this pair as the chosen one non-standardly. */
    selected: boolean;
    state: string | null;
    rttMs: number | null;
    availableKbps: number | null;
    localCandidateId: string | null;
}

/** What one sender says about what it is sending. */
interface SenderFacts {
    kind: string | null;
    bytes: number;
    width: number;
    height: number;
    fps: number;
    limitedBy: RTCQualityLimitationReason | null;
}

/** Everything a single walk over a report yields. */
interface CollectedReport {
    namedPairId: string | null;
    pairs: PairFacts[];
    relayCandidateIds: Set<string>;
    senders: SenderFacts[];
}

/**
 * Reduce a report in **one** pass.
 *
 * One pass is the point rather than tidiness. Every field below lives in the
 * same report, and the pair the transport selected has to be resolved before
 * any of the path fields can be read — so a consumer that asks for round trip,
 * then throughput headroom, then whether the route is relayed, walks the same
 * report three times and resolves the same pair three times, per link, on every
 * tick. On a mesh of eight at one sample every two seconds that is the most
 * expensive recurring work in the call, on the device least able to pay it.
 *
 * @param report - A report from `RTCPeerConnection.getStats()`.
 * @returns The entries that matter, grouped.
 */
function collect(report: RTCStatsReport): CollectedReport {
    let namedPairId: string | null = null;
    const pairs: PairFacts[] = [];
    const relayCandidateIds = new Set<string>();
    const senders: SenderFacts[] = [];

    report.forEach((raw: unknown) => {
        if (typeof raw !== "object" || raw === null) return;
        const entry = raw as StatsEntry;
        const type = stringField(entry, "type");
        if (type === "transport") {
            namedPairId = stringField(entry, "selectedCandidatePairId") ?? namedPairId;
            return;
        }
        if (type === "candidate-pair") {
            const seconds = numberField(entry, "currentRoundTripTime");
            const bps = numberField(entry, "availableOutgoingBitrate");
            pairs.push({
                id: stringField(entry, "id") ?? "",
                selected: booleanField(entry, "selected") === true,
                state: stringField(entry, "state"),
                rttMs: seconds === null ? null : seconds * 1000,
                availableKbps: bps === null ? null : Math.round(bps / 1000),
                localCandidateId: stringField(entry, "localCandidateId"),
            });
            return;
        }
        if (type === "local-candidate") {
            const id = stringField(entry, "id");
            if (id !== null && stringField(entry, "candidateType") === "relay") {
                relayCandidateIds.add(id);
            }
            return;
        }
        if (type !== "outbound-rtp") return;
        const reason = stringField(entry, "qualityLimitationReason");
        senders.push({
            kind: entryKind(entry),
            bytes: numberField(entry, "bytesSent") ?? 0,
            width: numberField(entry, "frameWidth") ?? 0,
            height: numberField(entry, "frameHeight") ?? 0,
            fps: Math.round(numberField(entry, "framesPerSecond") ?? 0),
            limitedBy: isLimitationReason(reason) ? reason : null,
        });
    });

    return { namedPairId, pairs, relayCandidateIds, senders };
}

/**
 * The candidate pair carrying the link, and how sure we are that it is.
 *
 * A connection routinely keeps several viable pairs alive at once — host,
 * server-reflexive, relayed — and only one of them carries traffic. Reading the
 * first `succeeded` pair makes a reading jump between paths that are not being
 * travelled: 8 ms on an idle host pair alternating with 180 ms on the TURN pair
 * doing the work.
 *
 * The chain is `transport.selectedCandidatePairId` → a pair flagged
 * `selected: true` → the first `succeeded` one. The middle step is not in the
 * spec and is there because an engine that fills neither the transport field
 * nor it does not appear to exist, while one that fills only the flag does: a
 * reader that skips straight to `succeeded` silently answers about the wrong
 * path there. The last step is a guess, and `named` says so — the fields where
 * guessing would report something false refuse it.
 *
 * @param collected - A collected report.
 * @returns The pair and whether the browser actually named it.
 */
function carryingPair(collected: CollectedReport): { pair: PairFacts | null; named: boolean } {
    const byId =
        collected.namedPairId === null
            ? undefined
            : collected.pairs.find((pair) => pair.id === collected.namedPairId);
    if (byId !== undefined) return { pair: byId, named: true };

    const flagged = collected.pairs.find((pair) => pair.selected);
    if (flagged !== undefined) return { pair: flagged, named: true };

    const succeeded = collected.pairs.find((pair) => pair.state === "succeeded");
    return { pair: succeeded ?? null, named: false };
}

/**
 * Read the round trip of the candidate pair actually carrying the link.
 *
 * A `succeeded` pair is kept as a last resort because not every browser names
 * the selected one — losing the reading entirely is worse than an occasionally
 * optimistic one. See {@link carryingPair} for the chain and why the middle
 * step exists.
 *
 * @param report - A report from `RTCPeerConnection.getStats()`.
 * @returns Round trip in milliseconds, rounded, or `null` when nothing reported
 *   one — which is the normal state before the connection settles.
 *
 * @example
 * const rttMs = readRoundTripMs(await pc.getStats());
 */
export function readRoundTripMs(report: RTCStatsReport): number | null {
    return roundTripOf(collect(report));
}

/**
 * Read the uplink the transport estimates for this path, in kbps.
 *
 * This is the field that tells a cap being honoured apart from a cap that is
 * drowning: `bytesSent` reports the same 2500 kbps whether the path has room
 * for it or the queue behind it is growing. No fixed budget can stand in for it
 * — a domestic uplink of 1 Mbps and a fibre link differ by an order of
 * magnitude, and in Brazil the upload routinely is a tenth of the download
 * beside it.
 *
 * @param report - A report from `RTCPeerConnection.getStats()`.
 * @returns The estimate in kbps, or `null` while there is none. Every reader
 *   needs a fallback for that, not a default of zero.
 *
 * @example
 * const headroom = readAvailableOutgoingKbps(await pc.getStats());
 * if (headroom !== null && headroom < asked) lowerTheCap(headroom);
 */
export function readAvailableOutgoingKbps(report: RTCStatsReport): number | null {
    return availableOf(collect(report));
}

/**
 * Read what the encoder says is holding the picture back.
 *
 * `"bandwidth"` wins when senders disagree, because it is the only reason a
 * lower cap answers. The spec's `"none"` comes back as `null`.
 *
 * @param report - A report from `RTCPeerConnection.getStats()`.
 * @returns The reason, or `null` when nothing is limiting the picture.
 *
 * @example
 * if (readQualityLimitation(await pc.getStats()) === "cpu") stopBlurringTheBackground();
 */
export function readQualityLimitation(report: RTCStatsReport): RTCQualityLimitationReason | null {
    return limitationOf(collect(report));
}

/**
 * Read whether the link is travelling through a TURN relay.
 *
 * Resolved only from the pair the browser names, never from a merely
 * `succeeded` one: a relayed route is somebody's hosting bill, and reporting
 * one from a pair that carries nothing bills a cost nobody is paying.
 *
 * @param report - A report from `RTCPeerConnection.getStats()`.
 * @returns `true` when the carrying pair's local candidate is a relay.
 *
 * @example
 * if (readRelayed(await pc.getStats())) capTheStreamThatCostsMoney();
 */
export function readRelayed(report: RTCStatsReport): boolean {
    return relayedOf(collect(report));
}

/** Round trip of the carrying pair, in whole milliseconds. */
function roundTripOf(collected: CollectedReport): number | null {
    const withTiming: CollectedReport = {
        ...collected,
        pairs: collected.pairs.filter((pair) => pair.rttMs !== null),
    };
    const { pair } = carryingPair(withTiming);
    return pair?.rttMs === undefined || pair.rttMs === null ? null : Math.round(pair.rttMs);
}

/** Estimated uplink of the carrying pair, in kbps. */
function availableOf(collected: CollectedReport): number | null {
    const { pair } = carryingPair(collected);
    return pair?.availableKbps ?? null;
}

/** Whether the pair the browser named travels through a relay. */
function relayedOf(collected: CollectedReport): boolean {
    const { pair, named } = carryingPair(collected);
    if (!named || pair === null || pair.localCandidateId === null) return false;
    return collected.relayCandidateIds.has(pair.localCandidateId);
}

/** The strongest limitation any sender reports, with bandwidth winning. */
function limitationOf(collected: CollectedReport): RTCQualityLimitationReason | null {
    let found: RTCQualityLimitationReason | null = null;
    for (const sender of collected.senders) {
        if (sender.limitedBy === null) continue;
        if (sender.limitedBy === "bandwidth") return "bandwidth";
        found = found ?? sender.limitedBy;
    }
    return found;
}

/**
 * Track one link's throughput, resolution and round trip across samples.
 *
 * Every rate here is a **delta**. `bytesSent` is cumulative since the connection
 * opened, so dividing it by the session length gives the historical average —
 * a number that only ever falls and never shows what is happening now. The
 * previous reading is kept on the sampler and subtracted, which is the part
 * every hand-rolled copy of this ends up rewriting.
 *
 * Bytes are summed across every matching sender, because a peer publishing a
 * camera and a screen at once occupies one uplink with both — and the uplink is
 * what runs out. Resolution and frame rate come from the **largest** stream by
 * area, which is the one that dominates that bandwidth and the one somebody
 * watching the call is looking at.
 *
 * @param options - See {@link LinkStatsSamplerOptions}.
 * @returns A sampler. Use one per `RTCPeerConnection`.
 *
 * @example
 * const sampler = createLinkStatsSampler();
 *
 * setInterval(async () => {
 *   const stats = await sampler.sample(pc);
 *   badge.textContent = `${stats.kbps} kbps · ${stats.rttMs ?? "—"} ms`;
 * }, 2000);
 */
export function createLinkStatsSampler(options: LinkStatsSamplerOptions = {}): LinkStatsSampler {
    const kind: LinkStatsKind = options.kind ?? "video";
    let lastBytes: number | null = null;
    let lastSampleAt = 0;
    let last: LinkStats = {
        kbps: 0,
        width: 0,
        height: 0,
        fps: 0,
        rttMs: null,
        availableKbps: null,
        limitedBy: null,
        relayed: false,
    };

    function read(report: RTCStatsReport): LinkStats {
        const now = performance.now();
        const collected = collect(report);
        const path = {
            rttMs: roundTripOf(collected),
            availableKbps: availableOf(collected),
            limitedBy: limitationOf(collected),
            relayed: relayedOf(collected),
        };

        let bytes = 0;
        let sawSender = false;
        let bestArea = 0;
        let width = 0;
        let height = 0;
        let fps = 0;

        for (const sender of collected.senders) {
            if (kind !== "all" && sender.kind !== kind) continue;
            sawSender = true;
            bytes += sender.bytes;

            const area = sender.width * sender.height;
            if (area < bestArea) continue;
            bestArea = area;
            width = sender.width;
            height = sender.height;
            fps = sender.fps;
        }

        if (!sawSender) {
            last = { ...last, ...path };
            return last;
        }

        const elapsed = lastBytes === null ? 0 : (now - lastSampleAt) / 1000;
        const delta = lastBytes === null ? 0 : bytes - lastBytes;
        const kbps = elapsed > 0 && delta > 0 ? Math.round((delta * 8) / 1000 / elapsed) : 0;

        lastBytes = bytes;
        lastSampleAt = now;
        last = {
            kbps,
            width: width > 0 ? width : last.width,
            height: height > 0 ? height : last.height,
            fps: fps > 0 ? fps : last.fps,
            ...path,
        };
        return last;
    }

    return {
        read,
        sample: async (connection: RTCPeerConnection): Promise<LinkStats> =>
            read(await connection.getStats()),
        reset: (): void => {
            lastBytes = null;
            lastSampleAt = 0;
            last = { ...last, kbps: 0 };
        },
    };
}
