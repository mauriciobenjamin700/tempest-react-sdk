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
    /** Candidates the connection accepted, in order. */
    accepted: RTCIceCandidateInit[] = [];

    constructor(config: RTCConfiguration = {}) {
        this.config = config;
        FakePeerConnection.instances.push(this);
    }

    addTransceiver(kind: string, init?: RTCRtpTransceiverInit): FakeTransceiver {
        const transceiver = new FakeTransceiver(kind, init?.direction ?? "sendrecv");
        transceiver.mid = String(this.transceivers.length);
        this.transceivers.push(transceiver);
        return transceiver;
    }

    getTransceivers(): FakeTransceiver[] {
        return [...this.transceivers];
    }

    async createOffer(): Promise<RTCSessionDescriptionInit> {
        return { type: "offer", sdp: "v=0\r\nlocal-offer" };
    }

    async createAnswer(): Promise<RTCSessionDescriptionInit> {
        return { type: "answer", sdp: "v=0\r\nlocal-answer" };
    }

    async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
        this.localDescription = description;
    }

    /**
     * Apply a remote description, creating transceivers for an offer's m-lines.
     *
     * The append is the point: a browser does not reuse transceivers the answerer
     * created beforehand, so anything pre-allocated stays in front of the
     * negotiated ones with no `mid` — which is exactly how positional slot lookup
     * ends up on the wrong media.
     */
    async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
        this.remoteDescription = description;
        if (description.type !== "offer") return;
        for (let index = 0; index < FakePeerConnection.remoteMLines; index += 1) {
            const transceiver = new FakeTransceiver(index === 0 ? "audio" : "video", "recvonly");
            transceiver.mid = String(index);
            this.transceivers.push(transceiver);
        }
    }

    async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (this.remoteDescription === null) {
            throw new DOMException("remote description is null", "InvalidStateError");
        }
        this.accepted.push(candidate);
    }

    close(): void {
        this.closed = true;
        this.connectionState = "closed";
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
     * `streams` is left empty on purpose: that is what a browser reports for an
     * offer built from bare `addTransceiver` calls, which is exactly how a mesh
     * allocates its slots, so the routing under test is the fallback path.
     */
    emitTrack(transceiver: FakeTransceiver, track: MediaStreamTrack): void {
        this.ontrack?.({ transceiver, track, streams: [] } as unknown as RTCTrackEvent);
    }

    static reset(): void {
        FakePeerConnection.instances = [];
        FakePeerConnection.remoteMLines = 4;
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
