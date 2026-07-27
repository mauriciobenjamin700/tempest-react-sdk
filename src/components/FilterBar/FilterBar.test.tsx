import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { FilterBar } from "./FilterBar";
import type { Filter, FilterField } from "./filter-model";

const FIELDS: FilterField[] = [
    { name: "titulo", label: "Título", type: "text" },
    { name: "total", label: "Total", type: "number" },
    {
        name: "status",
        label: "Status",
        type: "select",
        options: [
            { value: "paid", label: "Pago" },
            { value: "sent", label: "Enviado" },
        ],
    },
    { name: "ativo", label: "Ativo", type: "boolean" },
];

/** Controlled harness — the applied set belongs to the app. */
function Harness({
    initial = [],
    onChange,
    ...props
}: { initial?: Filter[]; onChange?: (filters: Filter[]) => void } & Partial<
    React.ComponentProps<typeof FilterBar>
>) {
    const [value, setValue] = useState<Filter[]>(initial);
    return (
        <FilterBar
            fields={FIELDS}
            value={value}
            onChange={(next) => {
                setValue(next);
                onChange?.(next);
            }}
            {...props}
        />
    );
}

/** Open the editor. */
const openEditor = () =>
    userEvent.click(screen.getByRole("button", { name: "+ Adicionar filtro" }));

