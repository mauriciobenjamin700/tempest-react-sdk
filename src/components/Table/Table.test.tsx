import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Table, type TableColumn } from "./Table";

type Row = { id: string; name: string };
const rows: Row[] = [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
];
const columns: TableColumn<Row>[] = [
    { key: "id", header: "ID" },
    { key: "name", header: "Name", render: (row) => <strong>{row.name}</strong> },
];

describe("Table", () => {
    it("renders rows", () => {
        render(<Table columns={columns} data={rows} rowKey={(row) => row.id} />);
        expect(screen.getByText("Alice")).toBeInTheDocument();
        expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    it("renders empty state when data is empty", () => {
        render(<Table columns={columns} data={[]} rowKey={(row) => row.id} />);
        expect(screen.getByText(/nenhum registro/i)).toBeInTheDocument();
    });

    it("fires onRowClick", async () => {
        const onRowClick = vi.fn();
        render(
            <Table columns={columns} data={rows} rowKey={(row) => row.id} onRowClick={onRowClick} />,
        );
        await userEvent.click(screen.getByText("Alice"));
        expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    });
});
