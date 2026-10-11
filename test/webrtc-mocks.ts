import { vi } from "vitest";

/**
 * Test doubles for the WebRTC surface jsdom does not implement.
 *
 * The fake connection reproduces the three behaviours a mesh is written against,
 * because a double that is merely callable would let every one of them regress
 * silently:
 *
 * 1. Applying a remote **offer** creates one transceiver per m-line, in m-line
 *    order, **appended after** whatever the answerer already held — browsers do
 *    not reuse those.
 * 2. `addIceCandidate` **throws** while `remoteDescription` is `null`.
 * 3. A transceiver has no `mid` until it is negotiated.
 *
 * It also models what `close()` does to negotiation, because a fake that keeps
 * answering after `close()` hides every race in which the mesh keeps
 * negotiating on a link it already tore down:
 *
 * - a call made **after** `close()` rejects with `InvalidStateError`;
 * - a call still **in flight** when `close()` runs either rejects the same way
 *   or never settles at all, per {@link FakePeerConnection.closeMode}. Chromium
 *   was measured doing the second — `accept()` stayed pending forever with
 *   `stop()` run 0 ms after the offer — and the spec allows both, so the mesh
 *   has to survive each. {@link FakePeerConnection.hold} is what keeps a call in
 *   flight long enough for a test to close the connection under it.
 */

/** An `RTCRtpSender` that records what was written to it. */
export class FakeSender {
    track: MediaStreamTrack | null = null;
    parameters: RTCRtpSendParameters = { encodings: [{}] } as RTCRtpSendParameters;
    /** Every `setParameters` call, in order. */
    written: RTCRtpSendParameters[] = [];
    /** Make `setParameters` reject when `degradationPreference` is present, as Firefox does. */
    rejectsDegradation = false;

    replaceTrack = vi.fn(async (track: MediaStreamTrack | null): Promise<void> => {
        this.track = track;
    });

    getParameters(): RTCRtpSendParameters {
        return {
            ...this.parameters,
            encodings: (this.parameters.encodings ?? []).map((e) => ({ ...e })),
        };
    }

    async setParameters(parameters: RTCRtpSendParameters): Promise<void> {
        if (this.rejectsDegradation && parameters.degradationPreference !== undefined) {
            throw new Error("degradationPreference is not supported");
        }
        this.parameters = parameters;
        this.written.push(parameters);
    }
}

/** An `RTCRtpTransceiver` with the three fields slot routing reads. */
export class FakeTransceiver {
    sender = new FakeSender();
    direction: RTCRtpTransceiverDirection = "sendrecv";
    mid: string | null = null;

    constructor(
        public kind: string,
        direction: RTCRtpTransceiverDirection = "sendrecv",
    ) {
        this.direction = direction;
    }
}

/** Options for {@link FakePeerConnection}. */
export interface FakePeerConnectionInit {
    /** How many m-lines a remote offer brings. Defaults to 4. */
    remoteMLines?: number;
}

/** An `RTCPeerConnection` with the behaviours a mesh is written against. */
export class FakePeerConnection {
    static instances: FakePeerConnection[] = [];
    /** Remote offers arriving at every instance carry this many m-lines. */
    static remoteMLines = 4;

    /**
     * SDP the next `createOffer` produces, or `null` for an offer with none.
     *
     * A browser does produce a description with an empty `sdp` — a codec
     * negotiation that found nothing in common gets there — and a mesh that
     * signals it anyway sends a peer an offer it cannot answer.
     */
    static offerSdp: string | null = "v=0\r\nlocal-offer";
    /** SDP the next `createAnswer` produces, or `null` for an answer with none. */
    static answerSdp: string | null = "v=0\r\nlocal-answer";
    /** Make `createOffer` reject, as it does when the connection is already closing. */
    static offerRejects = false;
    /**
     * Whether `setLocalDescription` stores what it was given.
     *
     * `false` reproduces the window in which `localDescription` is still `null`
     * right after the call, which is why the mesh signals
     * `localDescription?.sdp ?? offer.sdp` rather than trusting the readback.
     */
    static tracksLocalDescription = true;
    /**
     * Park every negotiation call until {@link FakePeerConnection.release}.
     *
     * Off by default, so a call settles on the next microtask as before. On, it
     * opens the window a real browser has while it works: the call is in flight
     * and `close()` can run under it.
     */
    /** Make `addTransceiver` throw, as it does for a kind the browser cannot send. */
    static addTransceiverThrows = false;
    static hold = false;
    /** What `close()` does to a call in flight: reject it, or leave it pending forever. */
    static closeMode: "reject" | "hang" = "reject";
    private static held: (() => void)[] = [];

