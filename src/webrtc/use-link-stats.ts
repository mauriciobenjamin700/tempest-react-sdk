import { useEffect, useRef, useState } from "react";

import { useDocumentVisibility } from "../hooks/use-document-visibility";
import { useInterval } from "../hooks/use-interval";
import {
    createLinkStatsSampler,
    type LinkStats,
    type LinkStatsKind,
    type LinkStatsSampler,
} from "./link-stats";

/** Options for {@link useLinkStats}. */
export interface UseLinkStatsOptions {
    /**
     * How often to sample, in milliseconds. Default `2000`.
     *
     * `getStats()` walks every report a connection holds, and a mesh runs one
     * per participant — on the device least able to pay for it. The numbers feed
     * a latency badge and a throughput figure nobody reads at 1 Hz, so the
     * default is deliberately slower than a frame budget suggests.
     */
    intervalMs?: number;
    /**
     * Stop sampling while the tab is in the background. Default `true`.
     *
     * The audio path is untouched by this — people in a backgrounded call still
     * expect to hear it. What stops is the measuring, which nobody can see.
     */
    pauseWhenHidden?: boolean;
    /** Which media the throughput counts. Default `"video"`. */
    kind?: LinkStatsKind;
}

/**
 * Poll one connection's throughput, resolution and round trip.
 *
 * Sampling runs only while the connection is `"connected"`, so a link that is
 * still negotiating or already gone costs nothing. The last reading is kept
 * across pauses rather than cleared, because a badge that blanks every time the
 * tab loses focus reads as a broken connection.
 *
 * Coming back from a pause resets the baseline first. Without that, the sample
 * after a five-minute background stretch divides five minutes of bytes by five
 * minutes and reports the average of a period the person is not asking about.
 *
 * @param connection - The connection to watch, or `null` before one exists.
 * @param options - See {@link UseLinkStatsOptions}.
 * @returns The latest reading, or `null` before the first sample lands.
 *
 * @example
 * const stats = useLinkStats(pc);
 *
 * return <span>{stats ? `${stats.kbps} kbps · ${stats.rttMs ?? "—"} ms` : "medindo…"}</span>;
 */
export function useLinkStats(
    connection: RTCPeerConnection | null,
    options: UseLinkStatsOptions = {},
): LinkStats | null {
    const { intervalMs = 2000, pauseWhenHidden = true, kind } = options;
    const [stats, setStats] = useState<LinkStats | null>(null);
    const samplerRef = useRef<LinkStatsSampler | null>(null);
    const inFlightRef = useRef(false);
    const visibility = useDocumentVisibility();
    const hidden = pauseWhenHidden && visibility === "hidden";

    useEffect(() => {
        samplerRef.current = createLinkStatsSampler(kind === undefined ? {} : { kind });
        setStats(null);
    }, [connection, kind]);

    useEffect(() => {
        if (!hidden) samplerRef.current?.reset();
    }, [hidden]);

    const paused = connection === null || hidden;

    useInterval(
        () => {
            const sampler = samplerRef.current;
            if (connection === null || sampler === null) return;
            if (connection.connectionState !== "connected") return;
            if (inFlightRef.current) return;
            inFlightRef.current = true;
            void sampler
                .sample(connection)
                .then((next) => setStats(next))
                .catch(() => undefined)
                .finally(() => {
                    inFlightRef.current = false;
                });
        },
        paused ? null : intervalMs,
    );

    return stats;
}
