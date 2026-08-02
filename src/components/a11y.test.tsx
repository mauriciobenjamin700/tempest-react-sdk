import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findA11yViolations, formatA11yViolations } from "../../test/a11y";
import { Accordion } from "./Accordion";
import { Alert } from "./Alert";
import { Avatar } from "./Avatar";
import { AvatarGroup } from "./AvatarGroup";
import { Badge } from "./Badge";
import { Banner } from "./Banner";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button } from "./Button";
import { Card } from "./Card";
import { AIChat } from "./AIChat";
import { AudioPlayer } from "./AudioPlayer";
import { Chat } from "./Chat";
import { Checkbox } from "./Checkbox";
import { EmptyState } from "./EmptyState";
import { ImageCropper } from "./ImageCropper";
import { FilterBar } from "./FilterBar";
import { Input } from "./Input";
import { Kanban } from "./Kanban";
import { Markdown } from "./Markdown";
import { Masonry } from "./Masonry";
import { Modal } from "./Modal";
import { NotificationCenter } from "./NotificationCenter";
import { Pagination } from "./Pagination";
import { PasswordInput } from "./PasswordInput";
import { Progress } from "./Progress";
import { Radio } from "./Radio";
import { Scheduler } from "./Scheduler";
import { SearchBar } from "./SearchBar";
import { SegmentedControl } from "./SegmentedControl";
import { Select } from "./Select";
import { Sparkline } from "./Sparkline";
import { CodeBlock } from "./CodeBlock";
import { QRCode } from "./QRCode";
import { Spinner } from "./Spinner";
import { Switch } from "./Switch";
import { Table } from "./Table";
import { Tabs } from "./Tabs";
import { SignaturePad } from "./SignaturePad";
import { Textarea } from "./Textarea";
import { Transfer } from "./Transfer";
import { Tour } from "./Tour";
import { TreeView } from "./TreeView";
import { VirtualTable } from "./VirtualTable";
import { Wizard } from "./Wizard";

interface Row {
    id: string;
    name: string;
}

const ROWS: Row[] = [
    { id: "1", name: "Ada" },
    { id: "2", name: "Grace" },
];

/**
 * One entry per audited component: a label plus a minimally-configured render.
 *
 * Kept as a table instead of one `it` per component so adding a component to
 * the sweep is a single line. Props are the smallest set that produces a
 * realistic tree — a control with no accessible name is exactly the kind of
 * defect this sweep is meant to catch, so labels are always provided.
 */