    /** How many calls are parked by {@link FakePeerConnection.hold} right now. */
    static get heldCount(): number {
        return FakePeerConnection.held.length;
    }

    /** Let every parked call proceed. Calls a `close()` already settled are skipped. */
    static release(): void {
        const parked = FakePeerConnection.held;
        FakePeerConnection.held = [];
        for (const proceed of parked) proceed();
    }

    connectionState: RTCPeerConnectionState = "new";
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    closed = false;
    config: RTCConfiguration;

    onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
    ontrack: ((event: RTCTrackEvent) => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    onnegotiationneeded: (() => void) | null = null;

    private transceivers: FakeTransceiver[] = [];
    private inFlight = new Set<(error: DOMException) => void>();
    /** Candidates the connection accepted, in order. */
    accepted: RTCIceCandidateInit[] = [];

    constructor(config: RTCConfiguration = {}) {
        this.config = config;
        FakePeerConnection.instances.push(this);
    }

    addTransceiver(kind: string, init?: RTCRtpTransceiverInit): FakeTransceiver {
        if (FakePeerConnection.addTransceiverThrows) {
            throw new DOMException("the kind is not supported", "NotSupportedError");
        }
        const transceiver = new FakeTransceiver(kind, init?.direction ?? "sendrecv");
        transceiver.mid = String(this.transceivers.length);
        this.transceivers.push(transceiver);
        return transceiver;
    }

    getTransceivers(): FakeTransceiver[] {
        return [...this.transceivers];
    }

    /** Reject the way a browser does when a closed connection is asked to negotiate. */
    private assertOpen(): void {
        if (this.closed) throw new DOMException("the connection is closed", "InvalidStateError");
    }

    /**
     * Run one negotiation call the way the browser schedules it.
     *
     * @param work - The effect of the call, applied only once it completes.
     * @returns What `work` returns.
     */
    private async negotiate<T>(work: () => T): Promise<T> {
        this.assertOpen();
        if (FakePeerConnection.hold) {
            await new Promise<void>((resolve, reject) => {
                const abort = (error: DOMException): void => reject(error);
                this.inFlight.add(abort);
                FakePeerConnection.held.push(() => {
                    if (this.inFlight.delete(abort)) resolve();
                });
            });
        }
        return work();
    }

    createOffer(): Promise<RTCSessionDescriptionInit> {
        return this.negotiate(() => {
            if (FakePeerConnection.offerRejects) throw new Error("the connection is closing");
            const sdp = FakePeerConnection.offerSdp;
            return sdp === null ? { type: "offer" } : { type: "offer", sdp };
        });
    }

    createAnswer(): Promise<RTCSessionDescriptionInit> {
        return this.negotiate(() => {
            const sdp = FakePeerConnection.answerSdp;
            return sdp === null ? { type: "answer" } : { type: "answer", sdp };
        });
    }

    setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
        return this.negotiate(() => {
            if (!FakePeerConnection.tracksLocalDescription) return;
            this.localDescription = description;
        });
    }

