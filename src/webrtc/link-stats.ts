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

function numberField(entry: unknown, key: string): number | null {
    if (typeof entry !== "object" || entry === null) return null;
    const value: unknown = (entry as Record<string, unknown>)[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringField(entry: unknown, key: string): string | null {
    if (typeof entry !== "object" || entry === null) return null;
    const value: unknown = (entry as Record<string, unknown>)[key];
    return typeof value === "string" ? value : null;
}

/**
 * Resolve the media an RTP entry carries.
 *
 * `kind` is the standard field and `mediaType` is what older Chrome reported;
 * both are still in the wild, and a sampler that reads only one of them
 * silently counts nothing on the browser that uses the other.
 */
function entryKind(entry: unknown): string | null {
    return stringField(entry, "kind") ?? stringField(entry, "mediaType");
}

function matchesKind(entry: unknown, kind: LinkStatsKind): boolean {
    if (kind === "all") return true;
    return entryKind(entry) === kind;
}

/**
 * Read the round trip of the candidate pair actually carrying the link.
 *
 * A connection routinely keeps several viable pairs alive at once — host,
 * server-reflexive, relayed — and only one of them carries traffic. Reading the
 * first `succeeded` pair makes the number jump between paths that are not being
 * travelled: 8 ms on an idle host pair alternating with 180 ms on the TURN pair
 * doing the work. The pair the transport names in `selectedCandidatePairId` is
 * the one being used.
 *
 * A succeeded pair is kept as a fallback because not every browser fills that
 * field in — losing the reading entirely is worse than an occasionally
 * optimistic one.
 *
 * @param report - A report from `RTCPeerConnection.getStats()`.
 * @returns Round trip in milliseconds, rounded, or `null` when nothing reported
 *   one — which is the normal state before the connection settles.
 *
 * @example
 * const rttMs = readRoundTripMs(await pc.getStats());
 */
export function readRoundTripMs(report: RTCStatsReport): number | null {
    let selectedId: string | null = null;
    report.forEach((entry: unknown) => {
        if (stringField(entry, "type") !== "transport") return;
        selectedId = stringField(entry, "selectedCandidatePairId") ?? selectedId;
    });

    let selected: number | null = null;
    let fallback: number | null = null;
    report.forEach((entry: unknown) => {
        if (stringField(entry, "type") !== "candidate-pair") return;
        const seconds = numberField(entry, "currentRoundTripTime");
        if (seconds === null) return;
        if (selectedId !== null && stringField(entry, "id") === selectedId)
            selected = seconds * 1000;
        else if (fallback === null && stringField(entry, "state") === "succeeded")
            fallback = seconds * 1000;
    });

    const value: number | null = selected ?? fallback;
    return value === null ? null : Math.round(value);
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
    let last: LinkStats = { kbps: 0, width: 0, height: 0, fps: 0, rttMs: null };

    function read(report: RTCStatsReport): LinkStats {
        const now = performance.now();
        const rttMs = readRoundTripMs(report);

        let bytes = 0;
        let sawSender = false;
        let bestArea = 0;
        let width = 0;
        let height = 0;
        let fps = 0;

        report.forEach((entry: unknown) => {
            if (stringField(entry, "type") !== "outbound-rtp") return;
            if (!matchesKind(entry, kind)) return;
            sawSender = true;
            bytes += numberField(entry, "bytesSent") ?? 0;

            const entryWidth = numberField(entry, "frameWidth") ?? 0;
            const entryHeight = numberField(entry, "frameHeight") ?? 0;
            const area = entryWidth * entryHeight;
            if (area < bestArea) return;
            bestArea = area;
            width = entryWidth;
            height = entryHeight;
            fps = Math.round(numberField(entry, "framesPerSecond") ?? 0);
        });

        if (!sawSender) {
            last = { ...last, rttMs };
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
            rttMs,
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
