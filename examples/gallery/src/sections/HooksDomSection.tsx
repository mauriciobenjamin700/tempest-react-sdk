import { useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { Example } from "../Example";
import {
    Badge,
    Button,
    Input,
    Stack,
    useBreakpoint,
    useClickOutside,
    useDeepMemo,
    useDocumentTitle,
    useDocumentVisibility,
    useEventListener,
    useFavicon,
    useFocusTrap,
    useGeolocation,
    useHover,
    useInterval,
    useLongPress,
    useMediaQuery,
    useResizeObserver,
    useScrollLock,
    useStableCallback,
    useThrottle,
    useTimeout,
    useWindowSize,
} from "tempest-react-sdk";

const boxStyle: CSSProperties = {
    border: "1px solid var(--tempest-color-border, #ddd)",
    borderRadius: 8,
    padding: 16,
    textAlign: "center",
    userSelect: "none",
};

/** Live demo for `useMediaQuery`. */
function MediaQueryDemo(): React.JSX.Element {
    const isWide = useMediaQuery("(min-width: 768px)");
    return (
        <Stack gap={8}>
            <Badge variant={isWide ? "success" : "warning"}>
                {isWide ? "≥ 768px (desktop/tablet)" : "< 768px (mobile)"}
            </Badge>
            <small>Redimensione a janela para ver o valor mudar ao vivo.</small>
        </Stack>
    );
}

/** Live demo for `useBreakpoint`. */
function BreakpointDemo(): React.JSX.Element {
    const bp = useBreakpoint();
    return (
        <Stack gap={8}>
            <div>
                <Badge variant="primary">current: {bp.current}</Badge>{" "}
                <Badge variant="neutral">width: {bp.width}px</Badge>
            </div>
            <div>
                <Badge variant={bp.isMobile ? "success" : "neutral"}>isMobile</Badge>{" "}
                <Badge variant={bp.isTablet ? "success" : "neutral"}>isTablet</Badge>{" "}
                <Badge variant={bp.isDesktop ? "success" : "neutral"}>isDesktop</Badge>
            </div>
            <small>
                above(&quot;md&quot;): {String(bp.above("md"))} · below(&quot;lg&quot;):{" "}
                {String(bp.below("lg"))}
            </small>
        </Stack>
    );
}

/** Live demo for `useWindowSize`. */
function WindowSizeDemo(): React.JSX.Element {
    const { width, height } = useWindowSize();
    return (
        <div>
            <Badge variant="primary">
                {width} × {height}
            </Badge>{" "}
            <small>px (atualiza no resize)</small>
        </div>
    );
}

/** Live demo for `useHover`. */
function HoverDemo(): React.JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const hovered = useHover(ref);
    return (
        <div
            ref={ref}
            style={{
                ...boxStyle,
                background: hovered ? "var(--tempest-color-primary-soft, #e6f0ff)" : "transparent",
            }}
        >
            {hovered ? "Hover ativo ✨" : "Passe o mouse aqui"}
        </div>
    );
}

/** Live demo for `useEventListener`. */
function EventListenerDemo(): React.JSX.Element {
    const [lastKey, setLastKey] = useState<string>("(nenhuma)");
    useEventListener("keydown", (event: KeyboardEvent) => {
        setLastKey(event.key);
    });
    return (
        <Stack gap={8}>
            <div>
                Última tecla: <Badge variant="primary">{lastKey}</Badge>
            </div>
            <small>Listener anexado a window. Pressione qualquer tecla.</small>
        </Stack>
    );
}

/** Live demo for `useInterval`. */
function IntervalDemo(): React.JSX.Element {
    const [count, setCount] = useState<number>(0);
    const [running, setRunning] = useState<boolean>(true);
    useInterval(() => setCount((c) => c + 1), running ? 1000 : null);
    return (
        <Stack gap={8}>
            <div>
                Tick: <Badge variant="primary">{count}</Badge>
            </div>
            <Button size="sm" onClick={() => setRunning((r) => !r)}>
                {running ? "Pausar" : "Retomar"}
            </Button>
        </Stack>
    );
}

