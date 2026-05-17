import { useState } from "react";
import { Breadcrumbs, Button, Drawer, Tabs, Tooltip } from "tempest-react-sdk";

export function NavigationSection() {
    const [drawer, setDrawer] = useState(false);

    return (
        <section className="gallery-section" id="navigation">
            <h3>Tabs · Tooltip · Drawer · Breadcrumbs</h3>
            <p className="description">Navegação interna + overlays.</p>

            <div style={{ marginBottom: 24 }}>
                <Breadcrumbs
                    items={[
                        { label: "Início", onClick: () => undefined },
                        { label: "Configurações", onClick: () => undefined },
                        { label: "Notificações" },
                    ]}
                />
            </div>

            <Tabs
                items={[
                    {
                        id: "overview",
                        label: "Visão geral",
                        content: (
                            <p>
                                Underline variant padrão. Conteúdo do tab é trocado mantendo o
                                container.
                            </p>
                        ),
                    },
                    {
                        id: "metrics",
                        label: "Métricas",
                        content: <p>Gráfico, KPIs, etc. iriam aqui.</p>,
                    },
                    {
                        id: "settings",
                        label: "Configurações",
                        content: <p>Forms de configuração entrariam aqui.</p>,
                    },
                ]}
            />

            <div className="gallery-row" style={{ marginTop: 24 }}>
                <Tooltip content="Adicionar novo item" placement="top">
                    <Button variant="secondary">Hover me</Button>
                </Tooltip>
                <Tooltip content="Esta ação é irreversível" placement="right">
                    <Button variant="danger">Hover (right)</Button>
                </Tooltip>
                <Button onClick={() => setDrawer(true)}>Abrir Drawer</Button>
            </div>

            <Drawer
                open={drawer}
                onClose={() => setDrawer(false)}
                title="Filtros"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDrawer(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={() => setDrawer(false)}>Aplicar</Button>
                    </>
                }
            >
                <p>Drawer lateral com lock de scroll + Esc fecha.</p>
                <p>Slot de footer pra ações.</p>
            </Drawer>
        </section>
    );
}
