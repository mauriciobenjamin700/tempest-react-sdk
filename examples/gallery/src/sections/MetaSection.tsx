import { useRef } from "react";
import {
    Badge,
    Button,
    Card,
    Stack,
    isShareSupported,
    share,
    useClipboard,
    useIdle,
    useIntersectionObserver,
    useKeyboardShortcut,
    useOnline,
    useToast,
} from "tempest-react-sdk";

import { Example } from "../Example";

export function MetaSection() {
    const toast = useToast();
    const online = useOnline();
    const idle = useIdle(8000);
    const clipboard = useClipboard();
    const sentinelRef = useRef<HTMLDivElement>(null);
    const entry = useIntersectionObserver(sentinelRef, { once: false });

    useKeyboardShortcut({ key: "k", mod: true }, (event) => {
        event.preventDefault();
        toast.info("Cmd/Ctrl+K detectado");
    });

    async function handleShare(): Promise<void> {
        const result = await share({
            title: "tempest-react-sdk",
            text: "Catálogo visual + funcional",
            url: typeof window !== "undefined" ? window.location.href : undefined,
        });
        if (result.unsupported) toast.warning("Web Share não suportado");
        else if (result.cancelled) toast.info("Compartilhamento cancelado");
        else if (result.shared) toast.success("Compartilhado");
    }

    return (
        <section className="gallery-section" id="meta">
            <h3>Hooks meta · Clipboard · Share · Keyboard</h3>
            <p className="description">
                Tudo que toca APIs do navegador além de fetch. Pressione <kbd>Ctrl/Cmd+K</kbd>.
            </p>

            <Example
                title="Network · Idle · Clipboard · Share"
                note="Hooks de navegador: status de rede, ociosidade, clipboard e Web Share."
                code={`const online = useOnline();
const idle = useIdle(8000);
const clipboard = useClipboard();

<Badge variant={online ? "success" : "danger"}>
    {online ? "online" : "offline"}
</Badge>

<Badge variant={idle ? "warning" : "neutral"}>
    {idle ? "usuário ocioso" : "ativo"}
</Badge>

<Button size="sm" onClick={() => clipboard.copy("npm install tempest-react-sdk")}>
    {clipboard.copied ? "Copiado!" : "Copiar comando"}
</Button>

<Button
    size="sm"
    variant="secondary"
    disabled={!isShareSupported()}
    onClick={handleShare}
>
    Compartilhar
</Button>`}
            >
                <Stack direction="horizontal" gap={3} wrap>
                    <Card title="Network">
                        <Badge variant={online ? "success" : "danger"}>
                            {online ? "online" : "offline"}
                        </Badge>
                    </Card>
                    <Card title="Idle (8s)">
                        <Badge variant={idle ? "warning" : "neutral"}>
                            {idle ? "usuário ocioso" : "ativo"}
                        </Badge>
                    </Card>
                    <Card title="Clipboard">
                        <Button
                            size="sm"
                            onClick={() => clipboard.copy("npm install tempest-react-sdk")}
                        >
                            {clipboard.copied ? "Copiado!" : "Copiar comando"}
                        </Button>
                    </Card>
                    <Card title="Web Share">
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={!isShareSupported()}
                            onClick={handleShare}
                        >
                            Compartilhar
                        </Button>
                    </Card>
                </Stack>
            </Example>

            <Example
                title="IntersectionObserver"
                note="Observa quando o elemento entra na viewport."
                code={`const sentinelRef = useRef<HTMLDivElement>(null);
const entry = useIntersectionObserver(sentinelRef, { once: false });

<div ref={sentinelRef}>
    IntersectionObserver — visível: {entry?.isIntersecting ? "✅" : "❌"}
</div>`}
            >
                <div
                    ref={sentinelRef}
                    style={{
                        padding: 16,
                        border: "1px dashed var(--tempest-border)",
                        borderRadius: 8,
                        textAlign: "center",
                        color: "var(--tempest-text-muted)",
                        fontSize: 13,
                    }}
                >
                    IntersectionObserver — visível: {entry?.isIntersecting ? "✅" : "❌"}
                </div>
            </Example>
        </section>
    );
}
