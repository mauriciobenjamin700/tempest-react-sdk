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
import { createLinkStatsSampler, type LinkStats, type LinkStatsSampler } from "./link-stats";
import type {
    MeshMessage,
    MeshPeer,
    MeshQuality,
    MeshStatsOptions,
    PeerMeshOptions,
} from "./mesh-types";

/** What {@link createPeerMesh}'s negotiation steps return once their link is gone. */
const GONE = Symbol("gone");

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
    /**
     * Close every link, forget the local tracks and report `closed` — for good.
     *
     * Stopping is terminal. The signalling socket usually outlives the call, so
     * an offer still in flight from a former participant, or from anyone the
     * server relays to this user, keeps reaching {@link PeerMesh.accept} after
     * the hang-up. A stopped mesh drops it: no connection is opened, nothing is
     * answered and no track is published, so a call that reports `closed` never
     * sends the microphone or camera again. The same holds for `addPeer`,
     * `setLocalTrack` and `applyQuality`, and for every negotiation that was
     * already awaiting the browser when `stop()` ran. Calling it twice is a
     * no-op.
     *
     * The tracks themselves are not stopped: they belong to the caller, who may
     * still be showing them in a preview or reusing them on the next call. To
     * join again, create a new mesh.
     */
    stop: () => void;
    /** The peers as the mesh currently sees them. */
    readonly peers: MeshPeer[];
    /**
     * The connection carrying one peer's link, or `null`.
     *
     * The escape hatch for everything this mesh does not model. `getStats()`,
     * `getSenders()`, an `RTCDataChannel`, an encoding tweak the `quality`
     * shape has no field for — all of it lives on the connection, and a mesh
     * that keeps it private turns adopting the mesh into losing a feature.
     *
     * {@link MeshPeer.connection} is the *state*, which is what a view needs;
     * this is the object, which is what a measurement needs. For the common
     * case of measuring, {@link PeerMeshOptions.stats} spares you the loop —
     * including the one-sampler-per-connection rule that a hand-rolled version
     * gets wrong.
     *
     * @param peerId - The id the peer was added under.
     * @returns The connection, or `null` when there is no link for that id.
     */
    getConnection: (peerId: string) => RTCPeerConnection | null;
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
    const slotWrites = new Map<string, Promise<void>>();
    let iceServers = options.iceServers ?? [];
    const describe =
        options.setLocalDescription ??
        ((connection: RTCPeerConnection, description: RTCSessionDescriptionInit) =>
            connection.setLocalDescription(description));
    let quality: MeshQuality = options.quality ?? {};
    let stopped = false;
    const samplers = new Map<string, LinkStatsSampler>();
    let statsTimer: ReturnType<typeof setInterval> | null = null;

    const emptyStreams = (): Record<string, MediaStream | null> =>
        Object.fromEntries(slots.map((slot) => [slot.name, null]));

    const emitPeers = (): void => {
        options.onPeers?.([...peers.values()].map((peer) => ({ ...peer })));
    };

    /**
     * Whether a link is still the one the mesh holds for its peer.
     *
     * Every negotiation step awaits the browser, and `stop()` or `removePeer()`
     * can close the link inside any of those awaits. A continuation that does
     * not re-check keeps negotiating on a closed connection — which a browser
     * answers with `InvalidStateError` — or, worse, signals an answer for a call
     * that already hung up.
     *
     * @param link - The link a continuation is about to touch.
     * @returns `false` once the mesh stopped or the link was removed or replaced.
     */
    const isLive = (link: PeerLink): boolean => !stopped && links.get(link.peerId) === link;

    /**
     * Await one negotiation step, and tell the caller whether to go on.
     *
     * A browser settles a call that `close()` ran under in one of two ways:
     * it rejects with `InvalidStateError`, or — what Chromium was measured
     * doing — it never settles at all. The second needs nothing here; the
     * first would surface as a rejected `accept()`, which the documented
     * `void mesh.accept(message)` wiring turns into an unhandled rejection
     * for a call that already hung up. So a rejection on a link that is no
     * longer live is swallowed, and one on a live link is rethrown untouched.
     *
     * @param link - The link the step negotiates on.
     * @param step - The pending browser call.
     * @returns The step's value, or {@link GONE} when the link stopped being live.
     */
    const whileLive = async <T>(link: PeerLink, step: Promise<T>): Promise<T | typeof GONE> => {
        try {
            const value = await step;
            return isLive(link) ? value : GONE;
        } catch (error) {
            if (!isLive(link)) return GONE;
            throw error;
        }
    };

    /**
     * Sample every connected link once.
     *
     * Only `connected` links are asked. A link still gathering candidates has
     * no traffic to measure, and asking anyway spends a `getStats()` round trip
     * to learn that — per link, on every tick.
     *
     * `settings` arrives as an argument rather than being read from `options`
     * here: the timer is only ever armed past the check that they exist, so
     * reading them again would add a branch that nothing can reach.
     *
     * Each link is sampled on its own: a `getStats()` that rejects — a link
     * closing under the call does that — skips that link for this tick and
     * leaves the others measured. Across the await the link is re-checked by
     * identity, not by id: a peer removed and re-added under the same id holds
     * a new connection, and the old one's sample must not land on it.
     *
     * @param settings - The measuring options, already known to be present.
     */
    const sampleLinks = async (settings: MeshStatsOptions): Promise<void> => {
        if (stopped) return;
        let changed = false;

        for (const link of [...links.values()]) {
            if (link.pc.connectionState !== "connected") continue;
            let sampler = samplers.get(link.peerId);
            if (sampler === undefined) {
                sampler = createLinkStatsSampler(
                    settings.kind === undefined ? {} : { kind: settings.kind },
                );
                samplers.set(link.peerId, sampler);
            }
            let stats: LinkStats;
            try {
                stats = await sampler.sample(link.pc);
            } catch {
                continue;
            }
            const peer = peers.get(link.peerId);
            if (!isLive(link) || peer === undefined) continue;
            peer.stats = stats;
            changed = true;
            settings.onStats?.(link.peerId, stats);
        }

        if (changed) emitPeers();
    };

    /**
     * Keep the timer alive exactly while there is something to measure.
     *
     * One timer for the whole mesh, not one per peer — and none at all in an
     * empty room, which is where a call sits for as long as the first person is
     * early.
     */
    const syncStatsTimer = (): void => {
        const settings = options.stats;
        if (settings === undefined) return;
        const wanted = !stopped && links.size > 0;
        if (wanted && statsTimer === null) {
            statsTimer = setInterval(() => void sampleLinks(settings), settings.intervalMs ?? 2000);
            return;
        }
        if (!wanted && statsTimer !== null) {
            clearInterval(statsTimer);
            statsTimer = null;
        }
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
        if (stopped) return;
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
            if (!isLive(link)) return;
            if (!offer.sdp) {
                options.onNotice?.("empty_local_offer_sdp");
                return;
            }
            await describe(link.pc, offer);
            if (!isLive(link)) return;
            send({
                type: "offer",
                to: link.peerId,
                sdp: link.pc.localDescription?.sdp ?? offer.sdp,
            });
        } catch {
            if (isLive(link)) options.onNotice?.("offer_failed");
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
        if (stopped) return;
        const link = links.get(peerId);
        if (link) {
            link.pc.close();
            links.delete(peerId);
        }
        peers.delete(peerId);
        samplers.delete(peerId);
        void applyQuality(quality);
        syncStatsTimer();
        emitPeers();
        refreshState();
    };

    const addPeer = async (peerId: string, { offerer }: { offerer: boolean }): Promise<void> => {
        if (stopped || links.has(peerId)) return;

        const pc = createPeerConnection(iceServers);
        let transceivers: RTCRtpTransceiver[] = [];
        if (offerer) {
            try {
                transceivers = slots.map((slot) =>
                    pc.addTransceiver(slot.kind, { direction: "sendrecv" }),
                );
            } catch (error) {
                pc.close();
                throw error;
            }
        }
        const link: PeerLink = {
            peerId,
            pc,
            transceivers,
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
            await attachLocalTracks(link, slots, localTracks);
            if (!isLive(link)) return;
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
            if (!isLive(link)) return;
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

        syncStatsTimer();
        emitPeers();
        refreshState();
        if (offerer) await makeOffer(link);
    };

    const acceptOffer = async (from: string, sdp: string): Promise<void> => {
        if (!links.has(from)) await addPeer(from, { offerer: false });
        const link = links.get(from);
        if (!link || !isLive(link)) return;

        if (
            (await whileLive(link, link.pc.setRemoteDescription({ type: "offer", sdp }))) === GONE
        ) {
            return;
        }
        link.remoteReady = true;
        await drainCandidates(link);

        if (!link.isOfferer) {
            adoptTransceivers(link);
            await attachLocalTracks(link, slots, localTracks);
        }
        if (!isLive(link)) return;

        const answer = await whileLive(link, link.pc.createAnswer());
        if (answer === GONE) return;
        if (!answer.sdp) {
            options.onNotice?.("empty_local_answer_sdp");
            return;
        }
        if ((await whileLive(link, describe(link.pc, answer))) === GONE) return;
        send({ type: "answer", to: from, sdp: link.pc.localDescription?.sdp ?? answer.sdp });
        await applyQuality(quality);
    };

    const accept = async (message: MeshMessage & { from: string }): Promise<void> => {
        if (stopped) return;
        if (message.type === "offer") {
            await acceptOffer(message.from, message.sdp);
            return;
        }

        const link = links.get(message.from);
        if (!link) return;

        if (message.type === "answer") {
            const applied = link.pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
            if ((await whileLive(link, applied)) === GONE) return;
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

    /**
     * Write a slot's current track onto every live link.
     *
     * The track is read when the write runs, not when it was requested, so a
     * queued write always publishes the latest call's track. A sender that
     * refuses the track belongs to a link that is tearing down, and its state
     * handler removes it — so a refusal is not an error here.
     *
     * @param slot - The slot name.
     * @param index - The slot's position in `slots`, which is its transceiver.
     */
    const publishSlot = async (slot: string, index: number): Promise<void> => {
        const track = localTracks.get(slot) ?? null;
        for (const link of [...links.values()]) {
            const transceiver = link.transceivers[index];
            if (!transceiver) continue;
            try {
                await transceiver.sender.replaceTrack(track);
            } catch {
                continue;
            }
        }
    };

    /**
     * Publish or retract one slot, one write at a time per slot.
     *
     * Writes to a slot are chained, and each publishes whatever the slot holds
     * when it runs. Without the chain, an unmute whose `replaceTrack` is still
     * in flight could finish after the mute that followed it, leaving the
     * sender on the microphone while the mesh believes the slot is empty.
     */
    const setLocalTrack = async (slot: string, track: MediaStreamTrack | null): Promise<void> => {
        if (stopped) return;
        localTracks.set(slot, track);
        const index = slots.findIndex((entry) => entry.name === slot);
        if (index < 0) return;

        const write = (slotWrites.get(slot) ?? Promise.resolve()).then(() =>
            publishSlot(slot, index),
        );
        slotWrites.set(slot, write);
        await write;
        await applyQuality(quality);
    };

    const stop = (): void => {
        if (stopped) return;
        stopped = true;
        for (const link of links.values()) link.pc.close();
        links.clear();
        peers.clear();
        samplers.clear();
        localTracks.clear();
        syncStatsTimer();
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
        getConnection: (peerId: string): RTCPeerConnection | null => links.get(peerId)?.pc ?? null,
        get peers(): MeshPeer[] {
            return [...peers.values()].map((peer) => ({ ...peer }));
        },
    };
}
