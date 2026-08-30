import { useEffect, useRef, useState } from "react";
import {
    createPeerMesh,
    type MeshMessage,
    type MeshPeer,
    type MeshState,
    type PeerMesh,
} from "tempest-react-sdk";
import { Example } from "../Example";

/** The lanes both sides negotiate, in the order that gives them their `mid`. */
const SLOTS = [
    { name: "mic", kind: "audio" as const },
    { name: "cam", kind: "video" as const },
    { name: "screen", kind: "video" as const },
];

/** One side of the demo room. */
interface Side {
    id: string;
    mesh: PeerMesh;
}

/**
 * Draw a moving square onto a canvas and publish it as a video track.
 *
 * A canvas needs no permission prompt, which keeps the demo self-contained —
 * and the motion is what makes it obvious that the far side is receiving live
 * frames rather than one still image.
 */
function paintedTrack(label: string, color: string): MediaStreamTrack | null {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    if (!context || typeof canvas.captureStream !== "function") return null;

    let frame = 0;
    const draw = (): void => {
        frame += 1;
        context.fillStyle = "#111827";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = color;
        context.fillRect((frame * 2) % canvas.width, 60, 60, 60);
        context.fillStyle = "#f9fafb";
        context.font = "16px sans-serif";
        context.fillText(label, 12, 28);
        requestAnimationFrame(draw);
    };
    draw();

    return canvas.captureStream(15).getVideoTracks()[0] ?? null;
}

/**
 * Demo of a two-peer mesh, with the signalling looped back in the page.
 *
 * Both sides are real `RTCPeerConnection`s that connect to each other over host
 * candidates — no server, and nothing faked. What the loopback replaces is only
 * the part `createPeerMesh` deliberately leaves to the app: delivering three
 * message shapes to the right peer.
 */
export function PeerMeshSection() {
    const [peersA, setPeersA] = useState<MeshPeer[]>([]);
    const [peersB, setPeersB] = useState<MeshPeer[]>([]);
    const [state, setState] = useState<{ value: MeshState; detail?: string }>({
        value: "connecting",
    });
    const [publishing, setPublishing] = useState(false);
    const sides = useRef<{ a: Side; b: Side } | null>(null);
    const remoteVideo = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const deliver = (to: "a" | "b", message: MeshMessage): void => {
            const target = sides.current?.[to];
            if (!target) return;
            void target.mesh.accept({ ...message, from: to === "a" ? "b" : "a" });
        };

        const a: Side = {
            id: "a",
            mesh: createPeerMesh({
                slots: SLOTS,
                send: (message) => deliver("b", message),
                onPeers: setPeersA,
                onState: (value, detail) => setState({ value, detail }),
            }),
        };
        const b: Side = {
            id: "b",
            mesh: createPeerMesh({
                slots: SLOTS,
                send: (message) => deliver("a", message),
                onPeers: setPeersB,
            }),
        };
        sides.current = { a, b };

        void (async () => {
            await b.mesh.addPeer("a", { offerer: false });
            await a.mesh.addPeer("b", { offerer: true });
        })();

        return () => {
            a.mesh.stop();
            b.mesh.stop();
            sides.current = null;
        };
    }, []);

    useEffect(() => {
        const stream = peersB[0]?.streams.cam ?? null;
        if (remoteVideo.current) remoteVideo.current.srcObject = stream;
    }, [peersB]);

    async function togglePublish(): Promise<void> {
        const mesh = sides.current?.a.mesh;
        if (!mesh) return;
        if (publishing) {
            await mesh.setLocalTrack("cam", null);
            setPublishing(false);
            return;
        }
        const track = paintedTrack("A publica", "#38bdf8");
        if (!track) return;
        await mesh.setLocalTrack("cam", track);
        setPublishing(true);
    }

    return (
        <section className="gallery-section" id="peer-mesh">
            <h3>Mesh WebRTC (createPeerMesh)</h3>
            <p className="description">
                Duas meshes reais na mesma página, sinalizando em loopback. As conexões são
                `RTCPeerConnection` de verdade, conectadas por candidatos host — o que o loopback
                substitui é só a entrega das mensagens, que é o que o SDK deixa para o app.
            </p>

            <Example
                title="Uma sala de dois, sem servidor"
                note="A oferece (chegou depois), B responde. Publicar liga a faixa `cam` por replaceTrack — nada renegocia."
                code={`const mesh = createPeerMesh({
  slots: [
    { name: "mic", kind: "audio" },
    { name: "cam", kind: "video" },
    { name: "screen", kind: "video" },
  ],
  send: (message) => socket.send(message),
  onPeers: setPeers,
  onState: setState,
});

socket.onMessage = (message) => void mesh.accept(message);

await mesh.addPeer("peer-2", { offerer: true });
await mesh.setLocalTrack("cam", camTrack);`}
            >
                <div className="gallery-toolbar" style={{ marginBottom: 16 }}>
                    <button onClick={() => void togglePublish()}>
                        {publishing ? "Retrair cam" : "Publicar cam de A"}
                    </button>
                    <span className="description">
                        Estado: <strong>{state.value}</strong>
                        {state.detail ? ` (${state.detail})` : ""}
                    </span>
                </div>

                <div
                    style={{
                        display: "grid",
                        gap: 16,
                        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    }}
                >
                    <div>
                        <strong>Lado A</strong>
                        <ul>
                            {peersA.map((peer) => (
                                <li key={peer.peerId}>
                                    {peer.peerId} — {peer.connection}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <strong>Lado B (recebe)</strong>
                        <ul>
                            {peersB.map((peer) => (
                                <li key={peer.peerId}>
                                    {peer.peerId} — {peer.connection} · slots com mídia:{" "}
                                    {Object.entries(peer.streams)
                                        .filter(([, stream]) => stream !== null)
                                        .map(([slot]) => slot)
                                        .join(", ") || "nenhum"}
                                </li>
                            ))}
                        </ul>
                        <video
                            ref={remoteVideo}
                            autoPlay
                            playsInline
                            muted
                            style={{
                                width: "100%",
                                maxWidth: 320,
                                background: "var(--tempest-surface)",
                                borderRadius: "var(--tempest-radius-md)",
                            }}
                        />
                    </div>
                </div>
            </Example>
        </section>
    );
}
