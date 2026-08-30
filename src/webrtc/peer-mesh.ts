/**
 * @tempest-limits file-lines — the mesh is one object's lifetime: a link's
 * transceivers, the offer it owes, the tracks published on it and the share of
 * the uplink it costs all change together, and every method here reads or writes
 * the same two maps. The pieces that *could* stand alone already do —
 * `peer-link.ts` for the per-connection mechanics and `mesh-quality.ts` for the
 * division — and what is left is the coordination between them.
 */
import { applyQualityToLink, resolveDegradation, scaleForRoom } from "./mesh-quality";
import {
    acceptCandidate,
    adoptTransceivers,
    attachLocalTracks,
    createPeerConnection,
    drainCandidates,
    slotOf,
    type PeerLink,
} from "./peer-link";
import type { MeshMessage, MeshPeer, MeshQuality, PeerMeshOptions } from "./mesh-types";

/** A running mesh. */
export interface PeerMesh {
    /**
     * Open a link to a peer.
     *
     * `offerer` decides which side sends the offer, and exactly one side of each
     * link must say `true`. Drive it from the arrival order your server already
     * imposes — the peer that joined **later** offers, the one already in the
     * room answers. That avoids glare by construction, without the rollback
     * dance of perfect negotiation and without depending on a browser
     * implementing argument-less `setLocalDescription`.
     */
    addPeer: (peerId: string, options: { offerer: boolean }) => Promise<void>;
    /** Close one link and give its share of the uplink back to the others. */
    removePeer: (peerId: string) => void;
    /** Feed the mesh an `offer`, `answer` or `ice` message from `from`. */
    accept: (message: MeshMessage & { from: string }) => Promise<void>;
    /**
     * Publish or retract one slot across every live link.
     *
     * `null` retracts: the sender keeps its negotiated transceiver and stops
     * producing, which is what mutes a microphone without disturbing the other
     * slots or the connection. Nothing renegotiates — the m-lines were allocated
     * before any track existed, which is what makes a mesh survive toggling: a
     * renegotiation per toggle is N-1 simultaneous offer/answer rounds every time
     * somebody unmutes.
     */
    setLocalTrack: (slot: string, track: MediaStreamTrack | null) => Promise<void>;
    /** Apply encoder limits, divided by the current size of the room. */
    applyQuality: (quality: MeshQuality) => Promise<void>;
    /** Replace the ICE servers used for links opened from now on. */
    setIceServers: (servers: RTCIceServer[]) => void;
    /** Close every link and report `closed`. */
    stop: () => void;
    /** The peers as the mesh currently sees them. */
    readonly peers: MeshPeer[];
}

/**
 * One `RTCPeerConnection` per peer, with the slots negotiated up front.
 *
 * The signalling protocol stays yours: this produces and accepts three message
 * shapes (`offer`, `answer`, `ice`) and leaves delivery, room membership and
 * identity to your server. What it owns is the part that is the same in every
 * mesh and wrong in most of them — see {@link PeerMesh} for the traps each
 * method exists to avoid.
 *
 * @param options - See {@link PeerMeshOptions}.
 * @returns The mesh.
 *
 * @example
 * const mesh = createPeerMesh({
 *     slots: [
 *         { name: "mic", kind: "audio" },
 *         { name: "cam", kind: "video" },
 *     ],
 *     send: (message) => socket.send(message),
 *     onPeers: setPeers,
 * });
 * socket.onMessage = (message) => void mesh.accept(message);
 * await mesh.addPeer("peer-2", { offerer: true });
 * await mesh.setLocalTrack("mic", micTrack);
 */