    /**
     * Apply a remote description, creating transceivers for an offer's m-lines.
     *
     * The append is the point: a browser does not reuse transceivers the answerer
     * created beforehand, so anything pre-allocated stays in front of the
     * negotiated ones with no `mid` — which is exactly how positional slot lookup
     * ends up on the wrong media.
     */
    setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
        return this.negotiate(() => {
            this.remoteDescription = description;
            if (description.type !== "offer") return;
            for (let index = 0; index < FakePeerConnection.remoteMLines; index += 1) {
                const transceiver = new FakeTransceiver(
                    index === 0 ? "audio" : "video",
                    "recvonly",
                );
                transceiver.mid = String(index);
                this.transceivers.push(transceiver);
            }
        });
    }

    addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        return this.negotiate(() => {
            if (this.remoteDescription === null) {
                throw new DOMException("remote description is null", "InvalidStateError");
            }
            this.accepted.push(candidate);
        });
    }

    /** Close, settling every call in flight per {@link FakePeerConnection.closeMode}. */
    close(): void {
        this.closed = true;
        this.connectionState = "closed";
        const aborts = [...this.inFlight];
        this.inFlight.clear();
        if (FakePeerConnection.closeMode === "hang") return;
        for (const abort of aborts) {
            abort(new DOMException("the connection was closed", "InvalidStateError"));
        }
    }

    /** Drive a connection state change, as the browser would. */
    setConnectionState(state: RTCPeerConnectionState): void {
        this.connectionState = state;
        this.onconnectionstatechange?.();
    }

    /** Deliver a local ICE candidate, as gathering would. */
    emitCandidate(candidate: RTCIceCandidate | null): void {
        this.onicecandidate?.({ candidate } as RTCPeerConnectionIceEvent);
    }

    /**
     * Deliver an inbound track on one of this connection's transceivers.
     *
     * `streams` defaults to empty on purpose: that is what a browser reports for
     * an offer built from bare `addTransceiver` calls, which is exactly how a
     * mesh allocates its slots, so the routing under test is the fallback path.
     * Pass one to exercise the other branch, where the sending side grouped the
     * track into a stream the caller should see instead of a local wrapper.
     */
    emitTrack(
        transceiver: FakeTransceiver,
        track: MediaStreamTrack,
        streams: readonly MediaStream[] = [],
    ): void {
        this.ontrack?.({ transceiver, track, streams } as unknown as RTCTrackEvent);
    }

    static reset(): void {
        FakePeerConnection.instances = [];
        FakePeerConnection.remoteMLines = 4;
        FakePeerConnection.offerSdp = "v=0\r\nlocal-offer";
        FakePeerConnection.answerSdp = "v=0\r\nlocal-answer";
        FakePeerConnection.offerRejects = false;
        FakePeerConnection.tracksLocalDescription = true;
        FakePeerConnection.hold = false;
        FakePeerConnection.addTransceiverThrows = false;
        FakePeerConnection.closeMode = "reject";
        FakePeerConnection.held = [];
    }
}

/** Install {@link FakePeerConnection} on `globalThis`. Returns a restore function. */
export function installPeerConnection(): () => void {
    const previousPc = (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection;
    const previousStream = (globalThis as { MediaStream?: unknown }).MediaStream;
    FakePeerConnection.reset();
    (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = FakePeerConnection;
    (globalThis as { MediaStream?: unknown }).MediaStream = FakeMediaStream;
    return () => {
        (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = previousPc;
        (globalThis as { MediaStream?: unknown }).MediaStream = previousStream;
    };
}

/**
 * A `MediaStream` jsdom does not provide, holding whatever it was handed.
 *
 * Installed alongside the connection because a mesh wraps every inbound track in
 * one, and a `ReferenceError` there would fail the routing tests for a reason
 * that has nothing to do with routing.
 */
class FakeMediaStream {
    id = `stream-${Math.random().toString(36).slice(2, 8)}`;
    constructor(private tracks: MediaStreamTrack[] = []) {}
    getTracks(): MediaStreamTrack[] {
        return this.tracks;
    }
    getAudioTracks(): MediaStreamTrack[] {
        return this.tracks.filter((track) => track.kind === "audio");
    }
    getVideoTracks(): MediaStreamTrack[] {
        return this.tracks.filter((track) => track.kind === "video");
    }
}

/** A `MediaStreamTrack` stand-in, enough for `replaceTrack` and `onended`. */
export function fakeMediaTrack(kind: "audio" | "video" = "audio"): MediaStreamTrack {
    return {
        kind,
        id: `${kind}-track`,
        stop: vi.fn(),
        onended: null,
    } as unknown as MediaStreamTrack;
}
