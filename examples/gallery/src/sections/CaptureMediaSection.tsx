import { useRef, useState } from "react";
import {
    AvatarGroup,
    Badge,
    Button,
    Lightbox,
    SignaturePad,
    type LightboxItem,
    type SignaturePadHandle,
} from "tempest-react-sdk";
import { Example } from "../Example";

const PHOTOS: LightboxItem[] = [
    { src: "/cover-1.svg", alt: "Capa 1", caption: "Fachada — 14:02" },
    { src: "/cover-2.svg", alt: "Capa 2", caption: "Interior — 14:05" },
    { src: "/avatar-1.svg", alt: "Avatar", caption: "Responsável" },
];

const PEOPLE = [
    { name: "Ana Lima", src: "/avatar-1.svg" },
    { name: "João Pedro" },
    { name: "Bruna Castro" },
    { name: "Carlos Eduardo" },
    { name: "Daniela Souza" },
];

/** Capture and media components added in 0.25.0. */
export function CaptureMediaSection() {
    const pad = useRef<SignaturePadHandle>(null);
    const [empty, setEmpty] = useState(true);
    const [exported, setExported] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [index, setIndex] = useState(0);
    const [overflowClicks, setOverflowClicks] = useState(0);

    async function exportSignature() {
        const blob = await pad.current?.toBlob("image/png");
        setExported(blob ? `${Math.round(blob.size / 1024)} KB de PNG` : "nada exportado");
    }

    return (
        <section className="gallery-section" id="capture-media">
            <h3>SignaturePad · Lightbox · AvatarGroup</h3>
            <p className="description">
                Captura de assinatura, visualizador de foto em tela cheia e fileira de avatares — o
                trio que aparece em app de campo (comprovante de entrega, fotos de vistoria,
                responsáveis pela tarefa).
            </p>

            <Example
                title="SignaturePad"
                note="Assine com o mouse ou o dedo. Desfazer remove só o último traço — o canvas é redesenhado a partir das listas de pontos. A tinta segue --tempest-text, então troque o tema e assine de novo."
                code={`const pad = useRef<SignaturePadHandle>(null);
const [vazio, setVazio] = useState(true);

const blob = await pad.current?.toBlob("image/png"); // é isto que você sobe

<SignaturePad ref={pad} label="Assinatura do cliente" onEmptyChange={setVazio} />`}
            >
                <div className="tempest-stack">
                    <SignaturePad
                        ref={pad}
                        label="Assinatura do cliente"
                        width={360}
                        height={160}
                        onEmptyChange={setEmpty}
                    />
                    <div className="tempest-cluster">
                        <Button disabled={empty} onClick={exportSignature}>
                            Exportar como blob
                        </Button>
                        {exported ? <Badge appearance="soft">{exported}</Badge> : null}
                    </div>
                </div>
            </Example>

            <Example
                title="Lightbox"
                note="Abre em overlay com foco preso e scroll da página travado. Esc fecha, ←/→ navegam, Home/End vão pras pontas. As vizinhas são pré-carregadas, então a troca não pisca."
                code={`<Lightbox
  open={aberto}
  items={fotos}
  index={indice}
  onIndexChange={setIndice}
  onClose={() => setAberto(false)}
/>`}
            >
                <div className="tempest-stack">
                    <div className="tempest-cluster">
                        {PHOTOS.map((photo, photoIndex) => (
                            <button
                                key={photo.src}
                                type="button"
                                onClick={() => {
                                    setIndex(photoIndex);
                                    setOpen(true);
                                }}
                                style={{
                                    padding: 0,
                                    border: "1px solid var(--tempest-border)",
                                    borderRadius: "var(--tempest-radius-sm)",
                                    background: "none",
                                    cursor: "pointer",
                                    width: 96,
                                }}
                            >
                                <img
                                    src={photo.src}
                                    alt={photo.alt}
                                    className="tempest-aspect-square"
                                    style={{ display: "block", borderRadius: "inherit" }}
                                />
                            </button>
                        ))}
                    </div>
                    <Lightbox
                        open={open}
                        items={PHOTOS}
                        index={index}
                        onIndexChange={setIndex}
                        onClose={() => setOpen(false)}
                    />
                </div>
            </Example>

            <Example
                title="AvatarGroup"
                note="max controla quantos aparecem antes do chip +N. O chip só é focável quando existe onOverflowClick — botão sem ação é ruído de tabulação."
                code={`<AvatarGroup
  label="Participantes"
  max={3}
  items={pessoas}
  onOverflowClick={() => abrirLista()}
/>`}
            >
                <div className="tempest-stack">
                    <div className="tempest-cluster">
                        <AvatarGroup label="Participantes (max 3)" max={3} items={PEOPLE} />
                        <AvatarGroup label="Participantes (sm)" max={4} size="sm" items={PEOPLE} />
                        <AvatarGroup
                            label="Participantes clicáveis"
                            max={2}
                            items={PEOPLE}
                            onOverflowClick={() => setOverflowClicks((count) => count + 1)}
                        />
                    </div>
                    {overflowClicks > 0 ? (
                        <Badge appearance="soft">chip clicado {overflowClicks}×</Badge>
                    ) : null}
                </div>
            </Example>
        </section>
    );
}
