import { useState } from "react";
import {
    Button,
    SyncStatusBadge,
    UpdatePrompt,
    isPushSupported,
    useBeforeInstallPrompt,
    usePushSubscription,
    useStorageEstimate,
    type SyncTone,
} from "tempest-react-sdk";
import { Example } from "../Example";

const TONES: SyncTone[] = ["idle", "syncing", "pending", "offline", "error"];

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
    const [tone, setTone] = useState<SyncTone>("pending");
    const [updateOpen, setUpdateOpen] = useState(false);
    const storage = useStorageEstimate();

    return (
        <section className="gallery-section" id="pwa">
            <h3>PWA: Install · Push · Sync · Update · Storage</h3>
            <p className="description">
                Hooks e componentes para instalar, receber push, mostrar status de sincronização,
                atualizar o service worker e gerenciar o armazenamento offline.
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

            <Example
                title="SyncStatusBadge"
                note="Badge de status do motor offline. Alimente por useSyncStatus(sync).tone."
                code={`const { tone, pending } = useSyncStatus(sync);
<SyncStatusBadge tone={tone} pending={pending} />`}
            >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {TONES.map((t) => (
                        <Button
                            key={t}
                            size="sm"
                            variant={t === tone ? "primary" : "outline"}
                            onClick={() => setTone(t)}
                        >
                            {t}
                        </Button>
                    ))}
                </div>
                <SyncStatusBadge tone={tone} pending={3} />
            </Example>

            <Example
                title="UpdatePrompt"
                note="Toast de nova versão do SW. Par de useServiceWorkerUpdate (open ↔ updateAvailable)."
                code={`const { updateAvailable, applyUpdate } = useServiceWorkerUpdate({ url: "/sw.js" });
<UpdatePrompt open={updateAvailable} onUpdate={applyUpdate} />`}
            >
                <Button onClick={() => setUpdateOpen(true)}>Simular nova versão</Button>
                <UpdatePrompt
                    open={updateOpen}
                    message="Uma nova versão está disponível (demo)."
                    onUpdate={() => setUpdateOpen(false)}
                    onDismiss={() => setUpdateOpen(false)}
                />
            </Example>

            <Example
                title="useStorageEstimate"
                note="Quota do Storage API + persistência. Evita despejo do IndexedDB offline."
                code={`const { usage, quota, ratio, persisted, requestPersist } = useStorageEstimate();`}
            >
                <p>supported: {String(storage.supported)}</p>
                <p>
                    usage: {((storage.usage ?? 0) / 1e6).toFixed(2)} MB / quota:{" "}
                    {((storage.quota ?? 0) / 1e6).toFixed(0)} MB
                </p>
                <p>persisted: {String(storage.persisted)}</p>
                <Button disabled={!storage.supported} onClick={() => void storage.requestPersist()}>
                    Tornar armazenamento permanente
                </Button>
            </Example>
        </section>
    );
}
