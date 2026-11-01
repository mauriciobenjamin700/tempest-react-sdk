import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakePeerConnection, installPeerConnection } from "../../test/webrtc-mocks";
import { createPeerMesh } from "./peer-mesh";
import type { MeshMessage, MeshSlot } from "./mesh-types";

const SLOTS: MeshSlot[] = [
    { name: "mic", kind: "audio" },
    { name: "cam", kind: "video" },
];

describe("createPeerMesh — acceptPeer gates offers from unknown peers", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installPeerConnection();
    });
    afterEach(() => restore());

    it("opens nothing and answers nothing for a refused peer", async () => {
        const sent: MeshMessage[] = [];
        const onNotice = vi.fn();
        const acceptPeer = vi.fn((peerId: string) => peerId === "roster-member");
        const mesh = createPeerMesh({
            slots: SLOTS,
            send: (message) => sent.push(message),
            onNotice,
            acceptPeer,
        });

        await mesh.accept({ type: "offer", from: "stranger", to: "me", sdp: "remote-offer" });

        expect(acceptPeer).toHaveBeenCalledWith("stranger");
        expect(FakePeerConnection.instances).toHaveLength(0);
        expect(sent).toEqual([]);
        expect(mesh.peers).toEqual([]);
        expect(onNotice).toHaveBeenCalledWith("offer_refused");
    });

    it("answers a peer the gate accepts", async () => {
        const sent: MeshMessage[] = [];
        const mesh = createPeerMesh({
            slots: SLOTS,
            send: (message) => sent.push(message),
            acceptPeer: (peerId) => peerId === "roster-member",
        });

        await mesh.accept({ type: "offer", from: "roster-member", to: "me", sdp: "remote-offer" });

        expect(sent.filter((message) => message.type === "answer")).toHaveLength(1);
        expect(mesh.peers.map((peer) => peer.peerId)).toEqual(["roster-member"]);
    });

    it("does not ask about a peer the app already added", async () => {
        const sent: MeshMessage[] = [];
        const acceptPeer = vi.fn(() => false);
        const mesh = createPeerMesh({
            slots: SLOTS,
            send: (message) => sent.push(message),
            acceptPeer,
        });

        await mesh.addPeer("known", { offerer: false });
        await mesh.accept({ type: "offer", from: "known", to: "me", sdp: "remote-offer" });

        expect(acceptPeer).not.toHaveBeenCalled();
        expect(sent.filter((message) => message.type === "answer")).toHaveLength(1);
    });
});