/** Live demo for `useTimeout`. */
function TimeoutDemo(): React.JSX.Element {
    const [armed, setArmed] = useState<boolean>(false);
    const [fired, setFired] = useState<boolean>(false);
    useTimeout(
        () => {
            setFired(true);
            setArmed(false);
        },
        armed ? 2000 : null,
    );
    return (
        <Stack gap={8}>
            <Badge variant={fired ? "success" : armed ? "warning" : "neutral"}>
                {fired ? "Disparou!" : armed ? "Aguardando 2s…" : "Inativo"}
            </Badge>
            <Button
                size="sm"
                onClick={() => {
                    setFired(false);
                    setArmed(true);
                }}
            >
                Armar timeout (2s)
            </Button>
        </Stack>
    );
}

/** Live demo for `useThrottle`. */
function ThrottleDemo(): React.JSX.Element {
    const [value, setValue] = useState<string>("");
    const throttled = useThrottle(value, 1000);
    return (
        <Stack gap={8}>
            <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Digite rápido…"
            />
            <div>
                <Badge variant="neutral">imediato: {value || "—"}</Badge>{" "}
                <Badge variant="primary">throttled (1s): {throttled || "—"}</Badge>
            </div>
        </Stack>
    );
}

/** Live demo for `useScrollLock`. */
function ScrollLockDemo(): React.JSX.Element {
    const [locked, setLocked] = useState<boolean>(false);
    useScrollLock(locked);
    return (
        <Stack gap={8}>
            <Badge variant={locked ? "danger" : "success"}>
                {locked ? "Scroll do body travado" : "Scroll liberado"}
            </Badge>
            <Button size="sm" onClick={() => setLocked((l) => !l)}>
                {locked ? "Destravar scroll" : "Travar scroll do body"}
            </Button>
        </Stack>
    );
}

/** Live demo for `useResizeObserver`. */
function ResizeObserverDemo(): React.JSX.Element {
    const ref = useRef<HTMLTextAreaElement>(null);
    const size = useResizeObserver(ref);
    return (
        <Stack gap={8}>
            <textarea
                ref={ref}
                defaultValue="Arraste o canto para redimensionar"
                style={{ width: "100%", minHeight: 60, resize: "both", padding: 8 }}
            />
            <Badge variant="primary">
                {size ? `${Math.round(size.width)} × ${Math.round(size.height)} px` : "medindo…"}
            </Badge>
        </Stack>
    );
}

/** Live demo for `useDocumentVisibility`. */
function DocumentVisibilityDemo(): React.JSX.Element {
    const visibility = useDocumentVisibility();
    return (
        <Stack gap={8}>
            <Badge variant={visibility === "visible" ? "success" : "warning"}>{visibility}</Badge>
            <small>Mude de aba e volte para ver o estado alternar.</small>
        </Stack>
    );
}

/** Live demo for `useDocumentTitle`. */
function DocumentTitleDemo(): React.JSX.Element {
    const [enabled, setEnabled] = useState<boolean>(false);
    const [title, setTitle] = useState<string>("Gallery — título custom");
    return (
        <Stack gap={8}>
            <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Novo título da aba"
            />
            <Button size="sm" onClick={() => setEnabled((v) => !v)}>
                {enabled ? "Restaurar título" : "Aplicar à aba"}
            </Button>
            {enabled && <TitleSetter title={title} />}
            <Badge variant={enabled ? "primary" : "neutral"}>
                {enabled ? "título aplicado" : "título padrão"}
            </Badge>
        </Stack>
    );
}

/** Scoped child so the title effect only runs while toggled on. */
function TitleSetter({ title }: { title: string }): null {
    useDocumentTitle(title);
    return null;
}

/** Live demo for `useFavicon`. */
function FaviconDemo(): React.JSX.Element {
    const [applied, setApplied] = useState<boolean>(false);
    const dataUri =
        "data:image/svg+xml," +
        encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='14' fill='%237c3aed'/></svg>",
        );
    return (
        <Stack gap={8}>
            {applied && <FaviconSetter href={dataUri} />}
            <Button size="sm" onClick={() => setApplied((v) => !v)}>
                {applied ? "Favicon trocado (recarregue p/ reverter)" : "Trocar favicon por 🟣"}
            </Button>
            <Badge variant={applied ? "primary" : "neutral"}>
                {applied ? "favicon roxo ativo" : "favicon padrão"}
            </Badge>
        </Stack>
    );
}

/** Scoped child so the favicon effect only runs while toggled on. */
function FaviconSetter({ href }: { href: string }): null {
    useFavicon(href);
    return null;
}

