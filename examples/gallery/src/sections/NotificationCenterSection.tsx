import { useState } from "react";
import { Button, NotificationCenter, useNotificationInbox } from "tempest-react-sdk";
import { Example } from "../Example";

/**
 * Stand-in glyphs for the demo.
 *
 * `renderIcon` takes any node — in a real app this is where `<Icon name={…} />`
 * from `tempest-react-sdk/icons` goes.
 */
const GLYPH: Record<string, string> = {
    truck: "🚚",
    "credit-card": "💳",
    "file-clock": "📄",
    "message-circle": "💬",
    "cloud-check": "☁️",
    "at-sign": "@",
};

/** Fixed reference so the relative timestamps in the demo are stable. */
const NOW = new Date("2026-07-26T12:00:00Z").getTime();

const SEED = [
    {
        id: "1",
        title: "Pedido #1234 saiu para entrega",
        body: "Previsão de chegada entre 14h e 16h.",
        receivedAt: NOW - 90_000,
        data: { icon: "truck" },
    },
    {
        id: "2",
        title: "Pagamento aprovado",
        body: "R$ 249,90 no cartão terminado em 4321.",
        receivedAt: NOW - 3_600_000,
        data: { icon: "credit-card" },
    },
    {
        id: "3",
        title: "Documento vence em 3 dias",
        receivedAt: NOW - 2 * 86_400_000,
        read: true,
        data: { icon: "file-clock" },
    },
];

const PUSHES = [
    { title: "Nova mensagem no chamado #88", body: "Suporte respondeu.", icon: "message-circle" },
    { title: "Sincronização concluída", body: "42 registros enviados.", icon: "cloud-check" },
    { title: "Novo comentário na tarefa", body: "Ana mencionou você.", icon: "at-sign" },
];

/**
 * Demo of the notification inbox.
 *
 * "Simular push" is the important button: it posts the same message shape a service
 * worker posts, so the demo exercises the real bridge instead of calling `add`
 * directly.
 */
export function NotificationCenterSection() {
    const inbox = useNotificationInbox({ initialItems: SEED, listenToServiceWorker: false });
    const [pushIndex, setPushIndex] = useState(0);

    const simulatePush = () => {
        const push = PUSHES[pushIndex % PUSHES.length];
        setPushIndex((n) => n + 1);
        inbox.add({
            id: `push-${pushIndex}`,
            title: push.title,
            body: push.body,
            receivedAt: NOW + (pushIndex + 1) * 1000,
            data: { icon: push.icon },
        });
    };

    return (
        <section className="gallery-section" id="notification-center">
            <h3>NotificationCenter — inbox de notificação</h3>
            <p className="description">
                Um push mostra a notificação do sistema e <strong>desaparece</strong>. O{" "}
                <code>NotificationCenter</code> é onde ela continua existindo: lida/não lida,
                timestamp relativo e ação por item. O <code>useNotificationInbox</code> guarda o
                estado e, num app de verdade, escuta o <code>postMessage</code> do service worker.
            </p>

            <Example
                title="Painel controlado + estado no hook"
                code={`const inbox = useNotificationInbox();

<NotificationCenter
  items={inbox.items}
  onMarkRead={inbox.markRead}
  onMarkAllRead={inbox.markAllRead}
  onDismiss={inbox.remove}
  onSelect={(item) => item.url && navigate(item.url)}
  renderIcon={(item) => <Icon name={item.data?.icon ?? "bell"} size={16} />}
/>`}
                note="Clique numa notificação: ela é marcada como lida junto (abrir é ler). O × descarta. O botão do cabeçalho aparece só quando há não lidas."
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Button onClick={simulatePush}>Simular push</Button>
                        <Button variant="secondary" onClick={inbox.markAllRead}>
                            Marcar todas como lidas
                        </Button>
                        <Button variant="secondary" onClick={inbox.clear}>
                            Limpar
                        </Button>
                        <span style={{ alignSelf: "center" }}>
                            {inbox.unreadCount} não lida(s) de {inbox.items.length}
                        </span>
                    </div>

                    <div
                        style={{
                            maxWidth: 420,
                            maxHeight: 380,
                            overflow: "auto",
                            border: "1px solid var(--tempest-border)",
                            borderRadius: "var(--tempest-radius-lg)",
                        }}
                    >
                        <NotificationCenter
                            items={inbox.items}
                            now={NOW + 60_000}
                            onSelect={(item) => window.console.log("abrir", item.id)}
                            onMarkRead={inbox.markRead}
                            onMarkAllRead={inbox.markAllRead}
                            onDismiss={inbox.remove}
                            renderIcon={(item) => (
                                <span aria-hidden>{GLYPH[item.data?.icon as string] ?? "🔔"}</span>
                            )}
                        />
                    </div>
                </div>
            </Example>

            <Example
                title="Somente leitura"
                code={`<NotificationCenter items={items} />`}
                note="Sem handler nenhum, as linhas viram texto puro em vez de botões — nada de alvo clicável que não faz nada."
            >
                <div style={{ maxWidth: 420 }}>
                    <NotificationCenter
                        items={SEED.slice(0, 2)}
                        now={NOW}
                        title="Somente leitura"
                    />
                </div>
            </Example>

            <Example
                title="Inbox vazio"
                code={`<NotificationCenter items={[]} emptyState={<EmptyState … />} />`}
                note="Estado vazio próprio, ou o default do SDK."
            >
                <div style={{ maxWidth: 420 }}>
                    <NotificationCenter items={[]} />
                </div>
            </Example>
        </section>
    );
}