export function createPeerMesh(options: PeerMeshOptions): PeerMesh {
    const { slots, send } = options;
    const links = new Map<string, PeerLink>();
    const peers = new Map<string, MeshPeer>();
    const localTracks = new Map<string, MediaStreamTrack | null>();
    let iceServers = options.iceServers ?? [];
    const describe =
        options.setLocalDescription ??
        ((connection: RTCPeerConnection, description: RTCSessionDescriptionInit) =>
            connection.setLocalDescription(description));
    let quality: MeshQuality = options.quality ?? {};
    let stopped = false;

    const emptyStreams = (): Record<string, MediaStream | null> =>
        Object.fromEntries(slots.map((slot) => [slot.name, null]));

    const emitPeers = (): void => {
        options.onPeers?.([...peers.values()].map((peer) => ({ ...peer })));
    };

    /**
     * Collapse the per-link states into the one badge a call shows.
     *
     * No links at all is `connected`, not a failure: it means nobody else is in
     * the room yet, which is a legitimate state a call sits in for as long as the
     * first person is early.
     */
    const refreshState = (): void => {
        if (stopped) return;
        const states = [...links.values()].map((link) => link.pc.connectionState);
        if (states.some((state) => state === "connected")) options.onState?.("connected");
        else if (states.length > 0) options.onState?.("connecting", "negotiating");
        else options.onState?.("connected", "alone");
    };

    const applyQuality = async (next: MeshQuality): Promise<void> => {
        quality = next;
        const effective = scaleForRoom(next, links.size);
        const degradation = resolveDegradation(next, effective);
        for (const link of links.values()) {
            await applyQualityToLink(link.transceivers, slots, effective, degradation);
        }
    };

    const makeOffer = async (link: PeerLink): Promise<void> => {
        if (link.makingOffer) return;
        link.makingOffer = true;
        try {
            const offer = await link.pc.createOffer();
            if (!offer.sdp) {
                options.onNotice?.("empty_local_offer_sdp");
                return;
            }
            await describe(link.pc, offer);
            send({
                type: "offer",
                to: link.peerId,
                sdp: link.pc.localDescription?.sdp ?? offer.sdp,
            });
        } catch {
            options.onNotice?.("offer_failed");
        } finally {
            link.makingOffer = false;
        }
    };

    /**
     * Wrap an inbound track in the stream the caller renders.
     *
     * The event's own stream is preferred: it is the one the sending side
     * grouped the track into, so a caller that reads `stream.id` sees what the
     * peer published rather than a wrapper invented here. Browsers only fill it
     * when the offer named a stream, hence the fallback — and the guard after
     * that is for a runtime with no `MediaStream` at all, where routing still
     * has to not throw.
     */
    const streamFor = (event: RTCTrackEvent): MediaStream | null => {
        const provided = event.streams?.[0];
        if (provided) return provided;
        return typeof MediaStream === "undefined" ? null : new MediaStream([event.track]);
    };

    const attachRemoteTrack = (link: PeerLink, event: RTCTrackEvent): void => {
        const slot = slotOf(event.transceiver, link, slots);
        const peer = peers.get(link.peerId);
        if (!slot || !peer) return;

        peer.streams = { ...peer.streams, [slot.name]: streamFor(event) };
        event.track.onended = (): void => {
            const current = peers.get(link.peerId);
            if (!current) return;
            current.streams = { ...current.streams, [slot.name]: null };
            emitPeers();
        };
        emitPeers();
    };

    const removePeer = (peerId: string): void => {
        const link = links.get(peerId);
        if (link) {
            link.pc.close();
            links.delete(peerId);
        }
        peers.delete(peerId);
        void applyQuality(quality);
        emitPeers();
        refreshState();
    };

    const addPeer = async (peerId: string, { offerer }: { offerer: boolean }): Promise<void> => {
        if (links.has(peerId)) return;

        const pc = createPeerConnection(iceServers);
        const link: PeerLink = {
            peerId,
            pc,
            transceivers: [],
            pendingCandidates: [],
            remoteReady: false,
            makingOffer: false,
            isOfferer: offerer,
        };
        links.set(peerId, link);
        peers.set(peerId, {
            peerId,
            connection: pc.connectionState,
            streams: peers.get(peerId)?.streams ?? emptyStreams(),
        });

        if (offerer) {
            link.transceivers = slots.map((slot) =>
                pc.addTransceiver(slot.kind, { direction: "sendrecv" }),
            );
            await attachLocalTracks(link, slots, localTracks);
        }

        pc.onicecandidate = (event): void => {
            send({
                type: "ice",
                to: peerId,
                candidate: event.candidate?.candidate ?? null,
                sdpMid: event.candidate?.sdpMid ?? null,
                sdpMLineIndex: event.candidate?.sdpMLineIndex ?? null,
            });
        };

        pc.ontrack = (event): void => attachRemoteTrack(link, event);

        pc.onconnectionstatechange = (): void => {
            const peer = peers.get(peerId);
            if (peer) peer.connection = pc.connectionState;
            if (pc.connectionState === "failed" || pc.connectionState === "closed") {
                removePeer(peerId);
                return;
            }
            emitPeers();
            refreshState();
        };

        pc.onnegotiationneeded = (): void => {
            if (link.isOfferer) void makeOffer(link);
        };

        emitPeers();
        refreshState();
        if (offerer) await makeOffer(link);
    };

    const acceptOffer = async (from: string, sdp: string): Promise<void> => {
        if (!links.has(from)) await addPeer(from, { offerer: false });
        const link = links.get(from);
        if (!link) return;

        await link.pc.setRemoteDescription({ type: "offer", sdp });
        link.remoteReady = true;
        await drainCandidates(link);

        if (!link.isOfferer) {
            adoptTransceivers(link);
            await attachLocalTracks(link, slots, localTracks);
        }

        const answer = await link.pc.createAnswer();
        if (!answer.sdp) {
            options.onNotice?.("empty_local_answer_sdp");
            return;
        }
        await describe(link.pc, answer);
        send({ type: "answer", to: from, sdp: link.pc.localDescription?.sdp ?? answer.sdp });
        await applyQuality(quality);
    };

    const accept = async (message: MeshMessage & { from: string }): Promise<void> => {
        if (message.type === "offer") {
            await acceptOffer(message.from, message.sdp);
            return;
        }

        const link = links.get(message.from);
        if (!link) return;

        if (message.type === "answer") {
            await link.pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
            link.remoteReady = true;
            await drainCandidates(link);
            await applyQuality(quality);
            return;
        }

        if (message.candidate === null) return;
        await acceptCandidate(link, {
            candidate: message.candidate,
            sdpMid: message.sdpMid ?? undefined,
            sdpMLineIndex: message.sdpMLineIndex ?? undefined,
        });
    };

    const setLocalTrack = async (slot: string, track: MediaStreamTrack | null): Promise<void> => {
        localTracks.set(slot, track);
        const index = slots.findIndex((entry) => entry.name === slot);
        if (index < 0) return;

        for (const link of links.values()) {
            const transceiver = link.transceivers[index];
            if (!transceiver) continue;
            try {
                await transceiver.sender.replaceTrack(track);
            } catch {
                /* the link is tearing down; its state handler will remove it */
            }
        }
        await applyQuality(quality);
    };

    const stop = (): void => {
        for (const link of links.values()) link.pc.close();
        links.clear();
        peers.clear();
        stopped = true;
        emitPeers();
        options.onState?.("closed");
    };

    options.onState?.("connecting", "signaling");

    return {
        addPeer,
        removePeer,
        accept,
        setLocalTrack,
        applyQuality,
        setIceServers: (servers): void => {
            iceServers = servers;
        },
        stop,
        get peers(): MeshPeer[] {
            return [...peers.values()].map((peer) => ({ ...peer }));
        },
    };
}
