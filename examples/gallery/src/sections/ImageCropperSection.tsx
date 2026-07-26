import { useRef, useState } from "react";
import {
    Badge,
    Button,
    FileUpload,
    ImageCropper,
    type ImageCropperHandle,
} from "tempest-react-sdk";
import { Example } from "../Example";

/**
 * A deterministic 480×320 sample served from `public/`.
 *
 * A raster asset rather than an inline SVG on purpose: an SVG data URI decodes fine
 * and still reports `naturalWidth: 0` in Chromium, which leaves the cropper with no
 * intrinsic size to frame against. A local file also keeps the gallery's Playwright
 * smoke working offline.
 */
const SAMPLE = "/cropper-sample.png";

/** Human-readable size for a Blob. */
function formatBytes(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Demo of the cropper.
 *
 * The "Recortar" button is the point: it exports through canvas and shows the real
 * output dimensions, which is how you see that the export uses the source's pixels
 * and not the preview's.
 */
export function ImageCropperSection() {
    const avatar = useRef<ImageCropperHandle>(null);
    const document = useRef<ImageCropperHandle>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [result, setResult] = useState<{ url: string; size: number; dims: string } | null>(null);

    const exportFrom = async (handle: ImageCropperHandle | null) => {
        const blob = await handle?.crop();
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const probe = new Image();
        probe.onload = () =>
            setResult({
                url,
                size: blob.size,
                dims: `${probe.naturalWidth} × ${probe.naturalHeight}`,
            });
        probe.src = url;
    };

    return (
        <section className="gallery-section" id="image-cropper">
            <h3>ImageCropper — recorte com proporção fixa</h3>
            <p className="description">
                O frame fica parado e a imagem pana/zooma atrás dele — por construção não existe
                recorte fora da proporção. A exportação lê os pixels <strong>naturais</strong> via
                canvas, não o preview, e a imagem é sempre clampada pra cobrir o frame (nunca sai
                borda vazia).
            </p>

            <Example
                title="Avatar — proporção 1:1, frame circular"
                code={`const cropper = useRef<ImageCropperHandle>(null);

<ImageCropper ref={cropper} src={file} aspect={1} shape="circle" maxSize={512} />

const blob = await cropper.current?.crop();`}
                note="Arraste pra reposicionar, roda do mouse dá zoom. A área é focável: setas movem, + e − dão zoom, 0 centraliza."
            >
                <div style={{ display: "grid", gap: 12, maxWidth: 320 }}>
                    <ImageCropper
                        ref={avatar}
                        src={SAMPLE}
                        aspect={1}
                        shape="circle"
                        maxSize={512}
                        outputType="image/png"
                        label="Foto de perfil"
                    />
                    <Button onClick={() => void exportFrom(avatar.current)}>Recortar</Button>
                </div>
            </Example>

            <Example
                title="Documento — 16:9, sem teto de tamanho"
                code={`<ImageCropper src={file} aspect={16 / 9} />`}
                note="Sem maxSize a saída mantém a resolução do original — o que um scan de documento quer."
            >
                <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
                    <ImageCropper
                        ref={document}
                        src={SAMPLE}
                        aspect={16 / 9}
                        label="Foto do documento"
                    />
                    <Button onClick={() => void exportFrom(document.current)}>Recortar</Button>
                </div>
            </Example>

            <Example
                title="Saída"
                code={`const blob = await cropper.current?.crop();
// crop() devolve Promise<Blob | null> — null antes de carregar, nunca lança`}
                note="A amostra tem 480 × 320, então o avatar 1:1 sai 320 × 320 e o 16:9 sai 480 × 269 — dimensões da fonte, não os ~293 px do preview. O maxSize={512} não capa aqui porque a fonte já é menor; capa numa foto de celular."
            >
                {result ? (
                    <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
                        <img
                            src={result.url}
                            alt="Recorte exportado"
                            style={{
                                maxWidth: 240,
                                border: "1px solid var(--tempest-border)",
                                borderRadius: "var(--tempest-radius-md)",
                            }}
                        />
                        <span style={{ display: "flex", gap: 8 }}>
                            <Badge variant="primary">{result.dims}</Badge>
                            <Badge>{formatBytes(result.size)}</Badge>
                        </span>
                    </div>
                ) : (
                    <p className="description">Clique em “Recortar” em um dos exemplos acima.</p>
                )}
            </Example>

            <Example
                title="Com FileUpload"
                code={`<FileUpload value={files} onChange={setFiles} accept="image/*" />
{files[0] && <ImageCropper src={files[0]} aspect={1} shape="circle" />}`}
                note="O par natural: escolha o arquivo, recorte o que foi escolhido. File/Blob viram object URL, revogada na troca e no unmount."
            >
                <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
                    <FileUpload
                        value={files}
                        onChange={setFiles}
                        accept="image/*"
                        label="Sua foto"
                        title="Escolha uma imagem"
                    />
                    {files[0] && (
                        <ImageCropper
                            src={files[0]}
                            aspect={1}
                            shape="circle"
                            maxSize={512}
                            label="Recorte da sua foto"
                        />
                    )}
                </div>
            </Example>
        </section>
    );
}
