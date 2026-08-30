import type { MeshSlot } from "./mesh-types";

/** One remote peer's connection and everything the mesh tracks about it. */
export interface PeerLink {
    peerId: string;
    pc: RTCPeerConnection;
    /**
     * Transceivers in slot order.
     *
     * Held explicitly rather than re-read from `getTransceivers()` so slot
     * lookup stays O(1) and cannot drift if a browser reorders.
     */
    transceivers: RTCRtpTransceiver[];
    /** Candidates that arrived before the remote description they belong to. */
    pendingCandidates: RTCIceCandidateInit[];
    /** Whether `setRemoteDescription` has landed, which gates the queue. */
    remoteReady: boolean;
    /** Whether an offer is in flight, so a re-entrant call does not stack one. */
    makingOffer: boolean;
    /** Whether this side offers. Exactly one side of a link does. */
    isOfferer: boolean;
}

/** Open a connection with the policies a mesh needs. */
export function createPeerConnection(iceServers: RTCIceServer[]): RTCPeerConnection {
    return new RTCPeerConnection({
        iceServers,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
    });
}

/**
 * Resolve which slot a transceiver carries.
 *
 * The offerer allocates the m-lines in slot order, so a transceiver's `mid` is
 * its ordinal and both ends read the same one. That makes `mid` the slot's wire
 * identity, and the **only** identifier correct on both sides of a link.
 *
 * Position in the link's own array is a fallback for a `mid` that is not a plain
 * ordinal, and never the primary: a browser answering an offer appends the
 * negotiated transceivers *after* any it already held, so positional lookup
 * silently resolves to the wrong slot — the camera arriving in the screen tile —
 * or to none at all, dropping the track.
 *
 * @param transceiver - The transceiver a track arrived on.
 * @param link - The link it belongs to.
 * @param slots - The mesh's slot list.
 * @returns The slot, or `null` when neither route names one.
 */
export function slotOf(
    transceiver: RTCRtpTransceiver,
    link: PeerLink,
    slots: readonly MeshSlot[],
): MeshSlot | null {
    const ordinal = Number(transceiver.mid);
    if (transceiver.mid !== null && Number.isInteger(ordinal) && slots[ordinal]) {
        return slots[ordinal];
    }
    const index = link.transceivers.indexOf(transceiver);
    return index >= 0 ? (slots[index] ?? null) : null;
}

/**
 * Feed a link every candidate that arrived before its remote description.
 *
 * `addIceCandidate` throws while `remoteDescription` is `null`, and candidates
 * routinely beat the offer or answer they belong to. Without the queue the
 * connection loses them and sits in `checking` until it times out — a failure
 * with no error anywhere.
 *
 * @param link - The link whose queue is drained.
 */
export async function drainCandidates(link: PeerLink): Promise<void> {
    const queued = link.pendingCandidates.splice(0, link.pendingCandidates.length);
    for (const candidate of queued) {
        try {
            await link.pc.addIceCandidate(candidate);
        } catch {
            /* a candidate the browser rejects is not fatal to the connection */
        }
    }
}

/**
 * Hand a candidate to the connection, or park it until the description lands.
 *
 * @param link - The link the candidate belongs to.
 * @param init - The candidate, already in `RTCIceCandidateInit` shape.
 */
export async function acceptCandidate(link: PeerLink, init: RTCIceCandidateInit): Promise<void> {
    if (!link.remoteReady) {
        link.pendingCandidates.push(init);
        return;
    }
    try {
        await link.pc.addIceCandidate(init);
    } catch {
        /* a candidate the browser rejects is not fatal to the connection */
    }
}

/**
 * Publish every held local track onto a link's slots.
 *
 * Called once the transceivers exist — up front for the offerer, after the offer
 * lands for the answerer — so a microphone that was already live when the peer
 * joined starts flowing without waiting for a toggle.
 *
 * @param link - The link to publish onto.
 * @param slots - The mesh's slot list.
 * @param tracks - The current local track per slot name.
 */
export async function attachLocalTracks(
    link: PeerLink,
    slots: readonly MeshSlot[],
    tracks: Map<string, MediaStreamTrack | null>,
): Promise<void> {
    for (const [index, slot] of slots.entries()) {
        const transceiver = link.transceivers[index];
        const track = tracks.get(slot.name) ?? null;
        if (!transceiver || !track) continue;
        try {
            await transceiver.sender.replaceTrack(track);
        } catch {
            /* the browser refused the track; the slot simply stays silent */
        }
    }
}

/**
 * Adopt the transceivers a remote offer created, in `mid` order.
 *
 * The answering side allocates **nothing** up front, and that is the whole
 * subtlety: applying a remote offer creates one transceiver per m-line, in
 * m-line order, and browsers do not reuse transceivers the answerer made
 * beforehand. Pre-allocating leaves dead, never-negotiated transceivers sitting
 * in front of the live ones, which is how slot lookup ends up pointing at the
 * wrong media or at nothing.
 *
 * Each adopted transceiver is switched to `sendrecv` so this side may publish on
 * it too; without that a peer that answered could hear but never be heard.
 *
 * @param link - The link that just applied a remote offer.
 */
export function adoptTransceivers(link: PeerLink): void {
    link.transceivers = link.pc
        .getTransceivers()
        .filter((transceiver) => transceiver.mid !== null)
        .sort((a, b) => Number(a.mid) - Number(b.mid));
    for (const transceiver of link.transceivers) {
        if (transceiver.direction !== "sendrecv") transceiver.direction = "sendrecv";
    }
}
