import {
    Button,
    isPushSupported,
    useBeforeInstallPrompt,
    usePushSubscription,
} from "tempest-react-sdk";
import { Example } from "../Example";

/**
 * Recursos de PWA do SDK: o prompt de instalação (`beforeinstallprompt`) e a
 * inscrição de Web Push. Esta galeria não tem service worker/backend reais, então
 * os exemplos mostram os estados e ações guardadas (sem efeitos colaterais).
 */
export function PWASection() {
    const install = useBeforeInstallPrompt();
    const push = usePushSubscription({
        vapidPublicKey: "",
        onSubscribe: async () => {},
    });

    return (
        <section className="gallery-section" id="pwa">
            <h3>PWA: Install prompt · Web Push</h3>
            <p className="description">
                Hooks para tornar seu app instalável e capaz de receber notificações push.
            </p>

            <Example
                title="Install prompt"
                note="installable só fica true quando o navegador dispara beforeinstallprompt."
                code={`const install = useBeforeInstallPrompt();

<p>installable: {String(install.installable)}</p>
<p>installed: {String(install.installed)}</p>
<Button disabled={!install.installable} onClick={() => void install.prompt()}>
  Instalar app
</Button>`}
            >
                <p>installable: {String(install.installable)}</p>
                <p>installed: {String(install.installed)}</p>
                <Button disabled={!install.installable} onClick={() => void install.prompt()}>
                    Instalar app
                </Button>
            </Example>

            <Example
                title="Web push"
                note="Push completo precisa de service worker ativo + backend (funciona num app gerado com --pwa, não nesta galeria)."
                code={`const push = usePushSubscription({
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  onSubscribe: async (sub) => { await api.post("/webpush/subscribe", { body: sub }); },
});

<p>isPushSupported(): {String(isPushSupported())}</p>
<p>permission: {push.permission}</p>
<p>subscribed: {String(push.subscribed)}</p>
<Button
  disabled={!push.supported || push.loading}
  onClick={() => void push.subscribe().catch(() => {})}
>
  {push.subscribed ? "Desinscrever" : "Ativar notificações"}
</Button>`}
            >
                <p>isPushSupported(): {String(isPushSupported())}</p>
                <p>permission: {push.permission}</p>
                <p>subscribed: {String(push.subscribed)}</p>
                <Button
                    disabled={!push.supported || push.loading}
                    onClick={() => void push.subscribe().catch(() => {})}
                >
                    {push.subscribed ? "Desinscrever" : "Ativar notificações"}
                </Button>
            </Example>
        </section>
    );
}