describe("FilterBar", () => {
    it("says when there is no filter", () => {
        render(<Harness />);
        expect(screen.getByText("Nenhum filtro")).toBeInTheDocument();
    });

    it("renders an applied filter as a chip, in words", () => {
        render(<Harness initial={[{ field: "status", operator: "eq", value: "paid" }]} />);
        expect(screen.getByText("Status é Pago")).toBeInTheDocument();
    });

    it("adds a filter through the editor", async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        await openEditor();

        await userEvent.type(screen.getByLabelText("Valor"), "nota");
        await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));

        expect(onChange).toHaveBeenCalledWith([
            { field: "titulo", operator: "contains", value: "nota" },
        ]);
        expect(screen.getByText("Título contém nota")).toBeInTheDocument();
    });

    it("keeps Apply disabled until the filter is complete", async () => {
        render(<Harness />);
        await openEditor();
        expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();

        await userEvent.type(screen.getByLabelText("Valor"), "x");
        expect(screen.getByRole("button", { name: "Aplicar" })).toBeEnabled();
    });

    it("needs no value for a valueless operator", async () => {
        render(<Harness />);
        await openEditor();
        await userEvent.selectOptions(screen.getByLabelText("Condição"), "empty");

        expect(screen.queryByLabelText("Valor")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Aplicar" })).toBeEnabled();
    });

    it("asks for two ends of a between", async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        await openEditor();
        await userEvent.selectOptions(screen.getByLabelText("Campo"), "total");
        await userEvent.selectOptions(screen.getByLabelText("Condição"), "between");

        await userEvent.type(screen.getByLabelText("De"), "10");
        expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();

        await userEvent.type(screen.getByLabelText("Até"), "90");
        await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
        expect(onChange).toHaveBeenCalledWith([
            { field: "total", operator: "between", value: ["10", "90"] },
        ]);
    });

    it("offers the field's options for a select", async () => {
        render(<Harness />);
        await openEditor();
        await userEvent.selectOptions(screen.getByLabelText("Campo"), "status");
        await userEvent.selectOptions(screen.getByLabelText("Valor"), "sent");
        await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
        expect(screen.getByText("Status é Enviado")).toBeInTheDocument();
    });

    it("uses a date input for a date field, so the value is parseable", async () => {
        render(<Harness fields={[{ name: "criadoEm", label: "Criado em", type: "date" }]} />);
        await openEditor();
        expect(screen.getByLabelText("Valor")).toHaveAttribute("type", "date");
    });

    it("uses a number input for a number field", async () => {
        render(<Harness />);
        await openEditor();
        await userEvent.selectOptions(screen.getByLabelText("Campo"), "total");
        expect(screen.getByLabelText("Valor")).toHaveAttribute("type", "number");
    });

    it("offers yes/no for a boolean field", async () => {
        render(<Harness />);
        await openEditor();
        await userEvent.selectOptions(screen.getByLabelText("Campo"), "ativo");
        expect(screen.getByRole("option", { name: "Sim" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Não" })).toBeInTheDocument();
    });

    it("splits a comma-separated list for an in", async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        await openEditor();
        await userEvent.selectOptions(screen.getByLabelText("Campo"), "status");
        await userEvent.selectOptions(screen.getByLabelText("Condição"), "in");
        await userEvent.type(screen.getByLabelText("Valor"), "paid, sent");
        await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));

        expect(onChange).toHaveBeenCalledWith([
            { field: "status", operator: "in", value: ["paid", "sent"] },
        ]);
    });

    it("resets the value when the operator changes", async () => {
        render(<Harness />);
        await openEditor();
        await userEvent.type(screen.getByLabelText("Valor"), "nota");
        await userEvent.selectOptions(screen.getByLabelText("Condição"), "eq");
        // Carrying a value across operators produces filters nobody meant to write.
        expect(screen.getByLabelText("Valor")).toHaveValue("");
    });

    it("closes the editor on cancel, adding nothing", async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        await openEditor();
        await userEvent.type(screen.getByLabelText("Valor"), "nota");
        await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "+ Adicionar filtro" })).toBeInTheDocument();
    });

    it("removes one chip by its own label", async () => {
        const onChange = vi.fn();
        render(
            <Harness
                initial={[
                    { field: "status", operator: "eq", value: "paid" },
                    { field: "titulo", operator: "contains", value: "nota" },
                ]}
                onChange={onChange}
            />,
        );
        await userEvent.click(
            screen.getByRole("button", { name: "Remover filtro: Status é Pago" }),
        );
        expect(onChange).toHaveBeenCalledWith([
            { field: "titulo", operator: "contains", value: "nota" },
        ]);
    });

    it("clears everything at once", async () => {
        const onChange = vi.fn();
        render(
            <Harness
                initial={[{ field: "status", operator: "eq", value: "paid" }]}
                onChange={onChange}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
        expect(onChange).toHaveBeenCalledWith([]);
    });

    it("offers no clear button when there is nothing to clear", () => {
        render(<Harness />);
        expect(screen.queryByRole("button", { name: "Limpar filtros" })).not.toBeInTheDocument();
    });

    it("keeps two filters on the same field", async () => {
        const onChange = vi.fn();
        render(
            <Harness
                initial={[{ field: "status", operator: "eq", value: "paid" }]}
                onChange={onChange}
            />,
        );
        await openEditor();
        await userEvent.selectOptions(screen.getByLabelText("Campo"), "status");
        await userEvent.selectOptions(screen.getByLabelText("Condição"), "ne");
        await userEvent.selectOptions(screen.getByLabelText("Valor"), "sent");
        await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));

        expect(onChange).toHaveBeenCalledWith([
            { field: "status", operator: "eq", value: "paid" },
            { field: "status", operator: "ne", value: "sent" },
        ]);
    });

    it("announces how many filters are active", () => {
        render(<Harness initial={[{ field: "status", operator: "eq", value: "paid" }]} />);
        expect(screen.getByRole("status")).toHaveTextContent("1 filtro ativo");
    });

    it("renders extra actions next to the controls", () => {
        render(<Harness actions={<button type="button">Salvar visão</button>} />);
        expect(screen.getByRole("button", { name: "Salvar visão" })).toBeInTheDocument();
    });

    it("does nothing when there are no fields to filter by", () => {
        render(<FilterBar fields={[]} value={[]} onChange={vi.fn()} />);
        expect(screen.getByRole("button", { name: "+ Adicionar filtro" })).toBeDisabled();
    });

    it("speaks English when asked", async () => {
        render(
            <Harness locale="en" initial={[{ field: "status", operator: "eq", value: "paid" }]} />,
        );
        expect(screen.getByText("Status is Pago")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("1 active filter");
    });
});
