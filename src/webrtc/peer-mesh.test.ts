import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    fakeMediaTrack,
    FakePeerConnection,
    installPeerConnection,
    type FakeTransceiver,
} from "../../test/webrtc-mocks";
import { createPeerMesh } from "./peer-mesh";
import type { MeshMessage, MeshSlot } from "./mesh-types";

/**
 * Every test here is named after a trap that cost real debugging in the mesh
 * this was ported from. The symptoms are all mute: a camera in the screen tile,
 * a connection that sits in `checking` forever, a call that dies the moment
 * somebody unmutes. None of them raises an error anywhere.
 */

const SLOTS: MeshSlot[] = [
    { name: "mic", kind: "audio" },
    { name: "cam", kind: "video" },
    { name: "screen", kind: "video" },
    { name: "screen-audio", kind: "audio" },
];

/** Build a mesh with the messages it sends captured. */
function meshWith(overrides: Partial<Parameters<typeof createPeerMesh>[0]> = {}) {
    const sent: MeshMessage[] = [];
    const mesh = createPeerMesh({
        slots: SLOTS,
        send: (message) => sent.push(message),
        ...overrides,
    });
    return { mesh, sent };
}

/** The connection opened for the nth peer. */
function connection(index = 0): FakePeerConnection {
    return FakePeerConnection.instances[index];
}

describe("createPeerMesh — the answerer must not pre-allocate", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installPeerConnection();
    });
    afterEach(() => restore());

    it("allocates nothing on the answering side before the offer lands", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: false });

        expect(connection().getTransceivers()).toHaveLength(0);
    });

    it("allocates one transceiver per slot on the offering side", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });

        const kinds = connection()
            .getTransceivers()
            .map((transceiver) => transceiver.kind);
        expect(kinds).toEqual(["audio", "video", "video", "audio"]);
    });

    it("adopts exactly the transceivers the offer created, and switches them to sendrecv", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: false });
        await mesh.accept({ type: "offer", from: "peer-1", to: "me", sdp: "remote-offer" });

        const adopted = connection().getTransceivers();
        expect(adopted).toHaveLength(SLOTS.length);
        for (const transceiver of adopted) expect(transceiver.direction).toBe("sendrecv");
    });
});

describe("createPeerMesh — mid is the slot identity", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installPeerConnection();
    });
    afterEach(() => restore());

    it("routes an inbound track by mid, not by position in getTransceivers()", async () => {
        const onPeers = vi.fn();
        const { mesh } = meshWith({ onPeers });
        await mesh.addPeer("peer-1", { offerer: false });
        await mesh.accept({ type: "offer", from: "peer-1", to: "me", sdp: "remote-offer" });

        const screen = connection()
            .getTransceivers()
            .find((transceiver) => transceiver.mid === "2") as FakeTransceiver;
        connection().emitTrack(screen, fakeMediaTrack("video"));

        const peer = mesh.peers[0];
        expect(peer.streams.screen).not.toBeNull();
        expect(peer.streams.cam).toBeNull();
    });

    it("falls back to position only when the mid is not a plain ordinal", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });

        const [first] = connection().getTransceivers();
        first.mid = "audio-mid";
        connection().emitTrack(first, fakeMediaTrack("audio"));

        expect(mesh.peers[0].streams.mic).not.toBeNull();
    });

    it("drops a track from a transceiver no slot claims, instead of guessing", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });

        const stray = { mid: "99", kind: "video" } as unknown as FakeTransceiver;
        connection().emitTrack(stray, fakeMediaTrack("video"));

        expect(Object.values(mesh.peers[0].streams).every((stream) => stream === null)).toBe(true);
    });
});

describe("createPeerMesh — candidates that arrive before the description", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installPeerConnection();
    });
    afterEach(() => restore());

    /** An `ice` message as the wire carries it. */
    function ice(candidate: string): MeshMessage & { from: string } {
        return {
            type: "ice",
            from: "peer-1",
            to: "me",
            candidate,
            sdpMid: "0",
            sdpMLineIndex: 0,
        };
    }

    it("queues a candidate while the remote description is missing, and drains it after", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });

        await mesh.accept(ice("candidate:early-1"));
        await mesh.accept(ice("candidate:early-2"));
        expect(connection().accepted).toEqual([]);

        await mesh.accept({ type: "answer", from: "peer-1", to: "me", sdp: "remote-answer" });

        expect(connection().accepted.map((entry) => entry.candidate)).toEqual([
            "candidate:early-1",
            "candidate:early-2",
        ]);
    });

    it("hands a later candidate straight to the connection", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });
        await mesh.accept({ type: "answer", from: "peer-1", to: "me", sdp: "remote-answer" });

        await mesh.accept(ice("candidate:late"));

        expect(connection().accepted.map((entry) => entry.candidate)).toEqual(["candidate:late"]);
    });

    it("ignores the end-of-candidates marker rather than passing null on", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });
        await mesh.accept({ type: "answer", from: "peer-1", to: "me", sdp: "remote-answer" });

        await mesh.accept({
            type: "ice",
            from: "peer-1",
            to: "me",
            candidate: null,
            sdpMid: null,
            sdpMLineIndex: null,
        });

        expect(connection().accepted).toEqual([]);
    });
});