/** Live demo for `useLongPress`. */
function LongPressDemo(): React.JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const [count, setCount] = useState<number>(0);
    useLongPress(ref, () => setCount((c) => c + 1), { delay: 600 });
    return (
        <Stack gap={8}>
            <div ref={ref} style={{ ...boxStyle, cursor: "pointer" }}>
                Segure 600ms aqui
            </div>
            <Badge variant="primary">disparos: {count}</Badge>
        </Stack>
    );
}

/** Live demo for `useGeolocation`. */
function GeolocationDemo(): React.JSX.Element {
    const [enabled, setEnabled] = useState<boolean>(false);
    return (
        <Stack gap={8}>
            <Button size="sm" onClick={() => setEnabled(true)} disabled={enabled}>
                Localizar (pede permissão)
            </Button>
            {enabled ? <GeolocationReader /> : <Badge variant="neutral">inativo</Badge>}
        </Stack>
    );
}

/** Reads geolocation only after the user opts in. */
function GeolocationReader(): React.JSX.Element {
    const { loading, error, coords } = useGeolocation();
    if (loading) return <Badge variant="warning">obtendo posição…</Badge>;
    if (error) return <Badge variant="danger">erro: {error.message}</Badge>;
    if (coords)
        return (
            <Badge variant="success">
                {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
            </Badge>
        );
    return <Badge variant="neutral">sem dados</Badge>;
}

/** Live demo for `useStableCallback`. */
function StableCallbackDemo(): React.JSX.Element {
    const [renders, setRenders] = useState<number>(0);
    const identityChangesRef = useRef<number>(0);
    const lastFnRef = useRef<(() => void) | null>(null);

    const stable = useStableCallback(() => setRenders((r) => r + 1));
    if (lastFnRef.current !== null && lastFnRef.current !== stable) {
        identityChangesRef.current += 1;
    }
    lastFnRef.current = stable;

    return (
        <Stack gap={8}>
            <div>
                <Badge variant="neutral">renders: {renders}</Badge>{" "}
                <Badge variant="success">trocas de identidade: {identityChangesRef.current}</Badge>
            </div>
            <Button size="sm" onClick={stable}>
                Re-renderizar
            </Button>
            <small>A referência da função permanece estável entre renders.</small>
        </Stack>
    );
}

/** Live demo for `useDeepMemo`. */
function DeepMemoDemo(): React.JSX.Element {
    const [n, setN] = useState<number>(0);
    // New object literal every render, but structurally identical across clicks.
    const obj = { role: "admin", scopes: ["read", "write"] };
    const memoized = useDeepMemo(obj);
    const lastRef = useRef<unknown>(memoized);
    const changesRef = useRef<number>(0);
    if (lastRef.current !== memoized) {
        changesRef.current += 1;
        lastRef.current = memoized;
    }
    return (
        <Stack gap={8}>
            <Button size="sm" onClick={() => setN((v) => v + 1)}>
                Re-renderizar (render #{n})
            </Button>
            <Badge variant="success">trocas de referência: {changesRef.current}</Badge>
            <small>
                O objeto é recriado a cada render, mas useDeepMemo mantém a mesma referência
                (deep-equal), então o contador fica em 0.
            </small>
        </Stack>
    );
}

/** Live demo for `useClickOutside`. */
function ClickOutsideDemo(): React.JSX.Element {
    const [open, setOpen] = useState<boolean>(false);
    const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
    return (
        <Stack gap={8}>
            <Button size="sm" onClick={() => setOpen(true)}>
                Abrir painel
            </Button>
            {open && (
                <div ref={ref} style={{ ...boxStyle, cursor: "default" }}>
                    Painel aberto. Clique fora para fechar.
                </div>
            )}
            <Badge variant={open ? "success" : "neutral"}>{open ? "aberto" : "fechado"}</Badge>
        </Stack>
    );
}

/** Live demo for `useFocusTrap`. */
function FocusTrapDemo(): React.JSX.Element {
    const [active, setActive] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);
    useFocusTrap(containerRef as RefObject<HTMLElement | null>, active);
    return (
        <Stack gap={8}>
            <Button size="sm" onClick={() => setActive((v) => !v)}>
                {active ? "Liberar foco" : "Ativar trap"}
            </Button>
            <div
                ref={containerRef}
                style={{
                    ...boxStyle,
                    textAlign: "left",
                    borderColor: active
                        ? "var(--tempest-color-primary, #7c3aed)"
                        : "var(--tempest-color-border, #ddd)",
                }}
            >
                <Stack gap={8} direction="horizontal">
                    <input placeholder="Campo A" style={{ padding: 6 }} />
                    <input placeholder="Campo B" style={{ padding: 6 }} />
                    <Button size="sm">Botão</Button>
                </Stack>
            </div>
            <small>
                Com o trap ativo, Tab e Shift+Tab ciclam apenas entre os controles desta caixa.
            </small>
        </Stack>
    );
}

/**
 * Gallery section showcasing the SDK's DOM, timing and observer hooks. Each
 * example mounts a small interactive demo that exercises the real hook API and
 * renders its live output.
 */
export function HooksDomSection(): React.JSX.Element {
    return (
        <section className="gallery-section" id="hooks-dom">
            <h3>Hooks — DOM, timing &amp; observers</h3>
            <p className="description">
                Hooks SSR-safe para media queries, breakpoints, tamanho de janela/elemento, eventos,
                timers, observers e gestos. Cada demo abaixo exercita a API real do hook e mostra a
                saída ao vivo.
            </p>

            <Example
                title="useMediaQuery"
                id="ex-use-media-query"
                note="Assina uma media query CSS e re-renderiza quando o match muda."
                code={`const isWide = useMediaQuery("(min-width: 768px)");
return <Badge>{isWide ? "wide" : "narrow"}</Badge>;`}
                props={[
                    { name: "query", type: "string", description: "Media query CSS (arg)." },
                    {
                        name: "→ returns",
                        type: "boolean",
                        description: "true enquanto a query casa.",
                    },
                ]}
            >
                <MediaQueryDemo />
            </Example>

            <Example
                title="useBreakpoint"
                id="ex-use-breakpoint"
                note="Retorna o breakpoint atual + helpers above/below e flags de device."
                code={`const bp = useBreakpoint();
bp.current;        // "xs" | "sm" | "md" | "lg" | "xl" | "2xl"
bp.above("md");    // boolean
bp.below("lg");    // boolean
bp.isMobile;       // boolean`}
                props={[
                    { name: "current", type: "Breakpoint", description: "Maior bp cujo min casa." },
                    { name: "width", type: "number", description: "Largura atual (0 no SSR)." },
                    {
                        name: "above / below",
                        type: "(bp) => boolean",
                        description: "Comparadores de viewport.",
                    },
                    {
                        name: "isMobile / isTablet / isDesktop",
                        type: "boolean",
                        description: "Flags de forma de device.",
                    },
                ]}
            >
                <BreakpointDemo />
            </Example>

            <Example
                title="useWindowSize"
                id="ex-use-window-size"
                note="Dimensões reativas da janela. { width, height } em pixels."
                code={`const { width, height } = useWindowSize();
const columns = width < 640 ? 1 : width < 1024 ? 2 : 3;`}
                props={[
                    { name: "width", type: "number", description: "innerWidth (0 no SSR)." },
                    { name: "height", type: "number", description: "innerHeight (0 no SSR)." },
                ]}
            >
                <WindowSizeDemo />
            </Example>

            <Example
                title="useHover"
                id="ex-use-hover"
                note="Recebe um ref e retorna boolean indicando hover do ponteiro."
                code={`const ref = useRef<HTMLDivElement>(null);
const hovered = useHover(ref);
return <div ref={ref}>{hovered ? "✨" : ""}</div>;`}
                props={[
                    {
                        name: "ref",
                        type: "RefObject<T | null>",
                        description: "Ref do elemento observado (arg).",
                    },
                    {
                        name: "→ returns",
                        type: "boolean",
                        description: "true enquanto o ponteiro está sobre o elemento.",
                    },
                ]}
            >
                <HoverDemo />
            </Example>

            <Example
                title="useEventListener"
                id="ex-use-event-listener"
                note="Assina um evento DOM com handler em ref (sem re-subscrever a cada render)."
                code={`useEventListener("keydown", (e) => {
    setLastKey(e.key);
}); // target default = window`}
                props={[
                    { name: "eventName", type: "keyof *EventMap", description: "Nome do evento." },
                    {
                        name: "handler",
                        type: "(event) => void",
                        description: "Callback (guardado em ref).",
                    },
                    {
                        name: "target?",
                        type: "EventTarget | Ref | null",
                        description: "Default: window.",
                    },
                    {
                        name: "options?",
                        type: "AddEventListenerOptions | boolean",
                        description: "Opções nativas.",
                    },
                ]}
            >
                <EventListenerDemo />
            </Example>

            <Example
                title="useInterval"
                id="ex-use-interval"
                note="setInterval reativo. Passe delay = null para pausar."
                code={`const [count, setCount] = useState(0);
useInterval(() => setCount((c) => c + 1), running ? 1000 : null);`}
                props={[
                    { name: "fn", type: "() => void", description: "Callback do tick (arg)." },
                    {
                        name: "delay",
                        type: "number | null",
                        description: "ms entre ticks; null pausa.",
                    },
                ]}
            >
                <IntervalDemo />
            </Example>

            <Example
                title="useTimeout"
                id="ex-use-timeout"
                note="Executa o callback após delay ms. Passe null para desarmar."
                code={`useTimeout(() => setShow(false), armed ? 2000 : null);`}
                props={[
                    { name: "fn", type: "() => void", description: "Callback (arg)." },
                    {
                        name: "delay",
                        type: "number | null",
                        description: "ms até disparar; null desarma.",
                    },
                ]}
            >
                <TimeoutDemo />
            </Example>

            <Example
                title="useThrottle"
                id="ex-use-throttle"
                note="Retorna um valor que muda no máximo a cada delay ms (leading + trailing)."
                code={`const throttled = useThrottle(value, 1000);`}
                props={[
                    { name: "value", type: "T", description: "Valor de entrada (arg)." },
                    { name: "delay", type: "number", description: "Intervalo mínimo em ms (arg)." },
                    { name: "→ returns", type: "T", description: "Valor throttled." },
                ]}
            >
                <ThrottleDemo />
            </Example>

            <Example
                title="useScrollLock"
                id="ex-use-scroll-lock"
                note="Trava o scroll do <body> enquanto active = true. Restaura ao desmontar."
                code={`useScrollLock(locked);`}
                props={[
                    {
                        name: "active",
                        type: "boolean",
                        description: "Quando true, body.overflow vira hidden.",
                    },
                ]}
            >
                <ScrollLockDemo />
            </Example>

            <Example
                title="useResizeObserver"
                id="ex-use-resize-observer"
                note="Observa mudanças de tamanho de um elemento via ResizeObserver."
                code={`const ref = useRef<HTMLTextAreaElement>(null);
const size = useResizeObserver(ref); // { width, height } | null`}
                props={[
                    {
                        name: "ref",
                        type: "RefObject<Element | null>",
                        description: "Ref do elemento observado (arg).",
                    },
                    {
                        name: "→ returns",
                        type: "{ width, height } | null",
                        description: "null até a 1ª medição.",
                    },
                ]}
            >
                <ResizeObserverDemo />
            </Example>

            <Example
                title="useDocumentVisibility"
                id="ex-use-document-visibility"
                note="Assina document.visibilityState. Mude de aba para ver alternar."
                code={`const visibility = useDocumentVisibility(); // "visible" | "hidden"`}
                props={[
                    {
                        name: "→ returns",
                        type: '"visible" | "hidden"',
                        description: "Estado de visibilidade do documento.",
                    },
                ]}
            >
                <DocumentVisibilityDemo />
            </Example>

            <Example
                title="useDocumentTitle"
                id="ex-use-document-title"
                note="Efeito global: altera document.title enquanto montado e restaura ao desmontar. O demo monta um filho escopado só quando ativado."
                code={`function TitleSetter({ title }: { title: string }) {
    useDocumentTitle(title);
    return null;
}`}
                props={[
                    {
                        name: "title",
                        type: "string",
                        description: "Título aplicado à aba enquanto montado.",
                    },
                ]}
            >
                <DocumentTitleDemo />
            </Example>

            <Example
                title="useFavicon"
                id="ex-use-favicon"
                note="Efeito global: troca o href do <link rel=icon>. Recarregue a página para reverter ao favicon original."
                code={`function FaviconSetter({ href }: { href: string }) {
    useFavicon(href);
    return null;
}`}
                props={[
                    { name: "href", type: "string", description: "URL/data-URI do novo favicon." },
                ]}
            >
                <FaviconDemo />
            </Example>

            <Example
                title="useLongPress"
                id="ex-use-long-press"
                note="Detecta long-press/long-tap. Dispara após delay ms enquanto o elemento é segurado."
                code={`const ref = useRef<HTMLDivElement>(null);
useLongPress(ref, () => openMenu(), { delay: 600 });`}
                props={[
                    {
                        name: "ref",
                        type: "RefObject<T | null>",
                        description: "Ref do alvo do gesto (arg).",
                    },
                    { name: "fn", type: "() => void", description: "Callback ao completar (arg)." },
                    {
                        name: "options.delay",
                        type: "number",
                        default: "500",
                        description: "Duração do press em ms.",
                    },
                    {
                        name: "options.moveThreshold",
                        type: "number",
                        default: "10",
                        description: "px de movimento que cancela.",
                    },
                ]}
            >
                <LongPressDemo />
            </Example>

            <Example
                title="useGeolocation"
                id="ex-use-geolocation"
                note="Wrapper da Geolocation API. O botão pede permissão ao navegador — o estado é exibido ao vivo."
                code={`const { loading, error, coords } = useGeolocation();
// { loading, error, coords, timestamp }`}
                props={[
                    { name: "loading", type: "boolean", description: "true enquanto resolve." },
                    {
                        name: "coords",
                        type: "GeolocationCoordinates | null",
                        description: "Posição obtida.",
                    },
                    {
                        name: "error",
                        type: "GeolocationPositionError | null",
                        description: "Erro, se houver.",
                    },
                    {
                        name: "timestamp",
                        type: "number | null",
                        description: "Quando foi medido.",
                    },
                    {
                        name: "options.watch",
                        type: "boolean",
                        default: "false",
                        description: "Usa watchPosition.",
                    },
                ]}
            >
                <GeolocationDemo />
            </Example>

            <Example
                title="useStableCallback"
                id="ex-use-stable-callback"
                note="Retorna uma referência estável que sempre invoca o callback mais recente."
                code={`const stable = useStableCallback(() => doSomething());
// identidade nunca muda entre renders`}
                props={[
                    {
                        name: "callback",
                        type: "(...args) => TReturn",
                        description: "Função alvo (arg).",
                    },
                    {
                        name: "→ returns",
                        type: "(...args) => TReturn",
                        description: "Wrapper estável (identidade constante).",
                    },
                ]}
            >
                <StableCallbackDemo />
            </Example>

            <Example
                title="useDeepMemo"
                id="ex-use-deep-memo"
                note="Memoiza um valor por igualdade estrutural — evita re-runs de efeitos por mudança só de referência."
                code={`const memoized = useDeepMemo({ role, scopes });
useEffect(() => { ... }, [memoized]); // só roda se mudar de fato`}
                props={[
                    { name: "value", type: "T", description: "Valor a memoizar (arg)." },
                    {
                        name: "→ returns",
                        type: "T",
                        description: "Mesma referência enquanto deep-equal.",
                    },
                ]}
            >
                <DeepMemoDemo />
            </Example>

            <Example
                title="useClickOutside"
                id="ex-use-click-outside"
                note="Chama o handler em mousedown/touchstart fora do elemento. Retorna um ref para anexar."
                code={`const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
return open ? <div ref={ref}>…</div> : null;`}
                props={[
                    {
                        name: "handler",
                        type: "() => void",
                        description: "Chamado ao clicar fora (arg).",
                    },
                    {
                        name: "→ returns",
                        type: "RefObject<T | null>",
                        description: "Ref do elemento tratado como interno.",
                    },
                ]}
            >
                <ClickOutsideDemo />
            </Example>

            <Example
                title="useFocusTrap"
                id="ex-use-focus-trap"
                note="Prende o foco do teclado dentro do container enquanto active = true. Tab/Shift+Tab ciclam entre primeiro e último focáveis."
                code={`const containerRef = useRef<HTMLDivElement>(null);
useFocusTrap(containerRef, active);
return <div ref={containerRef}>…controles…</div>;`}
                props={[
                    {
                        name: "containerRef",
                        type: "RefObject<HTMLElement | null>",
                        description: "Ref do container (arg).",
                    },
                    {
                        name: "active",
                        type: "boolean",
                        description: "Liga/desliga o trap de foco.",
                    },
                ]}
            >
                <FocusTrapDemo />
            </Example>
        </section>
    );
}
