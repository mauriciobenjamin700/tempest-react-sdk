import { useState } from "react";
import {
    FloatingActionButton,
    ListTile,
    NavigationRail,
    RefreshIndicator,
    TimePicker,
} from "tempest-react-sdk";
import { Example } from "../Example";

/**
 * Material-flavored widgets that fill the last gaps vs Flutter Material:
 * ListTile, FloatingActionButton, NavigationRail, TimePicker e RefreshIndicator.
 */
export function MaterialSection() {
    const [rail, setRail] = useState("home");
    const [time, setTime] = useState("09:30");
    const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

    return (
        <section className="gallery-section" id="material">
            <h3>Material: ListTile · FAB · NavigationRail · TimePicker · Refresh</h3>
            <p className="description">
                Widgets no estilo Material/Flutter sem equivalente direto antes — todos tematizáveis
                pelos tokens <code>--tempest-*</code>.
            </p>

            <Example
                title="ListTile"
                note="Linha com leading / título / subtítulo / trailing, clicável."
                code={`<ListTile
  leading={<span>👤</span>}
  title="Ana Lima"
  subtitle="ana@exemplo.com"
  trailing={<span>›</span>}
  onClick={() => {}}
/>`}
            >
                <div
                    style={{
                        width: 320,
                        border: "1px solid var(--tempest-border)",
                        borderRadius: 8,
                    }}
                >
                    <ListTile
                        leading={<span>👤</span>}
                        title="Ana Lima"
                        subtitle="ana@exemplo.com"
                        trailing={<span>›</span>}
                        onClick={() => {}}
                    />
                    <ListTile
                        leading={<span>🔔</span>}
                        title="Notificações"
                        subtitle="Ativadas"
                        trailing={<span>›</span>}
                        onClick={() => {}}
                    />
                </div>
            </Example>

            <Example
                title="FloatingActionButton"
                note="Redondo (icon-only) e estendido (com label). position='none' = inline."
                code={`<FloatingActionButton icon={<span>+</span>} aria-label="Novo" position="none" />
<FloatingActionButton icon={<span>+</span>} label="Criar" position="none" />`}
            >
                <FloatingActionButton icon={<span>+</span>} aria-label="Novo" position="none" />
                <FloatingActionButton icon={<span>+</span>} label="Criar" position="none" />
            </Example>

            <Example
                title="NavigationRail"
                note="Navegação vertical compacta (rail de ícones) para desktop."
                code={`const [rail, setRail] = useState("home");

<NavigationRail
  value={rail}
  onChange={setRail}
  items={[
    { key: "home", label: "Início", icon: <span>🏠</span> },
    { key: "search", label: "Buscar", icon: <span>🔍</span> },
    { key: "profile", label: "Perfil", icon: <span>👤</span> },
  ]}
/>`}
            >
                <div style={{ height: 240 }}>
                    <NavigationRail
                        value={rail}
                        onChange={setRail}
                        items={[
                            { key: "home", label: "Início", icon: <span>🏠</span> },
                            { key: "search", label: "Buscar", icon: <span>🔍</span> },
                            { key: "profile", label: "Perfil", icon: <span>👤</span> },
                        ]}
                    />
                </div>
            </Example>

            <Example
                title="TimePicker"
                note="Colunas de hora/minuto; emite sempre 24h 'HH:MM'."
                code={`const [time, setTime] = useState("09:30");

<TimePicker value={time} onChange={setTime} minuteStep={15} />`}
            >
                <TimePicker value={time} onChange={setTime} minuteStep={15} />
                <p>
                    Selecionado: <strong>{time}</strong>
                </p>
            </Example>

            <Example
                title="RefreshIndicator"
                note="Pull-to-refresh (arraste pra baixo no topo — toque/mobile)."
                code={`<RefreshIndicator onRefresh={async () => { await refetch(); }}>
  {/* conteúdo rolável */}
</RefreshIndicator>`}
            >
                <RefreshIndicator
                    onRefresh={async () => {
                        await new Promise((r) => setTimeout(r, 800));
                        setRefreshedAt(new Date().toLocaleTimeString());
                    }}
                >
                    <div style={{ height: 120, padding: 12 }}>
                        Puxe pra baixo pra atualizar.
                        {refreshedAt && <p>Atualizado às {refreshedAt}</p>}
                    </div>
                </RefreshIndicator>
            </Example>
        </section>
    );
}