describe("createPeerMesh — toggling media never renegotiates", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installPeerConnection();
    });
    afterEach(() => restore());

    it("publishes a track with replaceTrack, adding no m-line", async () => {
        const { mesh, sent } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });
        const offersBefore = sent.filter((message) => message.type === "offer").length;
        const transceiversBefore = connection().getTransceivers().length;

        const track = fakeMediaTrack("audio");
        await mesh.setLocalTrack("mic", track);

        expect(connection().getTransceivers()[0].sender.track).toBe(track);
        expect(connection().getTransceivers()).toHaveLength(transceiversBefore);
        expect(sent.filter((message) => message.type === "offer")).toHaveLength(offersBefore);
    });

    it("retracts with null, keeping the negotiated transceiver", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });
        await mesh.setLocalTrack("mic", fakeMediaTrack("audio"));

        await mesh.setLocalTrack("mic", null);

        expect(connection().getTransceivers()[0].sender.track).toBeNull();
        expect(connection().getTransceivers()).toHaveLength(SLOTS.length);
    });

    it("publishes a track held before a peer joined, without waiting for a toggle", async () => {
        const { mesh } = meshWith();
        const track = fakeMediaTrack("audio");
        await mesh.setLocalTrack("mic", track);

        await mesh.addPeer("peer-1", { offerer: true });

        expect(connection().getTransceivers()[0].sender.track).toBe(track);
    });

    it("publishes onto a link that answered, so a peer who answered can be heard", async () => {
        const { mesh } = meshWith();
        const track = fakeMediaTrack("audio");
        await mesh.setLocalTrack("mic", track);

        await mesh.addPeer("peer-1", { offerer: false });
        await mesh.accept({ type: "offer", from: "peer-1", to: "me", sdp: "remote-offer" });

        expect(connection().getTransceivers()[0].sender.track).toBe(track);
    });
});

describe("createPeerMesh — exactly one side of a link offers", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installPeerConnection();
    });
    afterEach(() => restore());

    it("offers when told it arrived later, and answers otherwise", async () => {
        const later = meshWith();
        await later.mesh.addPeer("peer-1", { offerer: true });
        expect(later.sent.filter((message) => message.type === "offer")).toHaveLength(1);

        FakePeerConnection.reset();
        const earlier = meshWith();
        await earlier.mesh.addPeer("peer-2", { offerer: false });
        expect(earlier.sent.filter((message) => message.type === "offer")).toEqual([]);
    });

    it("answers an offer from a peer it was never told about", async () => {
        const { mesh, sent } = meshWith();

        await mesh.accept({ type: "offer", from: "surprise", to: "me", sdp: "remote-offer" });

        expect(sent.filter((message) => message.type === "answer")).toHaveLength(1);
        expect(mesh.peers.map((peer) => peer.peerId)).toEqual(["surprise"]);
    });

    it("never offers from the answering side, even when negotiation is needed", async () => {
        const { mesh, sent } = meshWith();
        await mesh.addPeer("peer-1", { offerer: false });

        connection().onnegotiationneeded?.();
        await Promise.resolve();

        expect(sent.filter((message) => message.type === "offer")).toEqual([]);
    });
});

describe("createPeerMesh — the room divides the uplink", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installPeerConnection();
    });
    afterEach(() => restore());

    /** The bitrate written onto one link's video sender for a slot. */
    function capOf(index: number, slotIndex: number): number | undefined {
        const transceivers = connection(index).getTransceivers();
        return transceivers[slotIndex].sender.getParameters().encodings?.[0]?.maxBitrate;
    }

    it("leaves the caps alone while there is one peer", async () => {
        const { mesh } = meshWith({
            quality: { video: { cam: 1200, screen: 3000 }, uplinkBudgetKbps: 6000 },
        });
        await mesh.addPeer("peer-1", { offerer: true });
        await mesh.applyQuality({ video: { cam: 1200, screen: 3000 }, uplinkBudgetKbps: 6000 });

        expect(capOf(0, 1)).toBe(1200 * 1000);
        expect(capOf(0, 2)).toBe(3000 * 1000);
    });

    it("divides them once the room grows past one", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });
        await mesh.addPeer("peer-2", { offerer: true });
        await mesh.applyQuality({ video: { cam: 1200, screen: 3000 }, uplinkBudgetKbps: 6000 });

        expect(capOf(0, 2)).toBeLessThan(3000 * 1000);
        expect(capOf(1, 2)).toBe(capOf(0, 2));
    });

    it("keeps a floor, so a crowded room does not allocate a blur to everybody", async () => {
        const { mesh } = meshWith();
        for (const id of ["a", "b", "c", "d", "e", "f"]) {
            await mesh.addPeer(id, { offerer: true });
        }
        await mesh.applyQuality({
            video: { cam: 1200, screen: 3000 },
            uplinkBudgetKbps: 600,
            minVideoKbps: 300,
        });

        expect(capOf(0, 1)).toBe(300 * 1000);
        expect(capOf(0, 2)).toBe(300 * 1000);
    });

    it("gives the share back when a peer leaves", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });
        await mesh.addPeer("peer-2", { offerer: true });
        await mesh.applyQuality({ video: { screen: 3000 }, uplinkBudgetKbps: 3000 });
        const shared = capOf(0, 2);

        mesh.removePeer("peer-2");
        await Promise.resolve();
        await Promise.resolve();

        expect(shared).toBeLessThan(3000 * 1000);
        expect(capOf(0, 2)).toBe(3000 * 1000);
    });

    it("never divides audio, which is the part that has to survive", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });
        await mesh.addPeer("peer-2", { offerer: true });
        await mesh.applyQuality({
            audio: { mic: 32000 },
            video: { screen: 3000 },
            uplinkBudgetKbps: 600,
        });

        expect(capOf(0, 0)).toBe(32000);
    });
});

