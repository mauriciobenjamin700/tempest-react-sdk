import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataTable, type DataTableRowKey } from "./DataTable";

type Row = { id: number; name: string };
const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Pessoa ${i + 1}` }));

function Selectable({
    initial = [],
    onRowClick,
}: {
    initial?: DataTableRowKey[];
    onRowClick?: (row: Row) => void;
}) {
    const [keys, setKeys] = useState<DataTableRowKey[]>(initial);
    return (
        <>
            <output data-testid="keys">{keys.join(",")}</output>
            <DataTable<Row>
                data={rows}
                columns={[{ key: "name", header: "Nome" }]}
                rowKey={(row) => row.id}
                pageSize={2}
                selectable
                selectedKeys={keys}
                onSelectionChange={setKeys}
                selectionLabel={(row) => `Selecionar ${row.name}`}
                onRowClick={onRowClick}
                rowActions={(row) => <button type="button">Editar {row.name}</button>}
            />
        </>
    );
}

const keys = () => screen.getByTestId("keys").textContent;

/** #711: selection and an actions column without borrowing a field of the row. */
describe("DataTable — selection and row actions", () => {
    it("selects a row by its rowKey, with the caller's accessible name", async () => {
        render(<Selectable />);
        await userEvent.click(screen.getByRole("checkbox", { name: "Selecionar Pessoa 2" }));
        expect(keys()).toBe("2");
    });

    it("selects the whole page from the header and keeps keys picked on other pages", async () => {
        render(<Selectable initial={[5]} />);
        const all = screen.getByRole("checkbox", {
            name: "Selecionar todas as linhas desta página",
        });
        await userEvent.click(all);
        expect(keys()).toBe("5,1,2");
        await userEvent.click(all);
        expect(keys()).toBe("5");
    });

    it("marks the header indeterminate when only part of the page is selected", () => {
        render(<Selectable initial={[1]} />);
        const all = screen.getByRole("checkbox", {
            name: "Selecionar todas as linhas desta página",
        }) as HTMLInputElement;
        expect(all.indeterminate).toBe(true);
        expect(all.checked).toBe(false);
    });

    it("never lets a checkbox or an action click reach onRowClick", async () => {
        const onRowClick = vi.fn();
        render(<Selectable onRowClick={onRowClick} />);
        await userEvent.click(screen.getByRole("checkbox", { name: "Selecionar Pessoa 1" }));
        await userEvent.click(screen.getByRole("button", { name: "Editar Pessoa 1" }));
        expect(onRowClick).not.toHaveBeenCalled();
        await userEvent.click(screen.getByText("Pessoa 1"));
        expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    });

    it("names the actions column for assistive tech, with no React duplicate-key warning", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        render(<Selectable />);
        const headers = screen.getAllByRole("columnheader");
        expect(headers).toHaveLength(3);
        expect(within(headers[2]!).getByText("Ações")).toBeInTheDocument();
        expect(error).not.toHaveBeenCalled();
        error.mockRestore();
    });

    it("defaults a row checkbox's name to its position on the page", () => {
        render(
            <DataTable<Row>
                data={rows}
                columns={[{ key: "name", header: "Nome" }]}
                rowKey={(row) => row.id}
                selectable
                selectedKeys={[]}
                onSelectionChange={() => {}}
            />,
        );
        expect(screen.getByRole("checkbox", { name: "Selecionar linha 3" })).toBeInTheDocument();
    });

    it("disables the header checkbox on an empty page", () => {
        render(
            <DataTable<Row>
                data={[]}
                columns={[{ key: "name", header: "Nome" }]}
                selectable
                selectedKeys={[]}
                onSelectionChange={() => {}}
            />,
        );
        expect(screen.getByRole("checkbox")).toBeDisabled();
    });
});

/** #713: the Table props DataTable used to drop. */
describe("DataTable — forwarded Table props", () => {
    it("forwards stackOnMobile, onRowClick, scrollLabel and the column className", async () => {
        const onRowClick = vi.fn();
        const { container } = render(
            <DataTable<Row>
                data={rows.slice(0, 1)}
                columns={[{ key: "name", header: "Nome", className: "col-nome" }]}
                stackOnMobile
                onRowClick={onRowClick}
                scrollLabel="Produtos"
            />,
        );
        expect(container.querySelector("[class*='stackable']")).not.toBeNull();
        expect(container.querySelector("td.col-nome")).not.toBeNull();
        await userEvent.click(screen.getByText("Pessoa 1"));
        expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    });
});

describe("DataTable — stacked mobile cards", () => {
    it("labels a sortable column's cells, whose header is a button and not a string", () => {
        const { container } = render(
            <DataTable<Row>
                data={rows.slice(0, 1)}
                columns={[{ key: "name", header: "Nome", sortable: true }]}
                stackOnMobile
            />,
        );
        expect(container.querySelector("tbody td")).toHaveAttribute("data-label", "Nome");
    });
});
