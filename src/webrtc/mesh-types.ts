import type { LinkStats, LinkStatsKind } from "./link-stats";

/** What a slot carries. */
export type MeshSlotKind = "audio" | "video";

/**
 * One media lane, negotiated once and reused for the life of the link.
 *
 * The order of the slot list is the wire protocol: the offerer allocates one
 * m-line per slot in this order, so a slot's `mid` is its ordinal and both ends
 * read the same identity off it. Reorder the list and the two sides disagree
 * about which lane carries the camera.
 */
export interface MeshSlot {
    /** Stable name the caller uses in {@link PeerMesh.setLocalTrack}. */
    name: string;
    /** Whether the lane carries audio or video. */
    kind: MeshSlotKind;
}

/** A message the mesh produces and accepts. The transport is the caller's. */
export type MeshMessage =
    | { type: "offer"; to: string; from?: string; sdp: string }
    | { type: "answer"; to: string; from?: string; sdp: string }
    | {
          type: "ice";
          to: string;
          from?: string;
          candidate: string | null;
          sdpMid: string | null;
          sdpMLineIndex: number | null;
      };

/** One remote participant, as the mesh currently sees it. */
export interface MeshPeer {
    /** The id the caller registered this peer under. */
    peerId: string;
    /** The connection's own state, straight from `RTCPeerConnection`. */
    connection: RTCPeerConnectionState;
    /** Inbound stream per slot name, `null` for a slot the peer is not sending. */
    streams: Record<string, MediaStream | null>;
    /**
     * The last sample for this link, when the mesh was asked to measure.
     *
     * Absent unless {@link PeerMeshOptions.stats} was given: measuring costs a
     * `getStats()` per link per tick, and a mesh that shows no badge should not
     * pay it.
     */
    stats?: LinkStats;
}

/**
 * The single state a call badge shows.
 *
 * `connected` covers being alone in the room: a mesh with no peers has nothing
 * to connect to and is not failing, which is the case a naive "any link
 * connected?" check reports as broken for as long as nobody else joins.
 */
export type MeshState = "connecting" | "connected" | "reconnecting" | "failed" | "closed";

/** Encoder limits, before the room divides them. */
export interface MeshQuality {
    /**
     * Cap per video slot, in kbps. `null` leaves that slot uncapped.
     *
     * Divided by the size of the room — see {@link PeerMesh.applyQuality}.
     */
    video?: Record<string, number | null>;
    /**
     * Cap per audio slot, in **bps**, matching `setSenderBitrate`.
     *
     * Never divided. Audio is an order of magnitude cheaper than video and is
     * the part of a call that has to survive: dividing it buys back a few
     * percent of the uplink in exchange for the only thing everyone needs.
     */
    audio?: Record<string, number>;
    /** Frame ceiling written onto every video encoding. */
    maxFramerate?: number;
    /** What a video encoder gives up first. */
    degradationPreference?: RTCDegradationPreference;
    /**
     * Total uplink to divide among the peers, in kbps.
     *
     * A mesh sends one copy of everything **per participant**, so a cap that is
     * comfortable one-to-one saturates a home connection with four people.
     */
    uplinkBudgetKbps?: number;
    /**
     * Floor each video slot keeps after the division, in kbps.
     *
     * Dividing without a floor eventually allocates tens of kbps per stream,
     * which buys a blur that updates once a second: everybody loses the picture
     * instead of the excess giving way.
     */
    minVideoKbps?: number;
    /**
     * Budget below which `maintain-framerate` is overridden.
     *
     * Somebody who asked for fluidity wants a good picture in motion, not the
     * number 60. Once the share of the uplink is this small, holding the frame
     * rate halves what each frame gets and the result is worse than the lower
     * rate it replaced.
     */
    fluidFloorKbps?: number;
}

/** Options for `createPeerMesh`. */
/**
 * Ask the mesh to measure its own links.
 *
 * The rule this exists to keep is the one a hand-rolled loop gets wrong: **one
 * sampler per connection**. The rate is a delta, so a sampler shared across
 * peers subtracts one connection's counter from another's and reports nonsense
 * — and the mesh is the only place that knows how many links there are and when
 * one goes away. It also owns a single timer instead of one per peer.
 *
 * Sampling only runs for a link whose connection is `connected`. A link still
 * gathering candidates has no traffic to measure, and asking anyway spends a
 * `getStats()` to learn that.
 */
export interface MeshStatsOptions {
    /** How often to sample each connected link, in milliseconds. Default `2000`. */
    intervalMs?: number;
    /** Which media the throughput counts. Passed straight to the sampler. */
    kind?: LinkStatsKind;
    /**
     * Called with each link's sample, as it is taken.
     *
     * The same value lands on {@link MeshPeer.stats}, so a consumer that reads
     * the peer list needs no callback at all. Note that measuring therefore
     * makes {@link PeerMeshOptions.onPeers} fire on the interval — which is the
     * point for a badge, and worth knowing for anything that does real work in
     * that handler.
     */
    onStats?: (peerId: string, stats: LinkStats) => void;
}

export interface PeerMeshOptions {
    /** The lanes every link negotiates, in the order they are allocated. */
    slots: readonly MeshSlot[];
    /** Send one message to the peer named by `to`. The transport is yours. */
    send: (message: MeshMessage) => void;
    /** ICE servers for every connection this mesh opens. */
    iceServers?: RTCIceServer[];
    /** Called whenever the peer list or any peer's streams change. */
    onPeers?: (peers: MeshPeer[]) => void;
    /** Called when the aggregate state changes, with an optional detail. */
    onState?: (state: MeshState, detail?: string) => void;
    /** Called for a failure worth surfacing that is not fatal to the mesh. */
    onNotice?: (reason: string) => void;
    /** Initial encoder limits. */
    quality?: MeshQuality;
    /** Measure every link, on one timer the mesh owns. See {@link MeshStatsOptions}. */
    stats?: MeshStatsOptions;
    /**
     * Applies a local description, so the SDP can be rewritten on the way out.
     *
     * Defaults to `connection.setLocalDescription(description)`. The reason it
     * is a seam is `setTunedLocalDescription`: the mesh is what creates every
     * offer and answer, so without a hook here there is nowhere left to put the
     * Opus rewrite, and a call that adopts the mesh silently loses the bitrate
     * and channel layout it had negotiated before.
     *
     * Profiles are keyed by **audio m-line position**, which is legitimate for
     * exactly the reason slot routing is: the slot list fixes the order, so the
     * first audio slot is always the first audio m-line.
     *
     * @example
     * setLocalDescription: (connection, description) =>
     *     setTunedLocalDescription(connection, description, {
     *         0: MIC_PROFILE,
     *         1: SYSTEM_AUDIO_PROFILE,
     *     }),
     */
    setLocalDescription?: (
        connection: RTCPeerConnection,
        description: RTCSessionDescriptionInit,
    ) => Promise<unknown>;
}