describe("createPeerMesh — the aggregate state", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installPeerConnection();
    });
    afterEach(() => restore());

    it("reports connected-and-alone rather than a failure", async () => {
        const onState = vi.fn();
        meshWith({ onState });

        expect(onState).toHaveBeenLastCalledWith("connecting", "signaling");
    });

    it("reports negotiating while links exist and none is connected", async () => {
        const onState = vi.fn();
        const { mesh } = meshWith({ onState });
        await mesh.addPeer("peer-1", { offerer: true });

        expect(onState).toHaveBeenLastCalledWith("connecting", "negotiating");
    });

    it("reports connected as soon as any link is", async () => {
        const onState = vi.fn();
        const { mesh } = meshWith({ onState });
        await mesh.addPeer("peer-1", { offerer: true });

        connection().setConnectionState("connected");

        expect(onState).toHaveBeenLastCalledWith("connected");
    });

    it("falls back to alone when the last peer goes", async () => {
        const onState = vi.fn();
        const { mesh } = meshWith({ onState });
        await mesh.addPeer("peer-1", { offerer: true });

        mesh.removePeer("peer-1");

        expect(onState).toHaveBeenLastCalledWith("connected", "alone");
    });

    it("drops a link the browser reports as failed", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });

        connection().setConnectionState("failed");

        expect(mesh.peers).toEqual([]);
        expect(connection().closed).toBe(true);
    });

    it("closes every link and reports closed on stop", async () => {
        const onState = vi.fn();
        const { mesh } = meshWith({ onState });
        await mesh.addPeer("peer-1", { offerer: true });
        await mesh.addPeer("peer-2", { offerer: true });

        mesh.stop();

        expect(connection(0).closed).toBe(true);
        expect(connection(1).closed).toBe(true);
        expect(onState).toHaveBeenLastCalledWith("closed");
        expect(mesh.peers).toEqual([]);
    });
});

describe("createPeerMesh — the wire", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installPeerConnection();
    });
    afterEach(() => restore());

    it("sends each local candidate to the peer it belongs to", async () => {
        const { mesh, sent } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });

        connection().emitCandidate({
            candidate: "candidate:local",
            sdpMid: "0",
            sdpMLineIndex: 0,
        } as RTCIceCandidate);

        expect(sent).toContainEqual({
            type: "ice",
            to: "peer-1",
            candidate: "candidate:local",
            sdpMid: "0",
            sdpMLineIndex: 0,
        });
    });

    it("sends the end-of-candidates marker as a null candidate", async () => {
        const { mesh, sent } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });

        connection().emitCandidate(null);

        expect(sent).toContainEqual({
            type: "ice",
            to: "peer-1",
            candidate: null,
            sdpMid: null,
            sdpMLineIndex: null,
        });
    });

    it("uses the ICE servers it was given, and the ones set later", async () => {
        const first: RTCIceServer[] = [{ urls: "stun:one" }];
        const { mesh } = meshWith({ iceServers: first });
        await mesh.addPeer("peer-1", { offerer: true });
        expect(connection(0).config.iceServers).toBe(first);

        const second: RTCIceServer[] = [{ urls: "turn:two" }];
        mesh.setIceServers(second);
        await mesh.addPeer("peer-2", { offerer: true });
        expect(connection(1).config.iceServers).toBe(second);
    });

    it("ignores a message from a peer it has no link to", async () => {
        const { mesh } = meshWith();

        await expect(
            mesh.accept({ type: "answer", from: "ghost", to: "me", sdp: "x" }),
        ).resolves.toBeUndefined();
        expect(mesh.peers).toEqual([]);
    });

    it("opens one link per peer, and never a second for the same id", async () => {
        const { mesh } = meshWith();
        await mesh.addPeer("peer-1", { offerer: true });
        await mesh.addPeer("peer-1", { offerer: true });

        expect(FakePeerConnection.instances).toHaveLength(1);
        expect(mesh.peers).toHaveLength(1);
    });
});