const CASES: [name: string, ui: ReactElement][] = [
    ["Button", <Button>Salvar</Button>],
    ["Button (icon-only)", <Button aria-label="Fechar">×</Button>],
    [
        "FilterBar",
        <FilterBar
            fields={[
                { name: "titulo", label: "Título", type: "text" },
                {
                    name: "status",
                    label: "Status",
                    type: "select",
                    options: [{ value: "paid", label: "Pago" }],
                },
            ]}
            value={[{ field: "status", operator: "eq", value: "paid" }]}
            onChange={() => {}}
        />,
    ],
    ["Input", <Input label="E-mail" name="email" />],
    ["Input (error)", <Input label="CPF" name="cpf" error="CPF inválido" />],
    ["Textarea", <Textarea label="Descrição" name="description" />],
    ["PasswordInput", <PasswordInput label="Senha" name="password" />],
    ["Checkbox", <Checkbox label="Aceito os termos" name="terms" />],
    ["Radio", <Radio name="plan" value="pro" label="Plano Pro" />],
    ["Switch", <Switch label="Notificações" name="notifications" />],
    [
        "Select",
        <Select
            label="Estado"
            name="state"
            options={[
                { value: "sp", label: "São Paulo" },
                { value: "rj", label: "Rio de Janeiro" },
            ]}
        />,
    ],
    [
        "SegmentedControl",
        <SegmentedControl
            value="day"
            onChange={() => undefined}
            options={[
                { value: "day", label: "Dia" },
                { value: "week", label: "Semana" },
            ]}
        />,
    ],
    ["SearchBar", <SearchBar value="" onChange={() => undefined} />],
    ["Alert", <Alert title="Atenção">Confira os dados.</Alert>],
    ["Banner", <Banner>Manutenção programada.</Banner>],
    ["Badge", <Badge>Novo</Badge>],
    ["Card", <Card>Conteúdo</Card>],
    ["Avatar", <Avatar name="Ada Lovelace" />],
    ["EmptyState", <EmptyState title="Nada por aqui" />],
    ["Spinner", <Spinner />],
    ["Progress (visible label)", <Progress value={42} label="Enviando arquivo" />],
    ["Progress (aria-label only)", <Progress value={42} aria-label="Enviando arquivo" />],
    ["Pagination", <Pagination page={2} totalPages={5} onPageChange={() => undefined} />],
    ["Breadcrumbs", <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Detalhe" }]} />],
    [
        "Tabs",
        <Tabs
            items={[
                { id: "one", label: "Um", content: <p>Um</p> },
                { id: "two", label: "Dois", content: <p>Dois</p> },
            ]}
        />,
    ],
    [
        "NotificationCenter",
        <NotificationCenter
            items={[
                { id: "n1", title: "Pedido enviado", body: "#1234", receivedAt: 1_700_000_000_000 },
                {
                    id: "n2",
                    title: "Pagamento aprovado",
                    receivedAt: 1_700_000_000_000,
                    read: true,
                },
            ]}
            now={1_700_000_060_000}
            onSelect={() => undefined}
            onMarkRead={() => undefined}
            onMarkAllRead={() => undefined}
            onDismiss={() => undefined}
        />,
    ],
    ["ImageCropper", <ImageCropper src="/photo.jpg" label="Foto de perfil" />],
    [
        "Scheduler",
        <Scheduler
            anchor={new Date(2026, 6, 27)}
            now={new Date(2026, 6, 27, 14, 0)}
            days={3}
            events={[
                {
                    id: "s1",
                    title: "Reunião",
                    start: new Date(2026, 6, 27, 9, 0),
                    end: new Date(2026, 6, 27, 10, 0),
                },
                {
                    id: "s2",
                    title: "Viagem",
                    start: new Date(2026, 6, 28),
                    end: new Date(2026, 6, 29),
                    allDay: true,
                },
            ]}
            onEventClick={() => undefined}
        />,
    ],
    ["Sparkline", <Sparkline data={[4, 8, 6, 12, 9, 15]} />],
    ["QRCode", <QRCode value="https://tempest.dev" />],
    ["CodeBlock", <CodeBlock code={"const a = 1;\n// x"} language="ts" filename="a.ts" />],
    ["Accordion", <Accordion items={[{ id: "a", title: "Seção A", children: <p>Corpo A</p> }]} />],
    [
        "Table",
        <Table<Row>
            columns={[
                { key: "id", header: "ID", render: (row) => row.id },
                { key: "name", header: "Nome", render: (row) => row.name },
            ]}
            data={ROWS}
            rowKey={(row) => row.id}
        />,
    ],
    [
        "VirtualTable",
        <VirtualTable<Row>
            caption="Pessoas"
            columns={[
                { key: "id", header: "ID", width: 80, sortable: true },
                { key: "name", header: "Nome", width: 200 },
            ]}
            data={ROWS}
            rowHeight={40}
            height={200}
            rowKey={(row) => row.id}
        />,
    ],
    [
        "Markdown",
        <Markdown
            source={
                "# Título\n\nUm parágrafo com **forte** e [link](https://x.dev).\n\n- item\n- outro\n\n| a | b |\n| :-- | --: |\n| 1 | 2 |\n\n> citação\n\n```ts\nconst a = 1;\n```"
            }
        />,
    ],
    [
        "Masonry",
        <Masonry items={["a", "b", "c"]} columns={2}>
            {(item) => <p>{item}</p>}
        </Masonry>,
    ],
    [
        "Modal",
        <Modal open onClose={() => undefined} title="Confirmar">
            Tem certeza?
        </Modal>,
    ],
    [
        "Transfer",
        <Transfer
            items={[
                { id: "a", label: "Administrador" },
                { id: "b", label: "Financeiro", disabled: true },
                { id: "c", label: "Suporte" },
            ]}
            value={["c"]}
            onChange={() => {}}
            searchable
        />,
    ],
    [
        "Tour",
        <Tour
            steps={[
                { target: "#nada", title: "Passo", body: "Explicação do passo." },
                { body: "Segundo passo, sem título." },
            ]}
            open
            onClose={() => {}}
        />,
    ],
    [
        "TreeView",
        <TreeView
            label="Permissões"
            defaultExpandedIds={["vendas"]}
            nodes={[
                { id: "vendas", label: "Vendas", children: [{ id: "vendas.ler", label: "Ler" }] },
                { id: "sobre", label: "Sobre" },
            ]}
        />,
    ],
    [
        "Wizard",
        <Wizard
            steps={[
                { id: "dados", label: "Dados", content: <Input label="Nome" name="nome" /> },
                { id: "revisao", label: "Revisão", content: <p>Confira os dados</p> },
            ]}
        />,
    ],
    [
        "AvatarGroup",
        <AvatarGroup
            label="Participantes"
            max={2}
            items={[{ name: "Ada Lovelace" }, { name: "Grace Hopper" }, { name: "Alan Turing" }]}
        />,
    ],
    ["SignaturePad", <SignaturePad label="Assinatura do cliente" />],
    [
        "Chat",
        <Chat
            messages={[
                {
                    id: "1",
                    body: "Bom dia",
                    authorId: "ana",
                    authorName: "Ana",
                    sentAt: 1_772_000_000_000,
                },
                {
                    id: "2",
                    body: "Tudo certo",
                    authorId: "me",
                    authorName: "Eu",
                    sentAt: 1_772_000_060_000,
                    status: "read",
                },
            ]}
            currentUserId="me"
            typing={["Ana"]}
            header={<h2>Suporte</h2>}
            onSend={() => {}}
            onRetry={() => {}}
            now={1_772_000_120_000}
        />,
    ],
    [
        "AIChat",
        <AIChat
            messages={[
                { id: "s", role: "system", content: "Responda em português." },
                { id: "u1", role: "user", content: "Quantos pedidos atrasaram?" },
                {
                    id: "a1",
                    role: "assistant",
                    content: "**12 pedidos** atrasaram.\n\n```sql\nSELECT 1;\n```",
                    reasoning: "Contei os pedidos com entrega vencida.",
                    model: "opus-5",
                    createdAt: 1_772_000_060_000,
                    error: "A conexão caiu no meio.",
                },
            ]}
            showSystem
            header={<h2>Assistente de operações</h2>}
            onSend={() => {}}
            onStop={() => {}}
            onRegenerate={() => {}}
            onEditSubmit={() => {}}
            onFeedback={() => {}}
            onRetry={() => {}}
            composerFooter={<small>Pode errar.</small>}
        />,
    ],
    [
        "AudioPlayer",
        <AudioPlayer
            src="/nota.webm"
            durationMs={7000}
            actions={<button type="button">Baixar</button>}
        />,
    ],
    [
        "Kanban",
        <Kanban
            columns={[
                { id: "todo", title: "A fazer", cards: [{ id: "k1", content: "Corrigir login" }] },
                { id: "done", title: "Feito", cards: [] },
            ]}
            onMove={() => {}}
        />,
    ],
];

describe("component accessibility sweep", () => {
    it.each(CASES)("%s has no axe violations", async (_name, ui) => {
        const { baseElement } = render(ui);
        const violations = await findA11yViolations(baseElement);
        expect(formatA11yViolations(violations)).toBe("");
    });
});
