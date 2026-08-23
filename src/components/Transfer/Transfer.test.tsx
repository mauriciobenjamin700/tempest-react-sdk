import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Transfer } from "./Transfer";
import type { TransferItem } from "./transfer-state";

const ITEMS: TransferItem[] = [
    { id: "a", label: "Administrador" },
    { id: "b", label: "São Paulo" },
    { id: "c", label: "Financeiro", disabled: true },
    { id: "d", label: "Suporte" },
];

/** Controlled harness — the component owns no value, so tests need one. */
function Harness({
    initial = [],
    onChange,
    ...props
}: { initial?: string[]; onChange?: (value: string[]) => void } & Partial<
    React.ComponentProps<typeof Transfer>
>) {
    const [value, setValue] = useState<string[]>(initial);
    return (
        <Transfer
            items={ITEMS}
            value={value}
            onChange={(next) => {
                setValue(next);
                onChange?.(next);
            }}
            {...props}
        />
    );
}

/** The row checkbox for a label — the pane checkboxes are labelled by title. */
const row = (label: string) => screen.getByRole("checkbox", { name: label });

describe("Transfer", () => {
    it("puts everything on the source side by default", () => {
        render(<Harness />);
        expect(screen.getByText("0 de 4 marcados")).toBeInTheDocument();
        expect(screen.getByText("0 de 0 marcados")).toBeInTheDocument();
    });

    it("derives the panes from the value", () => {
        render(<Harness initial={["b"]} />);
        expect(screen.getByText("0 de 3 marcados")).toBeInTheDocument();
        expect(screen.getByText("0 de 1 marcados")).toBeInTheDocument();
    });

    it("moves a checked row to the target", async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);

        await userEvent.click(row("Administrador"));
        await userEvent.click(
            screen.getByRole("button", { name: "Mover selecionados para a direita" }),
        );
        expect(onChange).toHaveBeenCalledWith(["a"]);
    });

    it("clears the checks after a move, so the next click does not send it back", async () => {
        render(<Harness />);
        await userEvent.click(row("Administrador"));
        await userEvent.click(
            screen.getByRole("button", { name: "Mover selecionados para a direita" }),
        );

        expect(row("Administrador")).not.toBeChecked();
        expect(
            screen.getByRole("button", { name: "Mover selecionados para a esquerda" }),
        ).toBeDisabled();
    });

    it("moves back to the source", async () => {
        const onChange = vi.fn();
        render(<Harness initial={["a", "b"]} onChange={onChange} />);

        await userEvent.click(row("São Paulo"));
        await userEvent.click(
            screen.getByRole("button", { name: "Mover selecionados para a esquerda" }),
        );
        expect(onChange).toHaveBeenCalledWith(["a"]);
    });

    it("moves everything movable with the bulk control, leaving the disabled row", async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);

        await userEvent.click(screen.getByRole("button", { name: "Mover todos para a direita" }));
        expect(onChange).toHaveBeenCalledWith(["a", "b", "d"]);
    });

    it("keeps a disabled row where it is, even when its box is forced", async () => {
        render(<Harness />);
        expect(row("Financeiro")).toBeDisabled();
    });

    it("returns ids in catalogue order, not click order", async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);

        await userEvent.click(row("Suporte"));
        await userEvent.click(row("Administrador"));
        await userEvent.click(
            screen.getByRole("button", { name: "Mover selecionados para a direita" }),
        );
        expect(onChange).toHaveBeenCalledWith(["a", "d"]);
    });

    it("disables a move button while nothing is checked on that side", () => {
        render(<Harness />);
        expect(
            screen.getByRole("button", { name: "Mover selecionados para a direita" }),
        ).toBeDisabled();
    });

    it("checks and unchecks a whole pane from its header box", async () => {
        render(<Harness sourceTitle="Papéis" searchable={false} />);
        const header = screen.getByRole("checkbox", { name: "Papéis" });

        await userEvent.click(header);
        expect(screen.getByText("3 de 4 marcados")).toBeInTheDocument();

        await userEvent.click(header);
        expect(screen.getByText("0 de 4 marcados")).toBeInTheDocument();
    });

    it("filters a pane without accents", async () => {
        render(<Harness searchable />);
        const search = screen.getAllByRole("searchbox")[0];

        await userEvent.type(search, "sao");
        expect(screen.getByRole("checkbox", { name: "São Paulo" })).toBeInTheDocument();
        expect(screen.queryByRole("checkbox", { name: "Administrador" })).not.toBeInTheDocument();
    });

    it("says when a filter matched nothing, which is not the same as an empty pane", async () => {
        render(<Harness searchable />);
        await userEvent.type(screen.getAllByRole("searchbox")[0], "zzz");
        expect(screen.getByText("Nenhum resultado")).toBeInTheDocument();
        expect(screen.getByText("Nada aqui")).toBeInTheDocument();
    });

    it("only moves what the filter left visible", async () => {
        const onChange = vi.fn();
        render(<Harness searchable onChange={onChange} />);

        await userEvent.type(screen.getAllByRole("searchbox")[0], "sao");
        await userEvent.click(screen.getByRole("button", { name: "Mover todos para a direita" }));
        expect(onChange).toHaveBeenCalledWith(["b"]);
    });

    it("hides the search boxes on a short catalogue", () => {
        render(<Transfer items={ITEMS.slice(0, 2)} value={[]} onChange={vi.fn()} />);
        expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    });

    it("announces a move to a screen reader", async () => {
        render(<Harness />);
        await userEvent.click(row("Administrador"));
        await userEvent.click(
            screen.getByRole("button", { name: "Mover selecionados para a direita" }),
        );
        expect(screen.getByRole("status")).toHaveTextContent("1 item movido para selecionados");
    });

    it("blocks every move when disabled", async () => {
        render(<Harness initial={["a"]} disabled />);
        expect(screen.getByRole("button", { name: "Mover todos para a direita" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Mover todos para a esquerda" })).toBeDisabled();
        expect(row("Administrador")).toBeDisabled();
    });

    it("takes custom titles and a custom row body", () => {
        render(
            <Harness
                sourceTitle="Disponível"
                targetTitle="No usuário"
                renderItem={(item, side) => `${side}: ${String(item.label)}`}
            />,
        );
        expect(screen.getByRole("heading", { name: "Disponível" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "No usuário" })).toBeInTheDocument();
        expect(screen.getByText("source: Administrador")).toBeInTheDocument();
    });

    it("speaks English when asked", () => {
        render(<Harness locale="en" />);
        expect(screen.getByRole("heading", { name: "Available" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Selected" })).toBeInTheDocument();
        expect(screen.getByText("0 of 4 checked")).toBeInTheDocument();
    });

    it("names each pane for a screen reader", () => {
        render(<Harness sourceTitle="Papéis" targetTitle="Do usuário" />);
        expect(screen.getByRole("region", { name: "Papéis" })).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Do usuário" })).toBeInTheDocument();
    });
});

describe("Transfer — the paths a mouse takes", () => {
    it("moves a row with a double click, in both directions", async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);

        await userEvent.dblClick(row("Administrador"));
        expect(onChange).toHaveBeenLastCalledWith(["a"]);

        await userEvent.dblClick(row("Administrador"));
        expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("ignores a double click while the whole control is disabled", async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} disabled />);

        await userEvent.dblClick(row("Administrador"));

        expect(onChange).not.toHaveBeenCalled();
    });

    it("unchecks a row that was already checked", async () => {
        render(<Harness />);

        await userEvent.click(row("Administrador"));
        expect(row("Administrador")).toBeChecked();

        await userEvent.click(row("Administrador"));
        expect(row("Administrador")).not.toBeChecked();
    });

    it("labels the pane controls by side when the title is not text", async () => {
        render(<Harness searchable sourceTitle={<strong>Papéis</strong>} />);

        expect(screen.getByRole("checkbox", { name: "source" })).toBeInTheDocument();
        expect(screen.getByRole("searchbox", { name: /source/ })).toBeInTheDocument();
    });
});
