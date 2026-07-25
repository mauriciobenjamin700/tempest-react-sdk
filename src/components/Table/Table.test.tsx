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
            <Table
                columns={columns}
                data={rows}
                rowKey={(row) => row.id}
                onRowClick={onRowClick}
            />,
        );
        await userEvent.click(screen.getByText("Alice"));
        expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    });
});

describe("Table — alignment, priority and column chrome", () => {
    interface Row {
        id: string;
        qty: number;
    }

    const rows: Row[] = [{ id: "a", qty: 2 }];

    it("applies right and center alignment to header and body cells", () => {
        const { container } = render(
            <Table<Row>
                columns={[
                    { key: "id", header: "ID", align: "right", render: (r) => r.id },
                    { key: "qty", header: "Qtd", align: "center", render: (r) => r.qty },
                ]}
                data={rows}
                rowKey={(r) => r.id}
            />,
        );
        const headers = container.querySelectorAll("th");
        expect(headers[0].className).toContain("alignRight");
        expect(headers[1].className).toContain("alignCenter");

        const cells = container.querySelectorAll("td");
        expect(cells[0].className).toContain("alignRight");
        expect(cells[1].className).toContain("alignCenter");
    });

    it("maps the tablet and desktop priorities to their classes", () => {
        const { container } = render(
            <Table<Row>
                columns={[
                    { key: "id", header: "ID", priority: "tablet", render: (r) => r.id },
                    { key: "qty", header: "Qtd", priority: "desktop", render: (r) => r.qty },
                ]}
                data={rows}
                rowKey={(r) => r.id}
            />,
        );
        expect(container.querySelectorAll("th")[0].className).toContain("priorityTablet");
        expect(container.querySelectorAll("th")[1].className).toContain("priorityDesktop");
    });

    it("adds no priority class by default and forwards a column className", () => {
        const { container } = render(
            <Table<Row>
                columns={[{ key: "id", header: "ID", className: "mine", render: (r) => r.id }]}
                data={rows}
                rowKey={(r) => r.id}
            />,
        );
        expect(container.querySelector("th")?.className).not.toContain("priority");
        expect(container.querySelector("td")?.className).toContain("mine");
    });

    it("honours a column width", () => {
        const { container } = render(
            <Table<Row>
                columns={[{ key: "id", header: "ID", width: 120, render: (r) => r.id }]}
                data={rows}
                rowKey={(r) => r.id}
            />,
        );
        expect((container.querySelector("th") as HTMLElement).style.width).toBe("120px");
    });
});
