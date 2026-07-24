import { Avatar, Image, AspectRatio, Carousel } from "tempest-react-sdk";
import { Example } from "../Example";

export function DisplayMediaSection() {
    return (
        <section className="gallery-section" id="display-media">
            <h3>Avatar · Image · AspectRatio · Carousel</h3>
            <p className="description">
                Componentes de mídia e imagem: avatares com iniciais e status, imagem com fallback,
                proporção fixa e carrossel.
            </p>

            <Example
                title="Avatar"
                note="Imagem, iniciais (sem src), tamanhos e indicador de status."
                code={`<Avatar src="/avatar-1.svg" name="Ana Lima" size="lg" />
<Avatar name="João Pedro" size="lg" />
<Avatar name="Ana Lima" size="xs" />
<Avatar name="Ana Lima" size="sm" />
<Avatar name="Ana Lima" size="md" />
<Avatar name="Ana Lima" size="xl" />
<Avatar src="/avatar-1.svg" name="Ana Lima" size="lg" status="online" />`}
            >
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <Avatar src="/avatar-1.svg" name="Ana Lima" size="lg" />
                    <Avatar name="João Pedro" size="lg" />
                    <Avatar name="Ana Lima" size="xs" />
                    <Avatar name="Ana Lima" size="sm" />
                    <Avatar name="Ana Lima" size="md" />
                    <Avatar name="Ana Lima" size="xl" />
                    <Avatar src="/avatar-1.svg" name="Ana Lima" size="lg" status="online" />
                </div>
            </Example>

            <Example
                title="Image"
                note="Imagem válida e uma com src quebrado que cai no fallback."
                code={`<Image src="/cover-1.svg" alt="Capa" style={{ width: 240 }} />
<Image src="/nope.jpg" fallback="/cover-2.svg" alt="Fallback" style={{ width: 240 }} />`}
            >
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <Image src="/cover-1.svg" alt="Capa" style={{ width: 240 }} />
                    <Image
                        src="/nope.jpg"
                        fallback="/cover-2.svg"
                        alt="Fallback"
                        style={{ width: 240 }}
                    />
                </div>
            </Example>

            <Example
                title="AspectRatio"
                note="Mantém a proporção 16:9 independente da largura do container."
                code={`<div style={{ width: 320 }}>
  <AspectRatio ratio={16 / 9}>
    <img
      src="/cover-3.svg"
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  </AspectRatio>
</div>`}
            >
                <div style={{ width: 320 }}>
                    <AspectRatio ratio={16 / 9}>
                        <img
                            src="/cover-3.svg"
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                    </AspectRatio>
                </div>
            </Example>

            <Example
                title="Carousel"
                note="Setas, dots e loop habilitado."
                code={`<div style={{ width: 360 }}>
  <Carousel loop>
    <img src="/cover-1.svg" alt="Capa 1" style={{ width: "100%", display: "block" }} />
    <img src="/cover-2.svg" alt="Capa 2" style={{ width: "100%", display: "block" }} />
    <img src="/cover-3.svg" alt="Capa 3" style={{ width: "100%", display: "block" }} />
  </Carousel>
</div>`}
            >
                <div style={{ width: 360 }}>
                    <Carousel loop>
                        <img
                            src="/cover-1.svg"
                            alt="Capa 1"
                            style={{ width: "100%", display: "block" }}
                        />
                        <img
                            src="/cover-2.svg"
                            alt="Capa 2"
                            style={{ width: "100%", display: "block" }}
                        />
                        <img
                            src="/cover-3.svg"
                            alt="Capa 3"
                            style={{ width: "100%", display: "block" }}
                        />
                    </Carousel>
                </div>
            </Example>
        </section>
    );
}
