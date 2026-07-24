import { useState } from "react";
import {
    Button,
    Command,
    ContextMenu,
    DropdownMenu,
    HoverCard,
    Menubar,
    Popover,
} from "tempest-react-sdk";
import { Example } from "../Example";

/**
 * Overlays e camadas flutuantes do SDK: popover, dropdown, hover card, menu de
 * contexto, menubar e a paleta de comandos (estilo ⌘K).
 */
export function OverlaysSection() {
    const [paletteOpen, setPaletteOpen] = useState(false);

    return (
        <section className="gallery-section" id="overlays">
            <h3>Popover · Dropdown · HoverCard · ContextMenu · Menubar · Command</h3>
            <p className="description">
                Camadas flutuantes ancoradas a um gatilho — do popover simples à paleta de comandos.
            </p>

            <Example
                title="Popover"
                note="Painel ancorado a qualquer gatilho, fechado ao clicar fora."
                code={`<Popover trigger={<Button>Abrir popover</Button>}>
  <div style={{ padding: 8 }}>Conteúdo</div>
</Popover>`}
            >
                <Popover trigger={<Button>Abrir popover</Button>}>
                    <div style={{ padding: 8 }}>Conteúdo</div>
                </Popover>
            </Example>

            <Example
                title="DropdownMenu"
                note="Lista de ações com separador, ícones e item perigoso."
                code={`<DropdownMenu
  trigger={<Button>Ações</Button>}
  items={[
    { type: "item", id: "edit", label: "Editar", onSelect: () => {} },
    { type: "item", id: "dup", label: "Duplicar", onSelect: () => {} },
    { type: "separator", id: "sep" },
    { type: "item", id: "del", label: "Excluir", danger: true, onSelect: () => {} },
  ]}
/>`}
            >
                <DropdownMenu
                    trigger={<Button>Ações</Button>}
                    items={[
                        { type: "item", id: "edit", label: "Editar", onSelect: () => {} },
                        { type: "item", id: "dup", label: "Duplicar", onSelect: () => {} },
                        { type: "separator", id: "sep" },
                        {
                            type: "item",
                            id: "del",
                            label: "Excluir",
                            danger: true,
                            onSelect: () => {},
                        },
                    ]}
                />
            </Example>

            <Example
                title="HoverCard"
                note="Pré-visualização exibida ao passar o mouse ou focar o gatilho."
                code={`<HoverCard trigger={<a href="#overlays">@tempest</a>}>
  <div style={{ padding: 8 }}>SDK React da Tempest</div>
</HoverCard>`}
            >
                <HoverCard trigger={<a href="#overlays">@tempest</a>}>
                    <div style={{ padding: 8 }}>SDK React da Tempest</div>
                </HoverCard>
            </Example>

            <Example
                title="ContextMenu"
                note="Menu do botão direito sobre qualquer elemento."
                code={`<ContextMenu
  items={[
    { label: "Copiar", onSelect: () => {} },
    { label: "Colar", onSelect: () => {} },
    { separator: true },
    { label: "Excluir", danger: true, onSelect: () => {} },
  ]}
>
  <div style={{ padding: 24, border: "1px dashed var(--tempest-border)" }}>
    Clique direito
  </div>
</ContextMenu>`}
            >
                <ContextMenu
                    items={[
                        { label: "Copiar", onSelect: () => {} },
                        { label: "Colar", onSelect: () => {} },
                        { separator: true },
                        { label: "Excluir", danger: true, onSelect: () => {} },
                    ]}
                >
                    <div
                        style={{
                            padding: 24,
                            border: "1px dashed var(--tempest-border)",
                        }}
                    >
                        Clique direito
                    </div>
                </ContextMenu>
            </Example>

            <Example
                title="Menubar"
                note="Barra de menus no estilo desktop, com atalhos."
                code={`<Menubar
  menus={[
    {
      label: "Arquivo",
      items: [
        { label: "Novo", shortcut: "⌘N", onSelect: () => {} },
        { separator: true },
        { label: "Sair", onSelect: () => {} },
      ],
    },
    {
      label: "Editar",
      items: [
        { label: "Desfazer", shortcut: "⌘Z", onSelect: () => {} },
        { label: "Refazer", shortcut: "⌘⇧Z", onSelect: () => {} },
      ],
    },
  ]}
/>`}
            >
                <Menubar
                    menus={[
                        {
                            label: "Arquivo",
                            items: [
                                { label: "Novo", shortcut: "⌘N", onSelect: () => {} },
                                { separator: true },
                                { label: "Sair", onSelect: () => {} },
                            ],
                        },
                        {
                            label: "Editar",
                            items: [
                                { label: "Desfazer", shortcut: "⌘Z", onSelect: () => {} },
                                { label: "Refazer", shortcut: "⌘⇧Z", onSelect: () => {} },
                            ],
                        },
                    ]}
                />
            </Example>

            <Example
                title="Command"
                note="Paleta de comandos filtrável — abra e digite para buscar."
                code={`const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>Abrir paleta (⌘K)</Button>
<Command
  open={open}
  onOpenChange={setOpen}
  placeholder="Buscar comando…"
  items={[
    { id: "home", label: "Ir para início", group: "Navegação", onSelect: () => {} },
    { id: "docs", label: "Abrir documentação", group: "Navegação", onSelect: () => {} },
    { id: "new", label: "Novo projeto", group: "Ações", onSelect: () => {} },
  ]}
/>`}
            >
                <Button onClick={() => setPaletteOpen(true)}>Abrir paleta (⌘K)</Button>
                <Command
                    open={paletteOpen}
                    onOpenChange={setPaletteOpen}
                    placeholder="Buscar comando…"
                    items={[
                        {
                            id: "home",
                            label: "Ir para início",
                            group: "Navegação",
                            onSelect: () => {},
                        },
                        {
                            id: "docs",
                            label: "Abrir documentação",
                            group: "Navegação",
                            onSelect: () => {},
                        },
                        {
                            id: "new",
                            label: "Novo projeto",
                            group: "Ações",
                            onSelect: () => {},
                        },
                    ]}
                />
            </Example>
        </section>
    );
}
