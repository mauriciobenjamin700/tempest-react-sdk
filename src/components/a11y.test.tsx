import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findA11yViolations, formatA11yViolations } from "../../test/a11y";
import { Accordion } from "./Accordion";
import { Alert } from "./Alert";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Banner } from "./Banner";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button } from "./Button";
import { Card } from "./Card";
import { Checkbox } from "./Checkbox";
import { EmptyState } from "./EmptyState";
import { Input } from "./Input";
import { Modal } from "./Modal";
import { Pagination } from "./Pagination";
import { PasswordInput } from "./PasswordInput";
import { Progress } from "./Progress";
import { Radio } from "./Radio";
import { SearchBar } from "./SearchBar";
import { SegmentedControl } from "./SegmentedControl";
import { Select } from "./Select";
import { Spinner } from "./Spinner";
import { Switch } from "./Switch";
import { Table } from "./Table";
import { Tabs } from "./Tabs";
import { Textarea } from "./Textarea";

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
        "Modal",
        <Modal open onClose={() => undefined} title="Confirmar">
            Tem certeza?
        </Modal>,
    ],
];

describe("component accessibility sweep", () => {
    it.each(CASES)("%s has no axe violations", async (_name, ui) => {
        const { baseElement } = render(ui);
        const violations = await findA11yViolations(baseElement);
        expect(formatA11yViolations(violations)).toBe("");
    });
});
